/** Hit width of the native vertical scrollbar gutter, from the scrollport's right edge. */
export const EDITOR_SCROLLBAR_HIT_PX = 18;

/** How long the page tip stays after scrolling stops, unless the pointer is still on the gutter. */
export const EDITOR_SCROLL_PAGE_TIP_HIDE_MS = 700;

/** Floor so a long document does not shrink the estimated thumb to a sliver. */
export const EDITOR_SCROLL_PAGE_TIP_MIN_THUMB_PX = 28;

/**
 * Probe a few pixels below the scrollport top so the label matches the page
 * occupying the top of the canvas, not the page that has only barely entered.
 */
export const EDITOR_SCROLL_PAGE_PROBE_PX = 12;

/** Keep the tip inside the scrollport when the thumb sits at either end. */
export const EDITOR_SCROLL_PAGE_TIP_EDGE_PX = 22;

export type ScrollPageTip = {
    page: number;
    total: number;
    /** Thumb center, in pixels from the scrollport top. */
    centerY: number;
};

/**
 * Visual top of a PaginationPlus `.page` spacer.
 * The node's border box sits at the end of the page body; the sheet starts
 * `margin-top` above that box. `zoom` is the editor shell's CSS zoom, because
 * `getBoundingClientRect` is scaled and `getComputedStyle` margin is not.
 */
export function pageStartViewportY(borderTop: number, marginTopPx: number, zoom = 1): number {
    const margin = Number.isFinite(marginTopPx) ? marginTopPx : 0;
    const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    return borderTop - margin * scale;
}

/**
 * 1-based page index for visual page-start Y values in document order.
 * The current page is the last page whose start has reached `probeY`.
 * When every page is still below the probe (ruler / top padding), the result is page 1.
 */
export function pageIndexFromViewportTops(pageTops: readonly number[], probeY: number): number {
    if (pageTops.length === 0) return 1;
    let index = 0;
    for (let i = 0; i < pageTops.length; i++) {
        const top = pageTops[i];
        if (Number.isFinite(top) && top <= probeY) index = i;
    }
    return index + 1;
}

/**
 * Estimated vertical-scrollbar thumb center.
 * Returns null when the scrollport does not overflow.
 */
export function scrollbarThumbCenterY(
    scrollTop: number,
    scrollHeight: number,
    clientHeight: number,
    minThumb = EDITOR_SCROLL_PAGE_TIP_MIN_THUMB_PX,
): number | null {
    if (!Number.isFinite(scrollTop) || !Number.isFinite(scrollHeight) || !Number.isFinite(clientHeight)) {
        return null;
    }
    if (clientHeight <= 0 || scrollHeight <= clientHeight + 1) return null;
    const thumbHeight = Math.min(
        clientHeight,
        Math.max(minThumb, (clientHeight / scrollHeight) * clientHeight),
    );
    const maxScroll = scrollHeight - clientHeight;
    const travel = Math.max(0, clientHeight - thumbHeight);
    const thumbTop = maxScroll <= 0 ? 0 : (Math.min(Math.max(scrollTop, 0), maxScroll) / maxScroll) * travel;
    return thumbTop + thumbHeight / 2;
}

export function clampTipCenterY(
    centerY: number,
    clientHeight: number,
    margin = EDITOR_SCROLL_PAGE_TIP_EDGE_PX,
): number {
    if (!Number.isFinite(centerY) || !Number.isFinite(clientHeight) || clientHeight <= 0) return margin;
    const lo = Math.min(margin, clientHeight / 2);
    const hi = Math.max(lo, clientHeight - margin);
    return Math.min(hi, Math.max(lo, centerY));
}

/** Page label for the editor canvas scrollbar. `pageTops` are viewport Y of each `.page`. */
export function scrollPageTipFromMetrics(input: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    scrollportTop: number;
    pageTops: readonly number[];
}): ScrollPageTip | null {
    const center = scrollbarThumbCenterY(input.scrollTop, input.scrollHeight, input.clientHeight);
    if (center == null) return null;
    const probeY = input.scrollportTop + EDITOR_SCROLL_PAGE_PROBE_PX;
    const total = Math.max(1, input.pageTops.length);
    const page = Math.min(total, pageIndexFromViewportTops(input.pageTops, probeY));
    return {
        page,
        total,
        centerY: clampTipCenterY(center, input.clientHeight),
    };
}
