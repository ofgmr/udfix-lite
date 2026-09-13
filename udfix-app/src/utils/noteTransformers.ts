import { generateHTML } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';

import { createNoteContentExtensions } from '../components/notes/noteEditorExtensions';
import { tiptapJsonToPlainText } from './tiptapPlainText';
import { tiptapJsonToMarkdown } from './markdownExport';

export { parseWikiLinksFromPlainText, formatWikiLinkNoteRef, isLikelyNoteUuid } from './wikiLinks';

const tiptapHtmlExtensions = createNoteContentExtensions();

function parseJsonInput(json: JSONContent | string | null | undefined): JSONContent | null {
    if (!json) return null;
    if (typeof json === 'string') {
        try {
            return JSON.parse(json) as JSONContent;
        } catch {
            return null;
        }
    }
    return json;
}

/**
 * Plain text for SQLite FTS / sync (mentions, #tags). Schema-independent walker.
 */
export function tiptapToText(json: JSONContent | string | null | undefined): string {
    const content = parseJsonInput(json);
    if (!content) return '';
    try {
        return tiptapJsonToPlainText(content).trim();
    } catch (e) {
        console.error('Failed to convert Tiptap to text:', e);
        return '';
    }
}

/**
 * Converts Tiptap JSON to HTML for quick rendering if needed
 */
export function tiptapToHTML(json: JSONContent | string | null | undefined): string {
    const content = parseJsonInput(json);
    if (!content) return '';
    try {
        return generateHTML(content, tiptapHtmlExtensions);
    } catch (e) {
        console.error('Failed to convert Tiptap to HTML:', e);
        return '';
    }
}

/**
 * Converts Tiptap JSON to Markdown for export/data portability
 */
export function tiptapToMarkdown(json: JSONContent | string | null | undefined): string {
    return tiptapJsonToMarkdown(json);
}
