import { app, BrowserWindow } from 'electron';
import { rebuildMacDockMenu } from './macDockMenu';
import { rebuildMacMenuBarTray } from './macMenuBarTray';
import { maybeShowFirstLaunchUdfPrompt } from './macUdfDefaultHandler';
import { resolveMacActivateAction } from './macActivatePolicy';

type CreateMainWindowFn = () => BrowserWindow;
type GetMainWindowFn = () => BrowserWindow | null;

let createMainWindow: CreateMainWindowFn | null = null;
let getMainWindow: GetMainWindowFn | null = null;

export function initMacAppLifecycle(deps: {
    createMainWindow: CreateMainWindowFn;
    getMainWindow: GetMainWindowFn;
}): void {
    createMainWindow = deps.createMainWindow;
    getMainWindow = deps.getMainWindow;

    if (process.platform !== 'darwin') return;

    app.on('activate', () => {
        const win = getMainWindow?.();
        const action = resolveMacActivateAction({
            hasMainWindow: Boolean(win),
            isDestroyed: !win || win.isDestroyed(),
            isMinimized: Boolean(win && !win.isDestroyed() && win.isMinimized()),
        });

        if (action === 'create') {
            const created = createMainWindow?.();
            created?.show();
            return;
        }

        if (!win || win.isDestroyed()) return;

        if (action === 'restore-and-focus') {
            win.restore();
        }
        win.show();
        win.focus();
    });
}

export async function setupMacPlatformMenus(): Promise<void> {
    if (process.platform !== 'darwin') return;
    rebuildMacDockMenu();
    await rebuildMacMenuBarTray();
}

export async function refreshMacPlatformMenus(): Promise<void> {
    await setupMacPlatformMenus();
}

export function scheduleFirstLaunchUdfPrompt(mainWindow: BrowserWindow): void {
    if (process.platform !== 'darwin') return;
    mainWindow.webContents.once('did-finish-load', () => {
        void maybeShowFirstLaunchUdfPrompt(mainWindow);
    });
}
