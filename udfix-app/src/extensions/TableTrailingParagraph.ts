import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const tableTrailingParagraphKey = new PluginKey('tableTrailingParagraph');

/**
 * A document that ends on a table has nowhere to put the next paragraph:
 * the caret stays in the last cell, so text meant to follow the table lands inside it.
 */
export const TableTrailingParagraph = Extension.create({
    name: 'tableTrailingParagraph',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: tableTrailingParagraphKey,
                appendTransaction(transactions, _oldState, state) {
                    if (!transactions.some((tr) => tr.docChanged)) return null;
                    const last = state.doc.lastChild;
                    if (!last || last.type.name !== 'table') return null;
                    const paragraph = state.schema.nodes.paragraph;
                    if (!paragraph) return null;
                    return state.tr.insert(state.doc.content.size, paragraph.create());
                },
            }),
        ];
    },
});
