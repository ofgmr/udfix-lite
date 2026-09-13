import type { UyapDosyaTurBucket, UyapOpeningMonthRow } from '../services/dataService';
import type { KatirChartMode, KatirChartSeries } from './uyapChartPrefs';

const BUCKETS: readonly UyapDosyaTurBucket[] = ['icra', 'hukuk', 'ceza', 'idare', 'other'];

function emptyByType(): Record<UyapDosyaTurBucket, number> {
    return { icra: 0, hukuk: 0, ceza: 0, idare: 0, other: 0 };
}

function typeTotal(byType: Record<UyapDosyaTurBucket, number>): number {
    return byType.icra + byType.hukuk + byType.ceza + byType.idare + byType.other;
}

export type ChartPlotMonth = UyapOpeningMonthRow & { netStock: number };

export function applyKatirSeriesMask(row: UyapOpeningMonthRow, series: KatirChartSeries): UyapOpeningMonthRow {
    const byType = emptyByType();
    for (const bucket of BUCKETS) {
        if (series[bucket]) byType[bucket] = row.byType?.[bucket] || 0;
    }
    const split = (row.icraAlacakAlacakli || 0) > 0 || (row.icraAlacakBorclu || 0) > 0;
    const alacakli = series.alacakli ? row.icraAlacakAlacakli || 0 : 0;
    const borclu = series.borclu ? row.icraAlacakBorclu || 0 : 0;
    let icraAlacak = 0;
    if (split) {
        icraAlacak = alacakli + borclu;
    } else if (series.alacakli || series.borclu) {
        icraAlacak = row.icraAlacak || 0;
    }
    return {
        ...row,
        byType,
        count: typeTotal(byType),
        icraAlacak,
        icraAlacakAlacakli: alacakli,
        icraAlacakBorclu: borclu,
        closedThisMonth: series.kapanis ? row.closedThisMonth || 0 : 0,
    };
}

export function accumulateKatirChartMonths(rows: UyapOpeningMonthRow[]): ChartPlotMonth[] {
    const byType = emptyByType();
    let icraAlacak = 0;
    let icraAlacakAlacakli = 0;
    let icraAlacakBorclu = 0;
    let icraWithAmount = 0;
    let closedThisMonth = 0;
    return rows.map((row) => {
        for (const bucket of BUCKETS) {
            byType[bucket] += row.byType?.[bucket] || 0;
        }
        icraAlacak += row.icraAlacak || 0;
        icraAlacakAlacakli += row.icraAlacakAlacakli || 0;
        icraAlacakBorclu += row.icraAlacakBorclu || 0;
        icraWithAmount += row.icraWithAmount || 0;
        closedThisMonth += row.closedThisMonth || 0;
        const count = typeTotal(byType);
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

export function toKatirPlotMonths(
    months: UyapOpeningMonthRow[],
    series: KatirChartSeries,
    mode: KatirChartMode,
): ChartPlotMonth[] {
    const masked = months.map((row) => applyKatirSeriesMask(row, series));
    switch (mode) {
        case 'cumulative':
            return accumulateKatirChartMonths(masked);
        case 'monthly':
            return masked.map((row) => ({
                ...row,
                netStock: (row.count || 0) - (row.closedThisMonth || 0),
            }));
        default: {
            const _never: never = mode;
            return _never;
        }
    }
}
