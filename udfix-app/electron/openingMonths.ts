export type DosyaTurBucket = 'icra' | 'hukuk' | 'ceza' | 'idare' | 'other';

export const DOSYA_TUR_BUCKETS: readonly DosyaTurBucket[] = ['icra', 'hukuk', 'ceza', 'idare', 'other'];

export type OpeningTypeCounts = Record<DosyaTurBucket, number>;

export type MatterClosureKind = 'closed' | 'open' | 'unknown';

export type OpeningMonthAccum = {
    byType: OpeningTypeCounts;
    icraAlacak: number;
    icraAlacakAlacakli: number;
    icraAlacakBorclu: number;
    icraWithAmount: number;
    closed: number;
    stillOpen: number;
    unknown: number;
    /** Files whose `closing_date` falls in this month (eritme), not “opened here then later closed”. */
    closedThisMonth: number;
    labels: Map<string, number>;
};

export function emptyOpeningTypeCounts(): OpeningTypeCounts {
    return { icra: 0, hukuk: 0, ceza: 0, idare: 0, other: 0 };
}

export function emptyOpeningMonthAccum(): OpeningMonthAccum {
    return {
        byType: emptyOpeningTypeCounts(),
        icraAlacak: 0,
        icraAlacakAlacakli: 0,
        icraAlacakBorclu: 0,
        icraWithAmount: 0,
        closed: 0,
        stillOpen: 0,
        unknown: 0,
        closedThisMonth: 0,
        labels: new Map(),
    };
}

export function cloneOpeningMonthAccum(src: OpeningMonthAccum): OpeningMonthAccum {
    return {
        byType: { ...src.byType },
        icraAlacak: src.icraAlacak,
        icraAlacakAlacakli: src.icraAlacakAlacakli,
        icraAlacakBorclu: src.icraAlacakBorclu,
        icraWithAmount: src.icraWithAmount,
        closed: src.closed,
        stillOpen: src.stillOpen,
        unknown: src.unknown,
        closedThisMonth: src.closedThisMonth,
        labels: new Map(src.labels),
    };
}

export function openingTypeCountsTotal(counts: OpeningTypeCounts): number {
    return counts.icra + counts.hukuk + counts.ceza + counts.idare + counts.other;
}

/** Month key `YYYY-MM` from ISO or TR `gg/aa/yyyy` / `gg.aa.yyyy` (same ingest sources as `uyapDateToIso`). */
export function openingMonthKey(raw: unknown): string | null {
    if (raw == null) return null;
    const text = String(raw).trim();
    if (!text) return null;
    const iso = text.match(/^(\d{4})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}`;
    const tr = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (tr) return `${tr[3]}-${String(Number(tr[2])).padStart(2, '0')}`;
    const parsed = Date.parse(text);
    if (!Number.isFinite(parsed)) return null;
    const dt = new Date(parsed);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

export function coalesceOpeningMonth(row: {
    opening_date?: string | null;
    dosya_acilis_tarihi?: unknown;
    attr_opening?: string | null;
}): string | null {
    return (
        openingMonthKey(row.opening_date) ||
        openingMonthKey(row.dosya_acilis_tarihi) ||
        openingMonthKey(row.attr_opening)
    );
}

export const OPENING_CHART_LOOKBACK_MONTHS = 60;
export const TRAILING_OPENING_WINDOWS = [12, 24, 36, 48, 60] as const;
export type TrailingOpeningWindow = (typeof TRAILING_OPENING_WINDOWS)[number];

export type TrailingWindowMetrics = {
    count: number;
    byType: OpeningTypeCounts;
    icraAlacak: number;
    icraAlacakAlacakli: number;
    icraAlacakBorclu: number;
};

export type TrailingOpeningTotals = {
    months12: number;
    months24: number;
    months36: number;
    months48: number;
    months60: number;
    window12: TrailingWindowMetrics;
    window24: TrailingWindowMetrics;
    window36: TrailingWindowMetrics;
    window48: TrailingWindowMetrics;
    window60: TrailingWindowMetrics;
};

export type OpeningSeriesMask = {
    icra: boolean;
    hukuk: boolean;
    ceza: boolean;
    idare: boolean;
    other: boolean;
    alacakli: boolean;
    borclu: boolean;
    kapanis: boolean;
};

export type AccumulatedOpeningMonth = {
    month: string;
    count: number;
    byType: OpeningTypeCounts;
    icraAlacak: number;
    icraAlacakAlacakli: number;
    icraAlacakBorclu: number;
    icraWithAmount: number;
    closedThisMonth: number;
    /** `cum(openings) − cum(closings)` from the first row of this array (visible window). */
    netStock: number;
};

/**
 * Last `n` calendar months ending at the latest month that has data
 * (not calendar-now empty buckets — a 2024-only corpus would vanish in a 2026 window).
 */
export function lastNOpeningMonthsAccum(
    counts: Map<string, OpeningMonthAccum>,
    n: number,
    _now: Date = new Date(),
): Array<{ month: string; count: number } & OpeningMonthAccum> {
    void _now;
    const span = Math.max(1, Math.min(OPENING_CHART_LOOKBACK_MONTHS, Math.floor(n)));
    const populated = [...counts.entries()]
        .filter(
            ([, row]) =>
                openingTypeCountsTotal(row.byType) > 0 ||
                row.closedThisMonth > 0,
        )
        .map(([key]) => key)
        .sort();
    if (populated.length === 0) return [];
    const endKey = populated[populated.length - 1];
    const [endY, endM] = endKey.split('-').map(Number);
    const out: Array<{ month: string; count: number } & OpeningMonthAccum> = [];
    for (let i = span - 1; i >= 0; i -= 1) {
        const d = new Date(endY, endM - 1 - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const acc = counts.get(key);
        const cloned = acc ? cloneOpeningMonthAccum(acc) : emptyOpeningMonthAccum();
        out.push({
            month: key,
            count: openingTypeCountsTotal(cloned.byType),
            ...cloned,
        });
    }
    return out;
}

export function lastTwelveOpeningMonthsAccum(
    counts: Map<string, OpeningMonthAccum>,
    _now: Date = new Date(),
): Array<{ month: string; count: number } & OpeningMonthAccum> {
    return lastNOpeningMonthsAccum(counts, 12, _now);
}

function emptyTrailingWindowMetrics(): TrailingWindowMetrics {
    return {
        count: 0,
        byType: emptyOpeningTypeCounts(),
        icraAlacak: 0,
        icraAlacakAlacakli: 0,
        icraAlacakBorclu: 0,
    };
}

function sumTrailingWindowMetrics(
    counts: Map<string, OpeningMonthAccum>,
    n: number,
    now: Date,
): TrailingWindowMetrics {
    const y = now.getFullYear();
    const m = now.getMonth();
    const out = emptyTrailingWindowMetrics();
    for (let i = 0; i < n; i += 1) {
        const d = new Date(y, m - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const row = counts.get(key);
        if (!row) continue;
        out.byType.icra += row.byType.icra;
        out.byType.hukuk += row.byType.hukuk;
        out.byType.ceza += row.byType.ceza;
        out.byType.idare += row.byType.idare;
        out.byType.other += row.byType.other;
        out.icraAlacak += row.icraAlacak;
        out.icraAlacakAlacakli += row.icraAlacakAlacakli;
        out.icraAlacakBorclu += row.icraAlacakBorclu;
    }
    out.count = openingTypeCountsTotal(out.byType);
    return out;
}

/** Opening counts and monthly icra amounts in the last 12/24/36/48/60 calendar months ending at `now`. */
export function trailingOpeningTotals(
    counts: Map<string, OpeningMonthAccum>,
    now: Date = new Date(),
): TrailingOpeningTotals {
    const window12 = sumTrailingWindowMetrics(counts, 12, now);
    const window24 = sumTrailingWindowMetrics(counts, 24, now);
    const window36 = sumTrailingWindowMetrics(counts, 36, now);
    const window48 = sumTrailingWindowMetrics(counts, 48, now);
    const window60 = sumTrailingWindowMetrics(counts, 60, now);
    return {
        months12: window12.count,
        months24: window24.count,
        months36: window36.count,
        months48: window48.count,
        months60: window60.count,
        window12,
        window24,
        window36,
        window48,
        window60,
    };
}

export function applyOpeningSeriesMask<T extends {
    byType: OpeningTypeCounts;
    count: number;
    icraAlacak: number;
    icraAlacakAlacakli: number;
    icraAlacakBorclu: number;
    closedThisMonth: number;
}>(row: T, mask: OpeningSeriesMask): T {
    const byType = emptyOpeningTypeCounts();
    for (const bucket of DOSYA_TUR_BUCKETS) {
        if (mask[bucket]) byType[bucket] = row.byType[bucket] || 0;
    }
    const split = (row.icraAlacakAlacakli || 0) > 0 || (row.icraAlacakBorclu || 0) > 0;
    const alacakli = mask.alacakli ? row.icraAlacakAlacakli || 0 : 0;
    const borclu = mask.borclu ? row.icraAlacakBorclu || 0 : 0;
    let icraAlacak = 0;
    if (split) {
        icraAlacak = alacakli + borclu;
    } else if (mask.alacakli || mask.borclu) {
        icraAlacak = row.icraAlacak || 0;
    }
    return {
        ...row,
        byType,
        count: openingTypeCountsTotal(byType),
        icraAlacak,
        icraAlacakAlacakli: alacakli,
        icraAlacakBorclu: borclu,
        closedThisMonth: mask.kapanis ? row.closedThisMonth || 0 : 0,
    };
}

/**
 * Running sums along the given rows (typically the visible 12/24/36/48/60 slice).
 * File types and finance are cumulative **openings / monthly amounts**, not office-wide stock.
 * `netStock` is cumulative openings minus cumulative `closedThisMonth` from the first plotted month.
 */
export function accumulateOpeningMonthRows<T extends {
    month: string;
    count: number;
    byType: OpeningTypeCounts;
    icraAlacak: number;
    icraAlacakAlacakli: number;
    icraAlacakBorclu: number;
    icraWithAmount?: number;
    closedThisMonth: number;
}>(rows: T[]): Array<T & AccumulatedOpeningMonth> {
    const byType = emptyOpeningTypeCounts();
    let icraAlacak = 0;
    let icraAlacakAlacakli = 0;
    let icraAlacakBorclu = 0;
    let icraWithAmount = 0;
    let closedThisMonth = 0;
    return rows.map((row) => {
        for (const bucket of DOSYA_TUR_BUCKETS) {
            byType[bucket] += row.byType[bucket] || 0;
        }
        icraAlacak += row.icraAlacak || 0;
        icraAlacakAlacakli += row.icraAlacakAlacakli || 0;
        icraAlacakBorclu += row.icraAlacakBorclu || 0;
        icraWithAmount += row.icraWithAmount || 0;
        closedThisMonth += row.closedThisMonth || 0;
        const count = openingTypeCountsTotal(byType);
        return {
            ...row,
            count,
            byType: { ...byType },
            icraAlacak,
            icraAlacakAlacakli,
            icraAlacakBorclu,
            icraWithAmount,
            closedThisMonth,
            netStock: count - closedThisMonth,
        };
    });
}

/** Last 12 calendar months ending at the latest month that has data (not calendar-now). */
export function lastTwelveOpeningMonthsByType(
    counts: Map<string, OpeningTypeCounts>,
    _now: Date = new Date(),
): Array<{ month: string; count: number; byType: OpeningTypeCounts }> {
    const typed = new Map<string, OpeningMonthAccum>();
    for (const [key, byType] of counts) {
        const row = emptyOpeningMonthAccum();
        row.byType = { ...byType };
        typed.set(key, row);
    }
    return lastTwelveOpeningMonthsAccum(typed, _now).map(({ month, count, byType }) => ({
        month,
        count,
        byType,
    }));
}

/**
 * Last 12 calendar months ending at the latest month that has data
 * (not “now”, which drops a 2024-only corpus in a 2025–2026 window).
 */
export function lastTwelveOpeningMonths(
    counts: Map<string, number>,
    _now: Date = new Date(),
): Array<{ month: string; count: number }> {
    const typed = new Map<string, OpeningTypeCounts>();
    for (const [key, n] of counts) {
        const row = emptyOpeningTypeCounts();
        row.other = n;
        typed.set(key, row);
    }
    return lastTwelveOpeningMonthsByType(typed, _now).map(({ month, count }) => ({ month, count }));
}
