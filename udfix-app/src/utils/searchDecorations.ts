import type { Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { ReplaceAroundStep, ReplaceStep } from '@tiptap/pm/transform'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/** Text nodes visited while building search highlights. Tests reset this. */
export const searchScanStats = { nodes: 0 }

export function resetSearchScanStats(): void {
    searchScanStats.nodes = 0
}

export function createSearchRegex(term: string, caseSensitive: boolean): RegExp {
    let escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (!caseSensitive) {
        escaped = escaped
            .replace(/i|İ/g, '[iİ]')
            .replace(/ı|I/g, '[ıI]')
            .replace(/ğ|Ğ/g, '[ğĞ]')
            .replace(/ü|Ü/g, '[üÜ]')
            .replace(/ş|Ş/g, '[şŞ]')
            .replace(/ö|Ö/g, '[öÖ]')
            .replace(/ç|Ç/g, '[çÇ]')
    }
    return new RegExp(escaped, caseSensitive ? 'g' : 'gi')
}

export function buildSearchDecorations(
    doc: PMNode,
    term: string,
    caseSensitive: boolean,
    decorationClass: string,
): DecorationSet {
    if (!term) return DecorationSet.empty
    const decorations = scanSearchRange(doc, 0, doc.content.size, term, caseSensitive, decorationClass)
    return DecorationSet.create(doc, decorations)
}

/**
 * Map the previous highlight set through `tr`, then rescan only the edited
 * neighborhoods. A selection-only transaction does not visit text nodes.
 */
export function updateSearchDecorations(
    previous: DecorationSet,
    tr: Transaction,
    term: string,
    caseSensitive: boolean,
    decorationClass: string,
): DecorationSet {
    if (!term) return DecorationSet.empty
    if (!tr.docChanged) return previous
    let decorations = previous.map(tr.mapping, tr.doc)
    const pad = Math.max(term.length - 1, 0)
    const ranges = mergeRanges(
        changedRangesInNewDoc(tr).map((range) => expandRange(range, pad, tr.doc.content.size)),
    )
    for (const range of ranges) {
        const stale = decorations.find(range.from, range.to)
        if (stale.length > 0) decorations = decorations.remove(stale)
        const next = scanSearchRange(docOf(tr), range.from, range.to, term, caseSensitive, decorationClass)
        if (next.length > 0) decorations = decorations.add(tr.doc, next)
    }
    return decorations
}

export function searchHitRanges(decorations: DecorationSet, docSize: number): { from: number; to: number }[] {
    return decorations
        .find(0, docSize)
        .map((deco) => ({ from: deco.from, to: deco.to }))
        .sort((a, b) => a.from - b.from || a.to - b.to)
}

function docOf(tr: Transaction): PMNode {
    return tr.doc
}

function scanSearchRange(
    doc: PMNode,
    from: number,
    to: number,
    term: string,
    caseSensitive: boolean,
    decorationClass: string,
): Decoration[] {
    const start = Math.max(0, from)
    const end = Math.min(doc.content.size, to)
    if (!term || start >= end) return []
    const regex = createSearchRegex(term, caseSensitive)
    const decorations: Decoration[] = []
    doc.nodesBetween(start, end, (node, pos) => {
        if (!node.isText || !node.text) return
        searchScanStats.nodes += 1
        regex.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = regex.exec(node.text)) !== null) {
            if (match[0].length === 0) {
                regex.lastIndex += 1
                continue
            }
            const decoFrom = pos + match.index
            const decoTo = decoFrom + match[0].length
            if (decoTo <= start || decoFrom >= end) continue
            decorations.push(
                Decoration.inline(decoFrom, decoTo, {
                    class: decorationClass,
                }),
            )
        }
    })
    return decorations
}

function changedRangesInNewDoc(tr: Transaction): { from: number; to: number }[] {
    const ranges: { from: number; to: number }[] = []
    tr.mapping.maps.forEach((stepMap, index) => {
        stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
            let from = newStart
            let to = newEnd
            for (let later = index + 1; later < tr.mapping.maps.length; later += 1) {
                const next = tr.mapping.maps[later]
                if (!next) continue
                from = next.map(from, -1)
                to = next.map(to, 1)
            }
            ranges.push({ from, to })
        })
    })
    if (ranges.length > 0) return ranges
    // Some steps (for example a replace that the map reports as empty) still
    // need a neighborhood rescan. Fall back to each replace's new extent.
    tr.steps.forEach((step, index) => {
        if (!(step instanceof ReplaceStep) && !(step instanceof ReplaceAroundStep)) return
        let from = step.from
        let to = step.from + step.slice.size
        for (let later = index + 1; later < tr.mapping.maps.length; later += 1) {
            const next = tr.mapping.maps[later]
            if (!next) continue
            from = next.map(from, -1)
            to = next.map(to, 1)
        }
        ranges.push({ from, to })
    })
    return ranges
}

function expandRange(
    range: { from: number; to: number },
    pad: number,
    docSize: number,
): { from: number; to: number } {
    const anchor = Math.min(range.from, range.to)
    const from = Math.max(0, anchor - pad)
    const to = Math.min(docSize, Math.max(range.from, range.to) + pad)
    return { from, to: Math.max(to, Math.min(docSize, from + 1)) }
}

function mergeRanges(ranges: { from: number; to: number }[]): { from: number; to: number }[] {
    const sorted = [...ranges].sort((a, b) => a.from - b.from || a.to - b.to)
    const merged: { from: number; to: number }[] = []
    for (const range of sorted) {
        const last = merged[merged.length - 1]
        if (!last || range.from > last.to) {
            merged.push({ from: range.from, to: range.to })
        } else {
            last.to = Math.max(last.to, range.to)
        }
    }
    return merged
}
