import type { Editor } from '@tiptap/react';
import type { Mark } from '@tiptap/pm/model';
import { transformTurkishCaseText, type TurkishCaseMode } from './turkishTextCase';

/**
 * Seçim içindeki metin düğümlerinin içeriğini dönüştürür; işaretleri korur.
 */
export function applyTurkishCaseToSelection(editor: Editor, mode: TurkishCaseMode): boolean {
    const { state } = editor;
    const { from, to, empty } = state.selection;
    if (empty) return false;

    const replacements: { pos: number; oldLen: number; text: string; marks: readonly Mark[] }[] = [];

    state.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isText || !node.text) return;
        const start = Math.max(from, pos);
        const end = Math.min(to, pos + node.text.length);
        if (start >= end) return;
        const slice = node.text.slice(start - pos, end - pos);
        const next = transformTurkishCaseText(slice, mode);
        if (next !== slice) {
            replacements.push({ pos: start, oldLen: end - start, text: next, marks: node.marks });
        }
    });

    if (replacements.length === 0) return false;

    let tr = state.tr;
    replacements.sort((a, b) => b.pos - a.pos);
    for (const { pos, oldLen, text, marks } of replacements) {
        tr = tr.replaceWith(pos, pos + oldLen, state.schema.text(text, marks));
    }

    editor.view.dispatch(tr);
    return true;
}
