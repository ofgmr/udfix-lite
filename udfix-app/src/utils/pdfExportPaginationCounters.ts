/**
 * PDF export page-count freeze: `{total}` / `{totalPages}` must match the live
 * PaginationPlus `.rm-page-break` count, including a QR verification block that
 * was inserted into the snapshot DOM before counters are frozen.
 */

export function countPdfExportPageBreaks(root: ParentNode): number {
    return root.querySelectorAll('[data-rm-pagination] > .rm-page-break').length;
}

/**
 * Direct-child `.rm-page-break` count under `[data-rm-pagination]` for HTML
 * fixtures (no DOM). Nested matches are ignored by slicing from the first
 * pagination marker.
 */
export function countPdfExportPageBreaksInHtml(html: string): number {
    const marker = html.search(/data-rm-pagination\b/i);
    if (marker < 0) return 0;
    const region = html.slice(marker);
    const matches = region.match(/<[^>]*\brm-page-break\b[^>]*>/gi);
    return matches?.length ?? 0;
}

export function resolvePdfExportTotalPages(pageBreakCount: number): number {
    return Math.max(1, pageBreakCount);
}

export function applyFrozenTotalPageTokens(html: string, totalPages: number): string {
    const totalPagesStr = String(totalPages);
    return html.replace(/\{totalPages\}/g, totalPagesStr).replace(/\{total\}/g, totalPagesStr);
}

/** String-path freeze used by tests and as the last step of a cloned snapshot. */
export function freezeTotalPagesInPdfSnapshotHtml(html: string): { html: string; totalPages: number } {
    const totalPages = resolvePdfExportTotalPages(countPdfExportPageBreaksInHtml(html));
    return { html: applyFrozenTotalPageTokens(html, totalPages), totalPages };
}

/**
 * PaginationPlus DOM layout for `[data-rm-pagination] > .rm-page-break[i]`:
 *   .page                              → page (i+1) content
 *   .breaker > .rm-page-footer         → footer of page (i+1)
 *   .breaker > .rm-pagination-gap
 *   .breaker > .rm-page-header         → header of page (i+2) (next page)
 *
 * The page-1 header lives outside the wrapper as `.rm-first-page-header`.
 *
 * Page numbers come from a CSS counter in plugin head styles; the print window
 * does not load those styles, so we freeze numbers to text so footer of pb[i]
 * gets `i+1` and the header inside pb[i] (which belongs to the next page) gets
 * `i+2`. Treating both bands the same way prints `i+1` everywhere → every
 * header shows the previous page's number.
 */
export function freezePaginationCounters(clone: HTMLElement): void {
    const pageBreaks = Array.from(clone.querySelectorAll<HTMLElement>('[data-rm-pagination] > .rm-page-break'));
    const totalPages = resolvePdfExportTotalPages(pageBreaks.length);
    const totalPagesStr = String(totalPages);

    pageBreaks.forEach((pb, i) => {
        const footerPageNo = String(i + 1);
        const headerPageNo = String(i + 2);

        pb.querySelectorAll<HTMLElement>(
            '.rm-page-footer .rm-page-number, .rm-page-footer .rm-page-number-plus, .rm-page-footer-1 .rm-page-number, .rm-page-footer-1 .rm-page-number-plus',
        ).forEach((el) => {
            el.textContent = footerPageNo;
        });
        pb.querySelectorAll<HTMLElement>('.rm-page-header .rm-page-number, .rm-page-header .rm-page-number-plus').forEach((el) => {
            el.textContent = headerPageNo;
        });
        pb.querySelectorAll<HTMLElement>('[data-type="variable"][data-id="totalPages"], [data-type="variable"][data-id="total"]').forEach((el) => {
            el.textContent = totalPagesStr;
        });
    });

    clone.querySelectorAll<HTMLElement>('.rm-first-page-header .rm-page-number, .rm-first-page-header .rm-page-number-plus').forEach((el) => {
        el.textContent = '1';
    });
    clone.querySelectorAll<HTMLElement>('.rm-first-page-header [data-type="variable"][data-id="totalPages"], .rm-first-page-header [data-type="variable"][data-id="total"]').forEach((el) => {
        el.textContent = totalPagesStr;
    });
}
