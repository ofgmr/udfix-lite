export function resolveBandClampMaxHeightPx(
    budgetPx: number,
    liveHeightPx: number | null | undefined,
): number {
    const roundedBudget = Math.max(1, Math.round(Number.isFinite(budgetPx) ? budgetPx : 1));
    if (!Number.isFinite(liveHeightPx ?? Number.NaN)) return roundedBudget;
    const roundedLive = Math.max(1, Math.round(liveHeightPx as number));
    return Math.max(roundedBudget, roundedLive);
}

export type PdfBandBudgetSnapshot = {
    marginTopPx: number;
    marginBottomPx: number;
    contentMarginTopPx: number;
    contentMarginBottomPx: number;
    headerBudgetPx: number;
    footerBudgetPx: number;
    pageHeightPx: number;
    contentBoxHeightPx: number;
};

/**
 * Editor/PDF content box: pageHeight − header band − footer band.
 * Body (including table rows) must fit inside this height so the next page’s
 * first lines cannot paint into the previous footer band during print
 * fragmentation. Matches PaginationPlus `getHeight()._pageHeight` (floored).
 */
export function computePdfPageContentBoxHeightPx(
    pageHeightPx: number,
    headerBudgetPx: number,
    footerBudgetPx: number,
    floorPx = 80,
): number {
    const page = Math.max(1, Math.round(Number.isFinite(pageHeightPx) ? pageHeightPx : 1));
    const header = Math.max(0, Math.round(Number.isFinite(headerBudgetPx) ? headerBudgetPx : 0));
    const footer = Math.max(0, Math.round(Number.isFinite(footerBudgetPx) ? footerBudgetPx : 0));
    const floor = Math.max(1, Math.round(Number.isFinite(floorPx) ? floorPx : 80));
    const raw = page - header - footer;
    return Math.max(floor, Number.isFinite(raw) ? raw : floor);
}

/**
 * After `.rm-pagination-gap` is stripped, each float cycle is
 * `content + footer + nextHeader ≈ pageHeight`. Ending the sheet after the
 * footer alone leaves a hole ≈ next header band; float-wrapped body paints
 * into it (926-test). Bare `break-after:page` on the footer also inflated
 * page count (12→13) without closing that hole. Print inserts an opaque
 * `.rm-print-page-end-fill` of this height between footer and next header,
 * then breaks after the fill.
 */
export function computePdfPrintBreakerHoleFillPx(
    headerBudgetPx: number,
    liveHeaderHeightsPx: ReadonlyArray<number> = [],
): number {
    const budget = Math.max(1, Math.round(Number.isFinite(headerBudgetPx) ? headerBudgetPx : 1));
    let fill = budget;
    for (const live of liveHeaderHeightsPx) {
        if (!Number.isFinite(live) || live <= 0) continue;
        fill = Math.max(fill, Math.round(live));
    }
    return fill;
}

function toFiniteNonNegativePx(raw: string | null | undefined, fallback = 0): number {
    const v = Number.parseFloat(String(raw ?? '').trim());
    if (!Number.isFinite(v) || v < 0) return fallback;
    return Math.round(v);
}

/**
 * Export/runtime must derive page geometry from the same `--rm-*` variables.
 * This snapshot is used for both clamp budgeting and debug dumps.
 */
export function readPdfBandBudgetSnapshotFromStyles(
    style: Pick<CSSStyleDeclaration, 'getPropertyValue'>,
): PdfBandBudgetSnapshot {
    const marginTopPx = toFiniteNonNegativePx(style.getPropertyValue('--rm-margin-top'), 40);
    const marginBottomPx = toFiniteNonNegativePx(style.getPropertyValue('--rm-margin-bottom'), 40);
    const contentMarginTopPx = toFiniteNonNegativePx(style.getPropertyValue('--rm-content-margin-top'), 10);
    const contentMarginBottomPx = toFiniteNonNegativePx(style.getPropertyValue('--rm-content-margin-bottom'), 10);
    const pageHeightPx = Math.max(1, toFiniteNonNegativePx(style.getPropertyValue('--rm-page-height'), 1123));
    const headerBudgetPx = Math.max(1, marginTopPx + contentMarginTopPx);
    const footerBudgetPx = Math.max(1, marginBottomPx + contentMarginBottomPx);
    const contentBoxHeightPx = computePdfPageContentBoxHeightPx(
        pageHeightPx,
        headerBudgetPx,
        footerBudgetPx,
    );
    return {
        marginTopPx,
        marginBottomPx,
        contentMarginTopPx,
        contentMarginBottomPx,
        headerBudgetPx,
        footerBudgetPx,
        pageHeightPx,
        contentBoxHeightPx,
    };
}

/**
 * First-page header/footer nodes live outside the pagination breaker strip.
 * Their vertical flow metrics (especially margin-top for first footer) are
 * part of the plugin's page-boundary projection and must be preserved in PDF
 * snapshots; continued-page bands can safely reset to zero margins.
 */
export function shouldPreserveLiveBandFlowMetrics(className: string): boolean {
    const tokens = ` ${className || ''} `;
    return (
        tokens.includes(' rm-first-page-header ') ||
        tokens.includes(' rm-first-page-footer ') ||
        // PaginationPlus can expose first-page footer as `.rm-page-footer-1`.
        // Preserve its live flow metrics so print clone keeps page-1 anchoring.
        tokens.includes(' rm-page-footer-1 ')
    );
}
