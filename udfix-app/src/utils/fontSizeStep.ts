import type { Editor } from '@tiptap/react';
import type { EditorState, Transaction } from '@tiptap/pm/state';

export const EDITOR_FONT_SIZES_PT = [
    8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72,
] as const;

const DEFAULT_FONT_SIZE_PT = 12;

export function parseFontSizePt(raw: string | null | undefined): number | null {
    if (raw == null || String(raw).trim() === '') return null;
    const match = String(raw).trim().match(/^([\d.]+)\s*(pt|px)?$/i);
    if (!match) return null;
    const n = parseFloat(match[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
}

export function stepFontSizePt(
    current: number | null,
    direction: 1 | -1,
    fallback = DEFAULT_FONT_SIZE_PT,
): number {
    const n = current ?? fallback;
    if (direction === 1) {
        return EDITOR_FONT_SIZES_PT.find((s) => s > n) ?? n;
    }
    return [...EDITOR_FONT_SIZES_PT].reverse().find((s) => s < n) ?? n;
}

export type SelectionFontSizeState = {
    mixed: boolean;
    displayValue: string;
};

export function getSelectionFontSizeState(editor: Editor): SelectionFontSizeState {
    const { from, to, empty } = editor.state.selection;

    if (empty) {
        const raw = editor.getAttributes('textStyle').fontSize as string | undefined;
        const pt = parseFontSizePt(raw);
        return { mixed: false, displayValue: pt == null ? '' : String(pt) };
    }

    const sizes = new Set<number | null>();
    editor.state.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isText || !node.text) return;
        const start = Math.max(from, pos);
        const end = Math.min(to, pos + node.text.length);
        if (start >= end) return;
        const mark = node.marks.find((m) => m.type.name === 'textStyle');
        sizes.add(parseFontSizePt(mark?.attrs?.fontSize as string | undefined));
    });

    if (sizes.size <= 1) {
        const only = sizes.values().next().value as number | null | undefined;
        return { mixed: false, displayValue: only == null ? '' : String(only) };
    }

    return { mixed: true, displayValue: '' };
}

function getActiveTextStyleAttrs(state: EditorState): Record<string, unknown> {
    const textStyle = state.schema.marks.textStyle;
    if (!textStyle) return {};

    const stored = state.storedMarks?.find((m) => m.type === textStyle);
    if (stored) return { ...stored.attrs };

    const atCursor = textStyle.isInSet(state.selection.$from.marks());
    return { ...(atCursor?.attrs ?? {}) };
}

export type StepFontSizeTransactionResult =
    | { kind: 'stored'; tr: Transaction }
    | { kind: 'range'; tr: Transaction }
    | null;

export function buildStepFontSizeTransaction(
    state: EditorState,
    direction: 1 | -1,
    baseTr?: Transaction,
): StepFontSizeTransactionResult {
    const { from, to, empty } = state.selection;
    const textStyle = state.schema.marks.textStyle;
    if (!textStyle) return null;

    if (empty) {
        const raw = getActiveTextStyleAttrs(state).fontSize as string | undefined;
        const next = stepFontSizePt(parseFontSizePt(raw), direction);
        const attrs = { ...getActiveTextStyleAttrs(state), fontSize: `${next}pt` };
        const mark = textStyle.create(attrs);
        let tr = baseTr ?? state.tr;
        const currentStored = tr.storedMarks ?? state.storedMarks;
        const nextStored = currentStored
            ? currentStored.filter((m) => m.type !== textStyle).concat(mark)
            : [mark];
        tr = tr.setStoredMarks(nextStored);
        return { kind: 'stored', tr };
    }

    const segments: { from: number; to: number; fontSizePt: number | null }[] = [];

    state.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isText || !node.text) return;
        const start = Math.max(from, pos);
        const end = Math.min(to, pos + node.text.length);
        if (start >= end) return;
        const mark = node.marks.find((m) => m.type.name === 'textStyle');
        segments.push({
            from: start,
            to: end,
            fontSizePt: parseFontSizePt(mark?.attrs?.fontSize as string | undefined),
        });
    });

    if (segments.length === 0) return null;

    let tr = baseTr ?? state.tr;
    let changed = false;

    for (const seg of [...segments].reverse()) {
        const currentPt = seg.fontSizePt ?? DEFAULT_FONT_SIZE_PT;
        const nextPt = stepFontSizePt(seg.fontSizePt, direction);
        if (nextPt === currentPt) continue;

        const $from = state.doc.resolve(seg.from);
        const existing = textStyle.isInSet($from.marks());
        const attrs = { ...(existing?.attrs ?? {}), fontSize: `${nextPt}pt` };

        tr = tr.removeMark(seg.from, seg.to, textStyle);
        tr = tr.addMark(seg.from, seg.to, textStyle.create(attrs));
        changed = true;
    }

    if (!changed) return null;
    return { kind: 'range', tr };
}
