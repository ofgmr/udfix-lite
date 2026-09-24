import type { XmlParagraph } from '../types/uyapXml';
import type { TiptapNode } from './converter';
import {
    uyapPtStringToPx,
    uyapSpaceToCssMargin,
    uyapHangingPtIsSchemaDefault,
    uyapTabSetFirstStopCssPx,
} from './uyapImportUnits';
import {
    UYAP_DEFAULT_IMPORT_TAB_SIZE_PX,
    UYAP_IMPORT_BLOCK_GAP_MARGIN,
    type UyapParagraphEnd,
} from './uyapParagraphText';

/** Body default in the editor (`LineHeight`). UYAP draws single spacing when the attribute is omitted. */
export const UDFIX_DEFAULT_CSS_LINE_HEIGHT = 1.5;

/**
 * UYAP `LineSpacing` is Swing's extra-space factor (`ParagraphView` bottom inset =
 * line height × factor): `0` single, `0.5` = 1.5, `1` double. CSS `line-height` is the
 * full multiple, so the attribute is `css - 1`. Writing the CSS number (or omitting 1.5)
 * makes UYAP Doküman Editörü draw single spacing.
 */
export function cssLineHeightToUyapLineSpacing(lineHeight: unknown): string {
    const raw =
        lineHeight == null || String(lineHeight).trim() === ''
            ? String(UDFIX_DEFAULT_CSS_LINE_HEIGHT)
            : String(lineHeight).trim().replace(',', '.');
    const css = Number.parseFloat(raw);
    const factor = Number.isFinite(css) ? Math.max(0, css - 1) : UDFIX_DEFAULT_CSS_LINE_HEIGHT - 1;
    return formatUyapSpacingNumber(factor);
}

export function uyapLineSpacingToCssLineHeight(lineSpacing: string | undefined): string | null {
    if (lineSpacing == null || String(lineSpacing).trim() === '') return null;
    const factor = Number.parseFloat(String(lineSpacing).trim().replace(',', '.'));
    if (!Number.isFinite(factor) || factor < 0) return null;
    const css = Math.round((1 + factor) * 1000) / 1000;
    if (Math.abs(css - UDFIX_DEFAULT_CSS_LINE_HEIGHT) < 0.001) return null;
    return formatCssLineHeightNumber(css);
}

function formatUyapSpacingNumber(n: number): string {
    const rounded = Math.round(n * 1000) / 1000;
    if (Math.abs(rounded) < 1e-6) return '0.0';
    if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return `${Math.round(rounded)}.0`;
    return String(rounded);
}

function formatCssLineHeightNumber(n: number): string {
    const rounded = Math.round(n * 1000) / 1000;
    if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
    return String(rounded);
}

const alignmentMap: Record<string, string> = {
    '0': 'left',
    '1': 'center',
    '2': 'right',
    '3': 'justify',
};

export function uyapParagraphBlockKind(p: XmlParagraph): 'heading' | 'paragraph' {
    const name = p.$?.name ?? '';
    if (/^UDFIX-H[1-6]$/i.test(name)) return 'heading';
    return 'paragraph';
}

export function uyapHeadingLevel(p: XmlParagraph): number {
    const name = p.$?.name ?? '';
    const m = name.match(/^UDFIX-H([1-6])$/i);
    return m ? Number.parseInt(m[1], 10) : 1;
}

/** UYAP `Hanging` → CSS: first line at block edge, wrapped lines inset (padding compensates negative indent). */
export function uyapHangingIndentCss(hangingPx: number): string {
    const px = Math.round(hangingPx);
    // Clamp padding so the wrapped-line column never collapses on a narrow page/content box
    // (otherwise `overflow-wrap` shreds words letter-by-letter into the margin at page breaks).
    return `box-sizing: border-box; text-indent: -${px}px; padding-left: min(${px}px, max(0px, calc(100% - 96px)));`;
}

export function uyapParagraphAttrsToTipTap(
    p: XmlParagraph,
    importOptions?: {
        blockGapAfter?: boolean;
        paragraphEnd?: UyapParagraphEnd | null;
        hasTabElements?: boolean;
    },
): TiptapNode['attrs'] {
    const a = p.$ ?? {};
    const attrs: Record<string, string | number | boolean | null | undefined> = {
        textAlign: alignmentMap[a.Alignment ?? ''] || 'left',
    };

    if (a.TabSet) attrs.uyapTabSet = a.TabSet;

    const leftPx = uyapPtStringToPx(a.LeftIndent);
    if (leftPx != null && leftPx > 0) attrs.marginLeft = Math.round(leftPx);

    const rightPx = uyapPtStringToPx(a.RightIndent);
    if (rightPx != null && rightPx > 0) attrs.marginRight = Math.round(rightPx);

    const firstPx = uyapPtStringToPx(a.FirstLineIndent);
    const hangingRaw = a.Hanging ?? a.HangingIndent;
    const hangingPx = uyapPtStringToPx(hangingRaw);
    const align = alignmentMap[a.Alignment ?? ''] || 'left';
    const skipHanging = align === 'right' || align === 'center';
    if (firstPx != null && firstPx !== 0) {
        attrs.textIndent = Math.round(firstPx);
    } else if (
        !skipHanging &&
        hangingPx != null &&
        !uyapHangingPtIsSchemaDefault(Number.parseFloat(String(hangingRaw ?? '0')))
    ) {
        attrs.textIndent = -Math.round(hangingPx);
    }

    const marginTop = uyapSpaceToCssMargin('above', a.SpaceAbove);
    if (marginTop) attrs.marginTop = marginTop;

    const marginBottom = uyapSpaceToCssMargin('below', a.SpaceBelow);
    if (marginBottom) attrs.marginBottom = marginBottom;

    const lineHeight = uyapLineSpacingToCssLineHeight(a.LineSpacing);
    if (lineHeight) attrs.lineHeight = lineHeight;

    if (importOptions?.blockGapAfter) attrs.nomaiUyapBlockGap = true;
    if (importOptions?.paragraphEnd) attrs.nomaiUyapParagraphEnd = importOptions.paragraphEnd;
    else if (importOptions && importOptions.paragraphEnd === null) {
        attrs.nomaiUyapSuppressParagraphEnd = true;
    }
    if (importOptions?.hasTabElements) attrs.nomaiUyapTabElements = true;

    if (a.KeepWithNext === 'true') attrs.keepWithNext = true;

    const name = a.name ?? '';
    if (name === 'UDFIX-Title') attrs.nomaiBlockStyle = 'title';
    else if (name === 'UDFIX-Subtitle') attrs.nomaiBlockStyle = 'subtitle';

    return attrs;
}

export function uyapParagraphStyleForHtml(
    p: XmlParagraph,
    options?: { hasTabCharacters?: boolean; blockGapAfter?: boolean },
): string {
    const a = p.$ ?? {};
    const alignment = alignmentMap[a.Alignment ?? ''] || 'left';
    let pStyle = `text-align: ${alignment}; white-space: pre-wrap;`;

    const leftPx = uyapPtStringToPx(a.LeftIndent);
    if (leftPx != null && leftPx > 0) pStyle += ` margin-left: ${leftPx}px;`;

    const rightPx = uyapPtStringToPx(a.RightIndent);
    if (rightPx != null && rightPx > 0) pStyle += ` margin-right: ${rightPx}px;`;

    const firstPx = uyapPtStringToPx(a.FirstLineIndent);
    const hangingRaw = a.Hanging ?? a.HangingIndent;
    const hangingPx = uyapPtStringToPx(hangingRaw);
    // Right/center + hanging clips leading glyphs in narrow UYAP amount cells (e.g. "2.625…" → ".625…").
    const skipHanging = alignment === 'right' || alignment === 'center';
    if (firstPx != null && firstPx !== 0) pStyle += ` text-indent: ${firstPx}px;`;
    else if (
        !skipHanging &&
        hangingPx != null &&
        !uyapHangingPtIsSchemaDefault(Number.parseFloat(String(hangingRaw ?? '0')))
    ) {
        pStyle += ` ${uyapHangingIndentCss(hangingPx)}`;
    }

    const marginTop = uyapSpaceToCssMargin('above', a.SpaceAbove);
    if (marginTop) pStyle += ` margin-top: ${marginTop};`;

    const marginBottom = uyapSpaceToCssMargin('below', a.SpaceBelow);
    if (marginBottom) pStyle += ` margin-bottom: ${marginBottom};`;

    const lineHeight = uyapLineSpacingToCssLineHeight(a.LineSpacing);
    if (lineHeight) pStyle += ` line-height: ${lineHeight};`;

    if (options?.blockGapAfter) pStyle += ` margin-bottom: ${UYAP_IMPORT_BLOCK_GAP_MARGIN};`;

    if (a.TabSet) {
        const tabPx = uyapTabSetFirstStopCssPx(String(a.TabSet));
        if (tabPx != null) pStyle += ` tab-size: ${tabPx}px;`;
    } else if (options?.hasTabCharacters) {
        pStyle += ` tab-size: ${UYAP_DEFAULT_IMPORT_TAB_SIZE_PX}px;`;
    }

    return pStyle;
}

export function uyapParagraphHtmlAttrs(
    p: XmlParagraph,
    options?: { blockGapAfter?: boolean; paragraphEnd?: UyapParagraphEnd | null },
): Record<string, string> {
    const a = p.$ ?? {};
    const out: Record<string, string> = {};
    if (options?.blockGapAfter) out['data-nomai-uyap-block-gap'] = '1';
    if (options?.paragraphEnd === '\n\n') out['data-nomai-uyap-paragraph-end'] = 'double';
    else if (options?.paragraphEnd === '\n') out['data-nomai-uyap-paragraph-end'] = 'single';
    else if (options && options.paragraphEnd === null) out['data-nomai-uyap-suppress-paragraph-end'] = '1';
    if (a.TabSet) out['data-uyap-tab-set'] = a.TabSet;
    if ((p.tab?.length ?? 0) > 0) out['data-nomai-uyap-tab-elements'] = '1';
    const block = a.name;
    if (block === 'UDFIX-Title') out['data-nomai-block-style'] = 'title';
    else if (block === 'UDFIX-Subtitle') out['data-nomai-block-style'] = 'subtitle';
    return out;
}
