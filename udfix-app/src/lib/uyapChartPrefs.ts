export const KATIR_CHART_PREFS_KEY = 'udfix-katir-chart-prefs';

export const CHART_RANGE_MONTHS = [12, 24, 36] as const;
export type ChartRangeMonths = (typeof CHART_RANGE_MONTHS)[number];

export type KatirChartMode = 'monthly' | 'cumulative';

export type KatirChartSeries = {
    icra: boolean;
    hukuk: boolean;
    ceza: boolean;
    idare: boolean;
    other: boolean;
    alacakli: boolean;
    borclu: boolean;
    kapanis: boolean;
    aktifStok: boolean;
};

/** Types on, finance off — bars stay readable; TL chips are one click away. */
export const DEFAULT_KATIR_CHART_SERIES: KatirChartSeries = {
    icra: true,
    hukuk: true,
    ceza: true,
    idare: true,
    other: true,
    alacakli: false,
    borclu: false,
    kapanis: true,
    aktifStok: true,
};

export type KatirChartPrefs = {
    mode: KatirChartMode;
    series: KatirChartSeries;
    range: ChartRangeMonths;
};

export const DEFAULT_KATIR_CHART_PREFS: KatirChartPrefs = {
    mode: 'monthly',
    series: { ...DEFAULT_KATIR_CHART_SERIES },
    range: 12,
};

function asChartRange(value: unknown): ChartRangeMonths {
    if (value === 12 || value === 24 || value === 36) return value;
    return 12;
}

function asMode(value: unknown): KatirChartMode {
    return value === 'cumulative' ? 'cumulative' : 'monthly';
}

function asBool(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

export function loadKatirChartPrefs(): KatirChartPrefs {
    try {
        const raw = localStorage.getItem(KATIR_CHART_PREFS_KEY);
        if (!raw) return { ...DEFAULT_KATIR_CHART_PREFS, series: { ...DEFAULT_KATIR_CHART_SERIES } };
        const parsed = JSON.parse(raw) as Partial<KatirChartPrefs> & { series?: Partial<KatirChartSeries> };
        const base = DEFAULT_KATIR_CHART_SERIES;
        return {
            mode: asMode(parsed.mode),
            range: asChartRange(parsed.range),
            series: {
                icra: asBool(parsed.series?.icra, base.icra),
                hukuk: asBool(parsed.series?.hukuk, base.hukuk),
                ceza: asBool(parsed.series?.ceza, base.ceza),
                idare: asBool(parsed.series?.idare, base.idare),
                other: asBool(parsed.series?.other, base.other),
                alacakli: asBool(parsed.series?.alacakli, base.alacakli),
                borclu: asBool(parsed.series?.borclu, base.borclu),
                kapanis: asBool(parsed.series?.kapanis, base.kapanis),
                aktifStok: asBool(parsed.series?.aktifStok, base.aktifStok),
            },
        };
    } catch {
        return { ...DEFAULT_KATIR_CHART_PREFS, series: { ...DEFAULT_KATIR_CHART_SERIES } };
    }
}

export function saveKatirChartPrefs(prefs: KatirChartPrefs): void {
    try {
        localStorage.setItem(KATIR_CHART_PREFS_KEY, JSON.stringify(prefs));
    } catch {
        /* ignore quota */
    }
}
