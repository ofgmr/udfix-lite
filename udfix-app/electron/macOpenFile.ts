import { app, BrowserWindow } from 'electron';
import path from 'path';
import { MENU_CHANNEL, type AppMenuAction } from './applicationMenuTypes';
import { assertUserFsPathAllowed } from './fsPathPolicy';
import { noteUdfFolderForRecents } from './workspaceMenuActions';
import {
    classifyMacOpenPath,
    collectOpenablePathsFromArgv,
    type MacOpenableKind,
    normalizeOpenPath,
} from './macOpenFilePaths';

type CreateMainWindowFn = () => BrowserWindow;
type GetMainWindowFn = () => BrowserWindow | null;

type PendingOpen = { kind: MacOpenableKind; path: string };

const pendingOpens: PendingOpen[] = [];
let createMainWindow: CreateMainWindowFn | null = null;
let getMainWindow: GetMainWindowFn | null = null;

function allowOpenPath(filePath: string): string | null {
    const normalized = normalizeOpenPath(filePath);
    if (!normalized) return null;
    try {
        return assertUserFsPathAllowed(normalized);
    } catch {
        return null;
    }
}

function broadcastOpenFile(kind: MacOpenableKind, filePath: string): void {
    let payload: AppMenuAction;
    switch (kind) {
        case 'udf':
            noteUdfFolderForRecents(path.dirname(filePath));
            payload = { type: 'open-udf-file', path: filePath, name: path.basename(filePath) };
            break;
        case 'viewer':
            payload = { type: 'open-viewer-file', path: filePath, name: path.basename(filePath) };
            break;
        default: {
            const _never: never = kind;
            return _never;
        }
    }

    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
            win.webContents.send(MENU_CHANNEL, payload);
        }
    }
}

function deliverToMainWindow(kind: MacOpenableKind, filePath: string): void {
    if (!getMainWindow || !createMainWindow) return;

    let win = getMainWindow();
    if (!win || win.isDestroyed()) {
        win = createMainWindow();
    }

    const send = () => broadcastOpenFile(kind, filePath);
    if (win.webContents.isLoading()) {
        win.webContents.once('did-finish-load', send);
    } else {
        send();
    }

    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
}

function queueOrOpenFile(filePath: string): void {
    const allowed = allowOpenPath(filePath);
    if (!allowed) return;
    const kind = classifyMacOpenPath(allowed);
    if (!kind) return;

    if (!app.isReady()) {
        if (!pendingOpens.some((item) => item.path === allowed)) {
            pendingOpens.push({ kind, path: allowed });
        }
        return;
    }

    deliverToMainWindow(kind, allowed);
}

export function registerMacOpenFileHandlers(): void {
    if (process.platform !== 'darwin') return;

    app.on('open-file', (event, filePath) => {
        event.preventDefault();
        queueOrOpenFile(filePath);
    });
}

export function initMacOpenFileDelivery(deps: {
    createMainWindow: CreateMainWindowFn;
    getMainWindow: GetMainWindowFn;
}): void {
    createMainWindow = deps.createMainWindow;
    getMainWindow = deps.getMainWindow;
}

export function drainStartupUdfOpenRequests(argv: string[] = process.argv): void {
    for (const item of collectOpenablePathsFromArgv(argv)) {
        queueOrOpenFile(item.path);
    }

    const queued = pendingOpens.splice(0, pendingOpens.length);
    for (const item of queued) {
        deliverToMainWindow(item.kind, item.path);
    }
}
