import Paragraph from '@tiptap/extension-paragraph';

/** HF mini editor: Enter is handled by HfHardBreak; avoid Paragraph splitBlock. */
export const HfParagraph = Paragraph.extend({
    addKeyboardShortcuts() {
        return {
            'Mod-Enter': () => this.editor.commands.splitBlock(),
        };
    },
});
