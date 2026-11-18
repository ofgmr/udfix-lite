/**
 * Packaged-app diagnostics. The renderer is sandboxed, so lines go to the
 * main process over the diagnostics IPC channels and land in udfix.log.
 * A stalled event loop is reported when the timer fires late — that is the
 * moment after a pagination freeze, which is when a log line can be written.
 */

const LONG_TASK_MS = 200;
const STALL_MS = 2000;
const HEARTBEAT_MS = 1000;
const MAX_LINES_PER_WINDOW = 30;

interface Budget {
    windowStart: number;
    sent: number;
}

const budget: Budget = { windowStart: 0, sent: 0 };

function formatArg(value: unknown): string {
    if (value instanceof Error) return value.stack || value.message;
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

export function reportDiagnostic(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    const bridge = window.electron;
    if (!bridge?.invoke) return;
    const now = Date.now();
    if (now - budget.windowStart >= 10_000) {
        budget.windowStart = now;
        budget.sent = 0;
    }
    if (budget.sent >= MAX_LINES_PER_WINDOW) return;
    budget.sent += 1;
    void bridge.invoke('diagnostics-log', { level, message }).catch(() => {});
}

function installStallWatch(): void {
    let last = performance.now();
    window.setInterval(() => {
        const now = performance.now();
        const gap = now - last;
        last = now;
        if (gap >= STALL_MS) {
            reportDiagnostic('error', `renderer event loop stalled ${Math.round(gap)}ms`);
        }
        void window.electron?.invoke('diagnostics-heartbeat', { t: Date.now() }).catch(() => {});
    }, HEARTBEAT_MS);
}

function installLongTasks(): void {
    if (typeof PerformanceObserver === 'undefined') return;
    try {
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.duration >= LONG_TASK_MS) {
                    reportDiagnostic('warn', `long task ${Math.round(entry.duration)}ms name=${entry.name}`);
                }
            }
        });
        observer.observe({ entryTypes: ['longtask'] });
    } catch {
        /* longtask is not supported in every test DOM */
    }
}

function installConsoleCapture(): void {
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    let inside = false;
    console.error = (...args: unknown[]) => {
        origError(...args);
        if (inside) return;
        inside = true;
        reportDiagnostic('error', args.map(formatArg).join(' '));
        inside = false;
    };
    console.warn = (...args: unknown[]) => {
        origWarn(...args);
        if (inside) return;
        inside = true;
        reportDiagnostic('warn', args.map(formatArg).join(' '));
        inside = false;
    };
}

function installCrashHooks(): void {
    window.addEventListener('error', (event) => {
        const err = event.error;
        const text = err instanceof Error ? err.stack || err.message : event.message;
        reportDiagnostic('error', `window.error ${text}`);
    });
    window.addEventListener('unhandledrejection', (event) => {
        reportDiagnostic('error', `unhandledrejection ${formatArg(event.reason)}`);
    });
}

let installed = false;

export function installRendererDiagnostics(): void {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    installConsoleCapture();
    installCrashHooks();
    installLongTasks();
    installStallWatch();
    reportDiagnostic('info', 'renderer diagnostics installed');
}
