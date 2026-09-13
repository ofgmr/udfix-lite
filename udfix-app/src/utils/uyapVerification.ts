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

/** QR içeriği: portal + erişim anahtarı (UYAP çıktılarıyla uyumlu kısa form). */
export function buildUyapVerificationQrPayload(meta: UyapVerificationMeta): string {
    return `${UYAP_VATANDAS_PORTAL_URL} ${meta.accessToken.trim()}`;
}

/** TipTap’e gömülmemesi için editör HTML’inden doğrulama bandını çıkarır. */
export function stripUyapVerificationFromHtml(html: string): string {
    if (!html || !html.includes('uyap-verification')) return html;
    return html
        .replace(/<section\b[^>]*\bdata-uyap-verification\b[^>]*>[\s\S]*?<\/section>/gi, '')
        .replace(/<div\b[^>]*\bdata-uyap-verification\b[^>]*>[\s\S]*?<\/div>/gi, '')
        .trim();
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
