import { app, BrowserWindow } from 'electron';
import path from 'path';
import { MENU_CHANNEL, type AppMenuAction } from './applicationMenuTypes';
import { noteUdfFolderForRecents } from './workspaceMenuActions';
import {
    collectUdfPathsFromArgv,
    isUdfFilePath,
    normalizeOpenPath,
} from './macOpenFilePaths';

type CreateMainWindowFn = () => BrowserWindow;
type GetMainWindowFn = () => BrowserWindow | null;

const pendingUdfFiles: string[] = [];
let createMainWindow: CreateMainWindowFn | null = null;
let getMainWindow: GetMainWindowFn | null = null;

function broadcastOpenUdfFile(filePath: string): void {
    const normalized = normalizeOpenPath(filePath);
    if (!normalized || !isUdfFilePath(normalized)) return;

    noteUdfFolderForRecents(path.dirname(normalized));

    const payload: AppMenuAction = {
        type: 'open-udf-file',
        path: normalized,
        name: path.basename(normalized),
    };

    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
            win.webContents.send(MENU_CHANNEL, payload);
        }
    }
}

function deliverToMainWindow(filePath: string): void {
    if (!getMainWindow || !createMainWindow) return;

    let win = getMainWindow();
    if (!win || win.isDestroyed()) {
        win = createMainWindow();
    }

    const send = () => broadcastOpenUdfFile(filePath);
    if (win.webContents.isLoading()) {
        win.webContents.once('did-finish-load', send);
    } else {
        send();
    }

    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
}

function queueOrOpenUdfFile(filePath: string): void {
    const normalized = normalizeOpenPath(filePath);
    if (!normalized || !isUdfFilePath(normalized)) return;

    if (!app.isReady()) {
        if (!pendingUdfFiles.includes(normalized)) pendingUdfFiles.push(normalized);
        return;
    }

    deliverToMainWindow(normalized);
}

export function registerMacOpenFileHandlers(): void {
    if (process.platform !== 'darwin') return;

    app.on('open-file', (event, filePath) => {
        event.preventDefault();
        queueOrOpenUdfFile(filePath);
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
    for (const filePath of collectUdfPathsFromArgv(argv)) {
        queueOrOpenUdfFile(filePath);
    }

    const queued = pendingUdfFiles.splice(0, pendingUdfFiles.length);
    for (const filePath of queued) {
        deliverToMainWindow(filePath);
    }
}
