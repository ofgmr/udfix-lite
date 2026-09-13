import type { SuggestionMatch } from '@tiptap/suggestion';

/**
 * Blocks tabanlı eşleme: aynı paragrafta (veya node içinde) `##` + isteğe bağlı sorgu.
 * Kurallar: sadece `##` veya `##Dilekçe` gibi; içeride `#` yok.
 */
export function findTemplateHashSuggestionMatch(config: {
    char: string;
    allowSpaces?: boolean;
    allowToIncludeChar?: boolean;
    allowedPrefixes?: string[] | null;
    startOfLine?: boolean;
    $position: { pos: number; start: (depth?: number) => number; doc: { textBetween: (a: number, b: number, br: string) => string } };
}): SuggestionMatch {
    void config.char;
    const { $position } = config;
    const pos = $position.pos;
    const start = $position.start();
    const slice = $position.doc.textBetween(start, pos, '\0');
    const m = /##([^#]*)$/.exec(slice);
    if (!m) return null;
    const full = m[0];
    const from = pos - full.length;
    return { range: { from, to: pos }, query: m[1] ?? '', text: full };
}
