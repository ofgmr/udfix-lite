/**
 * Print-only PaginationPlus chrome contract.
 *
 * Screen `.rm-pagination-gap` is editor-only visual sheet separation (footer +
 * gap + next header inside `.breaker`). Chromium print historically still
 * counted those nodes as whitespace / extra pages even with CSS
 * `display: none` — the export snapshot must physically remove them before
 * `printToPDF`.
 *
 * IMPORTANT — do NOT defloat or restructure the breaker:
 *   - PaginationPlus paints each page as a float:left; clear:both `.page` with
 *     a large `margin-top: var(--rm-page-content-N)` plus a floated `.breaker`
 *     strip holding `[footer][gap][next header]`. Defloating `.page`/`.breaker`
 *     (the previous, broken fix) collapsed the float track into normal flow
 *     and stacked every footer/header band at the top of the document.
 *   - Moving the next-page header out of `.breaker` to the next `.rm-page-break`
 *     breaks the `[footer][gap][header]` band order the print CSS relies on.
 *
 * Allowed DOM move (pinned chrome only): hoist `.rm-first-page-header` and
 * `.rm-page-footer-1` out of the ProseMirror / float tree so they become
 * direct `body` siblings in the print HTML. `position: fixed` inside a
 * fragmented float context is treated as in-flow by Chromium and lands
 * after the body (content-then-chrome). Hoisting does not touch `.page` /
 * `.breaker` floats or continued-page bands.
 *
 * Beyond that, the durable print model lives in `getPaginationPlusPdfCss`
 * (native paged media + pinned chrome — see the ONE PRINT MODEL comment there).
 * This module strips editor-only chrome and hoists the two pinned bands.
 */

/** DOM path used by the live export snapshot. */
export function removePrintOnlyPaginationChrome(clone: HTMLElement): void {
    clone.querySelectorAll('.rm-pagination-gap').forEach((el) => el.remove());
    // The last `.rm-page-break` carries a synthetic next-page header that is
    // never printed (plugin runtime hides it via CSS; mirror that in the DOM
    // so it cannot add a trailing blank sheet).
    const pageBreaks = Array.from(clone.querySelectorAll<HTMLElement>('[data-rm-pagination] > .rm-page-break'));
    pageBreaks.at(-1)?.querySelector<HTMLElement>(':scope > .breaker > .rm-page-header')?.remove();
}

/**
 * Pull the page-1 header/footer out of the ProseMirror clone so the print
 * document can place them as direct `body` children (fixed containing block =
 * viewport). Returns outerHTML snippets; nodes are removed from `clone`.
 */
export function extractPinnedPrintChromeFromClone(clone: HTMLElement): {
    headerHtml: string;
    footerHtml: string;
} {
    const header = clone.querySelector<HTMLElement>('.rm-first-page-header');
    const footer = clone.querySelector<HTMLElement>('.rm-page-footer-1, .rm-first-page-footer');
    const headerHtml = header?.outerHTML ?? '';
    const footerHtml = footer?.outerHTML ?? '';
    header?.remove();
    footer?.remove();
    return { headerHtml, footerHtml };
}

/**
 * Balanced-tag extract for a single element whose class list includes `className`.
 * Used by the string-path hoist (unit tests / no DOM).
 */
function extractDivByClassName(html: string, className: string): { element: string; rest: string } | null {
    const openRe = new RegExp(`<div\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`, 'i');
    const openMatch = openRe.exec(html);
    if (!openMatch || openMatch.index == null) return null;
    const start = openMatch.index;
    const afterOpen = start + openMatch[0].length;
    let depth = 1;
    let i = afterOpen;
    while (i < html.length && depth > 0) {
        const nextOpen = html.indexOf('<div', i);
        const nextClose = html.indexOf('</div>', i);
        if (nextClose < 0) break;
        if (nextOpen >= 0 && nextOpen < nextClose) {
            depth += 1;
            i = nextOpen + 4;
            continue;
        }
        depth -= 1;
        i = nextClose + 6;
        if (depth === 0) {
            const element = html.slice(start, i);
            const rest = html.slice(0, start) + html.slice(i);
            return { element, rest };
        }
    }
    return null;
}

/**
 * String-path mirror of `extractPinnedPrintChromeFromClone`: pulls page-1
 * header/footer out of the body HTML so `buildPdfDocumentHtml` can emit them
 * as direct `body` children ahead of the ProseMirror tree.
 */
export function hoistPinnedPrintChromeFromHtml(html: string): {
    headerHtml: string;
    footerHtml: string;
    bodyHtml: string;
} {
    let rest = html;
    let headerHtml = '';
    let footerHtml = '';
    const headerHit = extractDivByClassName(rest, 'rm-first-page-header');
    if (headerHit) {
        headerHtml = headerHit.element;
        rest = headerHit.rest;
    }
    const footerHit =
        extractDivByClassName(rest, 'rm-page-footer-1') ??
        extractDivByClassName(rest, 'rm-first-page-footer');
    if (footerHit) {
        footerHtml = footerHit.element;
        rest = footerHit.rest;
    }
    return { headerHtml, footerHtml, bodyHtml: rest };
}

/** True when pinned chrome already sits as a direct body sibling (hoist applied). */
export function htmlHasHoistedPinnedChrome(html: string): boolean {
    // Header/footer appear before the ProseMirror root as siblings in the body.
    const bodyOpen = html.search(/<body\b[^>]*>/i);
    if (bodyOpen < 0) return false;
    const afterBody = html.slice(bodyOpen);
    const pmIdx = afterBody.search(/<div\b[^>]*\bProseMirror\b/i);
    if (pmIdx < 0) return false;
    const beforePm = afterBody.slice(0, pmIdx);
    const hasHeader = /\brm-first-page-header\b/i.test(beforePm);
    const hasFooter = /\brm-page-footer-1\b|\brm-first-page-footer\b/i.test(beforePm);
    return hasHeader && hasFooter;
}

/**
 * True when HTML still contains a `.rm-pagination-gap` whose inline `height`
 * is a positive length. Export HTML that hits this has violated the chrome
 * contract and will reintroduce page-gap / footer drift in Chromium print.
 */
export function htmlHasPositiveHeightPaginationGap(html: string): boolean {
    const gapOpenTags = html.match(/<[^>]*\brm-pagination-gap\b[^>]*>/gi) ?? [];
    for (const tag of gapOpenTags) {
        const heightMatch = tag.match(/\bheight\s*:\s*([0-9.]+)\s*px/i);
        if (!heightMatch) continue;
        const px = Number.parseFloat(heightMatch[1] ?? '');
        if (Number.isFinite(px) && px > 0) return true;
    }
    return false;
}

/** True when any `.rm-pagination-gap` open tag remains in the HTML string. */
export function htmlContainsPaginationGap(html: string): boolean {
    return /<[^>]*\brm-pagination-gap\b[^>]*>/i.test(html);
}

/**
 * String-path mirror of gap + last-header removal for unit tests that lack a
 * DOM. Only strips editor-only chrome; does NOT defloat or restructure bands.
 */
export function stripPrintOnlyPaginationChromeFromHtml(html: string): string {
    let out = html.replace(/<[^>]*\brm-pagination-gap\b[^>]*>[\s\S]*?<\/[^>]*\brm-pagination-gap\b[^>]*>/gi, '');
    out = out.replace(/<[^>]*\brm-pagination-gap\b[^>]*\/\s*>/gi, '');
    out = out.replace(/<[^>]*\brm-pagination-gap\b[^>]*>/gi, '');
    // Last breaker's synthetic next-page header (best-effort for fixtures).
    out = out.replace(
        /(<div[^>]*\brm-page-break\b[^>]*>[\s\S]*)<div[^>]*\brm-page-header\b[^>]*>[\s\S]*?<\/div>(\s*<\/div>\s*<\/div>\s*<\/div>\s*$)/i,
        '$1$2',
    );
    return out;
}
