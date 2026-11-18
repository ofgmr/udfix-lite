import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Transaction } from '@tiptap/pm/state'
import type { ReplaceStep, Step } from '@tiptap/pm/transform'
import {
    TableRowGroup,
    getMaximumRowSpan,
    getRowGroupList,
    mergeOverlappingGroups,
} from 'tiptap-table-plus/dist/pagination/TableRowGroup.js'

function deepMatch(obj1: unknown, obj2: unknown): boolean {
    if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
        return obj1 === obj2
    }
    const a = obj1 as Record<string, unknown>
    const b = obj2 as Record<string, unknown>
    const keys1 = Object.keys(a)
    const keys2 = Object.keys(b)
    if (keys1.length !== keys2.length) return false
    for (const key of keys1) {
        if (!Object.prototype.hasOwnProperty.call(b, key) || !deepMatch(a[key], b[key])) {
            return false
        }
    }
    return true
}

const MAX_ROW_GROUP_REBUILDS = 64

const rowGroupKey = new PluginKey<{ primed: boolean }>('udfixTableRowGroupKey')

/** Nodes visited while looking for tables that still need a row-group wrap. */
export const rowGroupScanStats = { nodes: 0 }

const TABLE_NODE_NAMES = new Set(['table', 'tableRow', 'tableRowGroup', 'tableCell', 'tableHeader'])

function stepJsonId(step: Step): string {
    const labeled = step as Step & { jsonID?: string }
    return labeled.jsonID ?? ''
}

function nodeTouchesTable(node: PmNode): boolean {
    if (TABLE_NODE_NAMES.has(node.type.name)) return true
    let found = false
    node.descendants((child) => {
        if (TABLE_NODE_NAMES.has(child.type.name)) {
            found = true
            return false
        }
        return !found
    })
    return found
}

function rangeTouchesTable(doc: PmNode, from: number, to: number): boolean {
    const max = doc.content.size
    const start = Math.max(0, Math.min(from, max))
    const end = Math.max(start, Math.min(to, max))
    const $pos = doc.resolve(start)
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
        if ($pos.node(depth).type.name === 'table') return true
    }
    if (start === end) return false
    let found = false
    doc.nodesBetween(start, end, (node) => {
        if (TABLE_NODE_NAMES.has(node.type.name)) {
            found = true
            return false
        }
        return !found
    })
    return found
}

function transactionTouchesTable(tr: Transaction): boolean {
    if (!tr.docChanged) return false
    let doc = tr.before
    for (const step of tr.steps) {
        const kind = stepJsonId(step)
        if (kind === 'replace' || kind === 'replaceAround') {
            const replace = step as ReplaceStep
            let inserted = false
            replace.slice.content.forEach((node) => {
                if (!inserted && nodeTouchesTable(node)) inserted = true
            })
            if (inserted || rangeTouchesTable(doc, replace.from, replace.to)) return true
        } else if (kind === 'addMark' || kind === 'removeMark' || kind === 'attr') {
            const ranged = step as Step & { from?: number; to?: number; pos?: number }
            const from = ranged.from ?? ranged.pos ?? 0
            const to = ranged.to ?? ranged.pos ?? from
            if (rangeTouchesTable(doc, from, to)) return true
        } else {
            return true
        }
        const applied = step.apply(doc)
        if (applied.failed || !applied.doc) return true
        doc = applied.doc
    }
    return false
}

function tableNeedsRowGroupRebuild(tableNode: PmNode): boolean {
    const rows: PmNode[] = []
    const oldRowGroupStructure: Record<number, number> = {}
    let hasRawRow = false

    tableNode.forEach((child, _childOffset, childIndex) => {
        if (child.type.name === 'tableRowGroup') {
            oldRowGroupStructure[childIndex] = child.childCount
            child.forEach((row) => {
                if (row.type.name === 'tableRow') rows.push(row)
            })
        } else if (child.type.name === 'tableRow') {
            hasRawRow = true
            oldRowGroupStructure[childIndex] = 1
            rows.push(child)
        }
    })

    const rowSpanList: Record<number, number> = {}
    for (let i = 0; i < rows.length; i += 1) {
        rowSpanList[i + 1] = getMaximumRowSpan(rows[i])
    }
    const rowGroupList = mergeOverlappingGroups(getRowGroupList(rows.length, rowSpanList))
    const newRowGroupStructure = Object.assign(
        {},
        rowGroupList.map((group) => group.length),
    )
    return hasRawRow || !deepMatch(oldRowGroupStructure, newRowGroupStructure)
}

function rebuildTableWithRowGroups(tableNode: PmNode): PmNode | null {
    const schema = tableNode.type.schema
    const nodeType = schema.nodes.tableRowGroup
    const tableNodeType = schema.nodes.table
    if (!nodeType || !tableNodeType) return null

    const rows: PmNode[] = []
    tableNode.forEach((child) => {
        if (child.type.name === 'tableRowGroup') {
            child.forEach((row) => {
                if (row.type.name === 'tableRow') rows.push(row)
            })
        } else if (child.type.name === 'tableRow') {
            rows.push(child)
        }
    })

    const rowSpanList: Record<number, number> = {}
    for (let i = 0; i < rows.length; i += 1) {
        rowSpanList[i + 1] = getMaximumRowSpan(rows[i])
    }
    const rowGroupList = mergeOverlappingGroups(getRowGroupList(rows.length, rowSpanList))
    const rowGroups: PmNode[] = []
    for (const group of rowGroupList) {
        if (!group?.length) continue
        const rowGroup = rows.slice(Math.min(...group) - 1, Math.max(...group))
        if (rowGroup.length > 0) rowGroups.push(nodeType.create(null, rowGroup))
    }
    if (rowGroups.length === 0) return null
    return tableNodeType.create(tableNode.attrs, rowGroups, tableNode.marks)
}

/**
 * TablePlus leaves single-row tables as raw `tableRow` children of `<table>`.
 * Chromium then inserts an implicit `<tbody>`, ProseMirror unmaps the rows, and
 * 1-col UYAP `Sabit` heading boxes export as empty shells. Always wrap rows in
 * `tableRowGroup` (a real `<tbody>`) and keep table attrs on rebuild.
 *
 * Rebuild one table per step, always the last match in document order. Wrapping
 * adds a `tableRowGroup` node (+2 positions). Applying every replacement against
 * the pre-step positions maps the next table into the previous one and deletes
 * the characters in between.
 */
export const UdfixTableRowGroup = TableRowGroup.extend({
    addNodeView() {
        return () => {
            const tbody = document.createElement('tbody')
            tbody.classList.add('table-row-group')
            return { dom: tbody, contentDOM: tbody }
        }
    },

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: rowGroupKey,
                state: {
                    init: () => ({ primed: false }),
                    apply(tr, value) {
                        const meta = tr.getMeta(rowGroupKey) as { primed?: boolean } | undefined
                        if (meta?.primed) return { primed: true }
                        return value
                    },
                },
                appendTransaction(transactions, _oldState, newState) {
                    if (!transactions.some((tr) => tr.docChanged)) return null
                    const primed = rowGroupKey.getState(newState)?.primed === true
                    if (primed && !transactions.some((tr) => transactionTouchesTable(tr))) return null

                    const tr = newState.tr
                    let guard = 0
                    while (guard < MAX_ROW_GROUP_REBUILDS) {
                        guard += 1
                        const targets: { pos: number; node: PmNode }[] = []
                        tr.doc.descendants((node, pos) => {
                            rowGroupScanStats.nodes += 1
                            if (node.type.name !== 'table') return true
                            if (tableNeedsRowGroupRebuild(node)) targets.push({ pos, node })
                            return true
                        })
                        const target = targets[targets.length - 1]
                        if (!target) break
                        const rebuilt = rebuildTableWithRowGroups(target.node)
                        if (!rebuilt || rebuilt.eq(target.node)) break
                        tr.replaceWith(target.pos, target.pos + target.node.nodeSize, rebuilt)
                    }
                    if (tr.steps.length === 0) {
                        if (primed) return null
                        return tr.setMeta(rowGroupKey, { primed: true })
                    }
                    return tr.setMeta(rowGroupKey, { primed: true })
                },
            }),
        ]
    },
})
