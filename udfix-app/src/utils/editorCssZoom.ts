/**
 * Cumulative CSS `zoom` factor between `start` and the document root.
 *
 * `getBoundingClientRect()` returns visual (post-zoom) pixels. Inline CSS
 * lengths (`top`, `margin-bottom`, …) on a node inside
 * `.udfix-editor-zoom-shell { zoom: 0.75 }` are un-zoomed CSS pixels that the
 * engine then zooms. A measured 600 px visual gap must be written as
 * `800px` (= 600 / 0.75).
 *
 * Returns 1 if no ancestor has zoom — safe to divide by.
 */
export function getCumulativeCssZoom(start: Element | null): number {
    if (!start || typeof window === 'undefined') return 1;
    let factor = 1;
    let node: Element | null = start;
    while (node && node !== document.documentElement) {
        const zStr = window.getComputedStyle(node).zoom;
        if (zStr && zStr !== 'normal') {
            const z = Number.parseFloat(zStr);
            if (Number.isFinite(z) && z > 0) factor *= z;
        }
        node = node.parentElement;
    }
    return factor > 0 ? factor : 1;
}

/** Convert a visual (getBoundingClientRect) delta into CSS pixels for `style.top`. */
export function cssPxFromViewportDelta(visualDeltaPx: number, zoom: number): number {
    const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    return visualDeltaPx / scale;
}
