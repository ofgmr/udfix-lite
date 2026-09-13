import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import {
    isUpdateEnabled,
    resolveUpdateFeed,
    UPDATE_CHECK_DELAY_MS,
    UPDATE_CHECK_INTERVAL_MS,
} from './updateConfig';
import { UPDATE_EVENT_CHANNEL, type AppUpdateSnapshot } from './updateTypes';

let snapshot: AppUpdateSnapshot = {
    phase: 'idle',
    currentVersion: app.getVersion(),
};

let periodicCheckTimer: ReturnType<typeof setInterval> | null = null;
let delayedCheckTimer: ReturnType<typeof setTimeout> | null = null;
let manualCheckPending = false;
let listenersBound = false;
let updateUserDataPath = '';

function normalizeReleaseNotes(raw: unknown): string | undefined {
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (Array.isArray(raw)) {
        const joined = raw
            .map((entry) => {
                if (typeof entry === 'string') return entry;
                if (entry && typeof entry === 'object' && 'note' in entry) {
                    const note = (entry as { note?: unknown }).note;
                    return typeof note === 'string' ? note : '';
                }
                return '';
            })
            .filter(Boolean)
            .join('\n\n');
        return joined.trim() || undefined;
    }
    return undefined;
}

function broadcastSnapshot(): void {
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
            win.webContents.send(UPDATE_EVENT_CHANNEL, snapshot);
        }
    }
}

function setSnapshot(partial: Partial<AppUpdateSnapshot>): void {
    snapshot = {
        ...snapshot,
        ...partial,
        currentVersion: app.getVersion(),
        checkedAt: new Date().toISOString(),
    };
    broadcastSnapshot();
}

export function applyAccountUpdateFeed(userDataPath = updateUserDataPath): void {
    if (userDataPath) updateUserDataPath = userDataPath;
    const feed = resolveUpdateFeed(updateUserDataPath || undefined);
    autoUpdater.requestHeaders = feed.requestHeaders ?? {};
    autoUpdater.setFeedURL({ provider: 'generic', url: feed.url });
}

function bindAutoUpdaterListeners(): void {
    if (listenersBound) return;
    listenersBound = true;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;

    autoUpdater.on('checking-for-update', () => {
        setSnapshot({
            phase: 'checking',
            errorMessage: undefined,
            downloadPercent: undefined,
            triggeredByUser: manualCheckPending,
        });
    });

    autoUpdater.on('update-available', (info) => {
        setSnapshot({
            phase: 'available',
            availableVersion: info.version,
            releaseNotes: normalizeReleaseNotes(info.releaseNotes),
            releaseName: info.releaseName ?? undefined,
            errorMessage: undefined,
            triggeredByUser: manualCheckPending,
        });
        manualCheckPending = false;
    });

    autoUpdater.on('update-not-available', () => {
        setSnapshot({
            phase: 'not-available',
            availableVersion: undefined,
            releaseNotes: undefined,
            releaseName: undefined,
            errorMessage: undefined,
            downloadPercent: undefined,
            triggeredByUser: manualCheckPending,
        });
        manualCheckPending = false;
    });

    autoUpdater.on('download-progress', (progress) => {
        setSnapshot({
            phase: 'downloading',
            downloadPercent: progress.percent,
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        setSnapshot({
            phase: 'downloaded',
            availableVersion: info.version,
            downloadPercent: 100,
            errorMessage: undefined,
        });
    });

    autoUpdater.on('error', (err) => {
        setSnapshot({
            phase: 'error',
            errorMessage: err.message,
            triggeredByUser: manualCheckPending,
        });
        manualCheckPending = false;
    });
}

function configureAutoUpdater(): void {
    bindAutoUpdaterListeners();
    applyAccountUpdateFeed(updateUserDataPath);
}

export function getUpdateSnapshot(): AppUpdateSnapshot {
    return snapshot;
}

export async function checkForAppUpdates(options?: { manual?: boolean }): Promise<AppUpdateSnapshot> {
    if (!isUpdateEnabled()) {
        setSnapshot({ phase: 'disabled' });
        return snapshot;
    }

    configureAutoUpdater();
    manualCheckPending = Boolean(options?.manual);

    try {
        await autoUpdater.checkForUpdates();
    } catch (err) {
        setSnapshot({
            phase: 'error',
            errorMessage: err instanceof Error ? err.message : String(err),
            triggeredByUser: manualCheckPending,
        });
        manualCheckPending = false;
    }

    return snapshot;
}

export function triggerManualUpdateCheck(): void {
    void checkForAppUpdates({ manual: true });
}

export async function downloadAppUpdate(): Promise<AppUpdateSnapshot> {
    if (!isUpdateEnabled()) {
        setSnapshot({ phase: 'disabled' });
        return snapshot;
    }
    configureAutoUpdater();
    try {
        await autoUpdater.downloadUpdate();
    } catch (err) {
        setSnapshot({
            phase: 'error',
            errorMessage: err instanceof Error ? err.message : String(err),
        });
    }
    return snapshot;
}

export function installAppUpdate(): void {
    if (!isUpdateEnabled()) return;
    autoUpdater.quitAndInstall(false, true);
}

export function initUpdateService(userDataPath: string): void {
    updateUserDataPath = userDataPath;
    if (!isUpdateEnabled()) {
        setSnapshot({ phase: 'disabled' });
        return;
    }

    configureAutoUpdater();
    setSnapshot({ phase: 'idle' });

    delayedCheckTimer = setTimeout(() => {
        void checkForAppUpdates();
    }, UPDATE_CHECK_DELAY_MS);

    periodicCheckTimer = setInterval(() => {
        if (snapshot.phase === 'downloading' || snapshot.phase === 'downloaded') return;
        void checkForAppUpdates();
    }, UPDATE_CHECK_INTERVAL_MS);
}

export function registerUpdateHandlers(): void {
    ipcMain.handle('app-update-get-state', () => getUpdateSnapshot());

    ipcMain.handle('app-update-check', (_, options?: { manual?: boolean }) =>
        checkForAppUpdates(options),
    );

    ipcMain.handle('app-update-download', () => downloadAppUpdate());

    ipcMain.handle('app-update-install', () => {
        installAppUpdate();
        return { ok: true as const };
    });
}

export function disposeUpdateService(): void {
    if (delayedCheckTimer) {
        clearTimeout(delayedCheckTimer);
        delayedCheckTimer = null;
    }
    if (periodicCheckTimer) {
        clearInterval(periodicCheckTimer);
        periodicCheckTimer = null;
    }
}
