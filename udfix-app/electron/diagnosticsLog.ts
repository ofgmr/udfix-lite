import { app, BrowserWindow, dialog, ipcMain, shell, type WebContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
    formatDiagnosticLine,
    parseRendererLogPayload,
    shouldRotateLog,
    takeLogBudget,
    type DiagnosticLevel,
    type LogBudget,
} from './diagnosticsLogFormat';

const HEARTBEAT_GAP_MS = 2500;

let logFilePath = '';
let installed = false;
const budget: LogBudget = { windowStartMs: 0, accepted: 0, dropped: 0 };
const lastHeartbeat = new Map<number, number>();
const hookedContents = new WeakSet<WebContents>();

export function diagnosticsLogFilePath(): string {
    return logFilePath;
}

export function appendDiagnostic(level: DiagnosticLevel, source: string, message: string): void {
    if (!logFilePath) return;
    const now = Date.now();
    if (!takeLogBudget(budget, now)) {
        if (budget.dropped === 1) {
            const note = formatDiagnosticLine(new Date(now).toISOString(), 'warn', 'main', 'diagnostic log rate-limited');
            try {
                fs.appendFileSync(logFilePath, note);
            } catch {
                /* disk full or path gone — never throw into the caller */
            }
        }
        return;
    }
    const line = formatDiagnosticLine(new Date(now).toISOString(), level, source, message);
    try {
        fs.appendFileSync(logFilePath, line);
    } catch {
        /* ignore */
    }
}

function rotateIfNeeded(filePath: string): void {
    let size = 0;
    try {
        size = fs.statSync(filePath).size;
    } catch {
        return;
    }
    if (!shouldRotateLog(size)) return;
    const backup = `${filePath}.1`;
    try {
        fs.rmSync(backup, { force: true });
        fs.renameSync(filePath, backup);
    } catch {
        /* keep writing the current file */
    }
}

function noteHeartbeat(webContentsId: number): void {
    const now = Date.now();
    const prev = lastHeartbeat.get(webContentsId);
    lastHeartbeat.set(webContentsId, now);
    if (prev != null && now - prev >= HEARTBEAT_GAP_MS) {
        appendDiagnostic(
            'error',
            'main',
            `renderer heartbeat gap ${now - prev}ms webContents=${webContentsId}`,
        );
    }
}

export function attachDiagnosticsToWindow(win: BrowserWindow): void {
    if (win.isDestroyed()) return;
    const wc = win.webContents;
    if (hookedContents.has(wc)) return;
    hookedContents.add(wc);
    const id = wc.id;
    wc.on('unresponsive', () => {
        appendDiagnostic('error', 'main', `renderer unresponsive webContents=${id}`);
    });
    wc.on('responsive', () => {
        appendDiagnostic('warn', 'main', `renderer responsive again webContents=${id}`);
    });
    wc.on('render-process-gone', (_event, details) => {
        appendDiagnostic(
            'error',
            'main',
            `render-process-gone reason=${details.reason} exit=${details.exitCode} webContents=${id}`,
        );
    });
    wc.on('destroyed', () => {
        lastHeartbeat.delete(id);
    });
}

export function revealDiagnosticsLog(): string {
    if (!logFilePath) return '';
    shell.showItemInFolder(logFilePath);
    return logFilePath;
}

export async function exportDiagnosticsLog(parent?: BrowserWindow | null): Promise<string | null> {
    if (!logFilePath) return null;
    const focused = parent && !parent.isDestroyed() ? parent : BrowserWindow.getFocusedWindow();
    const options = {
        title: 'UDFIX günlüğünü dışa aktar',
        defaultPath: 'udfix.log',
        filters: [{ name: 'Log', extensions: ['log', 'txt'] }],
    };
    const result = focused ? await dialog.showSaveDialog(focused, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    fs.copyFileSync(logFilePath, result.filePath);
    appendDiagnostic('info', 'main', `log exported to ${result.filePath}`);
    return result.filePath;
}

function hookConsole(): void {
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    let inside = false;
    console.error = (...args: unknown[]) => {
        origError(...args);
        if (inside) return;
        inside = true;
        appendDiagnostic('error', 'main', args.map(formatUnknown).join(' '));
        inside = false;
    };
    console.warn = (...args: unknown[]) => {
        origWarn(...args);
        if (inside) return;
        inside = true;
        appendDiagnostic('warn', 'main', args.map(formatUnknown).join(' '));
        inside = false;
    };
}

function formatUnknown(value: unknown): string {
    if (value instanceof Error) return value.stack || value.message;
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

export function registerDiagnosticsIpc(): void {
    ipcMain.handle('diagnostics-log', (_event, payload: unknown) => {
        const parsed = parseRendererLogPayload(payload);
        if (!parsed) return false;
        appendDiagnostic(parsed.level, 'renderer', parsed.message);
        return true;
    });
    ipcMain.handle('diagnostics-heartbeat', (event) => {
        noteHeartbeat(event.sender.id);
        return true;
    });
    ipcMain.handle('diagnostics-reveal-log', () => revealDiagnosticsLog());
    ipcMain.handle('diagnostics-export-log', () => exportDiagnosticsLog());
}

/** Call once after `app` is ready. Safe to call again. */
export function initDiagnosticsLog(): void {
    if (installed) return;
    installed = true;
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    logFilePath = path.join(dir, 'udfix.log');
    rotateIfNeeded(logFilePath);
    hookConsole();
    process.on('uncaughtException', (err) => {
        appendDiagnostic('error', 'main', `uncaughtException ${err.stack || err.message}`);
    });
    process.on('unhandledRejection', (reason) => {
        const text = reason instanceof Error ? reason.stack || reason.message : String(reason);
        appendDiagnostic('error', 'main', `unhandledRejection ${text}`);
    });
    app.on('browser-window-created', (_event, win) => {
        attachDiagnosticsToWindow(win);
    });
    for (const win of BrowserWindow.getAllWindows()) attachDiagnosticsToWindow(win);
    registerDiagnosticsIpc();
    appendDiagnostic(
        'info',
        'main',
        `diagnostics log opened packaged=${app.isPackaged} version=${app.getVersion()}`,
    );
}
