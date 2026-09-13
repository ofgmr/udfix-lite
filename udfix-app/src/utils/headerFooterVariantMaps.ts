import { compileHfHtml } from './compileHfHtml';
import { resolveCssVarsInHtmlString } from './resolveCssVarsForExport';
import type {
    HeaderFooterSection,
    HeaderFooterSettings,
} from '../stores/useHeaderFooterStore';

/** Same shape as the slice passed from `useHeaderFooterStore` into editor sync. */
export type HeaderFooterVariantSlice = {
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
    s: HeaderFooterVariantSlice,
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

export type HeaderFooterVariantMaps = {
    defaultHeader: string;
    defaultFooter: string;
    customHeader: Record<number, { headerLeft: string; headerRight: string }>;
    customFooter: Record<number, { footerLeft: string; footerRight: string }>;
};

const SECTION_HTML_FIELDS: Array<keyof HeaderFooterSection> = [
    'headerLeft',
    'headerCenter',
    'headerRight',
    'footerLeft',
    'footerCenter',
    'footerRight',
];

/** True when compiled HF HTML would be an empty bar (no text, vars, or images). */
export function hfHtmlLooksEmpty(html: string): boolean {
    const s = String(html || '').trim();
    if (!s) return true;
    if (/<(img|svg)\b/i.test(s)) return false;
    if (/\{(?:page|total|totalPages|date|title)\}/i.test(s)) return false;
    if (/data-type=["']variable["']/i.test(s)) return false;
    const text = s.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
    return text.length === 0;
}

/**
 * True when the active HF variants have something to paint.
 * Empty default + unused first/last/odd-even sections must not trigger PaginationPlus rebuilds.
 */
export function headerFooterSliceHasVisibleContent(s: HeaderFooterVariantSlice): boolean {
    const keys: Array<keyof HeaderFooterVariantSlice['sections']> = ['default'];
    if (s.differentFirstPage) keys.push('firstPage');
    if (s.differentLastPage) keys.push('lastPage');
    if (s.differentOddEvenPages) {
        keys.push('oddPage', 'evenPage');
    }
    for (const key of keys) {
        const sec = s.sections[key];
        for (const field of SECTION_HTML_FIELDS) {
            if (!hfHtmlLooksEmpty(sec[field])) return true;
        }
    }
    return false;
}

/**
 * Compiles default + per-page custom header/footer HTML for PaginationPlus sync.
 * `totalPages` must match the number of `.page` sheets under `[data-rm-pagination]` (see `countPaginationPlusLogicalPages`).
 */
export function buildHeaderFooterVariantMaps(
    totalPages: number,
    docTitle: string,
    s: HeaderFooterVariantSlice,
): HeaderFooterVariantMaps {
    const resolveTotal = (html: string) =>
        html.replace(/\{total\}/g, String(totalPages)).replace(/\{totalPages\}/g, String(totalPages));

    const defaultHeader = resolveTotal(compileHfHtml(getCompileOpts(s, s.sections.default, true, docTitle)));
    const defaultFooter = resolveTotal(compileHfHtml(getCompileOpts(s, s.sections.default, false, docTitle)));

    const customHeader: Record<number, { headerLeft: string; headerRight: string }> = {};
    const customFooter: Record<number, { footerLeft: string; footerRight: string }> = {};

    if (s.differentFirstPage) {
        customHeader[1] = {
            headerLeft: resolveTotal(compileHfHtml(getCompileOpts(s, s.sections.firstPage, true, docTitle))),
            headerRight: '',
        };
        customFooter[1] = {
            footerLeft: resolveTotal(compileHfHtml(getCompileOpts(s, s.sections.firstPage, false, docTitle))),
            footerRight: '',
        };
    }
    if (s.differentLastPage && totalPages > 1) {
        customHeader[totalPages] = {
            headerLeft: resolveTotal(compileHfHtml(getCompileOpts(s, s.sections.lastPage, true, docTitle))),
            headerRight: '',
        };
        customFooter[totalPages] = {
            footerLeft: resolveTotal(compileHfHtml(getCompileOpts(s, s.sections.lastPage, false, docTitle))),
            footerRight: '',
        };
    }
    if (s.differentOddEvenPages) {
        const oddH = resolveTotal(compileHfHtml(getCompileOpts(s, s.sections.oddPage, true, docTitle)));
        const oddF = resolveTotal(compileHfHtml(getCompileOpts(s, s.sections.oddPage, false, docTitle)));
        const evenH = resolveTotal(compileHfHtml(getCompileOpts(s, s.sections.evenPage, true, docTitle)));
        const evenF = resolveTotal(compileHfHtml(getCompileOpts(s, s.sections.evenPage, false, docTitle)));
        /* Only emit keys 1..totalPages — padding to a fixed max forced PaginationPlus to grow page count. */
        for (let pg = 1; pg <= totalPages; pg++) {
            if (customHeader[pg]) continue;
            const isOdd = pg % 2 !== 0;
            customHeader[pg] = { headerLeft: isOdd ? oddH : evenH, headerRight: '' };
            customFooter[pg] = { footerLeft: isOdd ? oddF : evenF, footerRight: '' };
        }
    }

    return { defaultHeader, defaultFooter, customHeader, customFooter };
}
