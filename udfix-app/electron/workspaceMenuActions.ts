import { BrowserWindow, dialog, type MenuItemConstructorOptions, type OpenDialogOptions } from 'electron';
import path from 'path';
import {
    loadAppPreferences,
    MAX_WORKSPACE_RECENTS,
    patchAppPreferences,
    pushWorkspaceRecent,
    type AppPreferences,
} from './appPreferences';
import { MENU_CHANNEL, type AppMenuAction } from './applicationMenuTypes';
import { handleAppPreferencesTelemetryChange } from './telemetryService';

let onWorkspaceMenusChanged: (() => void) | null = null;

export function setWorkspaceMenusChangedHandler(handler: () => void): void {
    onWorkspaceMenusChanged = handler;
}

function notifyWorkspaceMenusChanged(): void {
    onWorkspaceMenusChanged?.();
}

function normalizeAbsolutePath(rawPath: string): string {
    if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
        throw new Error('Invalid path');
    }
    const normalized = path.resolve(rawPath);
    if (!path.isAbsolute(normalized)) {
        throw new Error('Only absolute paths are allowed');
    }
    return normalized;
}

export function truncatePathLabel(folderPath: string, max = 48): string {
    if (folderPath.length <= max) return folderPath;
    const name = path.basename(folderPath);
    if (name.length >= max - 3) return `…${name.slice(-(max - 3))}`;
    return `…${folderPath.slice(-(max - 3))}`;
}

export function broadcastToRenderers(payload: AppMenuAction): void {
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
            win.webContents.send(MENU_CHANNEL, payload);
        }
    }
}

export function applyPreferencePatch(patch: Partial<AppPreferences>): AppPreferences {
    const previous = loadAppPreferences();
    const preferences = patchAppPreferences(patch);
    handleAppPreferencesTelemetryChange(previous, preferences);
    return preferences;
}

async function pickWorkspaceDirectory(): Promise<string | null> {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
    const options: OpenDialogOptions = {
        title: 'Çalışma Klasörü Seç',
        properties: ['openDirectory', 'createDirectory'],
    };
    const res = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
    if (res.canceled || res.filePaths.length === 0) return null;
    return normalizeAbsolutePath(res.filePaths[0]);
}

export async function handleOpenWorkspacePicker(): Promise<void> {
    const picked = await pickWorkspaceDirectory();
    if (!picked) return;
    pushWorkspaceRecent(picked);
    const preferences = loadAppPreferences();
    notifyWorkspaceMenusChanged();
    broadcastToRenderers({ type: 'show-file-explorer' });
    broadcastToRenderers({ type: 'preferences-changed', preferences });
}

/** Finder UDF open: update recents only — do not change workspace root or open explorer. */
export function noteUdfFolderForRecents(folderPath: string): void {
    try {
        const normalized = normalizeAbsolutePath(folderPath);
        const prefs = loadAppPreferences();
        const recents = [normalized, ...prefs.workspaceRecents.filter((p) => p !== normalized)].slice(
            0,
            MAX_WORKSPACE_RECENTS,
        );
        patchAppPreferences({ workspaceRecents: recents });
        notifyWorkspaceMenusChanged();
    } catch {
        /* ignore invalid paths */
    }
}

export function handleOpenWorkspaceRecent(folderPath: string): void {
    try {
        const normalized = normalizeAbsolutePath(folderPath);
        pushWorkspaceRecent(normalized);
        const preferences = loadAppPreferences();
        notifyWorkspaceMenusChanged();
        broadcastToRenderers({ type: 'open-workspace-recent', path: normalized });
        broadcastToRenderers({ type: 'preferences-changed', preferences });
    } catch {
        dialog.showErrorBox('UDFIX', 'Geçersiz klasör yolu.');
    }
}

export function noteWorkspaceFolderUsed(folderPath: string): void {
    try {
        const normalized = normalizeAbsolutePath(folderPath);
        pushWorkspaceRecent(normalized);
        notifyWorkspaceMenusChanged();
    } catch {
        /* ignore invalid paths */
    }
}

export function buildWorkspaceRecentSubmenu(): MenuItemConstructorOptions[] {
    const prefs = loadAppPreferences();
    if (prefs.workspaceRecents.length === 0) {
        return [{ label: 'Henüz klasör yok', enabled: false }];
    }
    return prefs.workspaceRecents.map((folderPath) => ({
        label: truncatePathLabel(folderPath),
        toolTip: folderPath,
        click: () => handleOpenWorkspaceRecent(folderPath),
    }));
}
