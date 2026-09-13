import { ipcMain } from 'electron';

/** IPC channels the renderer may invoke (local-first desktop; no arbitrary channel access). */

const INVOKE_EXACT = new Set([
    'app-preferences-get',
    'app-preferences-patch',
    'app-entitlements-get',
    'app-account-get',
    'app-account-activate-katir',
    'app-katir-upgrade-start',
    'app-open-external-url',
    'app-update-get-state',
    'app-update-check',
    'app-update-download',
    'app-update-install',
    'telemetry-track',
    'telemetry-flush',
    'convert-html-to-pdf',
    'export-docx',
    'export-pdf-from-html',
    'open-external-viewer',
    'focus-main-window',
    'parse-email',
    'save-attachment-temp',
    'uyap-sign-detached',
    'udf-parse-detached-signature',
    'uyap-bridge-status',
    'uyap-bridge-walk-start',
    'uyap-bridge-walk-stop',
    'uyap-bridge-schedule-set',
    'app-show-native-notification',
    'fs-file-url',
]);

const INVOKE_PREFIXES = ['db-', 'fs-'] as const;

const LISTEN_EXACT = new Set(['app-menu-action', 'app-update-event', 'app-entitlements-changed', 'fs-watch-event']);

export function isAllowedInvokeChannel(channel: string): boolean {
    if (typeof channel !== 'string' || channel.length === 0) return false;
    if (INVOKE_EXACT.has(channel)) return true;
    return INVOKE_PREFIXES.some((prefix) => channel.startsWith(prefix));
}

export function isAllowedListenChannel(channel: string): boolean {
    return typeof channel === 'string' && LISTEN_EXACT.has(channel);
}

export function registerIpcHandler(
    channel: string,
    listener: Parameters<typeof ipcMain.handle>[1],
): void {
    try {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, listener);
    } catch (err) {
        console.error(`[ipc] ${channel} kaydedilemedi:`, err);
    }
}
