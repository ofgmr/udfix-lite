import { sanitizeModernColorFunctionsInCssText } from './sanitizeColorsForHtml2canvas';

/**
 * Replaces `var(--token)` in inline HTML styles with computed values from the
 * active document theme (renderer only). Export HTML otherwise has no :root
 * variables (PDF print window, DOCX).
 *
 * PaginationPlus exposes `--rm-*` on the ProseMirror root, not on `:root`.
 * Resolving `var(--rm-…)` from `documentElement` yields empty → `inherit` and
 * destroys `.page` margin-top in serialized HTML (PDF layout collapse).
 */
export function resolveCssVarsInHtmlString(html: string, scope?: Element | null): string {
    if (typeof document === 'undefined') return html;
    const root = document.documentElement;
    const rootCs = getComputedStyle(root);
    const scopeCs = scope ? getComputedStyle(scope) : null;
    const resolved = html.replace(/var\(\s*(--[\w-]+)\s*\)/gi, (m, name: string) => {
        let v = '';
        if (name.startsWith('--rm-') && scopeCs) {
            v = scopeCs.getPropertyValue(name).trim();
        }
        if (!v) {
            v = rootCs.getPropertyValue(name).trim();
        }
        // Keep unresolved vars as-is instead of forcing inherit; preserves theme/text color cascade.
        return v || m;
    });
    return sanitizeModernColorFunctionsInCssText(resolved, document);
}
