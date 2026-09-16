import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { isAllowedIpcSenderUrl } from './ipcSenderUrl';

export { isAllowedIpcSenderUrl };

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

type IpcHandleFn = typeof ipcMain.handle;

let ipcSecurityGuardInstalled = false;
let originalIpcHandle: IpcHandleFn | null = null;

function readIpcSenderUrl(event: IpcMainInvokeEvent): string {
    const frameUrl = event.senderFrame?.url;
    if (typeof frameUrl === 'string' && frameUrl.length > 0) return frameUrl;
    try {
        return event.sender.getURL() || '';
    } catch {
        return '';
    }
}

/** Wraps `ipcMain.handle` so every invoke is checked (channel allowlist + sender URL). */
export function installIpcSecurityGuard(): void {
    if (ipcSecurityGuardInstalled) return;
    if (typeof ipcMain?.handle !== 'function') return;
    ipcSecurityGuardInstalled = true;
    originalIpcHandle = ipcMain.handle.bind(ipcMain);
    ipcMain.handle = ((channel: string, listener: Parameters<IpcHandleFn>[1]) => {
        originalIpcHandle!(channel, async (event, ...args) => {
            if (!isAllowedInvokeChannel(channel)) {
                throw new Error('IPC channel not allowed');
            }
            if (!isAllowedIpcSenderUrl(readIpcSenderUrl(event))) {
                throw new Error('IPC sender not allowed');
            }
            return listener(event, ...args);
        });
    }) as IpcHandleFn;
}

// Runs at import (main.ts loads database.ts before whenReady) so db-* handlers are wrapped.
installIpcSecurityGuard();

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
