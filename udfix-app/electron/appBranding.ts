import { app, BrowserWindow, nativeImage } from 'electron';
import fs from 'fs';
import path from 'path';

export const UDFIX_APP_NAME = 'UDFIX';

type BrandingManifest = {
    appIconPng: string;
    aboutLogoSvg: string;
};

let aboutWindow: BrowserWindow | null = null;
let licensesWindow: BrowserWindow | null = null;
let cachedAppIcon: Electron.NativeImage | undefined | null = null;
let cachedManifest: BrandingManifest | null = null;

function loadBrandingManifest(): BrandingManifest {
    if (cachedManifest) return cachedManifest;

    const manifestPath = path.join(__dirname, '..', 'branding.manifest.json');
    if (fs.existsSync(manifestPath)) {
        cachedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BrandingManifest;
        return cachedManifest;
    }

    cachedManifest = {
        appIconPng: 'udfix-app-icon.png',
        aboutLogoSvg: '10-l_logo.svg',
    };
    return cachedManifest;
}

/** Packaged: dist-electron/*.html; dev: fall back to electron/*.html (no copy step on startup). */
function resolveElectronAsset(...segments: string[]): string {
    const distPath = path.join(__dirname, ...segments);
    if (fs.existsSync(distPath)) return distPath;
    const srcPath = path.join(__dirname, '..', 'electron', ...segments);
    if (fs.existsSync(srcPath)) return srcPath;
    return distPath;
}

function brandingCandidates(fileName: string): string[] {
    return [
        path.join(__dirname, 'branding', fileName),
        path.join(__dirname, '..', 'public', 'branding', fileName),
    ];
}

function resolveBrandingAsset(fileName: string): string {
    for (const candidate of brandingCandidates(fileName)) {
        if (fs.existsSync(candidate)) return path.resolve(candidate);
    }
    return path.resolve(brandingCandidates(fileName)[0]);
}

/** macOS dock / BrowserWindow icon (PNG). */
export function resolveAppIconPath(): string {
    return resolveBrandingAsset(loadBrandingManifest().appIconPng);
}

/**
 * BrowserWindow `icon` on macOS overrides the bundle `.icns` in Dock (square while running).
 * Return undefined on darwin so Dock keeps the squircle bundle icon.
 */
export function resolveBrowserWindowIcon(): Electron.NativeImage | undefined {
    if (process.platform === 'darwin') return undefined;
    return appIconImage();
}

/** About dialog full wordmark (SVG). */
export function resolveAboutLogoPath(): string {
    return resolveBrandingAsset(loadBrandingManifest().aboutLogoSvg);
}

/** @deprecated Use resolveAppIconPath or resolveAboutLogoPath. */
export function resolveAppLogoPath(): string {
    return resolveAppIconPath();
}

export function appIconImage(): Electron.NativeImage | undefined {
    if (cachedAppIcon !== null) {
        return cachedAppIcon || undefined;
    }

    const iconPath = resolveAppIconPath();
    if (!fs.existsSync(iconPath)) {
        cachedAppIcon = undefined;
        return undefined;
    }
    const icon = nativeImage.createFromPath(iconPath);
    cachedAppIcon = icon.isEmpty() ? undefined : icon;
    return cachedAppIcon;
}

/** Call before `app.whenReady()` so internal Electron name matches UDFIX. */
export function configureAppBrandingEarly(): void {
    app.setName(UDFIX_APP_NAME);
    process.title = UDFIX_APP_NAME;
}

/**
 * macOS branding after ready. Intentionally does NOT call `app.dock.setIcon()`:
 * runtime PNG overrides the bundle `.icns` and Dock loses Big Sur+ squircle masking
 * (square icon while running, rounded when quit). Dev: `patch-electron-mac-branding.mjs`;
 * packaged: `build.mac.icon` in electron-builder.
 */
export function applyMacAppIcon(): void {
    if (process.platform !== 'darwin') return;
    app.setAboutPanelOptions({
        applicationName: UDFIX_APP_NAME,
        applicationVersion: app.getVersion(),
        iconPath: resolveAppIconPath(),
    });
}

function createBrandedChildWindow(options: {
    width: number;
    height: number;
    title: string;
    htmlFile: string;
    query?: Record<string, string>;
    /** macOS sheet (parent+modal) hides the normal close button — keep false for dismissible dialogs. */
    modal?: boolean;
}): BrowserWindow {
    const icon = resolveBrowserWindowIcon();
    const win = new BrowserWindow({
        width: options.width,
        height: options.height,
        resizable: true,
        minimizable: true,
        maximizable: false,
        fullscreenable: false,
        closable: true,
        show: false,
        title: options.title,
        modal: options.modal ?? false,
        icon,
        autoHideMenuBar: true,
        webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    const htmlPath = resolveElectronAsset(options.htmlFile);
    // Register before loadFile — ready-to-show can fire before the load promise resolves.
    win.once('ready-to-show', () => {
        if (!win.isDestroyed()) win.show();
    });
    void win.loadFile(htmlPath, { query: options.query }).catch((err) => {
        console.error(`[appBranding] failed to load ${options.htmlFile}:`, err);
        if (!win.isDestroyed()) win.destroy();
    });

    return win;
}

export function showAboutDialog(): void {
    if (aboutWindow && !aboutWindow.isDestroyed()) {
        aboutWindow.focus();
        return;
    }

    aboutWindow = createBrandedChildWindow({
        width: 340,
        height: 400,
        title: `Hakkında ${UDFIX_APP_NAME}`,
        htmlFile: 'AboutWindow.html',
        query: {
            v: app.getVersion(),
            logoFile: loadBrandingManifest().aboutLogoSvg,
        },
    });

    aboutWindow.on('closed', () => {
        aboutWindow = null;
    });
}

export function openOpenSourceLicensesWindow(): void {
    if (licensesWindow && !licensesWindow.isDestroyed()) {
        licensesWindow.focus();
        return;
    }

    licensesWindow = createBrandedChildWindow({
        width: 520,
        height: 640,
        title: `Lisanslar — ${UDFIX_APP_NAME}`,
        htmlFile: 'AboutCredits.html',
    });

    licensesWindow.on('closed', () => {
        licensesWindow = null;
    });

    licensesWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}
