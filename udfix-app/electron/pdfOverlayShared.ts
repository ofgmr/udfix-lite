/**
 * Pure (pdf-lib-free) types and helpers shared between the renderer and the
 * main process for the two-pass UDF→PDF overlay export.
 *
 * Keeping this module free of `pdf-lib` lets the renderer import the variant
 * selection / token resolution / overlay HTML assembly without pulling
 * pdf-lib into the renderer bundle. The pdf-lib overlay merge lives in
 * `electron/pdfOverlay.ts` (main only).
 */

export type HfVariantCompiled = {
    headerHtml: string;
    footerHtml: string;
};

export type HfOverlayPayload = {
    variants: {
        default: HfVariantCompiled;
        firstPage: HfVariantCompiled;
        lastPage: HfVariantCompiled;
        oddPage: HfVariantCompiled;
        evenPage: HfVariantCompiled;
    };
    differentFirstPage: boolean;
    differentLastPage: boolean;
    differentOddEvenPages: boolean;
    docTitle: string;
    /**
     * Body `@page` insets and the matching HF band box (px).
     * `top` / `bottom` are the full reserved bands (ruler pad + measured panel
     * content + content gap). Horizontal `left` / `right` and the pad fields
     * mirror the ruler (`--rm-margin-*` / `--rm-content-margin-*`).
     */
    pageMarginPx: {
        top: number;
        bottom: number;
        left?: number;
        right?: number;
        headerPadTop?: number;
        headerPadBottom?: number;
        footerPadTop?: number;
        footerPadBottom?: number;
    };
    offlineFontFaceCss: string;
    themeVarsCss: string;
    /**
     * Optional per-page HF HTML snapped from the live PaginationPlus DOM.
     * Used when store-compiled variant strings are empty (or as a supplement):
     * body page i prefers `perPageBands[i]` when the resolved variant slot is
     * empty. Extra body pages beyond the screen count clamp to the last band.
     */
    perPageBands?: HfVariantCompiled[];
};

export type ExportPdfWithOverlayPayload = {
    bodyHtml: string;
    hfOverlay: HfOverlayPayload;
    suggestedBaseName?: string;
    printToPdfOptions?: Record<string, unknown>;
};

/**
 * Mirrors `useHeaderFooterStore.getSectionKeyForPage` so variant selection in
 * the overlay matches the editor / store contract exactly.
 *
 * Priority: firstPage (page 1, if enabled) → lastPage (last page, if enabled
 * and totalPages > 1) → oddPage/evenPage (if enabled) → default.
 */
export function resolveHfVariantKey(
    pageIndex0: number,
    totalPages: number,
    payload: Pick<
        HfOverlayPayload,
        'differentFirstPage' | 'differentLastPage' | 'differentOddEvenPages'
    >,
): 'default' | 'firstPage' | 'lastPage' | 'oddPage' | 'evenPage' {
    const isFirstPage = pageIndex0 === 0;
    const isLastPage = pageIndex0 === totalPages - 1;
    if (isFirstPage && payload.differentFirstPage) return 'firstPage';
    if (isLastPage && payload.differentLastPage && totalPages > 1) return 'lastPage';
    if (payload.differentOddEvenPages) {
        const isOdd = (pageIndex0 + 1) % 2 !== 0;
        return isOdd ? 'oddPage' : 'evenPage';
    }
    return 'default';
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Resolve `{page}` / `{total}` / `{totalPages}` tokens in a compiled variant
 * HTML string for a specific page. `compileHfHtml` (renderer) leaves these
 * verbatim; main resolves them per-page during overlay assembly once the body
 * page count is known.
 */
export function resolveHfPageTokens(html: string, pageNumber: number, totalPages: number): string {
    return html
        .replace(/\{page\}/g, String(pageNumber))
        .replace(/\{total\}/g, String(totalPages))
        .replace(/\{totalPages\}/g, String(totalPages));
}

/** True when compiled/live HF HTML has no visible text or images. */
export function hfOverlayHtmlLooksEmpty(html: string): boolean {
    const s = String(html || '').trim();
    if (!s) return true;
    if (/<(img|svg)\b/i.test(s)) return false;
    if (/\{(?:page|total|totalPages|date|title)\}/i.test(s)) return false;
    const text = s
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length === 0;
}

/**
 * Resolve header+footer HTML for body page index `pageIndex0`. Prefer the
 * store-compiled variant; fall back to live DOM `perPageBands` when the
 * variant slot is empty.
 */
export function resolveHfOverlayPageHtml(
    payload: HfOverlayPayload,
    pageIndex0: number,
    pageCount: number,
): HfVariantCompiled {
    const key = resolveHfVariantKey(pageIndex0, pageCount, payload);
    const variant = payload.variants[key] ?? { headerHtml: '', footerHtml: '' };
    const fallback = key === 'default' ? variant : (payload.variants.default ?? { headerHtml: '', footerHtml: '' });
    const pageNumber = pageIndex0 + 1;
    const chosenHeader = variant.headerHtml || '';
    const chosenFooter = variant.footerHtml || '';
    // An empty odd/even/first/last slot keeps the default letterhead for that
    // side. Otherwise a text-only "ÇİFT" footer hides the default header logo,
    // and a first-page text header is the only thing that ever prints.
    const headerSource = hfOverlayHtmlLooksEmpty(chosenHeader) ? fallback.headerHtml || '' : chosenHeader;
    const footerSource = hfOverlayHtmlLooksEmpty(chosenFooter) ? fallback.footerHtml || '' : chosenFooter;
    let headerHtml = resolveHfPageTokens(headerSource, pageNumber, pageCount);
    let footerHtml = resolveHfPageTokens(footerSource, pageNumber, pageCount);

    const bands = payload.perPageBands;
    if (bands && bands.length > 0) {
        const live = bands[Math.min(pageIndex0, bands.length - 1)] ?? { headerHtml: '', footerHtml: '' };
        if (hfOverlayHtmlLooksEmpty(headerHtml) && !hfOverlayHtmlLooksEmpty(live.headerHtml)) {
            headerHtml = resolveHfPageTokens(live.headerHtml || '', pageNumber, pageCount);
        }
        if (hfOverlayHtmlLooksEmpty(footerHtml) && !hfOverlayHtmlLooksEmpty(live.footerHtml)) {
            footerHtml = resolveHfPageTokens(live.footerHtml || '', pageNumber, pageCount);
        }
    }
    return { headerHtml, footerHtml };
}

function overlayPx(value: number | undefined, fallback = 0): number {
    const n = value ?? fallback;
    if (!Number.isFinite(n)) return Math.max(0, Math.round(fallback));
    return Math.max(0, Math.round(n));
}

/**
 * Build the N-page HF overlay HTML document. Each page is one A4 table
 * (`height` just under 297mm) so Chromium emits one sheet per variant.
 * A flex column at exactly 297mm with `overflow:hidden` painted only page 1
 * and dropped the rest. Header/footer cells use the same ruler padding as
 * the editor (`--rm-margin-*` plus the content gap). Margin on `@page` is 0
 * so the stamp sits in the body PDF's reserved bands.
 */
export function buildHfOverlayHtmlFromPayload(
    payload: HfOverlayPayload,
    pageCount: number,
): string {
    const box = payload.pageMarginPx;
    const left = overlayPx(box.left);
    const right = overlayPx(box.right);
    const headerPadTop = overlayPx(box.headerPadTop);
    const headerPadBottom = overlayPx(box.headerPadBottom);
    const footerPadTop = overlayPx(box.footerPadTop);
    const footerPadBottom = overlayPx(box.footerPadBottom);
    const headerBand = overlayPx(box.top, headerPadTop + headerPadBottom);
    const footerBand = overlayPx(box.bottom, footerPadTop + footerPadBottom);
    const pages: string[] = [];
    for (let i = 0; i < pageCount; i += 1) {
        const { headerHtml, footerHtml } = resolveHfOverlayPageHtml(payload, i, pageCount);
        pages.push(
            `<table class="udf-hf-page">` +
                `<tr><td class="udf-hf-band">` +
                `<header class="udf-hf-header" style="min-height:${headerBand}px;padding:${headerPadTop}px ${right}px ${headerPadBottom}px ${left}px;">${headerHtml}</header>` +
                `</td></tr>` +
                `<tr><td class="udf-hf-spacer"></td></tr>` +
                `<tr><td class="udf-hf-band">` +
                `<footer class="udf-hf-footer" style="min-height:${footerBand}px;padding:${footerPadTop}px ${right}px ${footerPadBottom}px ${left}px;">${footerHtml}</footer>` +
                `</td></tr>` +
                `</table>`,
        );
    }
    return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(payload.docTitle || 'Belge')}</title>
<style id="nomai-offline-font-faces">${payload.offlineFontFaceCss || ''}</style>
<style>
@page { size: 210mm 297mm; margin: 0; }
html, body { margin: 0 !important; padding: 0 !important; box-sizing: border-box !important; }
body {
  background: transparent !important;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  font-size: 10px;
  line-height: 1.4;
  color: #000;
}
${payload.themeVarsCss || ''}
table.udf-hf-page {
  width: 210mm;
  height: calc(297mm - 2px);
  border-collapse: collapse;
  border-spacing: 0;
  table-layout: fixed;
  break-after: page;
  page-break-after: always;
  overflow: hidden;
  background: transparent;
}
table.udf-hf-page:last-child {
  break-after: auto;
  page-break-after: auto;
}
.udf-hf-spacer { height: 100%; }
.udf-hf-header, .udf-hf-footer {
  display: block;
  box-sizing: border-box;
  width: 100%;
  overflow: visible;
  font-size: 10px;
  line-height: 1.4;
  color: #000;
  visibility: visible;
  opacity: 1;
}
.udf-hf-header { vertical-align: top; }
.udf-hf-footer { vertical-align: bottom; }
.udf-hf-header img, .udf-hf-footer img { max-width: 100% !important; height: auto !important; object-fit: contain !important; vertical-align: middle !important; display: inline-block !important; }
</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`;
}
