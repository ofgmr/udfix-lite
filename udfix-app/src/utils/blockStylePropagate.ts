import type { Editor } from '@tiptap/react';
import type { Node } from '@tiptap/pm/model';
import type { BlockStyleKey } from './blockStyleFormat';
import type { EditorTypographyPayload } from './editorTypography';
import { applySavedParagraphFormatting } from './blockStyleApply';

function blockMatchesStyleKey(node: Node, key: BlockStyleKey): boolean {
    if (key === 'p') {
        if (node.type.name !== 'paragraph') return false;
        const slot = node.attrs.nomaiBlockStyle as string | null | undefined;
        return slot == null || slot === '' || slot === 'normal';
    }
    if (key === 'title') {
        return node.type.name === 'paragraph' && node.attrs.nomaiBlockStyle === 'title';
    }
    if (key === 'subtitle') {
        return node.type.name === 'paragraph' && node.attrs.nomaiBlockStyle === 'subtitle';
    }
    const level = parseInt(key.replace('h', ''), 10);
    if (level >= 1 && level <= 6) {
        return node.type.name === 'heading' && Number(node.attrs.level) === level;
    }
    return false;
}

/**
 * Kaydedilen blok stilini, belgede aynı semantik yuvadaki tüm bloklara uygular (normal metin, B/T, A/S, H1…H6).
 */
export function propagateBlockStyleDefaultsToDocument(
    editor: Editor,
    key: BlockStyleKey,
    payload: EditorTypographyPayload,
): number {
    const { doc } = editor.state;
    const savedFrom = editor.state.selection.from;
    const savedTo = editor.state.selection.to;
    const targets: { pos: number; node: Node }[] = [];
    doc.descendants((node, pos) => {
        if (!node.isBlock) return true;
        if (blockMatchesStyleKey(node, key)) {
            targets.push({ pos, node });
        }
        return true;
    });

    let updated = 0;
    for (const { pos, node } of targets) {
        const innerFrom = pos + 1;
        const innerTo = pos + node.nodeSize - 1;
        if (innerFrom <= innerTo) {
            editor.chain().focus().setTextSelection({ from: innerFrom, to: innerTo }).run();
        } else {
            editor.chain().focus().setTextSelection(innerFrom).run();
        }
        if (applySavedParagraphFormatting(editor, payload)) {
            updated += 1;
        }
    }
    const maxPos = editor.state.doc.content.size;
    const clamp = (n: number) => Math.max(0, Math.min(n, maxPos));
    editor.chain().focus().setTextSelection({ from: clamp(savedFrom), to: clamp(savedTo) }).run();
    return updated;
}
