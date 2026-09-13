import { app, ipcMain, type BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { loadAppPreferences, type AppPreferences } from './appPreferences';
import type { TelemetryConsent, TelemetryEvent, TelemetryTrackInput } from './telemetryTypes';
import {
    getTelemetryEndpoint,
    TELEMETRY_MAX_PROPERTY_STRING_LENGTH,
    TELEMETRY_MAX_QUEUE_EVENTS,
    TELEMETRY_SCHEMA_VERSION,
    TELEMETRY_UPLOAD_INTERVAL_MS,
} from './telemetryConfig';

const STATE_FILENAME = 'telemetry-state.json';
const QUEUE_FILENAME = 'telemetry-queue.json';

interface TelemetryState {
    installId: string;
    sessionId: string;
}

interface TelemetryQueueFile {
    events: TelemetryEvent[];
}

let state: TelemetryState | null = null;
let uploadTimer: ReturnType<typeof setInterval> | null = null;
let flushInFlight: Promise<void> | null = null;

function statePath(): string {
    return path.join(app.getPath('userData'), STATE_FILENAME);
}

function queuePath(): string {
    return path.join(app.getPath('userData'), QUEUE_FILENAME);
}

function readJsonFile<T>(filePath: string, fallback: T): T {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function writeJsonFile(filePath: string, data: unknown): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function loadState(): TelemetryState {
    const existing = readJsonFile<Partial<TelemetryState>>(statePath(), {});
    const installId =
        typeof existing.installId === 'string' && existing.installId.length > 0
            ? existing.installId
            : crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const next = { installId, sessionId };
    writeJsonFile(statePath(), next);
    return next;
}

function loadQueue(): TelemetryEvent[] {
    const file = readJsonFile<TelemetryQueueFile>(queuePath(), { events: [] });
    return Array.isArray(file.events) ? file.events : [];
}

function saveQueue(events: TelemetryEvent[]): void {
    writeJsonFile(queuePath(), { events });
}

function isCollecting(): boolean {
    return loadAppPreferences().telemetryConsent === 'opted_in';
}

function redactPaths(value: string): string {
    const home = os.homedir();
    let out = value;
    if (home && out.includes(home)) {
        out = out.split(home).join('~');
    }
    return out.replace(/\/Users\/[^/\s]+/g, '~').replace(/\\Users\\[^\\]+/g, '~');
}

function sanitizeProperties(
    raw: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | null> | undefined {
    if (!raw || typeof raw !== 'object') return undefined;

    const blockedKey = /(path|file|content|title|name|email|password|token|secret|matter|client|note|party)/i;
    const out: Record<string, string | number | boolean | null> = {};

    for (const [key, value] of Object.entries(raw)) {
        if (blockedKey.test(key)) continue;
        if (value === null) {
            out[key] = null;
            continue;
        }
        if (typeof value === 'boolean' || typeof value === 'number') {
            if (Number.isFinite(value as number)) out[key] = value as number | boolean;
            continue;
        }
        if (typeof value === 'string') {
            const trimmed = redactPaths(value).slice(0, TELEMETRY_MAX_PROPERTY_STRING_LENGTH);
            out[key] = trimmed;
        }
    }

    return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeErrorMessage(raw: unknown): string {
    const message =
        raw instanceof Error
            ? raw.message
            : typeof raw === 'string'
              ? raw
              : JSON.stringify(raw);
    return redactPaths(message).slice(0, TELEMETRY_MAX_PROPERTY_STRING_LENGTH);
}

export function enqueueTelemetryEvent(input: TelemetryTrackInput): void {
    if (!isCollecting()) return;

    const event: TelemetryEvent = {
        id: crypto.randomUUID(),
        ts: Date.now(),
        category: input.category,
        name: input.name,
        properties: sanitizeProperties(input.properties),
    };

    const queue = loadQueue();
    queue.push(event);
    const trimmed =
        queue.length > TELEMETRY_MAX_QUEUE_EVENTS
            ? queue.slice(queue.length - TELEMETRY_MAX_QUEUE_EVENTS)
            : queue;
    saveQueue(trimmed);
}

function buildBatch(events: TelemetryEvent[]) {
    const s = state ?? loadState();
    return {
        schemaVersion: TELEMETRY_SCHEMA_VERSION,
        sessionId: s.sessionId,
        installId: s.installId,
        appVersion: app.getVersion(),
        platform: process.platform,
        osRelease: os.release(),
        locale: app.getLocale(),
        sentAt: Date.now(),
        events,
    };
}

async function uploadQueuedEvents(): Promise<void> {
    if (!isCollecting()) return;

    const endpoint = getTelemetryEndpoint();
    // No remote backend configured — keep queue on disk for a later flush.
    if (!endpoint) return;

    const queue = loadQueue();
    if (queue.length === 0) return;

    const batch = buildBatch(queue);
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
    });

    if (!response.ok) {
        throw new Error(`Telemetry upload failed: HTTP ${response.status}`);
    }

    saveQueue([]);
}

export async function flushTelemetryQueue(): Promise<void> {
    if (flushInFlight) {
        await flushInFlight;
        return;
    }
    flushInFlight = uploadQueuedEvents().finally(() => {
        flushInFlight = null;
    });
    await flushInFlight;
}

export function purgeTelemetryQueue(): void {
    saveQueue([]);
}

export function onTelemetryConsentChanged(consent: TelemetryConsent): void {
    if (consent === 'opted_out') {
        purgeTelemetryQueue();
        stopTelemetryUploadTimer();
        return;
    }
    if (consent === 'opted_in') {
        startTelemetryUploadTimer();
        enqueueTelemetryEvent({
            category: 'lifecycle',
            name: 'telemetry_opt_in',
        });
        void flushTelemetryQueue();
    }
}

export function handleAppPreferencesTelemetryChange(
    previous: AppPreferences,
    next: AppPreferences,
): void {
    if (previous.telemetryConsent === next.telemetryConsent) return;
    onTelemetryConsentChanged(next.telemetryConsent);
}

function startTelemetryUploadTimer(): void {
    if (uploadTimer) return;
    uploadTimer = setInterval(() => {
        void flushTelemetryQueue().catch((err) => {
            console.warn('[telemetry] periodic upload failed:', err);
        });
    }, TELEMETRY_UPLOAD_INTERVAL_MS);
}

function stopTelemetryUploadTimer(): void {
    if (!uploadTimer) return;
    clearInterval(uploadTimer);
    uploadTimer = null;
}

export function initTelemetryService(): void {
    state = loadState();

    if (isCollecting()) {
        enqueueTelemetryEvent({
            category: 'lifecycle',
            name: 'session_start',
            properties: { packaged: app.isPackaged },
        });
        startTelemetryUploadTimer();
    }

    process.on('uncaughtException', (error) => {
        console.error('[main] uncaughtException:', error);
        enqueueTelemetryEvent({
            category: 'crash',
            name: 'main_uncaught_exception',
            properties: { message: sanitizeErrorMessage(error), stack: redactPaths(error.stack ?? '').slice(0, 1024) },
        });
        void flushTelemetryQueue();
    });

    process.on('unhandledRejection', (reason) => {
        enqueueTelemetryEvent({
            category: 'error',
            name: 'main_unhandled_rejection',
            properties: { message: sanitizeErrorMessage(reason) },
        });
    });

    app.on('before-quit', () => {
        if (isCollecting()) {
            enqueueTelemetryEvent({ category: 'lifecycle', name: 'session_end' });
        }
        void flushTelemetryQueue();
        stopTelemetryUploadTimer();
    });
}

export function attachWindowTelemetryHandlers(win: BrowserWindow): void {
    const wc = win.webContents;

    wc.on('render-process-gone', (_event, details) => {
        enqueueTelemetryEvent({
            category: 'crash',
            name: 'renderer_process_gone',
            properties: {
                reason: details.reason,
                exitCode: details.exitCode,
            },
        });
        void flushTelemetryQueue();
    });

    wc.on('unresponsive', () => {
        enqueueTelemetryEvent({
            category: 'crash',
            name: 'renderer_unresponsive',
        });
    });

    wc.on('responsive', () => {
        enqueueTelemetryEvent({
            category: 'performance',
            name: 'renderer_responsive',
        });
    });

    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        enqueueTelemetryEvent({
            category: 'error',
            name: 'renderer_load_failed',
            properties: {
                errorCode,
                errorDescription: redactPaths(errorDescription),
                urlScheme: validatedURL.split(':')[0] ?? 'unknown',
            },
        });
    });
}

export function registerTelemetryHandlers(): void {
    ipcMain.handle('telemetry-track', (_event, input: TelemetryTrackInput) => {
        if (!input || typeof input !== 'object') return false;
        if (typeof input.name !== 'string' || typeof input.category !== 'string') return false;
        enqueueTelemetryEvent(input);
        return true;
    });

    ipcMain.handle('telemetry-flush', async () => {
        await flushTelemetryQueue();
        return true;
    });
}
