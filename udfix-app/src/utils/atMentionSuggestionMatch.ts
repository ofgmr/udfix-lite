import type { SuggestionMatch } from '@tiptap/suggestion';

/** First pointer on a row only opens the detail card; a second pointer on the same row inserts. */
export function mentionListPointerAction(
    clickedIndex: number,
    selectedIndex: number,
    previewOpen: boolean,
): 'open-preview' | 'insert' {
    if (previewOpen && clickedIndex === selectedIndex) return 'insert';
    return 'open-preview';
}

type MatchPos = {
    pos: number;
    start: (depth?: number) => number;
    doc: {
        textBetween: (
            from: number,
            to: number,
            blockSeparator?: string,
            leafText?: string,
        ) => string;
    };
};

/**
 * `@` mention matcher that keeps the query active across spaces.
 * Tiptap's default `findSuggestionMatch` only reads `$position.nodeBefore`, so a
 * space (or a decoration/pagination split) drops the trigger and closes the list.
 */
export function findAtMentionSuggestionMatch(config: {
    char: string;
    allowSpaces?: boolean;
    allowToIncludeChar?: boolean;
    allowedPrefixes?: string[] | null;
    startOfLine?: boolean;
    $position: MatchPos;
}): SuggestionMatch {
    const char = config.char || '@';
    const { $position } = config;
    const pos = $position.pos;
    const blockStart = $position.start();
    const slice = $position.doc.textBetween(blockStart, pos, '\0', '\0');
    if (!slice) return null;

    const last = slice.lastIndexOf(char);
    if (last < 0) return null;

    const prefixChar = last === 0 ? '' : slice.charAt(last - 1);
    const allowed = config.allowedPrefixes === undefined ? [' '] : config.allowedPrefixes;
    if (allowed !== null && last > 0) {
        const prefixOk = allowed.includes(prefixChar) || prefixChar === '\0';
        if (!prefixOk) return null;
    }

    if (config.startOfLine && last !== 0 && prefixChar !== '\0') {
        return null;
    }

    const query = slice.slice(last + char.length);
    if (!config.allowSpaces && /\s/.test(query)) return null;

    const from = pos - (slice.length - last);
    return {
        range: { from, to: pos },
        query,
        text: slice.slice(last),
    };
}
