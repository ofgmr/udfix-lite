import type { UyapRenderedSpan } from './uyapFieldResolver';
import { uyapArgbToCssColor } from './uyapColor';

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function spanAttrsToInlineStyle(attrs: Record<string, string | undefined> | undefined): string {
    if (!attrs) return '';
    let spanStyle = '';
    if (attrs.bold === 'true') spanStyle += 'font-weight: bold;';
    if (attrs.italic === 'true') spanStyle += 'font-style: italic;';
    if (attrs.underline === 'true') spanStyle += 'text-decoration: underline;';
    if (attrs.strikethrough === 'true') spanStyle += 'text-decoration: line-through;';
    if (attrs.family) spanStyle += `font-family: ${attrs.family};`;
    if (attrs.size) spanStyle += `font-size: ${attrs.size}pt;`;
    if (attrs.foreground) {
        const cssColor = uyapArgbToCssColor(attrs.foreground);
        spanStyle += `color: ${cssColor ?? attrs.foreground};`;
    }
    if (attrs.background) {
        const cssBg = uyapArgbToCssColor(attrs.background);
        spanStyle += `background-color: ${cssBg ?? (attrs.background === '-256' ? '#ffff00' : attrs.background)};`;
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
