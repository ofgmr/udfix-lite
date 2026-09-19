import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { isAllowedInvokeChannel, isAllowedListenChannel } from './ipcChannelAllowlist';
import { isAllowedIpcSenderUrl } from './ipcSenderUrl';

export { isAllowedInvokeChannel, isAllowedListenChannel, isAllowedIpcSenderUrl };

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
