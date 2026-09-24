import { contextBridge, ipcRenderer, webUtils } from 'electron';

/**
 * Sandboxed preload can `require('electron')` only — not `./ipcAllowlist`.
 * Keep these checks identical to `ipcChannelAllowlist.ts`.
 */
function isAllowedInvokeChannel(channel: string): boolean {
    if (typeof channel !== 'string' || channel.length === 0) return false;
    const exact = new Set([
        'app-preferences-get',
        'app-preferences-patch',
        'app-entitlements-get',
        'app-account-get',
        'app-account-sign-out',
        'app-account-activate-katir',
        'app-open-external-url',
        'app-update-get-state',
        'app-update-check',
        'app-update-download',
        'app-update-install',
        'telemetry-track',
        'telemetry-flush',
        'convert-html-to-pdf',
        'convert-html-to-pdf-with-overlay',
        'export-docx',
        'export-pdf-from-html',
        'export-pdf-with-overlay',
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
    if (exact.has(channel)) return true;
    // `db-` covers library + per-document HF: db-get/set-header-footer-library, db-get/set-document-hf.
    return channel.startsWith('db-') || channel.startsWith('fs-');
}

function isAllowedListenChannel(channel: string): boolean {
    return (
        typeof channel === 'string' &&
        (channel === 'app-menu-action' ||
            channel === 'app-update-event' ||
            channel === 'app-entitlements-changed' ||
            channel === 'fs-watch-event')
    );
}

const listenerWrappers = new Map<string, Map<(...args: unknown[]) => void, (_event: unknown, ...args: unknown[]) => void>>();

function assertInvokeChannel(channel: string): void {
    if (!isAllowedInvokeChannel(channel)) {
        throw new Error(`IPC invoke channel not allowed: ${channel}`);
    }
}

function assertListenChannel(channel: string): void {
    if (!isAllowedListenChannel(channel)) {
        throw new Error(`IPC listen channel not allowed: ${channel}`);
    }
}

contextBridge.exposeInMainWorld('electron', {
    /** Absolute path for a renderer `File` from drag-and-drop (replaces deprecated `File.path`). */
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
    invoke: (channel: string, ...args: unknown[]) => {
        assertInvokeChannel(channel);
        return ipcRenderer.invoke(channel, ...args);
    },
    send: (channel: string, ...args: unknown[]) => {
        assertListenChannel(channel);
        ipcRenderer.send(channel, ...args);
    },
    on: (channel: string, listener: (...args: unknown[]) => void) => {
        assertListenChannel(channel);
        const wrapped = (_event: unknown, ...payload: unknown[]) => listener(...payload);
        let channelMap = listenerWrappers.get(channel);
        if (!channelMap) {
            channelMap = new Map();
            listenerWrappers.set(channel, channelMap);
        }
        channelMap.set(listener, wrapped);
        ipcRenderer.on(channel, wrapped);
    },
    off: (channel: string, listener: (...args: unknown[]) => void) => {
        const channelMap = listenerWrappers.get(channel);
        const wrapped = channelMap?.get(listener);
        if (wrapped) {
            ipcRenderer.removeListener(channel, wrapped);
            channelMap?.delete(listener);
        }
    },
});
