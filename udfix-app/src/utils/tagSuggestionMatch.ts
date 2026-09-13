/** Tiptap suggestion: `#etiket` before cursor (not `##` headings). */
export function findTagSuggestionMatch(opts: {
    $position: {
        pos: number;
        start: (depth?: number) => number;
        doc: { textBetween: (from: number, to: number, blockSeparator?: string) => string };
    };
}): { range: { from: number; to: number }; query: string; text: string } | null {
    const { $position } = opts;
    const pos = $position.pos;
    const start = $position.start();
    const slice = $position.doc.textBetween(start, pos, '\0');
    const m = /(?:^|[\s\u00a0])#([\p{L}\p{M}\p{N}_][\p{L}\p{M}\p{N}_-]*)$/u.exec(slice);
    if (!m) return null;
    const tagPart = m[1] ?? '';
    const hashIndex = slice.lastIndexOf('#' + tagPart);
    if (hashIndex < 0) return null;
    const from = start + hashIndex;
    return { range: { from, to: pos }, query: tagPart, text: slice.slice(hashIndex) };
}
