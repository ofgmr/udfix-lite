import type { Editor } from '@tiptap/react';
import type { Node } from '@tiptap/pm/model';
import type { BlockStyleKey } from './blockStyleFormat';
import type { EditorTypographyPayload } from './editorTypography';
import { applyTypographyPayload } from './editorTypography';
import { SUBTITLE_FONT_PT, TITLE_FONT_PT } from './blockStyleApply';

/** Toolbar’daki başlık/alt başlık sezgisiyle uyum (nomaiBlockStyle yokken pt ile ayırt). */
function firstTextStyleFontSize(node: Node): string | undefined {
    let out: string | undefined;
    node.descendants((child) => {
        if (child.isText) {
            const ts = child.marks.find((m) => m.type.name === 'textStyle');
            if (ts) {
                out = (ts.attrs as { fontSize?: string }).fontSize;
                return false;
            }
        }
        return true;
    });
    return out;
}

function blockMatchesStyleKey(node: Node, key: BlockStyleKey): boolean {
    if (key === 'p') {
        if (node.type.name !== 'paragraph') return false;
        const slot = node.attrs.nomaiBlockStyle as string | null | undefined;
        if (slot === 'title' || slot === 'subtitle') return false;
        const fs = firstTextStyleFontSize(node);
        if (fs === TITLE_FONT_PT || fs === SUBTITLE_FONT_PT) return false;
        return slot == null || slot === '' || slot === 'normal';
    }
    if (key === 'title') {
        if (node.type.name !== 'paragraph') return false;
        const slot = node.attrs.nomaiBlockStyle as string | null | undefined;
        if (slot === 'subtitle') return false;
        if (slot === 'title') return true;
        return firstTextStyleFontSize(node) === TITLE_FONT_PT;
    }
    if (key === 'subtitle') {
        if (node.type.name !== 'paragraph') return false;
        const slot = node.attrs.nomaiBlockStyle as string | null | undefined;
        if (slot === 'title') return false;
        if (slot === 'subtitle') return true;
        return firstTextStyleFontSize(node) === SUBTITLE_FONT_PT;
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
        if (applyTypographyPayload(editor, payload)) {
            updated += 1;
        }
    }
    const maxPos = editor.state.doc.content.size;
    const clamp = (n: number) => Math.max(0, Math.min(n, maxPos));
    editor.chain().focus().setTextSelection({ from: clamp(savedFrom), to: clamp(savedTo) }).run();
    return updated;
}
