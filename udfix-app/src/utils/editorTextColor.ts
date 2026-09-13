import type { Editor } from '@tiptap/react';

/** TipTap Color extension: `setColor` on the current selection / stored marks. */
export function applyEditorTextColor(editor: Editor, color: string): boolean {
    return editor.chain().focus().setColor(color).run();
}
