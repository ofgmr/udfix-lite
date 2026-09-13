/** Legal portal years: not Excel-serial garbage like 5314. */
export const PORTAL_DATE_MIN_YEAR = 1990;

const INGEST_CLOCK = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:/;

export type UyapPortalDateFields = {
    tarih?: unknown;
    sistemeGonderildigiTarih?: unknown;
    onaylandigiTarih?: unknown;
    incomingDate?: unknown;
};

export type PortalDateParts = {
    year: number;
    month: number;
    day: number;
};

export function portalDateMaxYear(asOf: Date = new Date()): number {
    return asOf.getFullYear() + 1;
}

export function isPlausiblePortalYear(year: number, asOf: Date = new Date()): boolean {
    if (!Number.isInteger(year)) return false;
    return year >= PORTAL_DATE_MIN_YEAR && year <= portalDateMaxYear(asOf);
}

function pad2(value: number): string {
    return String(value).padStart(2, '0');
}

export function formatPortalIso(year: number, month: number, day: number): string {
    return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

export function isValidCalendarYmd(year: number, month: number, day: number): boolean {
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const dt = new Date(Date.UTC(year, month - 1, day));
    return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

export function isIngestClockDate(raw: unknown): boolean {
    return INGEST_CLOCK.test(String(raw || '').trim());
}

/** Parse TR `gg.aa.yyyy` / `gg/aa/yyyy` or ISO `YYYY-MM-DD` (optional time). Year may be garbage. */
export function parsePortalDateParts(raw: unknown): PortalDateParts | null {
    if (raw == null) return null;
    const text = String(raw).trim();
    if (!text) return null;
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
        return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    }
    const tr = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (tr) {
        return { year: Number(tr[3]), month: Number(tr[2]), day: Number(tr[1]) };
    }
    return null;
}

export function isPlausiblePortalIso(iso: string, asOf: Date = new Date()): boolean {
    const parts = parsePortalDateParts(iso);
    if (!parts) return false;
    return (
        isPlausiblePortalYear(parts.year, asOf)
        && isValidCalendarYmd(parts.year, parts.month, parts.day)
    );
}

export function parseUyapPortalDateToIso(raw: unknown, asOf: Date = new Date()): string | null {
    const parts = parsePortalDateParts(raw);
    if (!parts) return null;
    if (!isPlausiblePortalYear(parts.year, asOf)) return null;
    if (!isValidCalendarYmd(parts.year, parts.month, parts.day)) return null;
    return formatPortalIso(parts.year, parts.month, parts.day);
}

export function coalesceUyapPortalDate(
    fields: UyapPortalDateFields,
    asOf: Date = new Date(),
): string | null {
    const incoming = isIngestClockDate(fields.incomingDate) ? null : fields.incomingDate;
    const candidates = [
        fields.tarih,
        fields.sistemeGonderildigiTarih,
        fields.onaylandigiTarih,
        incoming,
    ];
    for (const candidate of candidates) {
        const iso = parseUyapPortalDateToIso(candidate, asOf);
        if (iso) return iso;
    }
    return null;
}

/**
 * Keep DD.MM from a garbage year (5314) and apply the sibling/anchor year.
 * If day/month are unusable, substitute the anchor date wholesale.
 */
export function clampPortalDateToAnchor(
    raw: unknown,
    anchorIso: string | null | undefined,
    asOf: Date = new Date(),
): string | null {
    const anchor = parseUyapPortalDateToIso(anchorIso, asOf);
    if (!anchor) return null;
    const parts = parsePortalDateParts(raw);
    if (!parts) return anchor;
    const year = Number(anchor.slice(0, 4));
    if (!isValidCalendarYmd(year, parts.month, parts.day)) return anchor;
    const iso = formatPortalIso(year, parts.month, parts.day);
    return isPlausiblePortalYear(year, asOf) ? iso : anchor;
}

/**
 * Own UYAP fields first (tarih / gönderildi / onay / date-only incoming).
 * If the year is implausible, clamp/substitute using the matter’s latest sibling portal date.
 * SQL must not compute that sibling with a per-row correlated subquery — use one GROUP BY join.
 */
export function sanitizeUyapPortalDate(
    fields: UyapPortalDateFields,
    siblingIso?: string | null,
    asOf: Date = new Date(),
): string | null {
    const own = coalesceUyapPortalDate(fields, asOf);
    if (own) return own;
    const garbage = fields.tarih ?? fields.sistemeGonderildigiTarih ?? fields.onaylandigiTarih ?? fields.incomingDate;
    if (!parsePortalDateParts(garbage)) return null;
    return clampPortalDateToAnchor(garbage, siblingIso, asOf);
}

export function comparePortalIsoDesc(
    a: string | null | undefined,
    b: string | null | undefined,
    asOf: Date = new Date(),
): number {
    const aa = a && isPlausiblePortalIso(a, asOf) ? a.slice(0, 10) : '';
    const bb = b && isPlausiblePortalIso(b, asOf) ? b.slice(0, 10) : '';
    if (aa === bb) return 0;
    if (!aa) return 1;
    if (!bb) return -1;
    return aa < bb ? 1 : -1;
}

export function sortBySanitizedPortalDate<T>(
    rows: T[],
    isoOf: (row: T) => string | null | undefined,
    titleOf?: (row: T) => string,
    asOf: Date = new Date(),
): T[] {
    return [...rows].sort((left, right) => {
        const cmp = comparePortalIsoDesc(isoOf(left), isoOf(right), asOf);
        if (cmp !== 0) return cmp;
        const titleA = titleOf?.(left) ?? '';
        const titleB = titleOf?.(right) ?? '';
        return titleA.localeCompare(titleB, 'tr');
    });
}

/** SQLite predicate: ISO `YYYY-MM-DD` year in [1990, strftime('%Y','now')+1]. */
export function sqlIsoYearIsPlausible(isoExpr: string): string {
    return `(${isoExpr}) IS NOT NULL
        AND CAST(substr((${isoExpr}), 1, 4) AS INTEGER) BETWEEN ${PORTAL_DATE_MIN_YEAR}
            AND (CAST(strftime('%Y', 'now') AS INTEGER) + 1)`;
}
