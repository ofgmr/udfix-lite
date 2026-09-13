import { PageNumber, TextRun, UnderlineType } from 'docx';
import { htmlStringToPlainText } from '../htmlPlainText';
import { mapFontFamilyForDocx } from './fontMap';
import {
    DEFAULT_DOCX_FONT_HALF_POINTS,
    fontSizeHalfPointsFromCssLength,
} from './fontSizeHalfPoints';

const PAGE_FIELD_TOKEN_RE = /\{page\}|\{totalPages?\}|\{total\}/gi;

export type HtmlInlineToDocxRunsOptions = {
    /** Resolve `{page}` / `{total}` tokens to native Word PAGE fields. */
    pageFields?: boolean;
};

type InlineStyle = {
    bold?: boolean;
    italics?: boolean;
    underline?: { type?: (typeof UnderlineType)[keyof typeof UnderlineType] };
    strike?: boolean;
    font?: string;
    size?: number;
    color?: string;
    shading?: { fill?: string };
};

function parseColor(raw: string | undefined): string | undefined {
    if (!raw?.trim()) return undefined;
    const v = raw.trim();
    if (/^#[0-9a-f]{3,8}$/i.test(v)) return v.replace('#', '');
    const m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (m) {
        const hex = (n: string) => Number.parseInt(n, 10).toString(16).padStart(2, '0');
        return `${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
    }
    return undefined;
}

function applyElementStyle(el: HTMLElement, style: InlineStyle, defaultFont: string): InlineStyle {
    const next: InlineStyle = { ...style };
    switch (el.tagName.toLowerCase()) {
        case 'strong':
        case 'b':
            next.bold = true;
            break;
        case 'em':
        case 'i':
            next.italics = true;
            break;
        case 'u':
            next.underline = { type: UnderlineType.SINGLE };
            break;
        case 's':
        case 'strike':
        case 'del':
            next.strike = true;
            break;
        case 'mark':
            next.shading = { fill: parseColor(el.style.backgroundColor) ?? 'FFFF00' };
            break;
        default:
            break;
    }

    const inline = el.getAttribute('style') ?? '';
    if (inline) {
        const ff = inline.match(/font-family\s*:\s*([^;]+)/i)?.[1];
        if (ff) next.font = mapFontFamilyForDocx(ff, defaultFont);
        const fs = inline.match(/font-size\s*:\s*([^;]+)/i)?.[1];
        const parsedSize = fontSizeHalfPointsFromCssLength(fs);
        if (parsedSize) next.size = parsedSize;
        const fg = inline.match(/(?:^|[^-])color\s*:\s*([^;]+)/i)?.[1];
        const parsedColor = parseColor(fg);
        if (parsedColor) next.color = parsedColor;
        const bg = inline.match(/background(?:-color)?\s*:\s*([^;]+)/i)?.[1];
        const parsedBg = parseColor(bg);
        if (parsedBg) next.shading = { fill: parsedBg };
        if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(inline)) next.bold = true;
        if (/font-style\s*:\s*italic/i.test(inline)) next.italics = true;
        if (/text-decoration\s*:\s*[^;]*underline/i.test(inline)) {
            next.underline = { type: UnderlineType.SINGLE };
        }
        if (/text-decoration\s*:\s*[^;]*line-through/i.test(inline)) next.strike = true;
    }

    return next;
}

function runSize(style: InlineStyle): number {
    return style.size ?? DEFAULT_DOCX_FONT_HALF_POINTS;
}

function styleToRun(text: string, style: InlineStyle, defaultFont: string): TextRun {
    return new TextRun({
        text,
        font: style.font ?? defaultFont,
        bold: style.bold,
        italics: style.italics,
        underline: style.underline,
        strike: style.strike,
        size: runSize(style),
        color: style.color,
        shading: style.shading,
    });
}

function pageFieldRun(token: string, style: InlineStyle, defaultFont: string): TextRun {
    const field = /^\{page\}$/i.test(token) ? PageNumber.CURRENT : PageNumber.TOTAL_PAGES;
    return new TextRun({
        children: [field],
        font: style.font ?? defaultFont,
        size: runSize(style),
    });
}

function textToRunsWithPageFields(text: string, style: InlineStyle, defaultFont: string): TextRun[] {
    const runs: TextRun[] = [];
    let lastIndex = 0;
    for (const match of text.matchAll(PAGE_FIELD_TOKEN_RE)) {
        const idx = match.index ?? 0;
        if (idx > lastIndex) {
            runs.push(styleToRun(text.slice(lastIndex, idx), style, defaultFont));
        }
        runs.push(pageFieldRun(match[0], style, defaultFont));
        lastIndex = idx + match[0].length;
    }
    if (lastIndex < text.length) {
        runs.push(styleToRun(text.slice(lastIndex), style, defaultFont));
    }
    return runs;
}

function appendTextRuns(
    runs: TextRun[],
    text: string,
    style: InlineStyle,
    defaultFont: string,
    pageFields: boolean,
): void {
    if (!text) return;
    if (pageFields && PAGE_FIELD_TOKEN_RE.test(text)) {
        PAGE_FIELD_TOKEN_RE.lastIndex = 0;
        runs.push(...textToRunsWithPageFields(text, style, defaultFont));
        return;
    }
    runs.push(styleToRun(text, style, defaultFont));
}

/** Convert inline HTML (footnote bodies, simple markup) to docx TextRun array. */
export function htmlInlineToDocxRuns(
    html: string,
    defaultFont: string,
    options: HtmlInlineToDocxRunsOptions = {},
): TextRun[] {
    const { pageFields = false } = options;
    const trimmed = (html || '').replace(/\r\n/g, '\n').trim();
    if (!trimmed) {
        return [new TextRun({ text: ' ', font: defaultFont, size: DEFAULT_DOCX_FONT_HALF_POINTS })];
    }

    if (!/<[a-z][\s\S]*>/i.test(trimmed)) {
        if (pageFields && PAGE_FIELD_TOKEN_RE.test(trimmed)) {
            PAGE_FIELD_TOKEN_RE.lastIndex = 0;
            return textToRunsWithPageFields(trimmed, {}, defaultFont);
        }
        return [new TextRun({ text: trimmed, font: defaultFont, size: DEFAULT_DOCX_FONT_HALF_POINTS })];
    }

    if (typeof document === 'undefined') {
        const plain = htmlStringToPlainText(trimmed);
        if (pageFields && PAGE_FIELD_TOKEN_RE.test(plain)) {
            PAGE_FIELD_TOKEN_RE.lastIndex = 0;
            return textToRunsWithPageFields(plain, {}, defaultFont);
        }
        return [new TextRun({ text: plain, font: defaultFont, size: DEFAULT_DOCX_FONT_HALF_POINTS })];
    }

    const root = document.createElement('div');
    root.innerHTML = trimmed;
    const runs: TextRun[] = [];

    const walk = (node: Node, style: InlineStyle) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent ?? '';
            appendTextRuns(runs, text, style, defaultFont, pageFields);
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (tag === 'br') {
            runs.push(new TextRun({ break: 1 }));
            return;
        }

        const nextStyle = applyElementStyle(el, style, defaultFont);
        if (tag === 'p' || tag === 'div') {
            if (runs.length > 0) runs.push(new TextRun({ break: 1 }));
            el.childNodes.forEach((child) => walk(child, nextStyle));
            return;
        }

        el.childNodes.forEach((child) => walk(child, nextStyle));
    };

    root.childNodes.forEach((child) => walk(child, {}));
    return runs.length > 0
        ? runs
        : [new TextRun({ text: htmlStringToPlainText(trimmed), font: defaultFont, size: DEFAULT_DOCX_FONT_HALF_POINTS })];
}
