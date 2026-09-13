import {
    DOSYA_TUR_BUCKETS,
    emptyOpeningMonthAccum,
    emptyOpeningTypeCounts,
    lastNOpeningMonthsAccum,
    OPENING_CHART_LOOKBACK_MONTHS,
    type DosyaTurBucket,
    type MatterClosureKind,
    type OpeningMonthAccum,
    type OpeningTypeCounts,
} from './openingMonths';
import { displayCourtName, toTurkishTitleCase } from './turkishTitleCase';

export { displayCourtName, toTurkishTitleCase } from './turkishTitleCase';

export type BreakdownRow = { label: string; count: number; open?: number };

export type BreakdownPair = { open: number; count: number };

export type OpeningMonthRow = {
    month: string;
    count: number;
    byType: OpeningTypeCounts;
    icraAlacak: number;
    icraAlacakAlacakli: number;
    icraAlacakBorclu: number;
    icraWithAmount: number;
    closed: number;
    stillOpen: number;
    unknown: number;
    closedThisMonth: number;
    topLabels: BreakdownRow[];
};

export type IcraMuvekkilRole = 'alacakli' | 'borclu' | 'ucuncu' | 'unknown';

export type TypeStatusCounts = Record<DosyaTurBucket, { open: number; closed: number }>;

export type IdleOpenMatter = {
    id: string;
    file_number: string;
    court_name: string | null;
    snoozeUntil?: string | null;
};

export const IDLE_OPEN_MONTHS = 3;
export const EVRAK_RECENT_DAYS = 14;
/** SQLite ingest clock for “added in the last 24h”, not portal date. */
export const EVRAK_ADDED_HOURS = 24;
export const KATIR_LAST_SCAN_META_KEY = 'katir_last_evrak_scan_at';
export const SPARKLINE_PAD_PX = 2;

/** Same cadence table as `drip-schedule.mjs` (P = hours / period). */
export type CatalogPeriodKind = 'missing' | 'first' | 'appeal' | 'closed' | 'dlq';

export const CATALOG_PERIOD_HOURS: Record<CatalogPeriodKind, number> = {
    missing: 0,
    first: 24,
    appeal: 14 * 24,
    closed: 30 * 24,
    dlq: 7 * 24,
};

export const CATALOG_PRIORITY_MIN = 1.0;

export type CatalogFreshnessInput = {
    status?: string | null;
    courtName?: string | null;
    birimAdi?: string | null;
    yargiBirimTablo?: unknown;
    dosyaDurum?: unknown;
    lastCatalogScanAt?: unknown;
    lastCatalogAttemptAt?: unknown;
    evrakListed?: unknown;
    evrakSkipped?: unknown;
    evrakUpdatedAt?: unknown;
    evrakCount?: unknown;
    evrakItemsLength?: unknown;
    unscannableUntil?: unknown;
};

export type InventoryFreshnessStats = {
    eligible: number;
    current: number;
    percent: number | null;
};

export const OPENING_MONTH_TOP_LABELS = 4;

const DOSYA_TUR_LABEL_BY_KOD: Record<number, string> = {
    1: 'Talimat Dosyası',
    3: 'Ceza Dava Dosyası',
    4: 'Ceza Değişik İş Dosyası',
    9: 'İdare Dava Dosyası',
    10: 'Bölge Dosyası',
    14: 'Hukuk Değişik İş Dosyası',
    15: 'Hukuk Dava Dosyası',
    28: 'Vergi Dava Dosyası',
    35: 'İcra Dosyası',
    78: 'Tereke Dosyası',
    168: 'Ort. Gid. Satış Dosyası',
    255: 'Tereke Satış Dosyası',
    262: 'İhtiyari Arabuluculuk Dosyası',
    313: 'İşçi İşveren Dava Şartı Arabuluculuk Dosyası',
    331: 'Ticari Dava Şartı Arabuluculuk Dosyası',
    408: 'Diğer Dava Şartı Arabuluculuk Dosyası',
};

const ICRA_TAKIP_TURU: Record<number, string> = {
    0: 'İlamlı Takip',
    1: 'İlamsız Takip',
};

const ICRA_TAKIP_YOLU: Record<number, string> = {
    0: 'Genel Haciz Yoluyla Takip',
    1: 'İflas Yoluyla Takip',
    2: 'Rehnin Paraya Çevrilmesi Yolu İle Takip',
    3: 'Kambiyo Senetlerine Mahsus Haciz Yolu',
    4: 'Kiralanan Gayrimenkullerin İlamsız Tahliyesi',
    5: 'Diğer',
};

const YARGI_BIRIM_BY_TABLO: Record<string, string> = {
    '0901': 'Ağır Ceza Mahkemesi',
    '0921': 'Asliye Ceza Mahkemesi',
    '7702': 'Bölge Adliye Mah. Ceza Dairesi',
    '0929': 'Çocuk Ağır Ceza Mahkemesi',
    '0910': 'Çocuk Mahkemesi',
    '0911': 'Çocuk Mahkemesi',
    '0914': 'Fikri ve Sınai Haklar Ceza Mahkemesi',
    '0924': 'İcra Ceza Hakimliği',
    '0915': 'İnfaz Hakimliği',
    '0935': 'İstinaf Ceza Dairesi (İlk Derece)',
    '0931': 'Sulh Ceza Hakimliği',
    '0934': 'Yargıtay Ceza Dairesi (İlk Derece)',
    '0926': 'Aile Mahkemesi',
    '0920': 'Asliye Hukuk Mahkemesi',
    '0902': 'Asliye Ticaret Mahkemesi',
    '7710': 'BAM Hukuk Dairesi (İlk Derece)',
    '7703': 'Bölge Adliye Mah. Hukuk Dairesi',
    '0913': 'Fikri ve Sınai Haklar Hukuk Mahkemesi',
    '0925': 'İcra Hukuk Mahkemesi',
    '0908': 'İş Mahkemesi',
    '0907': 'Kadastro Mahkemesi',
    '0906': 'Kadastro Mahkemesi (Müs)',
    '0904': 'Sulh Hukuk Mahkemesi',
    '0922': 'Sulh Hukuk Mahkemesi',
    '0912': 'Tüketici Mahkemesi',
    '1101': 'İcra Dairesi',
    '0917': 'Bölge İdare Mahkemesi',
    '0918': 'İdare Mahkemesi',
    '0919': 'Vergi Mahkemesi',
    '6701': 'Arabuluculuk',
    '6702': 'Arabuluculuk',
    '9791': 'Satış Memurluğu',
};

/**
 * Every `birimTuru2` in search-payloads + harvest + arabuluculuk / satış.
 * Unknown live codes still bucket to `other` without throwing.
 */
export const KNOWN_YARGI_BIRIM_TABLO = new Set([
    ...Object.keys(YARGI_BIRIM_BY_TABLO),
    '0933',
    '0927',
]);

/** İhtiyari + dava şartı arabuluculuk (`uyap-dosya-turleri` / search-payloads). */
export const ARABULUCULUK_TUR_KODLARI = new Set([262, 313, 331, 408]);
/**
 * Portal `yargiBirimTablo` / `birimTuru2` for arabuluculuk büroları.
 * Search-payloads also lists `9791`; live künye uses 9791 for Satış Memurluğu
 * (kod 168/255) — do not treat 9791 as mediation unless the name/tur says so.
 */
export const ARABULUCULUK_BIRIM_KODLARI = new Set(['6701', '6702']);
const SATIS_TUR_KODLARI = new Set([168, 255]);

function foldTr(value: string): string {
    return String(value || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c');
}

function finiteKod(kod: unknown): number | null {
    if (kod == null || kod === '') return null;
    if (typeof kod === 'object' || typeof kod === 'symbol' || typeof kod === 'function') return null;
    const n = typeof kod === 'number' ? kod : Number(kod);
    return Number.isFinite(n) ? n : null;
}

export function asDosyaTurBucket(value: unknown): DosyaTurBucket {
    if (typeof value === 'string' && (DOSYA_TUR_BUCKETS as readonly string[]).includes(value)) {
        return value as DosyaTurBucket;
    }
    return 'other';
}

/** BAM / istinaf / temyiz / AYM — stay in `other`, even when dosyaTurKod is 15/3/9. */
const DIGER_YARGI_TABLO = new Set([
    '7702',
    '7703',
    '7710',
    '0935',
    '0934',
    '0917',
]);

/**
 * First-instance `yargiBirimTablo` → type card. Used when `dosyaTurKod` is missing
 * or wrong so İcra Dairesi / İş / Asliye / Sulh never land in Diğer.
 */
const FIRST_INSTANCE_TABLO_BUCKET: Record<string, DosyaTurBucket> = {
    '1101': 'icra',
    '0926': 'hukuk',
    '0920': 'hukuk',
    '0902': 'hukuk',
    '0913': 'hukuk',
    '0925': 'hukuk',
    '0908': 'hukuk',
    '0907': 'hukuk',
    '0906': 'hukuk',
    '0904': 'hukuk',
    '0922': 'hukuk',
    '0912': 'hukuk',
    '0901': 'ceza',
    '0921': 'ceza',
    '0929': 'ceza',
    '0910': 'ceza',
    '0911': 'ceza',
    '0914': 'ceza',
    '0924': 'ceza',
    '0915': 'ceza',
    '0931': 'ceza',
    '0918': 'idare',
    '0919': 'idare',
    '0933': 'hukuk',
    '0927': 'hukuk',
};

/** Longest / most specific first so “icra hukuk” is not “icra dairesi”. */
const FIRST_INSTANCE_NAME_BUCKETS: ReadonlyArray<{ needle: string; bucket: DosyaTurBucket }> = [
    { needle: 'fikri ve sinai haklar ceza', bucket: 'ceza' },
    { needle: 'fikri ve sinai haklar hukuk', bucket: 'hukuk' },
    { needle: 'cocuk agir ceza', bucket: 'ceza' },
    { needle: 'satis memurlug', bucket: 'hukuk' },
    { needle: 'icra hukuk', bucket: 'hukuk' },
    { needle: 'icra ceza', bucket: 'ceza' },
    { needle: 'asliye ticaret', bucket: 'hukuk' },
    { needle: 'asliye hukuk', bucket: 'hukuk' },
    { needle: 'asliye ceza', bucket: 'ceza' },
    { needle: 'agir ceza', bucket: 'ceza' },
    { needle: 'sulh hukuk', bucket: 'hukuk' },
    { needle: 'sulh ceza', bucket: 'ceza' },
    { needle: 'aile mahkemesi', bucket: 'hukuk' },
    { needle: 'is mahkemesi', bucket: 'hukuk' },
    { needle: 'kadastro', bucket: 'hukuk' },
    { needle: 'tuketici mahkemesi', bucket: 'hukuk' },
    { needle: 'ticaret mahkemesi', bucket: 'hukuk' },
    { needle: 'infaz hakimligi', bucket: 'ceza' },
    { needle: 'cocuk mahkemesi', bucket: 'ceza' },
    { needle: 'icra dairesi', bucket: 'icra' },
    { needle: 'icra mudurlugu', bucket: 'icra' },
    { needle: 'iflas dairesi', bucket: 'icra' },
    { needle: 'iflas mudurlug', bucket: 'icra' },
    { needle: 'idare mahkemesi', bucket: 'idare' },
    { needle: 'vergi mahkemesi', bucket: 'idare' },
];

const EXTRA_COURT_NAME_LABELS = [
    'Anayasa Mahkemesi',
    'Yargıtay',
    'Danıştay',
    'Arabuluculuk',
    'Satış Memurluğu',
] as const;

const YARGI_LABELS_LONGEST_FIRST = [
    ...Object.values(YARGI_BIRIM_BY_TABLO),
    ...EXTRA_COURT_NAME_LABELS,
].sort((a, b) => b.length - a.length);

export type DosyaTurCourtHint = {
    yargiBirimTablo?: string | null;
    courtName?: string | null;
    birimAdi?: string | null;
    dosyaTurKod?: unknown;
    dosyaTur?: string | null;
};

function resolvedCourtName(court?: DosyaTurCourtHint | null): string {
    return String(court?.courtName || court?.birimAdi || '').trim();
}

export function isArabuluculukMatter(court?: DosyaTurCourtHint | null, kod?: unknown): boolean {
    const n = finiteKod(court?.dosyaTurKod ?? kod);
    if (n != null && ARABULUCULUK_TUR_KODLARI.has(n)) return true;
    const tablo = String(court?.yargiBirimTablo || '').trim();
    if (ARABULUCULUK_BIRIM_KODLARI.has(tablo)) return true;
    const folded = foldTr(`${resolvedCourtName(court)} ${String(court?.dosyaTur || '')}`);
    return folded.includes('arabuluculuk');
}

function isSatisMemurlugu(court?: DosyaTurCourtHint | null, kod?: unknown): boolean {
    const n = finiteKod(court?.dosyaTurKod ?? kod);
    if (n != null && SATIS_TUR_KODLARI.has(n)) return true;
    return foldTr(resolvedCourtName(court)).includes('satis memurlug');
}

export function bucketFromCourtName(courtName?: string | null): DosyaTurBucket | null {
    const folded = foldTr(String(courtName || '').trim());
    if (!folded) return null;
    if (folded.includes('anayasa mahkemesi') || folded.includes('anayasa mah.')) return null;
    if (folded.includes('bolge adliye') || folded.includes('bolge idare')) return null;
    if (folded.includes('bam hukuk') || folded.includes('bam ceza')) return null;
    if (/(^|\s)bam(\s|$)/.test(folded)) return null;
    if (folded.includes('istinaf') || folded.includes('yargitay') || folded.includes('danistay')) {
        return null;
    }
    for (const row of FIRST_INSTANCE_NAME_BUCKETS) {
        if (folded.includes(row.needle)) return row.bucket;
    }
    return null;
}

export function bucketFromYargiTablo(yargiBirimTablo?: string | null): DosyaTurBucket | null {
    const tablo = String(yargiBirimTablo || '').trim();
    if (!tablo) return null;
    return FIRST_INSTANCE_TABLO_BUCKET[tablo] ?? null;
}

export function isDigerYargiCourt(court?: DosyaTurCourtHint | null): boolean {
    if (!court) return false;
    const name = resolvedCourtName(court);
    if (bucketFromCourtName(name)) return false;
    const tablo = String(court.yargiBirimTablo || '').trim();
    if (tablo && DIGER_YARGI_TABLO.has(tablo)) return true;
    const folded = foldTr(name);
    if (!folded) return false;
    if (folded.includes('anayasa mahkemesi') || folded.includes('anayasa mah.')) return true;
    if (folded.includes('bolge adliye') || folded.includes('bolge idare')) return true;
    if (folded.includes('bam hukuk') || folded.includes('bam ceza')) return true;
    if (/(^|\s)bam(\s|$)/.test(folded)) return true;
    if (folded.includes('istinaf') || folded.includes('yargitay') || folded.includes('danistay')) {
        return true;
    }
    if (folded.includes('cumhuriyet bassavciligi') || folded.includes('cumhuriyet savciligi')) {
        return true;
    }
    return false;
}

/** First-instance idare/vergi — not Bölge İdare (istinaf → Diğer). */
export function isIdareFirstInstanceCourt(court?: DosyaTurCourtHint | null): boolean {
    if (!court || isDigerYargiCourt(court)) return false;
    return bucketFromYargiTablo(court.yargiBirimTablo) === 'idare'
        || bucketFromCourtName(resolvedCourtName(court)) === 'idare';
}

function bucketDosyaTurKod(kod: unknown): DosyaTurBucket {
    const n = finiteKod(kod);
    if (n == null) return 'other';
    if (n === 35) return 'icra';
    if (n === 15 || n === 14 || n === 78) return 'hukuk';
    if (n === 3 || n === 4) return 'ceza';
    if (n === 9 || n === 28) return 'idare';
    return 'other';
}

/**
 * Type card / chart bucket.
 * 1) First-instance court name (İcra Dairesi, İş, Asliye, Sulh, satış, …) —
 *    remaps a wrong/missing `dosyaTurKod` without rewriting SQLite.
 * 2) Arabuluculuk stays `other` (not Hukuk) even when kod is 15.
 * 3) AYM / BAM / istinaf / temyiz / Bölge İdare stay `other` even when kod is 15/3/9.
 * 4) First-instance `yargiBirimTablo`.
 * 5) Satış memurluğu (kod 168/255) → hukuk when not appellate.
 * 6) `dosyaTurKod` (35 icra, 15/14 hukuk, 3/4 ceza, 9/28 idare).
 */
export function bucketDosyaTur(kod: unknown, court?: DosyaTurCourtHint | null): DosyaTurBucket {
    try {
        const fromName = bucketFromCourtName(resolvedCourtName(court));
        if (fromName) return fromName;
        if (isArabuluculukMatter(court, kod)) return 'other';
        if (isDigerYargiCourt(court)) return 'other';
        const fromTablo = bucketFromYargiTablo(court?.yargiBirimTablo);
        if (fromTablo) return fromTablo;
        if (isSatisMemurlugu(court, kod)) return 'hukuk';
        return bucketDosyaTurKod(kod ?? court?.dosyaTurKod);
    } catch {
        return 'other';
    }
}

export function resolveStoredDosyaTurLabel(kod: unknown, stored?: string | null): string {
    const fromRow = toTurkishTitleCase(String(stored || '').trim());
    if (fromRow) return fromRow;
    const n = finiteKod(kod);
    if (n != null && DOSYA_TUR_LABEL_BY_KOD[n]) return DOSYA_TUR_LABEL_BY_KOD[n];
    return n != null ? `UYAP Dosya Türü ${n}` : 'Belirtilmemiş';
}

export type NotificationDosyaTurInput = {
    matterType?: string | null;
    dosyaTurKod?: unknown;
    dosyaTur?: string | null;
    yargiBirimTablo?: unknown;
    courtName?: string | null;
    davaTuru?: string | null;
    icraTakipYolu?: string | null;
    icraTakipYoluKod?: unknown;
};

/**
 * İcra Dairesi / icra müdürlüğü files (not İcra Hukuk Mahkemesi davaları).
 * Court name / tablo 0925 stay hukuk so those rows use `uyap_dava_turu`.
 */
export function isNotificationIcraMatter(input: NotificationDosyaTurInput): boolean {
    const court: DosyaTurCourtHint = {
        yargiBirimTablo:
            input.yargiBirimTablo == null || String(input.yargiBirimTablo).trim() === ''
                ? null
                : String(input.yargiBirimTablo).trim(),
        courtName: input.courtName ?? null,
        dosyaTurKod: input.dosyaTurKod,
        dosyaTur: input.dosyaTur ?? null,
    };
    const bucket = bucketDosyaTur(input.dosyaTurKod, court);
    if (bucket === 'icra') return true;
    return (
        String(input.matterType || '') === 'ENFORCEMENT' &&
        bucket === 'other' &&
        !isDigerYargiCourt(court)
    );
}

/**
 * Bell hover "Dosya türü": matter-card UYAP labels only.
 * İcra → `uyap_icra_takip_yolu` (or stored `icra.takipYolu` kod). Else → `uyap_dava_turu`.
 * Never the coarse `dosyaTur` / bucket string ("İcra", "Hukuk Dava Dosyası").
 */
export function resolveNotificationDosyaTurLabel(input: NotificationDosyaTurInput): string {
    const davaTuru = nonempty(input.davaTuru) ? String(input.davaTuru).trim() : '';
    const icraTakipYolu = nonempty(input.icraTakipYolu)
        ? String(input.icraTakipYolu).trim()
        : lookupKodLabel(ICRA_TAKIP_YOLU, input.icraTakipYoluKod);
    if (isNotificationIcraMatter(input)) return icraTakipYolu;
    return davaTuru;
}

function nonempty(value: unknown): boolean {
    return value != null && String(value).trim() !== '';
}

function lookupKodLabel(table: Record<number, string>, kod: unknown): string {
    if (kod == null || kod === '') return '';
    const n = finiteKod(kod);
    if (n == null || table[n] == null) return '';
    return table[n];
}

/** Compact display of stored icra takip labels (ilamsız / kambiyo), not a separate taxonomy. */
export function compactIcraLabel(label: string): string {
    const folded = foldTr(label);
    if (folded.includes('kambiyo')) return 'Kambiyo';
    if (folded.includes('ilamsiz')) return 'İlamsız';
    if (folded.includes('ilamli')) return 'İlamlı';
    if (folded.includes('iflas')) return 'İflas';
    if (folded.includes('genel haciz')) return 'Genel Haciz';
    if (folded.includes('rehin')) return 'Rehin';
    if (folded.includes('tahliye')) return 'Tahliye';
    return toTurkishTitleCase(label.trim()) || label.trim();
}

export function icraSubtypeLabel(input: {
    takipYoluText?: string | null;
    takipTuruText?: string | null;
    takipYoluKod?: unknown;
    takipTuruKod?: unknown;
}): string {
    const yolu = nonempty(input.takipYoluText)
        ? String(input.takipYoluText).trim()
        : lookupKodLabel(ICRA_TAKIP_YOLU, input.takipYoluKod);
    const turu = nonempty(input.takipTuruText)
        ? String(input.takipTuruText).trim()
        : lookupKodLabel(ICRA_TAKIP_TURU, input.takipTuruKod);
    const yoluShort = yolu ? compactIcraLabel(yolu) : '';
    const turuShort = turu ? compactIcraLabel(turu) : '';
    if (yoluShort && turuShort && foldTr(yoluShort) !== foldTr(turuShort)) {
        return `${turuShort} · ${yoluShort}`;
    }
    return yoluShort || turuShort || 'Belirtilmemiş';
}

export function courtTypeLabel(input: DosyaTurCourtHint): string {
    try {
        if (isArabuluculukMatter(input, input.dosyaTurKod)) return 'Arabuluculuk';
        if (isSatisMemurlugu(input, input.dosyaTurKod)) return 'Satış Memurluğu';
        const tablo = String(input.yargiBirimTablo || '').trim();
        if (tablo && YARGI_BIRIM_BY_TABLO[tablo]) return YARGI_BIRIM_BY_TABLO[tablo];
        const name = resolvedCourtName(input);
        if (!name) return 'Belirtilmemiş';
        const foldedName = foldTr(name);
        for (const label of YARGI_LABELS_LONGEST_FIRST) {
            if (foldedName.includes(foldTr(label))) return label;
        }
        return displayCourtName(name);
    } catch {
        return displayCourtName(resolvedCourtName(input));
    }
}

export function parseTrAmount(raw: unknown): number {
    const text = String(raw ?? '')
        .replace(/\s/g, '')
        .replace(/\./g, '')
        .replace(',', '.');
    const value = Number(text);
    return Number.isFinite(value) ? value : 0;
}

/** Per-file icra alacak: kesinleşen, else bakiye. Zero/missing kesinleşen does not invent money. */
export function icraAmountWithFallback(kesinlesen: unknown, bakiye: unknown): number {
    const primary = typeof kesinlesen === 'number' ? kesinlesen : parseTrAmount(kesinlesen);
    if (primary > 0) return primary;
    const fallback = typeof bakiye === 'number' ? bakiye : parseTrAmount(bakiye);
    return fallback > 0 ? fallback : 0;
}

/**
 * Stored closure only. `closing_date` or CLOSED/ARCHIVED → closed.
 * OPEN/APPEAL without a close date → open. Anything else is unknown — not “open”.
 */
export function classifyMatterClosure(input: {
    status?: string | null;
    closingDate?: string | null;
}): MatterClosureKind {
    const closing = String(input.closingDate || '').trim();
    const status = String(input.status || '').trim().toUpperCase();
    if (closing || status === 'CLOSED' || status === 'ARCHIVED') return 'closed';
    if (status === 'OPEN' || status === 'APPEAL') return 'open';
    return 'unknown';
}

export function isOpenLikeStatus(status?: string | null): boolean {
    const value = String(status || '').trim().toUpperCase();
    return value === 'OPEN' || value === 'APPEAL';
}

export function isClosedLikeStatus(status?: string | null): boolean {
    const value = String(status || '').trim().toUpperCase();
    return value === 'CLOSED' || value === 'ARCHIVED';
}

function jsonFlagOn(value: unknown): boolean {
    if (value === true || value === 1) return true;
    const text = String(value ?? '').trim().toLowerCase();
    return text === '1' || text === 'true';
}

function latestStampMs(values: unknown[]): number | null {
    let best: number | null = null;
    for (const raw of values) {
        const text = String(raw ?? '').trim();
        if (!text) continue;
        const parsed = Date.parse(text);
        if (!Number.isFinite(parsed)) continue;
        if (best == null || parsed > best) best = parsed;
    }
    return best;
}

export function matterHasEvrakCatalogFromAgg(input: CatalogFreshnessInput): boolean {
    if (jsonFlagOn(input.evrakListed) || jsonFlagOn(input.evrakSkipped)) return true;
    if ((Number(input.evrakCount) || 0) > 0) return true;
    if ((Number(input.evrakItemsLength) || 0) > 0) return true;
    return false;
}

export function isUnscannableCatalogNow(until: unknown, now = Date.now()): boolean {
    const parsed = Date.parse(String(until ?? '').trim());
    return Number.isFinite(parsed) && parsed > now;
}

function isClosedCatalogDurum(dosyaDurum: unknown): boolean {
    const durum = foldTr(String(dosyaDurum || '').trim());
    if (!durum) return false;
    return (
        durum.includes('karara cik') ||
        durum.includes('kapali') ||
        durum.includes('takipsizlik') ||
        durum.includes('arsiv')
    );
}

export function catalogPeriodKindFromAgg(input: CatalogFreshnessInput, now = Date.now()): CatalogPeriodKind {
    if (isUnscannableCatalogNow(input.unscannableUntil, now)) return 'dlq';
    if (!matterHasEvrakCatalogFromAgg(input)) return 'missing';
    if (isClosedLikeStatus(input.status) || isClosedCatalogDurum(input.dosyaDurum)) return 'closed';
    if (
        String(input.status || '').toUpperCase() === 'APPEAL' ||
        isDigerYargiCourt({
            courtName: input.courtName,
            birimAdi: input.birimAdi,
            yargiBirimTablo: input.yargiBirimTablo != null ? String(input.yargiBirimTablo) : null,
        })
    ) {
        return 'appeal';
    }
    return 'first';
}

/**
 * Inventory “güncel” = scannable file (not DLQ) whose catalog P is still < 1.0.
 * Missing trees are never current. Matches drip-schedule scoring, not katalog N/M.
 */
export function scoreInventoryCatalogFreshness(
    input: CatalogFreshnessInput,
    now = Date.now(),
): { periodKind: CatalogPeriodKind; eligible: boolean; current: boolean } {
    const periodKind = catalogPeriodKindFromAgg(input, now);
    if (periodKind === 'dlq') {
        return { periodKind, eligible: false, current: false };
    }
    const hasCatalog = matterHasEvrakCatalogFromAgg(input);
    const attempt = latestStampMs([input.lastCatalogAttemptAt]);
    const scan = latestStampMs([input.lastCatalogScanAt, input.evrakUpdatedAt]);
    const last = hasCatalog ? scan ?? attempt : attempt != null && (scan == null || attempt >= scan) ? attempt : scan;
    if (periodKind === 'missing' || CATALOG_PERIOD_HOURS[periodKind] === 0) {
        if (last == null) return { periodKind, eligible: true, current: false };
        const hours = Math.max(0, (now - last) / 3_600_000);
        return { periodKind, eligible: true, current: hours / CATALOG_PERIOD_HOURS.first < CATALOG_PRIORITY_MIN };
    }
    if (last == null) return { periodKind, eligible: true, current: false };
    const hours = Math.max(0, (now - last) / 3_600_000);
    const periodHours = CATALOG_PERIOD_HOURS[periodKind];
    return { periodKind, eligible: true, current: hours / periodHours < CATALOG_PRIORITY_MIN };
}

export function emptyInventoryFreshness(): InventoryFreshnessStats {
    return { eligible: 0, current: 0, percent: null };
}

export function addInventoryFreshnessScore(
    stats: InventoryFreshnessStats,
    score: { eligible: boolean; current: boolean },
): void {
    if (!score.eligible) return;
    stats.eligible += 1;
    if (score.current) stats.current += 1;
}

export function finalizeInventoryFreshness(stats: InventoryFreshnessStats): InventoryFreshnessStats {
    if (stats.eligible <= 0) return { ...stats, percent: null };
    return { ...stats, percent: Math.round((stats.current / stats.eligible) * 100) };
}

/**
 * İcra alacak açık/kapalı (stored fields only).
 * Open: `status` OPEN/APPEAL, or `dosyaDurum` itiraz-durmuş (`Takibe İtiraz`).
 * Closed: CLOSED/ARCHIVED, or `dosyaDurum` takipsiz/takipsizlik.
 */
export function isIcraAlacakOpen(input: {
    status?: string | null;
    dosyaDurum?: string | null;
}): boolean {
    const durum = foldTr(String(input.dosyaDurum || '').trim());
    if (durum.includes('takipsiz')) return false;
    if (durum.includes('itiraz')) return true;
    if (isOpenLikeStatus(input.status)) return true;
    if (isClosedLikeStatus(input.status)) return false;
    return durum.startsWith('acik');
}

export function emptyTypeStatusCounts(): TypeStatusCounts {
    return {
        icra: { open: 0, closed: 0 },
        hukuk: { open: 0, closed: 0 },
        ceza: { open: 0, closed: 0 },
        idare: { open: 0, closed: 0 },
        other: { open: 0, closed: 0 },
    };
}

function parseIsoMs(raw?: string | null): number | null {
    const text = String(raw || '').trim();
    if (!text) return null;
    const isoDay = text.match(/^(\d{4}-\d{2}-\d{2})/);
    const parsed = Date.parse(isoDay ? `${isoDay[1]}T00:00:00` : text);
    return Number.isFinite(parsed) ? parsed : null;
}

/** OPEN/APPEAL with no document (and task, when used) activity in the last 3 months. */
export function isIdleOpenMatter(input: {
    status?: string | null;
    lastDocumentAt?: string | null;
    lastTaskAt?: string | null;
    useTasks: boolean;
    asOf?: Date;
}): boolean {
    if (!isOpenLikeStatus(input.status)) return false;
    const asOf = input.asOf ?? new Date();
    const cutoff = new Date(asOf.getFullYear(), asOf.getMonth() - IDLE_OPEN_MONTHS, asOf.getDate()).getTime();
    const docMs = parseIsoMs(input.lastDocumentAt);
    if (!input.useTasks) {
        if (docMs == null) return true;
        return docMs < cutoff;
    }
    const taskMs = parseIsoMs(input.lastTaskAt);
    if (docMs == null && taskMs == null) return true;
    const last = Math.max(docMs ?? 0, taskMs ?? 0);
    return last < cutoff;
}

export const HAREKETSIZ_SNOOZE_MONTHS = [1, 3, 6] as const;
export type HareketsizSnoozeMonths = (typeof HAREKETSIZ_SNOOZE_MONTHS)[number];

export function hareketsizSnoozeUntilIso(months: HareketsizSnoozeMonths, asOf = new Date()): string {
    switch (months) {
        case 1:
        case 3:
        case 6: {
            const d = new Date(asOf.getTime());
            d.setMonth(d.getMonth() + months);
            return d.toISOString();
        }
        default: {
            const _never: never = months;
            return _never;
        }
    }
}

export function isHareketsizSnoozeActive(untilRaw: unknown, asOf = new Date()): boolean {
    if (untilRaw == null || untilRaw === '') return false;
    const ms = Date.parse(String(untilRaw));
    return Number.isFinite(ms) && ms > asOf.getTime();
}

export function partitionIdleOpenMatters<T extends { id: string }>(
    matters: T[],
    snoozeUntilById: Map<string, unknown>,
    asOf = new Date(),
): { active: T[]; snoozed: Array<T & { snoozeUntil: string }> } {
    const active: T[] = [];
    const snoozed: Array<T & { snoozeUntil: string }> = [];
    for (const row of matters) {
        const until = snoozeUntilById.get(row.id);
        if (isHareketsizSnoozeActive(until, asOf)) {
            snoozed.push({ ...row, snoozeUntil: String(until) });
        } else {
            active.push(row);
        }
    }
    return { active, snoozed };
}

function parsePartyProcessRolesMap(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }
    if (typeof raw !== 'string' || !raw.trim()) return {};
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        return {};
    }
    return {};
}

export function isOfficeMuvekkilRole(role?: string | null): boolean {
    const value = String(role || '').trim().toLocaleUpperCase('tr-TR');
    return value === 'MÜVEKKİL' || value === 'MUVEKKIL' || value === 'CLIENT';
}

export function isOfficeKarsiRole(role?: string | null): boolean {
    const value = String(role || '').trim().toLocaleUpperCase('tr-TR');
    return value === 'KARŞI_TARAF' || value === 'KARSI_TARAF' || value === 'COUNTERPARTY';
}

function roleKindFromLabel(raw: unknown): IcraMuvekkilRole {
    if (raw == null) return 'unknown';
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        if (raw === 21) return 'alacakli';
        if (raw === 22) return 'borclu';
        return 'unknown';
    }
    const folded = foldTr(String(raw));
    if (!folded) return 'unknown';
    if (folded.includes('alacakli')) return 'alacakli';
    if (folded.includes('borclu')) return 'borclu';
    if (folded.includes('ucuncu') || folded.includes('3. kisi') || folded.includes('3. sahis')) {
        return 'ucuncu';
    }
    return 'unknown';
}

function resolveIcraKindSet(kinds: Set<IcraMuvekkilRole>): IcraMuvekkilRole {
    kinds.delete('unknown');
    if (kinds.size === 0) return 'unknown';
    if (kinds.size === 1) return [...kinds][0];
    if (kinds.has('alacakli') && kinds.has('borclu')) return 'unknown';
    if (kinds.has('alacakli')) return 'alacakli';
    if (kinds.has('borclu')) return 'borclu';
    if (kinds.has('ucuncu')) return 'ucuncu';
    return 'unknown';
}

/**
 * When müvekkil has no icra process role, the other side of the file can still
 * say who we are: karşı alacaklı → müvekkil borçlu, and the reverse.
 */
export function inferIcraRoleFromKarsi(karsiProcessRoles?: unknown[] | null): IcraMuvekkilRole {
    if (!karsiProcessRoles?.length) return 'unknown';
    const kinds = new Set<IcraMuvekkilRole>();
    for (const item of karsiProcessRoles) kinds.add(roleKindFromLabel(item));
    kinds.delete('unknown');
    kinds.delete('ucuncu');
    if (kinds.has('alacakli') && kinds.has('borclu')) return 'unknown';
    if (kinds.has('alacakli')) return 'borclu';
    if (kinds.has('borclu')) return 'alacakli';
    return 'unknown';
}

export type IcraMuvekkilRoleFallback = {
    /** `parties.metadata.uyap.rol` (or `uyap_taraf_rolu`) keyed by müvekkil party id. */
    muvekkilProcessRoles?: Record<string, unknown>;
    /** UYAP süreç rolü on KARŞI_TARAF rows of the same file. */
    karsiProcessRoles?: unknown[];
};

/**
 * Müvekkil UYAP process role on an icra file — not a scan of every party on the file.
 *
 * Lookup order per müvekkil id:
 * 1. `matters.metadata.uyap.partyProcessRoles[partyId]` (keys must be SQLite party ids)
 * 2. fallback `parties.metadata.uyap.rol` on the müvekkil row
 * 3. infer from karşı taraf Alacaklı/Borçlu on this file
 *
 * Mixed alacaklı+borçlu müvekkils stay `unknown` rather than inventing a winner.
 */
export function classifyIcraMuvekkilRole(
    processRolesRaw: unknown,
    muvekkilPartyIds: string[],
    fallback?: IcraMuvekkilRoleFallback | null,
): IcraMuvekkilRole {
    if (muvekkilPartyIds.length === 0) return 'unknown';
    const roles = parsePartyProcessRolesMap(processRolesRaw);
    const fallbackMap =
        fallback?.muvekkilProcessRoles && typeof fallback.muvekkilProcessRoles === 'object'
            ? fallback.muvekkilProcessRoles
            : {};
    const kinds = new Set<IcraMuvekkilRole>();
    for (const partyId of muvekkilPartyIds) {
        const id = String(partyId || '').trim();
        if (!id) continue;
        let kind = roleKindFromLabel(roles[id]);
        if (kind === 'unknown') kind = roleKindFromLabel(fallbackMap[id]);
        kinds.add(kind);
    }
    const fromMuvekkil = resolveIcraKindSet(kinds);
    if (fromMuvekkil !== 'unknown') return fromMuvekkil;
    return inferIcraRoleFromKarsi(fallback?.karsiProcessRoles);
}

export function incrementLabelCount(counts: Map<string, number>, label: string, n = 1) {
    const key = toTurkishTitleCase(String(label || '').trim()) || 'Belirtilmemiş';
    counts.set(key, (counts.get(key) || 0) + n);
}

export function incrementBreakdownPair(
    counts: Map<string, BreakdownPair>,
    label: string,
    isOpen: boolean,
    n = 1,
) {
    const key = toTurkishTitleCase(String(label || '').trim()) || 'Belirtilmemiş';
    const row = counts.get(key) ?? { open: 0, count: 0 };
    row.count += n;
    if (isOpen) row.open += n;
    counts.set(key, row);
}

export function addOpeningMonthFact(
    months: Map<string, OpeningMonthAccum>,
    fact: {
        month: string;
        bucket: DosyaTurBucket;
        icraAlacak?: number;
        icraRole?: IcraMuvekkilRole;
        closure: MatterClosureKind;
        label?: string;
    },
) {
    const row = months.get(fact.month) ?? emptyOpeningMonthAccum();
    row.byType[fact.bucket] += 1;
    if (fact.bucket === 'icra') {
        const amount = fact.icraAlacak && fact.icraAlacak > 0 ? fact.icraAlacak : 0;
        if (amount > 0) {
            row.icraAlacak += amount;
            row.icraWithAmount += 1;
            if (fact.icraRole === 'alacakli') row.icraAlacakAlacakli += amount;
            else if (fact.icraRole === 'borclu') row.icraAlacakBorclu += amount;
        }
    }
    switch (fact.closure) {
        case 'closed':
            row.closed += 1;
            break;
        case 'open':
            row.stillOpen += 1;
            break;
        case 'unknown':
            row.unknown += 1;
            break;
        default: {
            const _never: never = fact.closure;
            void _never;
        }
    }
    if (fact.label != null) incrementLabelCount(row.labels, fact.label);
    months.set(fact.month, row);
}

/** Closing volume by `closing_date` month — independent of when the file was opened. */
export function addClosingMonthCount(
    months: Map<string, OpeningMonthAccum>,
    month: string,
    n = 1,
) {
    const row = months.get(month) ?? emptyOpeningMonthAccum();
    row.closedThisMonth += n;
    months.set(month, row);
}

export function serializeOpeningMonthWindow(
    months: Map<string, OpeningMonthAccum>,
    topN = OPENING_MONTH_TOP_LABELS,
): OpeningMonthRow[] {
    return lastNOpeningMonthsAccum(months, OPENING_CHART_LOOKBACK_MONTHS).map((row) => ({
        month: row.month,
        count: row.count,
        byType: row.byType,
        icraAlacak: row.icraAlacak,
        icraAlacakAlacakli: row.icraAlacakAlacakli,
        icraAlacakBorclu: row.icraAlacakBorclu,
        icraWithAmount: row.icraWithAmount,
        closed: row.closed,
        stillOpen: row.stillOpen,
        unknown: row.unknown,
        closedThisMonth: row.closedThisMonth,
        topLabels: toBreakdownRows(row.labels).slice(0, topN),
    }));
}

export function shouldUseLogAmountScale(values: number[]): boolean {
    const positive = values.filter((value) => value > 0);
    if (positive.length < 2) return false;
    const max = Math.max(...positive);
    const sorted = [...positive].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (!(median > 0)) return false;
    return max / median >= 8;
}

function scaleUnit(value: number, max: number, log: boolean): number {
    if (max <= 0) return 0;
    const clamped = Math.max(0, value);
    if (!log) return Math.min(1, clamped / max);
    const top = Math.log10(1 + max);
    if (top <= 0) return 0;
    return Math.min(1, Math.log10(1 + clamped) / top);
}

/** Amount sparkline Y is pixels from the bottom of a `barMaxPx` plot; X is 0–1 along the axis. Clipped to the plot. */
export function amountLinePoints(
    amounts: number[],
    barMaxPx: number,
    options?: { log?: boolean; padPx?: number },
): Array<{ x: number; y: number }> {
    const n = amounts.length;
    if (n === 0 || barMaxPx <= 0) return [];
    const max = Math.max(0, ...amounts);
    if (max <= 0) return [];
    const pad = Math.max(0, options?.padPx ?? 0);
    const inner = Math.max(0, barMaxPx - pad * 2);
    const log = Boolean(options?.log);
    return amounts.map((value, i) => ({
        x: (i + 0.5) / n,
        y: Math.round(pad + scaleUnit(value, max, log) * inner),
    }));
}

/** SVG polyline in viewBox `0 0 n heightPx` (y from top). Stroke stays inside the box. */
export function sparklinePolylinePoints(
    values: number[],
    heightPx: number,
    options?: { log?: boolean; padPx?: number; sharedMax?: number },
): string | null {
    const n = values.length;
    if (n === 0 || heightPx <= 0) return null;
    const max = options?.sharedMax != null ? options.sharedMax : Math.max(0, ...values);
    if (max <= 0) return null;
    const pad = Math.max(0, options?.padPx ?? SPARKLINE_PAD_PX);
    const inner = Math.max(0, heightPx - pad * 2);
    const log = Boolean(options?.log);
    return values
        .map((value, i) => {
            const x = i + 0.5;
            const y = heightPx - pad - scaleUnit(value, max, log) * inner;
            const clipped = Math.min(heightPx - pad, Math.max(pad, y));
            return `${x},${clipped}`;
        })
        .join(' ');
}

export function toBreakdownRows(counts: Map<string, number>): BreakdownRow[] {
    return [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'tr'));
}

export function toBreakdownPairRows(counts: Map<string, BreakdownPair>): BreakdownRow[] {
    return [...counts.entries()]
        .map(([label, row]) => ({ label, count: row.count, open: row.open }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'tr'));
}

export function stackBarSegments(
    byType: OpeningTypeCounts,
    max: number,
    barMaxPx: number,
): Array<{ bucket: DosyaTurBucket; px: number }> {
    const total = byType.icra + byType.hukuk + byType.ceza + byType.idare + byType.other;
    if (total <= 0 || max <= 0) return [];
    const pxTotal = Math.max(4, Math.round((total / max) * barMaxPx));
    const present = DOSYA_TUR_BUCKETS.filter((bucket) => byType[bucket] > 0);
    let remaining = pxTotal;
    return present.map((bucket, index) => {
        const isLast = index === present.length - 1;
        const px = isLast
            ? remaining
            : Math.max(1, Math.round((byType[bucket] / total) * pxTotal));
        remaining = Math.max(0, remaining - px);
        return { bucket, px };
    });
}

export function addOpeningTypeCount(
    counts: Map<string, OpeningTypeCounts>,
    month: string,
    bucket: DosyaTurBucket,
) {
    const row = counts.get(month) ?? emptyOpeningTypeCounts();
    row[bucket] += 1;
    counts.set(month, row);
}

export function emptyBreakdowns(): Record<DosyaTurBucket, BreakdownRow[]> {
    return { icra: [], hukuk: [], ceza: [], idare: [], other: [] };
}
