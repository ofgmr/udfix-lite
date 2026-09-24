import type { Editor } from '@tiptap/react';
import type { ListStyleType } from '../extensions/ExtendedOrderedList';
import { getSelectionFontFamilyState } from './fontFamilyResolve';

export type LayoutBlockName = 'paragraph' | 'heading';

/** Parse margin CSS length to approximate pt (px uses 96dpi). */
export function marginAttrToPt(value: unknown): number | null {
    if (value == null || value === '') return null;
    // Indent extension stores margin top/bottom as px numbers.
    if (typeof value === 'number') {
        if (Number.isNaN(value) || value <= 0.05) return null;
        return (value * 72) / 96;
    }
    const str = String(value).trim().toLowerCase();
    const m = str.match(/^([\d.]+)\s*(pt|px|em|rem)?$/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (Number.isNaN(n)) return null;
    const unit = (m[2] || 'pt') as string;
    if (unit === 'px') return (n * 72) / 96;
    if (unit === 'em' || unit === 'rem') return n * 12;
    return n;
}

/** True when margin is set to ~12pt (toolbar “standart paragraf boşluğu”). */
export function isStandardParagraphGapPt(value: unknown, targetPt = 12): boolean {
    const pt = marginAttrToPt(value);
    return pt != null && Math.abs(pt - targetPt) < 0.75;
}

/** True when any positive margin is set (pt/px/em). */
export function hasPositiveMargin(value: unknown): boolean {
    const pt = marginAttrToPt(value);
    return pt != null && pt > 0.05;
}

const LINE_HEIGHT_PRESETS = [1, 1.15, 1.5, 2] as const;

/** Maps stored line-height to a preset value, or '' if custom / unknown. */
export function lineHeightPresetRadioValue(raw: unknown): string {
    if (raw == null || raw === '') return '';
    const n = parseFloat(String(raw).replace(',', '.'));
    if (Number.isNaN(n)) return '';
    for (const p of LINE_HEIGHT_PRESETS) {
        if (Math.abs(n - p) < 0.021) return String(p);
    }
    return '';
}

/** Deepest paragraph or heading wrapping the selection (skips listItem wrapper). */
export function getActiveLayoutBlock(editor: Editor): {
    name: LayoutBlockName;
    attrs: Record<string, unknown>;
    level?: number;
} | null {
    const { $from } = editor.state.selection;
    for (let d = $from.depth; d > 0; d--) {
        const node = $from.node(d);
        if (node.type.name === 'paragraph') {
            return { name: 'paragraph', attrs: { ...node.attrs } };
        }
        if (node.type.name === 'heading') {
            return {
                name: 'heading',
                attrs: { ...node.attrs },
                level: node.attrs.level as number,
            };
        }
    }
    return null;
}

export interface EditorTypographyPayload {
    fontFamily?: string | null;
    fontSize?: string | null;
    lineHeight?: string | null;
    marginTop?: string | null;
    marginBottom?: string | null;
    textAlign?: string | null;
    color?: string | null;
    /** Kayıtlı stil yuvası için; yoksa uygulanmaz (geri uyumluluk). */
    bold?: boolean | null;
    italic?: boolean | null;
    underline?: boolean | null;
}

export function captureTypographyPayload(editor: Editor): EditorTypographyPayload {
    const { $from } = editor.state.selection;
    /** Seçimin başı ($from): araç çubuğuna tıklayınca ve kısmi seçimde TipTap’ın getAttributes aralığıyla uyumlu, tutarlı örnekleme. */
    const textStyleMark = $from.marks().find((m) => m.type.name === 'textStyle');
    const ts = (textStyleMark ? textStyleMark.attrs : editor.getAttributes('textStyle')) as {
        fontFamily?: string;
        fontSize?: string;
        color?: string;
    };
    const fontState = getSelectionFontFamilyState(editor);
    const fontFamily = fontState.font?.stack ?? fontState.raw ?? ts.fontFamily ?? null;
    const block = getActiveLayoutBlock(editor);
    const attrs = block?.attrs ?? {};
    return {
        fontFamily,
        fontSize: ts.fontSize ?? null,
        lineHeight: (attrs.lineHeight as string) ?? null,
        marginTop: (attrs.marginTop as string) ?? null,
        marginBottom: (attrs.marginBottom as string) ?? null,
        textAlign: (attrs.textAlign as string) ?? null,
        color: ts.color ?? null,
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
    };
}

export function applyTypographyPayload(editor: Editor, p: EditorTypographyPayload): boolean {
    const chain = editor.chain().focus();
    let touched = false;

    if (p.fontFamily != null && p.fontFamily !== '') {
        chain.setFontFamily(p.fontFamily);
        touched = true;
    } else if (p.fontFamily === '') {
        chain.unsetFontFamily();
        touched = true;
    }

    if (p.fontSize != null && p.fontSize !== '') {
        // FontSize extension
        (chain as unknown as { setFontSize: (s: string) => typeof chain }).setFontSize(p.fontSize);
        touched = true;
    }

    if (p.lineHeight != null && p.lineHeight !== '') {
        chain.setLineHeight(p.lineHeight);
        touched = true;
    }

    if (p.textAlign != null && p.textAlign !== '') {
        chain.setTextAlign(p.textAlign as 'left' | 'center' | 'right' | 'justify');
        touched = true;
    }

    if (p.color != null && p.color !== '') {
        chain.setColor(p.color);
        touched = true;
    } else if (p.color === '') {
        chain.unsetColor();
        touched = true;
    }

    if (p.marginTop != null && p.marginTop !== '') {
        chain.setMarginTop(p.marginTop);
        touched = true;
    }

    if (p.marginBottom != null && p.marginBottom !== '') {
        chain.setMarginBottom(p.marginBottom);
        touched = true;
    }

    if (p.bold === true) {
        chain.setBold();
        touched = true;
    } else if (p.bold === false) {
        chain.unsetBold();
        touched = true;
    }

    if (p.italic === true) {
        chain.setItalic();
        touched = true;
    } else if (p.italic === false) {
        chain.unsetItalic();
        touched = true;
    }

    if (p.underline === true) {
        chain.setUnderline();
        touched = true;
    } else if (p.underline === false) {
        chain.unsetUnderline();
        touched = true;
    }

    if (!touched) return false;
    return chain.run();
}

const FORMAT_PAINTER_SKIP = new Set([
    'link',
    'comment',
    'footnoteReference',
    'mention',
    'attachment',
]);

export interface FormatPainterSnapshot {
    marks: Array<{ type: string; attrs: Record<string, unknown> }>;
    /** Bold / italic / underline / strike / scripts — applied via explicit commands (reliable with TipTap). */
    inlineMarks: {
        bold: boolean;
        italic: boolean;
        underline: boolean;
        strike: boolean;
        subscript: boolean;
        superscript: boolean;
    };
    textStyle: Record<string, unknown>;
    highlightColor?: string | null;
    textAlign: string | null;
}

export function captureFormatPainterSnapshot(editor: Editor): FormatPainterSnapshot {
    const { from } = editor.state.selection;
    const $from = editor.state.doc.resolve(from);
    const skipInline = new Set(['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript']);
    const marks = $from
        .marks()
        .filter((m) => !FORMAT_PAINTER_SKIP.has(m.type.name) && !skipInline.has(m.type.name))
        .map((m) => ({ type: m.type.name, attrs: { ...(m.attrs || {}) } }));
    const hl = editor.getAttributes('highlight') as { color?: string };
    const block = getActiveLayoutBlock(editor);
    return {
        marks,
        inlineMarks: {
            bold: editor.isActive('bold'),
            italic: editor.isActive('italic'),
            underline: editor.isActive('underline'),
            strike: editor.isActive('strike'),
            subscript: editor.isActive('subscript'),
            superscript: editor.isActive('superscript'),
        },
        textStyle: { ...editor.getAttributes('textStyle') },
        highlightColor: hl?.color ?? null,
        textAlign: (block?.attrs.textAlign as string) ?? null,
    };
}

export function applyFormatPainterSnapshot(editor: Editor, snap: FormatPainterSnapshot): boolean {
    const { empty, from, to } = editor.state.selection;
    let chain = editor.chain().focus();
    if (!empty) {
        chain = chain.setTextSelection({ from, to });
    }

    if (snap.textAlign) {
        chain = chain.setTextAlign(snap.textAlign as 'left' | 'center' | 'right' | 'justify');
    }

    const ts = snap.textStyle as {
        fontFamily?: string;
        fontSize?: string;
        color?: string;
    };
    if (ts.fontFamily) {
        chain = chain.setFontFamily(ts.fontFamily);
    }
    if (ts.fontSize) {
        chain = (chain as unknown as { setFontSize: (s: string) => typeof chain }).setFontSize(ts.fontSize);
    }
    if (ts.color) {
        chain = chain.setColor(ts.color);
    }

    if (snap.highlightColor) {
        chain = chain.setHighlight({ color: snap.highlightColor });
    } else {
        chain = chain.unsetHighlight();
    }

    const im = snap.inlineMarks;
    chain = im.bold ? chain.setBold() : chain.unsetBold();
    chain = im.italic ? chain.setItalic() : chain.unsetItalic();
    chain = im.underline ? chain.setUnderline() : chain.unsetUnderline();
    chain = im.strike ? chain.setStrike() : chain.unsetStrike();
    chain = im.subscript ? chain.setSubscript() : chain.unsetSubscript();
    chain = im.superscript ? chain.setSuperscript() : chain.unsetSuperscript();

    for (const m of snap.marks) {
        if (m.type === 'textStyle' || m.type === 'highlight') continue;
        if (FORMAT_PAINTER_SKIP.has(m.type)) continue;
        try {
            chain = chain.setMark(m.type, m.attrs);
        } catch {
            /* unknown mark */
        }
    }

    return chain.run();
}

export function applyOrderedListStyle(editor: Editor, style: ListStyleType): void {
    const runStyleOnly = () =>
        (editor.chain().focus() as unknown as { setListStyle: (s: ListStyleType) => { run: () => boolean } })
            .setListStyle(style)
            .run()

    if (editor.isActive('orderedList') && runStyleOnly()) return

    const switched = editor.chain().focus().toggleOrderedList().run()
    if (!switched) return

    // Some states (especially when toolbar popovers steal focus) need a second pass.
    runStyleOnly()
}
