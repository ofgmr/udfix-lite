/**
 * Derive UYAP header/footer column HTML from compiled PaginationPlus HF output
 * so UDF export matches the same flex layout as PDF preview.
 */

import { compileHfHtml, type CompileHfOptions } from './compileHfHtml';
import type { HeaderFooterSection, HeaderFooterSettings } from '../stores/useHeaderFooterStore';
import { htmlStringToPlainText } from './htmlPlainText';
import { resolveCssVarsInHtmlString } from './resolveCssVarsForExport';
import { HF_EXPORT_IMG_MAX_HEIGHT_PT, parseHfHtmlToExportSegments } from './udfHfExportSegments';
import type { UyapHfLayoutPreset } from './uyapExportBuild';
import { parseHtmlFragment } from './sanitizeDocumentHtml';

export type HfCompiledColumns = { left: string; center: string; right: string };

/** Parse `compileHfHtml` flex (or docx table) output back into left/center/right slots. */
export function extractHfColumnsFromCompiledHtml(compiled: string): HfCompiledColumns {
    const trimmed = (compiled || '').trim();
    if (!trimmed) return { left: '', center: '', right: '' };

    if (typeof document === 'undefined') {
        return { left: trimmed, center: '', right: '' };
    }

    const wrap = parseHtmlFragment(trimmed);
    if (!wrap) return { left: trimmed, center: '', right: '' };

    const table = wrap.querySelector('table[role="presentation"]');
    if (table) {
        const tds = Array.from(table.querySelectorAll('td'));
        return {
            left: tds[0]?.innerHTML ?? '',
            center: tds[1]?.innerHTML ?? '',
            right: tds[2]?.innerHTML ?? '',
        };
    }

    const outer = wrap.firstElementChild;
    if (outer?.tagName === 'DIV') {
        const cols = Array.from(outer.children).filter((c) => c.tagName === 'DIV');
        if (cols.length >= 3) {
            return {
                left: cols[0].innerHTML,
                center: cols[1].innerHTML,
                right: cols[2].innerHTML,
            };
        }
    }

    return { left: trimmed, center: '', right: '' };
}

export function buildCompileHfOptions(
    settings: HeaderFooterSettings,
    section: HeaderFooterSection,
    isHeader: boolean,
    docTitle: string,
): CompileHfOptions {
    return {
        left: isHeader ? section.headerLeft : section.footerLeft,
        center: isHeader ? section.headerCenter : section.footerCenter,
        right: isHeader ? section.headerRight : section.footerRight,
        layout: isHeader ? settings.headerLayout : settings.footerLayout,
        dateFormat: settings.dateFormat,
        docTitle,
        showSeparator: isHeader ? settings.showHeaderSeparatorLine : settings.showFooterSeparatorLine,
        separatorColor: resolveCssVarsInHtmlString(settings.separatorLineColor || ''),
        separatorWidth: settings.separatorLineWidth,
        indent: isHeader ? settings.headerIndent : settings.footerIndent,
        isHeader,
    };
}

/** Compiled HF columns — same visual layout as PaginationPlus / PDF export. */
export function compileHfColumnsForUdfExport(
    settings: HeaderFooterSettings,
    section: HeaderFooterSection,
    docTitle: string,
): { header: HfCompiledColumns; footer: HfCompiledColumns } {
    const header = extractHfColumnsFromCompiledHtml(
        compileHfHtml(buildCompileHfOptions(settings, section, true, docTitle)),
    );
    const footer = extractHfColumnsFromCompiledHtml(
        compileHfHtml(buildCompileHfOptions(settings, section, false, docTitle)),
    );
    return { header, footer };
}

/** True when a single HF cell has user-visible text, logo, or page-number tokens. */
export function hfHtmlCellHasExportableContent(html: string): boolean {
    const raw = (html || '').trim();
    if (!raw) return false;
    if (/\{page\}|\{totalPages\}|\{total\}/i.test(raw)) return true;
    if (/<img\b/i.test(raw)) return true;
    return htmlStringToPlainText(raw).length > 0;
}

/** True when any default HF column would render non-empty export content. */
export function headerFooterSectionHasExportableContent(section: HeaderFooterSection): boolean {
    return (
        hfHtmlCellHasExportableContent(section.headerLeft) ||
        hfHtmlCellHasExportableContent(section.headerCenter) ||
        hfHtmlCellHasExportableContent(section.headerRight) ||
        hfHtmlCellHasExportableContent(section.footerLeft) ||
        hfHtmlCellHasExportableContent(section.footerCenter) ||
        hfHtmlCellHasExportableContent(section.footerRight)
    );
}

const HF_LINE_HEIGHT_PT = 14;

/** Rough band height (pt) from HF HTML segments — used for headerFOffset/footerFOffset. */
export function estimateHfBandHeightPt(html: string): number {
    const segments = parseHfHtmlToExportSegments(html);
    if (!segments.length) return 0;
    let pt = 0;
    for (const seg of segments) {
        if (seg.type === 'image') {
            pt += parseFloat(seg.heightPt) || HF_EXPORT_IMG_MAX_HEIGHT_PT;
        } else {
            const lines = Math.max(1, seg.text.split('\n').length);
            pt += lines * HF_LINE_HEIGHT_PT;
        }
    }
    return pt;
}

export function hfEmitPlanForEstimate(
    layout: UyapHfLayoutPreset,
    left: string,
    center: string,
    right: string,
): Array<{ html: string }> {
    const L = (left || '').trim();
    const C = (center || '').trim();
    const R = (right || '').trim();
    switch (layout) {
        case '1-col':
            if (C) return [{ html: center }];
            if (L) return [{ html: left }];
            if (R) return [{ html: right }];
            return [];
        case '2-col-70-30':
        case '2-col-80-20':
        case '2-col-30-70':
        case '2-col-20-80':
            return [...(L ? [{ html: left }] : []), ...(R ? [{ html: right }] : [])];
        case '3-col-equal':
        default:
            return [
                ...(L ? [{ html: left }] : []),
                ...(C ? [{ html: center }] : []),
                ...(R ? [{ html: right }] : []),
            ];
    }
}

/** Total UYAP band height when multiple Alignment paragraphs stack in one header/footer zone. */
export function estimateHfZoneHeightPt(
    layout: UyapHfLayoutPreset,
    left: string,
    center: string,
    right: string,
): number {
    const plan = hfEmitPlanForEstimate(layout, left, center, right);
    if (!plan.length) return 0;
    return plan.reduce((sum, row) => sum + estimateHfBandHeightPt(row.html), 0);
}
