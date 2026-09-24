import type { UyapRenderedSpan } from './uyapFieldResolver';
import { uyapArgbToCssColor } from './uyapColor';
import { UDF_DEFAULT_FONT_FAMILY } from './udfPrintHtml';

const SAFE_CSS_FONT_FAMILY = /^[A-Za-z0-9 ._-]+$/;

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Allow only CSS font-family identifiers; omit the declaration when unsafe. */
function sanitizeCssFontFamily(family: string): string | null {
    const stripped = family.replace(/["';\\<>]/g, '').trim();
    if (!stripped || !SAFE_CSS_FONT_FAMILY.test(stripped)) return null;
    return stripped;
}

function spanAttrsToInlineStyle(attrs: Record<string, string | undefined> | undefined): string {
    if (!attrs) return '';
    let spanStyle = '';
    if (attrs.bold === 'true') spanStyle += 'font-weight: bold;';
    if (attrs.italic === 'true') spanStyle += 'font-style: italic;';
    if (attrs.underline === 'true') spanStyle += 'text-decoration: underline;';
    if (attrs.strikethrough === 'true') spanStyle += 'text-decoration: line-through;';
    if (attrs.family) {
        const family = sanitizeCssFontFamily(attrs.family);
        if (family) spanStyle += `font-family: ${family}, ${UDF_DEFAULT_FONT_FAMILY};`;
    }
    if (attrs.size) {
        const size = String(attrs.size).trim();
        if (/^\d+(?:\.\d+)?$/.test(size)) {
            spanStyle += `font-size: ${size}pt;`;
        }
    }
    if (attrs.foreground) {
        const cssColor = uyapArgbToCssColor(attrs.foreground);
        if (cssColor) spanStyle += `color: ${cssColor};`;
    }
    if (attrs.background) {
        const cssBg = uyapArgbToCssColor(attrs.background);
        if (cssBg) spanStyle += `background-color: ${cssBg};`;
    }
    return spanStyle;
}

export function spansToHtml(spans: UyapRenderedSpan[]): string {
    let html = '';
    for (const span of spans) {
        if (span.html) {
            html += span.html;
            continue;
        }
        if (!span.text) continue;

        const spanStyle = spanAttrsToInlineStyle(span.attrs);
        // TipTap HTML parse collapses raw newlines inside <p>; <br> survives.
        const escaped = escapeHtml(span.text).replace(/\n/g, '<br>');

        if (span.attrs?.superscript === 'true') {
            html += `<sup style="${spanStyle}">${escaped}</sup>`;
        } else if (span.attrs?.subscript === 'true') {
            html += `<sub style="${spanStyle}">${escaped}</sub>`;
        } else if (spanStyle) {
            html += `<span style="${spanStyle}">${escaped}</span>`;
        } else {
            html += escaped;
        }
    }
    return html;
}
