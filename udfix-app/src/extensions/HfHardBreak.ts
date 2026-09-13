import { mergeAttributes } from '@tiptap/core';
import HardBreak from '@tiptap/extension-hard-break';

/** HF mini editor: Enter → soft line break preserved in stored/compiled HTML. */
export const HfHardBreak = HardBreak.extend({
    priority: 1000,

    parseHTML() {
        return [{ tag: 'br' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['br', mergeAttributes(HTMLAttributes, { 'data-hf-break': '1' })];
    },

    addKeyboardShortcuts() {
        return {
            Enter: () => this.editor.commands.setHardBreak(),
            'Shift-Enter': () => this.editor.commands.splitBlock(),
        };
    },
});
