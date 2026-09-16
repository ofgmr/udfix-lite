import { parseHtmlFragment } from './sanitizeDocumentHtml';
import { stripHtmlTags } from './stripHtmlTags';

/** Plain text from HTML fragments (header/footer for UDF export, etc.). */

export function htmlStringToPlainText(html: string): string {
    if (!html?.trim()) return '';
    if (typeof document === 'undefined') {
        return stripHtmlTags(html).replace(/\s+/g, ' ').trim();
    }
    const wrap = parseHtmlFragment(html);
    const t = wrap?.textContent ?? wrap?.innerText ?? '';
    return t.replace(/\u00a0/g, ' ').trim();
}
