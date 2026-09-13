import { Node, mergeAttributes } from '@tiptap/core';
import { formatWikiLinkNoteRef } from '../utils/wikiLinks';

/**
 * Inline wiki note reference chip — replaces plain `[[uuid|label]]` in the editor body.
 * Plain-text export still uses wiki syntax for FTS / `note_links` sync.
 */
export const WikiNoteLink = Node.create({
    name: 'wikiNoteLink',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,

    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: (el) => el.getAttribute('data-id'),
                renderHTML: (attrs) => (attrs.id ? { 'data-id': String(attrs.id) } : {}),
            },
            label: {
                default: '',
                parseHTML: (el) => el.getAttribute('data-label') ?? '',
                renderHTML: (attrs) =>
                    attrs.label ? { 'data-label': String(attrs.label) } : {},
            },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-wiki-note-link="1"]' }];
    },

    renderHTML({ node, HTMLAttributes }) {
        const id = String(node.attrs.id ?? '');
        const label = String(node.attrs.label ?? id ?? 'Not');
        return [
            'span',
            mergeAttributes(HTMLAttributes, {
                'data-wiki-note-link': '1',
                'data-id': id,
                'data-label': label,
                class: 'nomai-wiki-link-chip',
                contenteditable: 'false',
            }),
            label,
        ];
    },

    renderText: ({ node }) => {
        const id = String(node.attrs.id ?? '');
        const label = String(node.attrs.label ?? id);
        return id ? formatWikiLinkNoteRef(id, label) : '';
    },

    renderMarkdown: (node) => {
        const id = String(node.attrs?.id ?? '');
        const label = String(node.attrs?.label ?? id);
        return id ? formatWikiLinkNoteRef(id, label) : '';
    },
});
