import { Extension } from '@tiptap/core';
import { applyParagraphStyleSelectValue } from '../utils/blockStyleApply';

/**
 * Paragraf / başlık stilleri: ⌘⌥0 normal, ⌘⌥1–6 H1–H6, ⌘⌥7 başlık, ⌘⌥8 alt başlık.
 * Windows/Linux: Ctrl+Alt+…
 */
export const ParagraphStyleShortcuts = Extension.create({
    name: 'paragraphStyleShortcuts',

    addKeyboardShortcuts() {
        return {
            'Mod-Alt-0': () => {
                applyParagraphStyleSelectValue(this.editor, 'p');
                return true;
            },
            'Mod-Alt-1': () => {
                applyParagraphStyleSelectValue(this.editor, 'h1');
                return true;
            },
            'Mod-Alt-2': () => {
                applyParagraphStyleSelectValue(this.editor, 'h2');
                return true;
            },
            'Mod-Alt-3': () => {
                applyParagraphStyleSelectValue(this.editor, 'h3');
                return true;
            },
            'Mod-Alt-4': () => {
                applyParagraphStyleSelectValue(this.editor, 'h4');
                return true;
            },
            'Mod-Alt-5': () => {
                applyParagraphStyleSelectValue(this.editor, 'h5');
                return true;
            },
            'Mod-Alt-6': () => {
                applyParagraphStyleSelectValue(this.editor, 'h6');
                return true;
            },
            'Mod-Alt-7': () => {
                applyParagraphStyleSelectValue(this.editor, 'title');
                return true;
            },
            'Mod-Alt-8': () => {
                applyParagraphStyleSelectValue(this.editor, 'subtitle');
                return true;
            },
        };
    },
});
