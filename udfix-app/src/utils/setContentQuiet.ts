import type { Editor } from '@tiptap/core';

/**
 * TipTap 2 accepted `setContent(html, false)` to skip the update event.
 * TipTap 3 takes an options object. A boolean is object-coerced (`false` → {}),
 * so `emitUpdate` stays at its default `true`. Header/footer sync then writes
 * the same HTML back into the store on every external update.
 */
export function setContentWithoutEmit(editor: Editor, content: string): boolean {
    return editor.commands.setContent(content, { emitUpdate: false });
}
