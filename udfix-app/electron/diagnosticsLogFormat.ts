/** Pure log-line helpers. No Electron imports so tests and the main process share them. */

export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: ReadonlySet<string> = new Set(['debug', 'info', 'warn', 'error']);

export const DIAGNOSTIC_LINE_MAX = 2000;
export const DIAGNOSTIC_ROTATE_BYTES = 5 * 1024 * 1024;

export function isDiagnosticLevel(value: unknown): value is DiagnosticLevel {
    return typeof value === 'string' && LEVELS.has(value);
}

/** One TSV line. Newlines are flattened so a message cannot break the file. */
export function formatDiagnosticLine(
    isoTime: string,
    level: DiagnosticLevel,
    source: string,
    message: string,
): string {
    const clean = message.replace(/\r\n|\r|\n/g, ' ').slice(0, DIAGNOSTIC_LINE_MAX);
    const src = source.replace(/[\t\r\n]/g, ' ').slice(0, 40) || 'app';
    return `${isoTime}\t${level}\t${src}\t${clean}\n`;
}

export function shouldRotateLog(sizeBytes: number, maxBytes = DIAGNOSTIC_ROTATE_BYTES): boolean {
    return sizeBytes > maxBytes;
}

export function parseRendererLogPayload(payload: unknown): { level: DiagnosticLevel; message: string } | null {
    if (!payload || typeof payload !== 'object') return null;
    const rec = payload as { level?: unknown; message?: unknown };
    if (!isDiagnosticLevel(rec.level)) return null;
    if (typeof rec.message !== 'string') return null;
    const message = rec.message.trim();
    if (!message) return null;
    return { level: rec.level, message: message.slice(0, DIAGNOSTIC_LINE_MAX) };
}

export interface LogBudget {
    windowStartMs: number;
    accepted: number;
    dropped: number;
}

/** Caps how many lines hit disk during a runaway loop. */
export function takeLogBudget(budget: LogBudget, nowMs: number, maxPerWindow = 40, windowMs = 1000): boolean {
    if (nowMs - budget.windowStartMs >= windowMs) {
        budget.windowStartMs = nowMs;
        budget.accepted = 0;
        budget.dropped = 0;
    }
    if (budget.accepted >= maxPerWindow) {
        budget.dropped += 1;
        return false;
    }
    budget.accepted += 1;
    return true;
}
