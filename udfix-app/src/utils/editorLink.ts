import type { Editor } from '@tiptap/react';

/** Toolbar ve yüzen araç çubuğunda ortak bağlantı ekleme/kaldırma (prompt). */
export function promptSetLink(editor: Editor): void {
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL:', previousUrl ?? '');
    if (url === null) return;
    if (url === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
}
