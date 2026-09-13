/**
 * Plain text from HTML fragments (header/footer for UDF export, etc.).
 * Uses DOM parsing so tags like `<br>` become newlines via layout text.
 */
export function htmlStringToPlainText(html: string): string {
    if (!html?.trim()) return '';
    if (typeof document === 'undefined') {
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    const d = document.createElement('div');
    d.innerHTML = html;
    const t = d.textContent ?? d.innerText ?? '';
    return t.replace(/\u00a0/g, ' ').trim();
}
