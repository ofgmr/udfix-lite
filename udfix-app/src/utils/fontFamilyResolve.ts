import type { Editor } from '@tiptap/react';
import { ALL_FONTS } from '../fonts/offlineFontRegistry';
import { getMarkerFontFamily } from './listFormatUtils';

export type ResolvedFont = { name: string; stack: string };

export type SelectionFontFamilyState = {
    mixed: boolean;
    raw: string | null;
    font: ResolvedFont | null;
};

/** First family token in a CSS font-family stack (`"Times New Roman", Times, serif` → `Times New Roman`). */
export function primaryFontName(stack: string | null | undefined): string | null {
    if (stack == null) return null;
    const first = String(stack).split(',')[0]?.trim() ?? '';
    const unquoted = first.replace(/^["']+|["']+$/g, '').trim();
    return unquoted || null;
}

export function matchOfflineFont(stack: string | null | undefined): ResolvedFont | null {
    const primary = primaryFontName(stack);
    if (!primary) return null;
    const lower = primary.toLowerCase();
    const hit =
        ALL_FONTS.find((f) => primaryFontName(f.stack)?.toLowerCase() === lower) ??
        ALL_FONTS.find((f) => f.name.toLowerCase() === lower);
    return hit ? { name: hit.name, stack: hit.stack } : null;
}

function textStyleFontFamily(marks: readonly { type: { name: string }; attrs: Record<string, unknown> }[]): string | null {
    const ts = marks.find((m) => m.type.name === 'textStyle');
    const raw = ts?.attrs?.fontFamily;
    return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

function computedFontFamilyAt(editor: Editor): string | null {
    try {
        const { from } = editor.state.selection;
        const dom = editor.view.domAtPos(from);
        const el = (dom.node.nodeType === 1 ? dom.node : dom.node.parentElement) as Element | null;
        if (!el || typeof window === 'undefined') return null;
        const ff = window.getComputedStyle(el).fontFamily;
        return ff && ff.trim() !== '' ? ff.trim() : null;
    } catch {
        return null;
    }
}

function fallbackFont(raw: string | null): ResolvedFont | null {
    if (!raw) return null;
    return matchOfflineFont(raw) ?? { name: primaryFontName(raw) ?? raw, stack: raw };
}

/**
 * Font family at the caret / selection: list marker, TextStyle marks, then computed CSS.
 * Matches UDF imports that store `Times New Roman` without the toolbar CSS stack.
 */
export function getSelectionFontFamilyState(editor: Editor): SelectionFontFamilyState {
    const markerFont = getMarkerFontFamily(editor);
    if (markerFont) {
        return { mixed: false, raw: markerFont, font: fallbackFont(markerFont) };
    }

    const { state } = editor;
    const { from, to, empty, $from } = state.selection;

    if (empty) {
        const marks = state.storedMarks ?? $from.marks();
        const fromMark = textStyleFontFamily(marks);
        const raw = fromMark ?? computedFontFamilyAt(editor);
        return { mixed: false, raw, font: fallbackFont(raw) };
    }

    const stacks: string[] = [];
    let sawUnstyled = false;
    state.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isText || !node.text) return;
        const start = Math.max(from, pos);
        const end = Math.min(to, pos + node.text.length);
        if (start >= end) return;
        const fam = textStyleFontFamily(node.marks);
        if (fam) stacks.push(fam);
        else sawUnstyled = true;
    });

    const primaries = new Set(
        stacks.map((s) => primaryFontName(s)?.toLowerCase()).filter((n): n is string => Boolean(n)),
    );

    if (primaries.size > 1) {
        return { mixed: true, raw: stacks[0] ?? null, font: fallbackFont(stacks[0] ?? null) };
    }
    if (primaries.size === 1 && !sawUnstyled) {
        return { mixed: false, raw: stacks[0] ?? null, font: fallbackFont(stacks[0] ?? null) };
    }
    if (primaries.size === 1 && sawUnstyled) {
        return { mixed: true, raw: stacks[0] ?? null, font: fallbackFont(stacks[0] ?? null) };
    }

    const computed = computedFontFamilyAt(editor);
    return { mixed: false, raw: computed, font: fallbackFont(computed) };
}
