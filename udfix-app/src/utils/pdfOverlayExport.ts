/**
 * Renderer-side helpers for the two-pass UDF→PDF export (native Chromium body
 * + pdf-lib HF overlay).
 *
 * The body PDF is produced by the existing `buildPdfExportPayloadFromEditor`
 * path, then ALL PaginationPlus HF chrome is stripped from the body HTML so
 * Chromium paginates the continuous text flow natively across A4 sheets with
 * reserved top/bottom @page margins (no float drift, no content-then-chrome
 * order bug). The HF overlay is assembled in main from per-variant compiled
 * header/footer HTML (one page per body page) and stamped on top with pdf-lib.
 *
 * Variant selection mirrors `useHeaderFooterStore.getSectionKeyForPage`:
 *   page 1 → firstPage if differentFirstPage else default
 *   last page → lastPage if differentLastPage (and totalPages > 1) else default
 *   odd/even → oddPage/evenPage if differentOddEvenPages else default
 *
 * Header/footer HTML comes only from the panel store via `compileHfHtml`.
 * Live PaginationPlus bands are not a fallback.
 */
import { compileHfHtml } from './compileHfHtml';
import { resolveCssVarsInHtmlString } from './resolveCssVarsForExport';
import { countPaginationPlusLogicalPages } from './paginationMarginSync';
import { hfHtmlLooksEmpty } from './headerFooterVariantMaps';
import type {
    HeaderFooterSection,
    HeaderFooterSettings,
} from '../stores/useHeaderFooterStore';
import type { HfVariantCompiled, HfOverlayPayload } from '../../electron/pdfOverlayShared';
import { resolveHfVariantKey, resolveHfPageTokens } from '../../electron/pdfOverlayShared';

export type { HfVariantCompiled, HfOverlayPayload } from '../../electron/pdfOverlayShared';

/**
 * Slice of the HF store needed to compile all 5 variants. Same shape as
 * `HeaderFooterVariantSlice` but we re-declare here to avoid pulling the store
 * import into every caller (headless batch, tests).
 */
export type HfOverlaySlice = {
    sections: {
        default: HeaderFooterSection;
        firstPage: HeaderFooterSection;
        lastPage: HeaderFooterSection;
        oddPage: HeaderFooterSection;
        evenPage: HeaderFooterSection;
    };
    settings: HeaderFooterSettings;
    differentFirstPage: boolean;
    differentLastPage: boolean;
    differentOddEvenPages: boolean;
};

function getCompileOpts(
    s: HfOverlaySlice,
    sec: HeaderFooterSection,
    isHeader: boolean,
    docTitle: string,
) {
    return {
        left: isHeader ? sec.headerLeft : sec.footerLeft,
        center: isHeader ? sec.headerCenter : sec.footerCenter,
        right: isHeader ? sec.headerRight : sec.footerRight,
        layout: isHeader ? s.settings.headerLayout : s.settings.footerLayout,
        dateFormat: s.settings.dateFormat,
        docTitle,
        isHeader,
        showSeparator: isHeader ? s.settings.showHeaderSeparatorLine : s.settings.showFooterSeparatorLine,
        separatorColor: resolveCssVarsInHtmlString(s.settings.separatorLineColor || ''),
        separatorWidth: s.settings.separatorLineWidth,
        indent: isHeader ? s.settings.headerIndent : s.settings.footerIndent,
    };
}

/**
 * Compile all 5 HF variants (default/firstPage/lastPage/oddPage/evenPage) into
 * header+footer HTML strings, ready for the main process to assemble into an
 * N-page overlay document. `{page}` and `{total}` tokens are left verbatim
 * (compileHfHtml already leaves `{page}` verbatim) and resolved per-page in
 * main once the body page count is known.
 */
function compileVariantUnresolved(
    s: HfOverlaySlice,
    sec: HeaderFooterSection,
    docTitle: string,
): HfVariantCompiled {
    const header = compileHfHtml(getCompileOpts(s, sec, true, docTitle));
    const footer = compileHfHtml(getCompileOpts(s, sec, false, docTitle));
    return { headerHtml: header, footerHtml: footer };
}

const SECTION_FIELDS: Array<keyof HeaderFooterSection> = [
    'headerLeft',
    'headerCenter',
    'headerRight',
    'footerLeft',
    'footerCenter',
    'footerRight',
];

/** True when any active HF section column has visible content. */
export function hfOverlaySliceHasVisibleContent(s: HfOverlaySlice): boolean {
    const keys: Array<keyof HfOverlaySlice['sections']> = ['default'];
    if (s.differentFirstPage) keys.push('firstPage');
    if (s.differentLastPage) keys.push('lastPage');
    if (s.differentOddEvenPages) {
        keys.push('oddPage', 'evenPage');
    }
    for (const key of keys) {
        const sec = s.sections[key];
        for (const field of SECTION_FIELDS) {
            if (!hfHtmlLooksEmpty(sec[field])) return true;
        }
    }
    return false;
}

/** True when any compiled variant (or live band) has visible HF HTML. */
export function hfOverlayPayloadHasVisibleContent(p: HfOverlayPayload): boolean {
    for (const v of Object.values(p.variants)) {
        if (!hfHtmlLooksEmpty(v.headerHtml) || !hfHtmlLooksEmpty(v.footerHtml)) return true;
    }
    for (const band of p.perPageBands ?? []) {
        if (!hfHtmlLooksEmpty(band.headerHtml) || !hfHtmlLooksEmpty(band.footerHtml)) return true;
    }
    return false;
}

const LIVE_UI_STRIP_SELECTORS = [
    '.hf-page-zone',
    '.in-context-hf-editor',
    '.ProseMirror-widget',
    '[data-hf-zone]',
];

/**
 * Extract the printable inner HTML of a PaginationPlus HF band element.
 * Prefers the compiled left slot (where `compileHfHtml` packs all columns).
 */
export function extractLiveHfBandInnerHtml(band: Element | null | undefined): string {
    if (!band) return '';
    const clone = band.cloneNode(true) as HTMLElement;
    for (const sel of LIVE_UI_STRIP_SELECTORS) {
        clone.querySelectorAll(sel).forEach((n) => n.remove());
    }
    const left =
        clone.querySelector<HTMLElement>('.rm-page-header-left, .rm-page-footer-left') ??
        clone.querySelector<HTMLElement>('.rm-page-header-content, .rm-page-footer-content');
    const source = left ?? clone;
    return (source.innerHTML || '').trim();
}

/**
 * Snapshot per-page header/footer HTML from the live PaginationPlus DOM.
 * Page 1: `.rm-first-page-header` + `.rm-page-footer-1`.
 * Page N: `.rm-page-header-N` + `.rm-page-footer-N`.
 */
export function snapshotLiveHfPerPageBands(root: ParentNode): HfVariantCompiled[] {
    const pagination = (root as Element).querySelector?.('[data-rm-pagination]') ?? null;
    const pageCount = Math.max(1, countPaginationPlusLogicalPages(pagination));
    const bands: HfVariantCompiled[] = [];
    for (let page = 1; page <= pageCount; page += 1) {
        const headerEl =
            page === 1
                ? (root as ParentNode).querySelector?.('.rm-first-page-header')
                : (root as ParentNode).querySelector?.(`.rm-page-header-${page}`);
        const footerEl = (root as ParentNode).querySelector?.(`.rm-page-footer-${page}`);
        bands.push({
            headerHtml: extractLiveHfBandInnerHtml(headerEl ?? null),
            footerHtml: extractLiveHfBandInnerHtml(footerEl ?? null),
        });
    }
    return bands;
}

/**
 * Build the `hfOverlay` payload for the `export-pdf-with-overlay` IPC from the
 * HF store slice. Each variant's header+footer HTML is pre-compiled via
 * `compileHfHtml`; `{page}` and `{total}` tokens are left verbatim and
 * resolved per-page in main (`resolveHfPageTokens`) once the body page count is
 * known.
 *
 * When `liveRoot` is provided and store columns are empty (or compiled variants
 * are empty) but the live DOM has HF bands, those bands are attached as
 * `perPageBands` so the overlay is never blank.
 */
export function buildHfOverlayPayload(
    slice: HfOverlaySlice,
    options: {
        docTitle: string;
        pageMarginPx: HfOverlayPayload['pageMarginPx'];
        offlineFontFaceCss: string;
        themeVarsCss: string;
    },
): HfOverlayPayload {
    const variants = {
        default: compileVariantUnresolved(slice, slice.sections.default, options.docTitle),
        firstPage: compileVariantUnresolved(slice, slice.sections.firstPage, options.docTitle),
        lastPage: compileVariantUnresolved(slice, slice.sections.lastPage, options.docTitle),
        oddPage: compileVariantUnresolved(slice, slice.sections.oddPage, options.docTitle),
        evenPage: compileVariantUnresolved(slice, slice.sections.evenPage, options.docTitle),
    };
    return {
        variants,
        differentFirstPage: slice.differentFirstPage,
        differentLastPage: slice.differentLastPage,
        differentOddEvenPages: slice.differentOddEvenPages,
        docTitle: options.docTitle,
        pageMarginPx: options.pageMarginPx,
        offlineFontFaceCss: options.offlineFontFaceCss,
        themeVarsCss: options.themeVarsCss,
    };
}

// Re-export the variant resolver for renderer callers (tests, headless batch).
export { resolveHfVariantKey, resolveHfPageTokens } from '../../electron/pdfOverlayShared';

const HF_CHROME_SELECTORS = [
    '.rm-first-page-header',
    '.rm-first-page-footer',
    '.rm-page-header',
    '.rm-page-footer',
    '.rm-page-footer-1',
    '.rm-page-break',
    '.rm-pagination-gap',
];

/**
 * Strip ALL PaginationPlus HF chrome from the body HTML string so Chromium
 * paginates the continuous text flow natively. Removes page-1 header/footer
 * bands, breaker strips, page spacers, and pagination gaps. Keeps the
 * `[data-rm-pagination]` wrapper and the continuous text (the real editor
 * content, which is a sibling of the wrapper).
 *
 * Operates on a string (no DOM) so it runs in both renderer and headless
 * contexts. Uses a balanced-tag strip for the chrome divs.
 */
export function stripHfChromeFromBodyHtml(bodyHtml: string): string {
    let out = bodyHtml;
    for (const selector of HF_CHROME_SELECTORS) {
        out = stripDivsByClassName(out, selector.replace(/^\./, ''));
    }
    // `.page` spacers inside the wrapper are empty float divs; remove them too.
    out = stripDivsByClassName(out, 'page');
    // Collapse now-empty `.breaker` wrappers left after band removal.
    out = out.replace(/<div[^>]*class="[^"]*\bbreaker\b[^"]*"[^>]*>\s*<\/div>/gi, '');
    return out;
}

function stripDivsByClassName(html: string, className: string): string {
    let result = html;
    let match: RegExpExecArray | null;
    // Loop because there can be multiple matches; each strip shifts indices.
    // Use a single pass with a global regex + balanced-tag scan.
    const globalOpen = new RegExp(
        `<div\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`,
        'gi',
    );
    const removals: Array<{ start: number; end: number }> = [];
    while ((match = globalOpen.exec(result)) !== null) {
        const start = match.index;
        const afterOpen = start + match[0].length;
        let depth = 1;
        let i = afterOpen;
        let end = -1;
        while (i < result.length && depth > 0) {
            const nextOpen = result.indexOf('<div', i);
            const nextClose = result.indexOf('</div>', i);
            if (nextClose < 0) break;
            if (nextOpen >= 0 && nextOpen < nextClose) {
                depth += 1;
                i = nextOpen + 4;
                continue;
            }
            depth -= 1;
            i = nextClose + 6;
            if (depth === 0) {
                end = i;
                break;
            }
        }
        if (end > start) {
            removals.push({ start, end });
        }
    }
    // Apply removals from end to start to preserve indices.
    removals.sort((a, b) => b.start - a.start);
    for (const { start, end } of removals) {
        result = result.slice(0, start) + result.slice(end);
    }
    return result;
}

/**
 * True when the body HTML still contains any HF chrome band that should have
 * been stripped. Used by tests / assertions.
 */
export function bodyHtmlHasHfChrome(html: string): boolean {
    return HF_CHROME_SELECTORS.some((sel) =>
        new RegExp(`\\b${sel.replace(/^\./, '')}\\b`).test(html),
    );
}
