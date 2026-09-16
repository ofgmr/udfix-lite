import DOMPurify from 'dompurify';
import type { Config as DOMPurifyConfig } from 'dompurify';

/**
 * Fragment policy for editor/export HTML that must remain styled (HF bands, imza tables)
 * but must not execute script, navigate via javascript:, or load remote frames.
 */
const DOCUMENT_HTML_SANITIZE: DOMPurifyConfig = {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'base'],
    FORBID_ATTR: [
        'onerror',
        'onload',
        'onclick',
        'onmouseover',
        'onfocus',
        'onblur',
        'formaction',
    ],
    ALLOW_DATA_ATTR: true,
    ADD_ATTR: ['role', 'colspan', 'rowspan', 'width', 'height', 'align'],
    ALLOWED_URI_REGEXP:
        /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|blob|nomai-file|file|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

export function sanitizeTrustedDocumentHtml(html: string): string {
    if (!html) return '';
    if (typeof window === 'undefined') return html;
    return DOMPurify.sanitize(html, DOCUMENT_HTML_SANITIZE);
}

/** Parse a sanitized HTML fragment into an off-document wrapper. */
export function parseHtmlFragment(html: string): HTMLDivElement | null {
    if (typeof document === 'undefined') return null;
    const wrap = document.createElement('div');
    wrap.innerHTML = sanitizeTrustedDocumentHtml(html);
    return wrap;
}
