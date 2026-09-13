/**
 * Obsidian-style wiki link parsing from plain text (e.g. from Tiptap getText / FTS plain).
 * Supports: [[Title]], [[note-uuid]], [[note-uuid|Alias]]
 */

export type ParsedWikiLink = {
    /** Full matched string including brackets */
    raw: string;
    /** Left segment inside brackets (before |) */
    targetKey: string;
    /** Visible label (right side of | or same as targetKey) */
    displayText: string;
    start: number;
    end: number;
};

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLikelyNoteUuid(s: string): boolean {
    return UUID_RE.test(s.trim());
}

/**
 * Non-overlapping matches of [[...]] in plain text.
 */
export function parseWikiLinksFromPlainText(plain: string): ParsedWikiLink[] {
    if (!plain) return [];
    const re = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g;
    const out: ParsedWikiLink[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(plain)) !== null) {
        const targetKey = (m[1] ?? '').trim();
        const displayText = (m[2] ?? m[1] ?? '').trim();
        if (!targetKey) continue;
        out.push({
            raw: m[0],
            targetKey,
            displayText: displayText || targetKey,
            start: m.index,
            end: m.index + m[0].length,
        });
    }
    return out;
}

export function formatWikiLinkNoteRef(noteId: string, label: string): string {
    const safeLabel = (label || 'Not').replace(/\]\]/g, '››');
    return `[[${noteId}|${safeLabel}]]`;
}

/** Tiptap suggestion: match `[[query` before cursor inside the same block. */
export function findWikiLinkSuggestionMatch(opts: {
    $position: { pos: number; start: (depth?: number) => number; doc: { textBetween: (a: number, b: number, br: string) => string } };
}): { range: { from: number; to: number }; query: string; text: string } | null {
    const { $position } = opts;
    const pos = $position.pos;
    const start = $position.start();
    const slice = $position.doc.textBetween(start, pos, '\0');
    const m = /\[\[([^\]]*)$/.exec(slice);
    if (!m) return null;
    const full = m[0];
    const from = pos - full.length;
    return { range: { from, to: pos }, query: m[1] ?? '', text: full };
}
