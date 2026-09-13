import type { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';

/** Seçimin ProseMirror dilimini tek bir Tiptap `doc` JSON'una çevirir. */
export function editorSelectionToDocJson(editor: Editor): JSONContent | null {
    const { from, to, empty } = editor.state.selection;
    if (empty || from === to) return null;
    const slice = editor.state.doc.slice(from, to);
    const content: JSONContent[] = [];
    slice.content.forEach((node) => {
        content.push(node.toJSON() as JSONContent);
    });
    if (!content.length) {
        return { type: 'doc', content: [{ type: 'paragraph' }] };
    }
    return { type: 'doc', content };
}
