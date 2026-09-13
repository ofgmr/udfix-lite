import type { BrowserWindow } from 'electron';
import { isRendererDevelopmentHost } from './rendererSecurity';

/** Dev unpackaged build: open DevTools unless explicitly disabled. */
export function shouldOpenDevToolsOnStartup(): boolean {
    const raw = process.env.UDFIX_OPEN_DEVTOOLS;
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
    return isRendererDevelopmentHost();
}

export function toggleDevToolsForWindow(win: BrowserWindow | null | undefined): void {
    if (!win || win.isDestroyed()) return;
    const wc = win.webContents;
    if (wc.isDevToolsOpened()) {
        wc.closeDevTools();
    } else {
        wc.openDevTools();
    }
}

export function openDevToolsForWindow(win: BrowserWindow | null | undefined): void {
    if (!win || win.isDestroyed()) return;
    if (win.webContents.isDevToolsOpened()) return;
    try {
        // Docked panel is easier to spot than a detached window behind the app (common on macOS).
        win.webContents.openDevTools({ mode: 'right', activate: true });
        console.log('[dev] DevTools opened (mode: right)');
    } catch (err) {
        console.warn('[dev] DevTools open failed:', err);
    }
}

/** Call from createWindow: open early + after load so DevTools is never missed. */
export function attachAutoOpenDevTools(win: BrowserWindow): void {
    if (!shouldOpenDevToolsOnStartup()) return;

    const open = () => openDevToolsForWindow(win);

    win.webContents.on('dom-ready', open);
    win.webContents.on('did-finish-load', open);
    win.once('ready-to-show', () => {
        setTimeout(open, 250);
    });
}
