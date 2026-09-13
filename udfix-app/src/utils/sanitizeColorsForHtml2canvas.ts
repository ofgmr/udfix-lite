/**
 * html2canvas 1.x cannot parse CSS Color Level 4 functions (color(), oklch(), lab(), …).
 * Resolve them to rgb()/rgba() via a DOM probe before raster export.
 */

export const HTML2CANVAS_UNSUPPORTED_COLOR_FN =
    /\b(?:color|oklch|oklab|lab|lch|hwb)\s*\(/i;

export function containsUnsupportedColorFn(value: string): boolean {
    return HTML2CANVAS_UNSUPPORTED_COLOR_FN.test(value);
}

function findColorFunctionSpans(css: string): Array<{ start: number; end: number; text: string }> {
    const spans: Array<{ start: number; end: number; text: string }> = [];
    const re = /\b(?:color|oklch|oklab|lab|lch|hwb)\s*\(/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(css)) !== null) {
        const start = match.index;
        let i = match.index + match[0].length;
        let depth = 1;
        while (i < css.length && depth > 0) {
            const ch = css[i];
            if (ch === '(') depth += 1;
            else if (ch === ')') depth -= 1;
            i += 1;
        }
        spans.push({ start, end: i, text: css.slice(start, i) });
    }
    return spans;
}

/** Resolve a single CSS color string to rgb()/rgba() using the browser. */
export function resolveCssColorToRgb(color: string, doc?: Document | null): string {
    const trimmed = color.trim();
    if (!trimmed || !containsUnsupportedColorFn(trimmed)) return trimmed;

    const d = doc ?? (typeof document !== 'undefined' ? document : null);
    if (!d?.body) return trimmed;

    const probe = d.createElement('span');
    probe.style.setProperty('visibility', 'hidden');
    probe.style.setProperty('position', 'absolute');
    probe.style.setProperty('pointer-events', 'none');
    probe.style.setProperty('color', trimmed);
    d.body.appendChild(probe);
    try {
        const resolved = d.defaultView?.getComputedStyle(probe).color.trim();
        if (resolved && !containsUnsupportedColorFn(resolved)) return resolved;
    } finally {
        probe.remove();
    }
    return trimmed;
}

/** Replace unsupported color functions in CSS text (inline styles, style blocks). */
export function sanitizeModernColorFunctionsInCssText(css: string, doc?: Document | null): string {
    if (!css || !containsUnsupportedColorFn(css)) return css;

    const spans = findColorFunctionSpans(css);
    if (spans.length === 0) return css;

    let result = css;
    for (let i = spans.length - 1; i >= 0; i -= 1) {
        const { start, end, text } = spans[i];
        const rgb = resolveCssColorToRgb(text, doc);
        result = result.slice(0, start) + rgb + result.slice(end);
    }
    return result;
}

/** Walk a live DOM subtree and sanitize inline + embedded style colors. */
export function sanitizeModernColorsInDom(root: HTMLElement): void {
    const doc = root.ownerDocument;
    if (!doc) return;

    const elements: HTMLElement[] = [root];
    for (const el of root.querySelectorAll<HTMLElement>('*')) {
        elements.push(el);
    }

    for (const el of elements) {
        const inline = el.getAttribute('style');
        if (inline && containsUnsupportedColorFn(inline)) {
            el.setAttribute('style', sanitizeModernColorFunctionsInCssText(inline, doc));
        }
    }

    for (const styleEl of root.querySelectorAll('style')) {
        const text = styleEl.textContent;
        if (text && containsUnsupportedColorFn(text)) {
            styleEl.textContent = sanitizeModernColorFunctionsInCssText(text, doc);
        }
    }
}
