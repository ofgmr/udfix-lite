import type { Editor } from '@tiptap/react';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model';
import type { BlockStyleKey } from './blockStyleFormat';
import { useEditorStyleStore } from '../stores/useEditorStyleStore';
import { applyTypographyPayload, type EditorTypographyPayload } from './editorTypography';

export const TITLE_FONT_PT = '26pt';
export const SUBTITLE_FONT_PT = '15pt';

function getBlockStyleDefault(key: BlockStyleKey) {
    return useEditorStyleStore.getState().blockDefaults[key];
}

function textblockAround($pos: ResolvedPos): { pos: number; node: ProseMirrorNode } | null {
    for (let depth = $pos.depth; depth > 0; depth--) {
        const node = $pos.node(depth);
        if (node.isTextblock) return { pos: $pos.before(depth), node };
    }
    return null;
}

/**
 * A paragraph style belongs to every text block the selection touches.
 * Direct character formatting on a run stays; the style only fills what that run does not set.
 */
export function expandSelectionToTextblocks(editor: Editor): void {
    const { state, view } = editor;
    const { selection } = state;
    let fromBlock: { pos: number; node: ProseMirrorNode } | null = null;
    let toBlock: { pos: number; node: ProseMirrorNode } | null = null;

    if (selection instanceof NodeSelection && selection.node.isTextblock) {
        fromBlock = { pos: selection.from, node: selection.node };
        toBlock = fromBlock;
    } else {
        fromBlock = textblockAround(selection.$from);
        toBlock = textblockAround(selection.$to);
    }
    if (!fromBlock || !toBlock) return;

    const from = fromBlock.pos + 1;
    const to = toBlock.pos + toBlock.node.nodeSize - 1;
    const next = TextSelection.create(state.doc, Math.min(from, to), Math.max(from, to));
    if (selection.eq(next)) return;
    view.dispatch(state.tr.setSelection(next));
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
    const { selection } = editor.state;
    const block =
        selection instanceof NodeSelection && selection.node.isTextblock
            ? selection.node
            : selection.$from.parent;
    if (block.type.name === 'heading') {
        const level = Number(block.attrs.level);
        if (level >= 1 && level <= 6) return `h${level}`;
    }
    if (block.type.name === 'paragraph') {
        const slot = block.attrs.nomaiBlockStyle as string | null | undefined;
        if (slot === 'title') return 'title';
        if (slot === 'subtitle') return 'subtitle';
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

const STYLE_KEYS = [
    'fontFamily',
    'fontSize',
    'color',
    'bold',
    'italic',
    'underline',
    'lineHeight',
    'textAlign',
    'marginTop',
    'marginBottom',
] as const;

function mergeStylePayload(
    builtin: EditorTypographyPayload,
    saved: EditorTypographyPayload | null | undefined,
): EditorTypographyPayload {
    if (!saved) return builtin;
    const merged: EditorTypographyPayload = { ...builtin };
    for (const key of STYLE_KEYS) {
        const value = saved[key];
        if (value !== undefined && value !== null) {
            merged[key] = value as never;
        }
    }
    return merged;
}

function hasParagraphFields(payload: EditorTypographyPayload): boolean {
    return [payload.lineHeight, payload.textAlign, payload.marginTop, payload.marginBottom].some(
        (value) => value != null && String(value).trim() !== '',
    );
}

function hasCharacterFields(payload: EditorTypographyPayload): boolean {
    if (payload.bold === true || payload.italic === true || payload.underline === true) return true;
    return [payload.fontFamily, payload.fontSize, payload.color].some(
        (value) => value != null && String(value).trim() !== '',
    );
}

/**
 * Paragraph properties replace the block's own spacing and alignment.
 * Character properties of the style fill only runs that do not already carry that property.
 */
export function applySavedParagraphFormatting(editor: Editor, payload: EditorTypographyPayload): boolean {
    let changed = false;
    if (hasParagraphFields(payload)) {
        changed = applyTypographyPayload(editor, {
            lineHeight: payload.lineHeight,
            textAlign: payload.textAlign,
            marginTop: payload.marginTop,
            marginBottom: payload.marginBottom,
        }) || changed;
    }
    changed = fillMissingCharacterStyle(editor, payload) || changed;
    return changed;
}

function fillMissingCharacterStyle(editor: Editor, payload: EditorTypographyPayload): boolean {
    if (!hasCharacterFields(payload)) return false;
    const { state, view } = editor;
    if (state.selection.empty) {
        return applyTypographyPayload(editor, {
            fontFamily: payload.fontFamily,
            fontSize: payload.fontSize,
            color: payload.color,
            bold: payload.bold === true ? true : undefined,
            italic: payload.italic === true ? true : undefined,
            underline: payload.underline === true ? true : undefined,
        });
    }

    const { from, to } = state.selection;
    const textStyle = state.schema.marks.textStyle;
    const bold = state.schema.marks.bold;
    const italic = state.schema.marks.italic;
    const underline = state.schema.marks.underline;
    let tr = state.tr;
    let touched = false;

    state.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isText || !node.text) return;
        const start = Math.max(from, pos);
        const end = Math.min(to, pos + node.nodeSize);
        if (start >= end) return;

        const current = node.marks.find((mark) => mark.type === textStyle);
        const attrs = { ...(current?.attrs as Record<string, unknown> | undefined) };
        let styleChanged = false;
        if (payload.fontFamily && !String(attrs.fontFamily ?? '').trim()) {
            attrs.fontFamily = payload.fontFamily;
            styleChanged = true;
        }
        if (payload.fontSize && !String(attrs.fontSize ?? '').trim()) {
            attrs.fontSize = payload.fontSize;
            styleChanged = true;
        }
        if (payload.color && !String(attrs.color ?? '').trim()) {
            attrs.color = payload.color;
            styleChanged = true;
        }
        if (styleChanged && textStyle) {
            tr = tr.addMark(start, end, textStyle.create(attrs));
            touched = true;
        }
        if (payload.bold === true && bold && !node.marks.some((mark) => mark.type === bold)) {
            tr = tr.addMark(start, end, bold.create());
            touched = true;
        }
        if (payload.italic === true && italic && !node.marks.some((mark) => mark.type === italic)) {
            tr = tr.addMark(start, end, italic.create());
            touched = true;
        }
        if (payload.underline === true && underline && !node.marks.some((mark) => mark.type === underline)) {
            tr = tr.addMark(start, end, underline.create());
            touched = true;
        }
    });

    if (!touched) return false;
    view.dispatch(tr);
    return true;
}

/**
 * Paragraf / başlık / başlık satırı seçiminin değerini uygular (toolbar ve ⌘⌥ kısayolları).
 * `p` | `title` | `subtitle` | `h1`…`h6`
 */
export function applyParagraphStyleSelectValue(editor: Editor, value: string): void {
    normalizeListSelectionForStyleChange(editor);
    expandSelectionToTextblocks(editor);
    const ch = editor.chain().focus();
    if (value === 'p') {
        ch.setParagraph().updateAttributes('paragraph', { nomaiBlockStyle: null }).run();
        applySavedParagraphFormatting(editor, mergeStylePayload({}, getBlockStyleDefault('p')));
        return;
    }
    if (value === 'title') {
        ch.setParagraph().updateAttributes('paragraph', { nomaiBlockStyle: 'title' }).run();
        applySavedParagraphFormatting(
            editor,
            mergeStylePayload({ fontSize: TITLE_FONT_PT, bold: true }, getBlockStyleDefault('title')),
        );
        return;
    }
    if (value === 'subtitle') {
        ch.setParagraph().updateAttributes('paragraph', { nomaiBlockStyle: 'subtitle' }).run();
        applySavedParagraphFormatting(
            editor,
            mergeStylePayload({ fontSize: SUBTITLE_FONT_PT, color: '#5f6368' }, getBlockStyleDefault('subtitle')),
        );
        return;
    }
    const level = parseInt(value.replace('h', ''), 10);
    if (level >= 1 && level <= 6) {
        ch.setHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run();
        const saved = getBlockStyleDefault(`h${level}` as BlockStyleKey);
        if (saved) applySavedParagraphFormatting(editor, saved);
    }
}
