import type { JSONContent } from '@tiptap/core';
import { parseHtmlFragment } from './sanitizeDocumentHtml';

/**
 * UYAP mahkeme evrakları: `content.xml` içindeki `<webID>` ve ZIP `documentproperties.xml`
 * (uyapdogrulamakodu, uyapsicil) ile PDF/ekranda görünen doğrulama bandı.
 */

export const UYAP_VATANDAS_PORTAL_URL = 'http://vatandas.uyap.gov.tr';

export type UyapAccessTokenKind = 'webId' | 'dogrulamaKodu';

export interface UyapVerificationMeta {
    /** Metin ve QR’da kullanılan erişim anahtarı (webID veya yalnız doğrulama kodu). */
    accessToken: string;
    accessTokenKind: UyapAccessTokenKind;
    uyapdogrulamakodu?: string;
    uyapsicil?: string;
    /** @deprecated Eski localStorage kayıtları; `accessToken` ile aynı. */
    webIdDisplay?: string;
}

export function normalizeUyapVerificationMeta(
    raw: Partial<UyapVerificationMeta> | null | undefined,
): UyapVerificationMeta | null {
    if (!raw) return null;
    const accessToken = (raw.accessToken ?? raw.webIdDisplay)?.trim();
    if (!accessToken) return null;
    return {
        accessToken,
        accessTokenKind: raw.accessTokenKind ?? (raw.webIdDisplay ? 'webId' : 'dogrulamaKodu'),
        uyapdogrulamakodu: raw.uyapdogrulamakodu?.trim() || undefined,
        uyapsicil: raw.uyapsicil?.trim() || undefined,
    };
}

const WEB_ID_TAG_RE = /<webID\b[^>]*\bid="([^"]*)"/i;
const WEB_ID_ATTR_RE = /\bwebID="([^"]*)"/i;
const DOC_PROP_ENTRY_RE = /<entry\s+key="([^"]+)"[^>]*>([^<]*)<\/entry>/gi;

export function extractWebIdFromContentXml(contentXml: string): string | null {
    const tagMatch = contentXml.match(WEB_ID_TAG_RE);
    if (tagMatch?.[1]?.trim()) return tagMatch[1].trim();
    const attrMatch = contentXml.match(WEB_ID_ATTR_RE);
    if (attrMatch?.[1]?.trim()) return attrMatch[1].trim();
    return null;
}

export function parseDocumentPropertiesXml(xml: string): Record<string, string> {
    const out: Record<string, string> = {};
    if (!xml) return out;
    for (const match of xml.matchAll(DOC_PROP_ENTRY_RE)) {
        const key = match[1]?.trim();
        const value = match[2]?.trim();
        if (key && value) out[key] = value;
    }
    return out;
}

export function buildUyapVerificationMeta(
    contentXml: string,
    documentPropertiesXml?: string | null,
): UyapVerificationMeta | null {
    const props = documentPropertiesXml ? parseDocumentPropertiesXml(documentPropertiesXml) : {};
    const kod = props.uyapdogrulamakodu?.trim();
    const sicil = props.uyapsicil?.trim();
    const webId = extractWebIdFromContentXml(contentXml)?.trim();

    let accessToken: string | null = null;
    let accessTokenKind: UyapAccessTokenKind = 'webId';
    if (webId) {
        accessToken = webId;
        accessTokenKind = 'webId';
    } else if (kod) {
        accessToken = kod;
        accessTokenKind = 'dogrulamaKodu';
    }
    if (!accessToken) return null;

    const meta: UyapVerificationMeta = { accessToken, accessTokenKind };
    if (kod) meta.uyapdogrulamakodu = kod;
    if (sicil) meta.uyapsicil = sicil;
    return meta;
}

export function buildUyapVerificationMetaFromZipEntries(
    contentXml: string,
    preserveZipEntries?: Record<string, Uint8Array>,
): UyapVerificationMeta | null {
    const propsBytes = preserveZipEntries?.['documentproperties.xml'];
    const propsXml = propsBytes
        ? new TextDecoder('utf-8').decode(propsBytes)
        : null;
    return buildUyapVerificationMeta(contentXml, propsXml);
}

/** UYAP PDF’lerindeki standart bilgilendirme cümlesi. */
export function buildUyapVerificationNoticeText(meta: UyapVerificationMeta): string {
    const token = meta.accessToken.trim();
    let text =
        `UYAP Bilişim Sistemindeki bu dokümana ${UYAP_VATANDAS_PORTAL_URL} adresinden ${token} ile erişebilirsiniz.`;
    if (
        meta.uyapdogrulamakodu &&
        meta.accessTokenKind === 'webId' &&
        meta.uyapdogrulamakodu !== token
    ) {
        text += ` Doğrulama kodu: ${meta.uyapdogrulamakodu}.`;
    }
    return text;
}

/**
 * QR içeriği: portal + erişim anahtarı (UYAP çıktılarıyla uyumlu kısa form).
 * Native UYAP PDFs under `debug/UDF_QR/` and `debug/eyp/` decode to
 * `http://vatandas.uyap.gov.tr <webID>` (space-separated; webID may contain
 * spaced dashes). Not a query-string URL. Do not change without a new decode.
 */
export function buildUyapVerificationQrPayload(meta: UyapVerificationMeta): string {
    return `${UYAP_VATANDAS_PORTAL_URL} ${meta.accessToken.trim()}`;
}

const UYAP_VERIFICATION_NODE_SELECTOR = '[data-uyap-verification], .uyap-verification-block';

/** Distinctive UYAP PDF sentence; leftover copies in TipTap JSON/HTML match this. */
export const UYAP_VERIFICATION_NOTICE_MARKER = 'UYAP Bilişim Sistemindeki bu dokümana';

export function htmlContainsUyapVerification(html: string): boolean {
    if (!html) return false;
    return html.includes('uyap-verification') || html.includes(UYAP_VERIFICATION_NOTICE_MARKER);
}

export function countUyapVerificationNoticeOccurrences(html: string): number {
    if (!html) return 0;
    let count = 0;
    let from = 0;
    while (from < html.length) {
        const at = html.indexOf(UYAP_VERIFICATION_NOTICE_MARKER, from);
        if (at < 0) break;
        count += 1;
        from = at + UYAP_VERIFICATION_NOTICE_MARKER.length;
    }
    return count;
}

/** True when a text node is an adopted/exported UYAP verification sentence (not body copy). */
export function isUyapVerificationNoticeText(text: string): boolean {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!t.includes(UYAP_VERIFICATION_NOTICE_MARKER)) return false;
    if (!t.includes('vatandas.uyap.gov.tr')) return false;
    return t.length < 800;
}

function stripUyapVerificationFromHtmlWithRegex(html: string): string {
    let out = html;
    out = out.replace(
        /<(section|div|table)\b[^>]*(?:data-uyap-verification|uyap-verification-block)[^>]*>[\s\S]*?<\/\1>/gi,
        '',
    );
    const blockTags = ['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'td', 'th'];
    for (const tag of blockTags) {
        const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
        out = out.replace(re, (block) => (block.includes(UYAP_VERIFICATION_NOTICE_MARKER) ? '' : block));
    }
    return out.replace(/\n{3,}/g, '\n\n').trim();
}

function stripUyapVerificationNoticeElements(root: ParentNode): void {
    root.querySelectorAll(UYAP_VERIFICATION_NODE_SELECTOR).forEach((el) => el.remove());
    root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, td, th').forEach((el) => {
        if (!isUyapVerificationNoticeText(el.textContent || '')) return;
        const block = el.closest('section, table, p, li') ?? el;
        block.remove();
    });
}

/** TipTap’e gömülmemesi için editör HTML’inden doğrulama bandını çıkarır (parser-based). */
export function stripUyapVerificationFromHtml(html: string): string {
    if (!htmlContainsUyapVerification(html)) return html;
    const wrap = parseHtmlFragment(html);
    if (!wrap) {
        return stripUyapVerificationFromHtmlWithRegex(html);
    }
    stripUyapVerificationNoticeElements(wrap);
    return wrap.innerHTML.trim();
}

function collectTipTapText(node: JSONContent): string {
    if (typeof node.text === 'string') return node.text;
    if (!node.content?.length) return '';
    return node.content.map(collectTipTapText).join('');
}

function hasElementChildren(node: JSONContent): boolean {
    return Boolean(node.content?.some((child) => child.type && child.type !== 'text'));
}

function shouldDropUyapVerificationJsonNode(node: JSONContent): boolean {
    if (node.type === 'doc') return false;
    const attrs = node.attrs ?? {};
    if (attrs['data-uyap-verification'] === true || attrs['data-uyap-verification'] === 'true') {
        return true;
    }
    const className = typeof attrs.class === 'string' ? attrs.class : '';
    if (className.includes('uyap-verification-block')) return true;
    if (hasElementChildren(node)) return false;
    return isUyapVerificationNoticeText(collectTipTapText(node));
}

/**
 * Drop adopted QR/notice nodes from TipTap JSON so autosave / UDF export never
 * persist a temp PDF pin.
 */
export function stripUyapVerificationFromTipTapJson(doc: JSONContent): JSONContent {
    const walk = (node: JSONContent): JSONContent | null => {
        if (shouldDropUyapVerificationJsonNode(node)) return null;
        if (!node.content?.length) return node;
        const next = node.content.map(walk).filter((child): child is JSONContent => child != null);
        if (next.length === 0 && node.type !== 'doc') return null;
        if (next.length === node.content.length && next.every((child, i) => child === node.content![i])) {
            return node;
        }
        return { ...node, content: next };
    };
    return walk(doc) ?? { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** Live ProseMirror DOM: remove every verification node, not only the temp-export attr. */
export function stripUyapVerificationDom(root: ParentNode | null | undefined): void {
    if (!root) return;
    stripUyapVerificationNoticeElements(root);
}

export const UDF_VERIFICATION_STORAGE_PREFIX = 'nomai-udf-verification-';

export function udfVerificationStorageKey(documentId: string): string {
    return `${UDF_VERIFICATION_STORAGE_PREFIX}${documentId}`;
}

export function persistUyapVerificationMeta(documentId: string, meta: UyapVerificationMeta | null): void {
    if (typeof localStorage === 'undefined') return;
    const key = udfVerificationStorageKey(documentId);
    if (!meta) {
        localStorage.removeItem(key);
        return;
    }
    localStorage.setItem(key, JSON.stringify(meta));
}

export function readPersistedUyapVerificationMeta(documentId: string): UyapVerificationMeta | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(udfVerificationStorageKey(documentId));
    if (!raw) return null;
    try {
        return normalizeUyapVerificationMeta(JSON.parse(raw) as UyapVerificationMeta);
    } catch {
        return null;
    }
}
