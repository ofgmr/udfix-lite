/**
 * Remote telemetry ingest URL (main process only).
 *
 * Source (first match wins):
 *   - `UDFIX_TELEMETRY_ENDPOINT`
 *   - `NOMAI_TELEMETRY_ENDPOINT`
 *
 * When unset or empty, events are still collected (if opted in) and stored in
 * `userData/telemetry-queue.json`; upload is skipped until an endpoint is configured.
 * Set the env var when launching Electron (dev script, packaged app, or CI) once
 * the HTTPS ingest backend is deployed.
 */
export function getTelemetryEndpoint(): string | null {
    const raw = process.env.UDFIX_TELEMETRY_ENDPOINT ?? process.env.NOMAI_TELEMETRY_ENDPOINT;
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
        const url = new URL(trimmed);
        if (url.protocol !== 'https:') return null;
        return trimmed;
    } catch {
        return null;
    }
}

export const TELEMETRY_SCHEMA_VERSION = 1 as const;
export const TELEMETRY_MAX_QUEUE_EVENTS = 2000;
export const TELEMETRY_UPLOAD_INTERVAL_MS = 5 * 60 * 1000;
export const TELEMETRY_MAX_PROPERTY_STRING_LENGTH = 512;
export const TELEMETRY_ALLOWED_CATEGORIES = ['lifecycle', 'feature', 'error', 'crash', 'performance'] as const;
export const TELEMETRY_ALLOWED_PROPERTY_KEYS = new Set([
    'packaged',
    'message',
    'stack',
    'reason',
    'exitCode',
    'errorCode',
    'errorDescription',
    'urlScheme',
    'shortcutId',
    'panelId',
    'format',
    'durationMs',
    'action',
]);
