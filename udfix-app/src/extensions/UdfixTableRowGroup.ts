import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
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

/**
 * TablePlus leaves single-row tables as raw `tableRow` children of `<table>`.
 * Chromium then inserts an implicit `<tbody>`, ProseMirror unmaps the rows, and
 * 1-col UYAP `Sabit` heading boxes export as empty shells. Always wrap rows in
 * `tableRowGroup` (a real `<tbody>`) and keep table attrs on rebuild.
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
        const { editor } = this
        return [
            new Plugin({
                key: new PluginKey('udfixTableRowGroupKey'),
                appendTransaction(_, _oldState, newState) {
                    const { doc, tr } = newState
                    let modified = false
                    doc.descendants((tableNode, pos) => {
                        if (tableNode.type.name !== 'table') return false

                        const rowGroups: PmNode[] = []
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
                        const rowGroupList = mergeOverlappingGroups(
                            getRowGroupList(rows.length, rowSpanList),
                        )
                        const newRowGroupStructure = Object.assign(
                            {},
                            rowGroupList.map((group) => group.length),
                        )

                        if (hasRawRow || !deepMatch(oldRowGroupStructure, newRowGroupStructure)) {
                            const nodeType = editor.schema.nodes.tableRowGroup
                            const tableNodeType = editor.schema.nodes.table
                            if (!nodeType || !tableNodeType) return false
                            for (let i = 0; i < rowGroupList.length; i += 1) {
                                const group = rowGroupList[i]
                                if (!group?.length) continue
                                const rowGroup = rows.slice(Math.min(...group) - 1, Math.max(...group))
                                if (rowGroup.length > 0) {
                                    rowGroups.push(nodeType.create(null, rowGroup))
                                }
                            }
                            if (rowGroups.length === 0) return false
                            const tableNodeNew = tableNodeType.create(
                                tableNode.attrs,
                                rowGroups,
                                tableNode.marks,
                            )
                            tr.replaceWith(pos, pos + tableNode.nodeSize, tableNodeNew)
                            modified = true
                        }
                        return false
                    })
                    return modified ? tr : null
                },
            }),
        ]
    },
})
