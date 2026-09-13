const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
const marks: { label: string; ms: number }[] = [];

function enabled(): boolean {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('startupTiming') === '0') return false;
    if (params.get('startupTiming') === '1') return true;
    return import.meta.env.DEV;
}

export function rendererStartupMark(label: string): void {
    if (!enabled()) return;
    const last = marks[marks.length - 1];
    if (last?.label === label) return;
    const ms = performance.now() - t0;
    marks.push({ label, ms });
    console.log(`[startup-renderer +${ms.toFixed(0)}ms] ${label}`);
}

export function rendererStartupFlushSummary(): void {
    if (!enabled() || marks.length < 2) return;
    console.log('[startup-renderer] phase deltas (ms):');
    for (let i = 1; i < marks.length; i++) {
        const prev = marks[i - 1]!;
        const cur = marks[i]!;
        console.log(`  ${prev.label} → ${cur.label}: +${(cur.ms - prev.ms).toFixed(0)}`);
    }
}
