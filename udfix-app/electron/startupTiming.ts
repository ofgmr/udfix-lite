const t0 = process.hrtime.bigint();
const marks: { label: string; ms: number }[] = [];

export function isStartupTimingEnabled(): boolean {
    const raw = process.env.UDFIX_STARTUP_TIMING;
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
    return process.env.NODE_ENV === 'development';
}

/** Wall time since main process entered `whenReady` (or first mark). */
export function startupMark(label: string): void {
    if (!isStartupTimingEnabled()) return;
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    marks.push({ label, ms });
    console.log(`[startup +${ms.toFixed(0)}ms] ${label}`);
}

export function startupFlushSummary(): void {
    if (!isStartupTimingEnabled() || marks.length < 2) return;
    console.log('[startup] phase deltas (ms):');
    for (let i = 1; i < marks.length; i++) {
        const prev = marks[i - 1]!;
        const cur = marks[i]!;
        console.log(`  ${prev.label} → ${cur.label}: +${(cur.ms - prev.ms).toFixed(0)}`);
    }
    console.log(`[startup] total to last mark: ${marks[marks.length - 1]!.ms.toFixed(0)}ms`);
}
