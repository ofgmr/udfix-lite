import { Extension } from '@tiptap/core';

/**
 * Sayfa sonu: ⌘↵ / Ctrl+Enter (Mod-Enter).
 */
export const BreakShortcuts = Extension.create({
    name: 'breakShortcuts',
    priority: 1000,

    addKeyboardShortcuts() {
        return {
            'Mod-Enter': () => {
                return this.editor.commands.setPageBreak({ kind: 'page' });
            },
        };
    },
});
