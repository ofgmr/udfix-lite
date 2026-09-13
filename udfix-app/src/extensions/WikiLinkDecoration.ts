import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/** Matches Obsidian-style wiki links in plain text: [[Title]] or [[uuid|Alias]] */
const WIKI_LINK_IN_TEXT_RE = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g;

export const WIKI_LINK_DECORATION_PLUGIN_KEY = new PluginKey('wikiLinkDecoration');

function collectWikiLinkDecorations(doc: PMNode): Decoration[] {
    const decorations: Decoration[] = [];

    doc.descendants((node, pos) => {
        if (!node.isText) return;
        const text = node.text || '';
        if (!text.includes('[[')) return;

        WIKI_LINK_IN_TEXT_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = WIKI_LINK_IN_TEXT_RE.exec(text)) !== null) {
            const from = pos + match.index;
            const to = from + match[0].length;
            decorations.push(
                Decoration.inline(from, to, {
                    class: 'nomai-wiki-link-chip',
                    'data-wiki-link': '1',
                }),
            );
        }
    });

    return decorations;
}

/**
 * Visual-only wiki link styling for `[[...]]` plain text in the note editor.
 * Does not alter document JSON; click handling is a separate follow-up.
 */
export const WikiLinkDecoration = Extension.create({
    name: 'wikiLinkDecoration',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: WIKI_LINK_DECORATION_PLUGIN_KEY,
                state: {
                    init: (_, { doc }) =>
                        DecorationSet.create(doc, collectWikiLinkDecorations(doc)),
                    apply(tr, set) {
                        if (!tr.docChanged) return set.map(tr.mapping, tr.doc);
                        return DecorationSet.create(tr.doc, collectWikiLinkDecorations(tr.doc));
                    },
                },
                props: {
                    decorations(state) {
                        return WIKI_LINK_DECORATION_PLUGIN_KEY.getState(state) ?? DecorationSet.empty;
                    },
                },
            }),
        ];
    },
});
