/**
 * Plain-text extraction from Tiptap JSON without building a full Editor schema.
 * Avoids "Unknown node type: mention" when generateText() omits Mention.
 */

function textWithMarks(node: { text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] }): string {
    const t = node.text ?? '';
    const marks = node.marks ?? [];
    for (const m of marks) {
        if (m.type === 'link') {
            const href = String(m.attrs?.href ?? '');
            if (href.startsWith('note:')) {
                const id = href.slice('note:'.length);
                return t.trim() ? `@${t} ` : `@${id} `;
            }
        }
    }
    return t;
}

export function tiptapJsonToPlainText(doc: unknown): string {
    if (!doc) return '';
    try {
        const root =
            typeof doc === 'string'
                ? (JSON.parse(doc) as { type?: string; content?: unknown[] })
                : (doc as { type?: string; content?: unknown[] });
        if (!root || typeof root !== 'object') return '';
        return walkNode(root as Parameters<typeof walkNode>[0]).replace(/\n+$/g, '');
    } catch {
        return '';
    }
}

function walkNode(node: {
    type?: string;
    content?: unknown[];
    text?: string;
    marks?: { type: string; attrs?: Record<string, unknown> }[];
    attrs?: Record<string, unknown>;
}): string {
    if (!node) return '';

    if (node.type === 'text') {
        return textWithMarks(node as { text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] });
    }

    if (node.type === 'mention') {
        const a = node.attrs ?? {};
        const label = String(a.label ?? a.id ?? '').trim();
        const char = String(a.mentionSuggestionChar ?? '@');
        if (!label) return char.length > 1 ? `${char} ` : '';
        return `${char}${label} `;
    }

    if (node.type === 'wikiNoteLink') {
        const id = String(node.attrs?.id ?? '').trim();
        const label = String(node.attrs?.label ?? id).trim();
        if (!id) return '';
        const display = label || id;
        return label && label !== id ? `[[${id}|${display}]] ` : `[[${id}]] `;
    }

    if (node.type === 'variableSlot') {
        const k = String((node.attrs as { key?: string } | undefined)?.key ?? '').trim();
        return k ? `{{${k}}} ` : '{{}} ';
    }

    if (node.type === 'hardBreak') return '\n';

    const children = Array.isArray(node.content) ? node.content.map((c) => walkNode(c as typeof node)).join('') : '';

    switch (node.type) {
        case 'doc':
            return children;
        case 'paragraph':
            return children + '\n';
        case 'heading':
            return children + '\n';
        case 'bulletList':
        case 'orderedList':
            return children;
        case 'listItem':
            return children;
        case 'blockquote':
            return children.split('\n').filter(Boolean).map((l) => `> ${l}`).join('\n') + '\n';
        case 'codeBlock':
            return children + '\n';
        case 'horizontalRule':
            return '\n';
        default:
            return children;
    }
}
