import type { MevzuatInstrumentKind, MevzuatMaddeKind } from './mevzuatCorpusTypes';

export const MEVZUAT_TUR_KANUN = 1;
/** Tüzük iframe Tur (legacy MevzuatMetin `2.5.*` path). Not KHK. */
export const MEVZUAT_TUR_TUZUK = 2;
/**
 * Site uses Tur=4 for bakanlık yönetmeliği *and* for Kanun Hükmünde Kararname
 * (e.g. 663). Bundled kind stays `kanun` vs `yonetmelik` from the catalog.
 */
export const MEVZUAT_TUR_YONETMELIK = 4;
export const MEVZUAT_TUR_KURUM_YONETMELIK = 7;
export const MEVZUAT_TUR_TEBLIG = 9;
/** Cumhurbaşkanlığı Kararnamesi iframe Tur (1 sayılı CBK). */
export const MEVZUAT_TUR_CUMHURBASKANLIGI_KARARNAMESI = 19;
export const MEVZUAT_TUR_CUMHURBASKANLIGI_YONETMELIK = 21;

const HTML_ENTITIES: Record<string, string> = {
    nbsp: ' ',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    mdash: '—',
    ndash: '–',
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"',
};

export function iframeUrl(no: string, tertip: number, tur = MEVZUAT_TUR_KANUN): string {
    return `https://www.mevzuat.gov.tr/anasayfa/MevzuatFihristDetayIframe?MevzuatTur=${tur}&MevzuatNo=${encodeURIComponent(no)}&MevzuatTertip=${tertip}`;
}

export function publicMevzuatUrl(no: string, tertip: number, tur = MEVZUAT_TUR_KANUN): string {
    return `https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=${encodeURIComponent(no)}&MevzuatTur=${tur}&MevzuatTertip=${tertip}`;
}

export function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&([a-zA-Z]+);/g, (match, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? match);
}

export function htmlToPlainText(html: string): string {
    let s = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, ' ');
    s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, ' ');
    s = s.replace(/<!--[\s\S]*?-->/g, ' ');
    // Word HTML wraps lines inside spans; collapse those before block-tag conversion.
    s = s.replace(/\n+/g, ' ');
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<\/(p|div|tr|h[1-6]|li|blockquote|table)>/gi, '\n');
    let prev = '';
    while (s !== prev) {
        prev = s;
        s = s.replace(/<[^>]*>/g, '');
    }
    s = decodeHtmlEntities(s);
    s = s.replace(/\u00a0/g, ' ');
    s = s.replace(/[ \t]+\n/g, '\n');
    s = s.replace(/\n{3,}/g, '\n\n');
    s = s.replace(/[ \t]{2,}/g, ' ');
    return s.trim();
}

const MADDE_DASH = String.raw`[-.\u2010-\u2015\u2212:]`;

export function normalizeMaddeHeadings(text: string): string {
    return text.replace(
        new RegExp(
            `((?:(?:Ek|EK|Geçici|GEÇİCİ)\\s+)?)(Madde|MADDE)\\s+(\\d+[A-Za-z]?)\\s*(${MADDE_DASH})`,
            'g',
        ),
        (_m, prefix: string, label: string, num: string, dash: string) =>
            `${(prefix || '').replace(/\s+/g, ' ')}${label} ${num} ${dash}`
    );
}

export function countMaddeler(text: string): number {
    const matches = text.match(/(?:^|\n)\s*(?:(?:Ek|Geçici)\s+)?Madde\s+\d+/gi);
    return matches?.length ?? 0;
}

export function extractKabulTarihi(text: string): string | null {
    const m = text.match(/Kabul\s+Tarihi\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{2,4})/i);
    return m?.[1] ?? null;
}

export function isSpaShellHtml(html: string): boolean {
    const head = html.slice(0, 900).replace(/\s+/g, ' ').toLowerCase();
    return head.includes('<!doctype html>') && head.includes('<html lang="tr"');
}

export function looksLikeMevzuatContent(html: string): boolean {
    if (!html || isSpaShellHtml(html)) return false;
    const text = normalizeMaddeHeadings(htmlToPlainText(html));
    const maddeler = countMaddeler(text);
    return (
        maddeler >= 2 ||
        (text.length > 4000 &&
            /(kanun|y[oö]netmelik|t[uü]z[uü][gğ][uü]|tarife|kararname|h[uü]km[uü]nde)/i.test(text))
    );
}

export type SplitMadde = {
    maddeKind: MevzuatMaddeKind;
    maddeNo: string;
    heading: string;
    text: string;
};

const MADDE_HEAD_RE = new RegExp(
    String.raw`(?:^|\n)\s*((?:Ek|EK|Geçici|GEÇİCİ)\s+)?(Madde|MADDE)\s+(\d+[A-Za-z]?)\s*` + MADDE_DASH,
    'gi',
);

function maddeKindFromPrefix(prefix: string): MevzuatMaddeKind {
    const folded = prefix.trim().toLocaleLowerCase('tr-TR');
    if (folded.startsWith('ek')) return 'ek';
    if (folded.startsWith('geçici') || folded.startsWith('gecici')) return 'gecici';
    return 'madde';
}

function maddeHeading(kind: MevzuatMaddeKind, maddeNo: string): string {
    switch (kind) {
        case 'ek':
            return `Ek Madde ${maddeNo}`;
        case 'gecici':
            return `Geçici Madde ${maddeNo}`;
        case 'madde':
            return `Madde ${maddeNo}`;
        default: {
            const _exhaustive: never = kind;
            return _exhaustive;
        }
    }
}

export function splitMaddeler(text: string): SplitMadde[] {
    const normalized = normalizeMaddeHeadings(text);
    const re = new RegExp(MADDE_HEAD_RE.source, MADDE_HEAD_RE.flags);
    const matches: Array<{
        index: number;
        headEnd: number;
        kind: MevzuatMaddeKind;
        no: string;
    }> = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(normalized))) {
        const full = match[0];
        const leadingNewline = full.startsWith('\n') ? 1 : 0;
        matches.push({
            index: match.index + leadingNewline,
            headEnd: match.index + full.length,
            kind: maddeKindFromPrefix(match[1] || ''),
            no: match[3],
        });
    }
    if (matches.length === 0) return [];

    const out: SplitMadde[] = [];
    for (let i = 0; i < matches.length; i += 1) {
        const current = matches[i];
        const end = i + 1 < matches.length ? matches[i + 1].index : normalized.length;
        const body = normalized.slice(current.headEnd, end).trim();
        out.push({
            maddeKind: current.kind,
            maddeNo: current.no,
            heading: maddeHeading(current.kind, current.no),
            text: body,
        });
    }
    return out;
}

/** Plain text before the first Madde / Ek Madde / Geçici Madde heading. */
export function extractPreamble(text: string): string {
    const normalized = normalizeMaddeHeadings(text);
    const re = new RegExp(MADDE_HEAD_RE.source, MADDE_HEAD_RE.flags);
    const match = re.exec(normalized);
    if (!match) return '';
    const leadingNewline = match[0].startsWith('\n') ? 1 : 0;
    return normalized.slice(0, match.index + leadingNewline).trim();
}

export function instrumentId(kind: MevzuatInstrumentKind, no: string): string {
    switch (kind) {
        case 'kanun':
            return `kanun:${no}`;
        case 'yonetmelik':
            return `yonetmelik:${no}`;
        default: {
            const _exhaustive: never = kind;
            return _exhaustive;
        }
    }
}

export function maddeRecordId(
    kind: MevzuatInstrumentKind,
    no: string,
    maddeKind: MevzuatMaddeKind,
    maddeNo: string,
): string {
    const base = instrumentId(kind, no);
    switch (maddeKind) {
        case 'madde':
            return `${base}:m:${maddeNo}`;
        case 'ek':
            return `${base}:m:ek:${maddeNo}`;
        case 'gecici':
            return `${base}:m:gecici:${maddeNo}`;
        default: {
            const _exhaustive: never = maddeKind;
            return _exhaustive;
        }
    }
}

export function maddePreview(text: string, max = 140): string {
    const one = text.replace(/\s+/g, ' ').trim();
    if (one.length <= max) return one;
    return `${one.slice(0, max).trim()}…`;
}
