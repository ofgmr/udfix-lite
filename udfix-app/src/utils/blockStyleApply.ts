import type { Editor } from '@tiptap/react';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { Mark, ResolvedPos } from '@tiptap/pm/model';
import type { BlockStyleKey } from './blockStyleFormat';
import { useEditorStyleStore } from '../stores/useEditorStyleStore';
import { applyTypographyPayload } from './editorTypography';

export const TITLE_FONT_PT = '26pt';
export const SUBTITLE_FONT_PT = '15pt';

function getBlockStyleDefault(key: BlockStyleKey) {
    return useEditorStyleStore.getState().blockDefaults[key];
}

function textStyleFontSizeAt($from: ResolvedPos): string | undefined {
    const m = $from.marks().find((x: Mark) => x.type.name === 'textStyle');
    return (m?.attrs as { fontSize?: string } | undefined)?.fontSize;
}

export function normalizeListSelectionForStyleChange(editor: Editor): void {
    const { state, view } = editor;
    if (!(state.selection instanceof NodeSelection)) return;
    const selNodeName = state.selection.node.type.name;
    if (selNodeName !== 'listItem' && selNodeName !== 'orderedList' && selNodeName !== 'bulletList') return;

    const nearPos = Math.min(state.selection.from + 1, state.doc.content.size);
    const $near = state.doc.resolve(nearPos);
    view.dispatch(state.tr.setSelection(TextSelection.near($near, 1)));
}

export function getHeadingSelectValue(editor: Editor): string {
    const { $from } = editor.state.selection;
    const block = $from.parent;
    if (block.type.name === 'heading') {
        const level = Number(block.attrs.level);
        if (level >= 1 && level <= 6) return `h${level}`;
    }
    if (block.type.name === 'paragraph') {
        const slot = block.attrs.nomaiBlockStyle as string | null | undefined;
        if (slot === 'title') return 'title';
        if (slot === 'subtitle') return 'subtitle';
        const fs = textStyleFontSizeAt($from);
        if (fs === TITLE_FONT_PT) return 'title';
        if (fs === SUBTITLE_FONT_PT) return 'subtitle';
    }
    for (let level = 1; level <= 6; level++) {
        if (editor.isActive('heading', { level })) return `h${level}`;
    }
    return 'p';
}

export function asBlockStyleKey(v: string): BlockStyleKey | null {
    if (v === 'p' || v === 'title' || v === 'subtitle') return v;
    if (/^h[1-6]$/.test(v)) return v as BlockStyleKey;
    return null;
}

/**
 * Paragraf / başlık / başlık satırı seçiminin değerini uygular (toolbar ve ⌘⌥ kısayolları).
 * `p` | `title` | `subtitle` | `h1`…`h6`
 */
export function applyParagraphStyleSelectValue(editor: Editor, value: string): void {
    normalizeListSelectionForStyleChange(editor);
    const ch = editor.chain().focus();
    if (value === 'p') {
        ch.setParagraph()
            .updateAttributes('paragraph', { nomaiBlockStyle: null })
            .unsetFontSize()
            .unsetBold()
            .unsetColor()
            .run();
        const def = getBlockStyleDefault('p');
        if (def) applyTypographyPayload(editor, def);
        return;
    }
    if (value === 'title') {
        ch.setParagraph()
            .setFontSize(TITLE_FONT_PT)
            .setBold()
            .unsetColor()
            .updateAttributes('paragraph', { nomaiBlockStyle: 'title' })
            .run();
        const def = getBlockStyleDefault('title');
        if (def) applyTypographyPayload(editor, def);
        return;
    }
    if (value === 'subtitle') {
        ch.setParagraph()
            .unsetBold()
            .setFontSize(SUBTITLE_FONT_PT)
            .setColor('#5f6368')
            .updateAttributes('paragraph', { nomaiBlockStyle: 'subtitle' })
            .run();
        const def = getBlockStyleDefault('subtitle');
        if (def) applyTypographyPayload(editor, def);
        return;
    }
    const level = parseInt(value.replace('h', ''), 10);
    if (level >= 1 && level <= 6) {
        ch.setHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).unsetFontSize().unsetColor().run();
        // Kayıtlı yükte B/I/U kapalıysa önceki satır içi işaretleri temizle
        editor.chain().focus().unsetBold().unsetItalic().unsetUnderline().run();
        const def = getBlockStyleDefault(`h${level}` as BlockStyleKey);
        if (def) applyTypographyPayload(editor, def);
    }
}
