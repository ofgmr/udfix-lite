import { app, BrowserWindow, ipcMain, dialog, session, shell, protocol, Notification, type OpenDialogOptions, type WebPreferences } from 'electron';
import path from 'path';
import fs from 'fs';
import { setupDatabase, registerDatabaseHandlers } from './database';
import { registerEntitlementHandlers } from './entitlements';
import { simpleParser } from 'mailparser';
import os from 'os';
import { extractSignerInfoFromDetachedSignature } from './udfDetachedSignatureInfo';
import { loadAppPreferences, patchAppPreferences, pushWorkspaceRecent, type AppPreferences } from './appPreferences';
import { rebuildApplicationMenu, registerApplicationMenuIpc, MENU_CHANNEL } from './applicationMenu';
import { applyMacAppIcon, configureAppBrandingEarly, resolveBrowserWindowIcon, UDFIX_APP_NAME } from './appBranding';
import {
    buildRendererEntryHref,
    getRendererIndexHtmlPath,
    registerRendererSecurityHandlers,
    usesViteDevServer,
} from './rendererSecurity';
import {
    attachWindowTelemetryHandlers,
    handleAppPreferencesTelemetryChange,
    initTelemetryService,
    registerTelemetryHandlers,
} from './telemetryService';
import { attachAutoOpenDevTools } from './devTools';
import { startupFlushSummary, startupMark } from './startupTiming';
import { initUpdateService, registerUpdateHandlers, disposeUpdateService } from './updateService';
import { registerMacOpenFileHandlers, initMacOpenFileDelivery, drainStartupUdfOpenRequests } from './macOpenFile';
import { initMacAppLifecycle, setupMacPlatformMenus, scheduleFirstLaunchUdfPrompt } from './macAppLifecycle';
import { initMacMenuBarTray } from './macMenuBarTray';
import { registerUdfixWithLaunchServices, reassertUdfDefaultHandlerIfEnabled } from './macLaunchServices';
import { registerUdfQuickLookPlugins } from './macUdfQuickLook';
import { DEST_DIR_APP_OWNED, isAppOwnedEvrakPath, purgeAppOwnedUyapPreviewDirs } from './uyapEvrakStorage';
import { startCalendarReminderService, stopCalendarReminderService } from './calendarReminderService';

class UyapSigningError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
        super(message);
        this.name = 'UyapSigningError';
        this.code = code;
    }
}

async function signDetachedContentXml(): Promise<never> {
    throw new UyapSigningError('SIGNER_NOT_CONFIGURED', 'E-imza bu kaynak ağacında yapılandırılmaz.');
}

// Mitigate Chromium "tile memory limits exceeded" warnings (cc/tiles/tile_manager.cc) on glass-heavy UIs.
// Extra raster threads reduce eviction churn when many layers/backdrop blurs are present.
app.commandLine.appendSwitch('num-raster-threads', '4');
configureAppBrandingEarly();
registerMacOpenFileHandlers();

protocol.registerSchemesAsPrivileged([
    {
        scheme: 'nomai-file',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            stream: true,
            bypassCSP: true,
        },
    },
]);

function rendererWebPreferences(): WebPreferences {
    return {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
    };
}

function ipcBytesToBuffer(bytes: unknown): Buffer {
    if (Buffer.isBuffer(bytes)) return bytes;
    if (bytes instanceof Uint8Array) return Buffer.from(bytes);
    if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
    if (Array.isArray(bytes)) return Buffer.from(Uint8Array.from(bytes));
    return Buffer.alloc(0);
}

let mainWindow: BrowserWindow | null;
const fsWatchers = new Map<string, fs.FSWatcher>();

type FsListEntry = {
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
    mtimeMs: number;
};

const normalizeAbsolutePath = (rawPath: string): string => {
    if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
        throw new Error('Invalid path');
    }
    const normalized = path.resolve(rawPath);
    if (!path.isAbsolute(normalized)) {
        throw new Error('Only absolute paths are allowed');
    }
    return normalized;
};

function clampPrintScale(raw: unknown): number {
    const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? '1'));
    if (!Number.isFinite(n)) return 1;
    return Math.min(2, Math.max(0.5, n));
}

function normalizePdfPrintOptions(raw: Record<string, unknown>, useChromeHeaderFooter: boolean): Record<string, unknown> {
    const normalized: Record<string, unknown> = {
        ...raw,
        printBackground: true,
        pageSize: 'A4',
        preferCSSPageSize: raw.preferCSSPageSize === false ? false : true,
        landscape: raw.landscape === true,
        scale: clampPrintScale(raw.scale),
    };
    if (!useChromeHeaderFooter) {
        normalized.margins = { top: 0, bottom: 0, left: 0, right: 0 };
    } else if (raw.margins && typeof raw.margins === 'object') {
        normalized.margins = raw.margins;
    }
    return normalized;
}

type UyapMainSignRequest =
    | { provider: 'token'; tokenPin: string }
    | {
          provider: 'mobile';
          gsmNo: string;
          tcKimlikNo: string;
          operator: 'turkcell' | 'turktelekom' | 'vodafone';
          displayText?: string;
      };

function readBooleanEnvFlag(raw: string | undefined): boolean {
    if (!raw) return false;
    const normalized = raw.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function isUyapSignDebugEnabledFromPayload(payload: { debug?: unknown } | null | undefined): boolean {
    if (payload && typeof payload.debug === 'boolean') {
        return payload.debug;
    }
    return (
        readBooleanEnvFlag(process.env.UDFIX_DEBUG_UYAP_SIGN) ||
        readBooleanEnvFlag(process.env.NOMAI_DEBUG_UYAP_SIGN)
    );
}

async function waitForPrintWindowAssets(printWin: BrowserWindow): Promise<void> {
    try {
        await printWin.webContents.executeJavaScript(
            `new Promise((resolve) => {
                const done = () => resolve(true);
                const raf2 = () => requestAnimationFrame(() => requestAnimationFrame(done));
                const fontReady = (document.fonts && document.fonts.ready)
                    ? Promise.race([
                        document.fonts.ready.catch(() => undefined),
                        new Promise((r) => setTimeout(r, 3000)),
                    ])
                    : Promise.resolve();
                const images = Array.from(document.images || []);
                const pending = images.filter((img) => !img.complete || img.naturalWidth === 0);
                const imageReady = pending.length
                    ? Promise.race([
                        Promise.all(pending.map((img) => new Promise((r) => {
                            img.addEventListener('load', r, { once: true });
                            img.addEventListener('error', r, { once: true });
                        }))),
                        new Promise((r) => setTimeout(r, 3000)),
                    ])
                    : Promise.resolve();
                Promise.all([fontReady, imageReady]).finally(raf2);
            })`,
            true,
        );
    } catch (error) {
        console.warn('[export-pdf-from-html] print window readiness wait failed:', error);
    }
}

function createWindow(): BrowserWindow {
    if (mainWindow && !mainWindow.isDestroyed()) {
        return mainWindow;
    }

    startupMark('main:createWindow begin');

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: UDFIX_APP_NAME,
        icon: resolveBrowserWindowIcon(),
        webPreferences: rendererWebPreferences(),
    });
    void mainWindow.webContents.setVisualZoomLevelLimits(1, 1);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.webContents.once('did-finish-load', () => {
        startupMark('main:renderer did-finish-load');
        startupFlushSummary();
    });
    mainWindow.once('ready-to-show', () => startupMark('main:window ready-to-show'));

    attachAutoOpenDevTools(mainWindow);

    if (usesViteDevServer()) {
        void mainWindow.loadURL('http://localhost:5173');
    } else {
        void mainWindow.loadFile(getRendererIndexHtmlPath());
    }

    attachWindowTelemetryHandlers(mainWindow);
    startupMark('main:createWindow end');
    return mainWindow;
}

app.whenReady().then(async () => {
    startupMark('main:whenReady');
    applyMacAppIcon();
    startupMark('main:branding');
    registerRendererSecurityHandlers();

    protocol.registerFileProtocol('nomai-file', (request, callback) => {
        try {
            const raw = decodeURIComponent(request.url.replace(/^nomai-file:\/\//i, ''));
            const filePath = normalizeAbsolutePath(raw);
            callback({ path: filePath });
        } catch {
            callback({ error: -2 });
        }
    });

    const userDataPath = app.getPath('userData');

    try {
        startupMark('main:sqlite begin');
        setupDatabase(userDataPath, app.getVersion());
        startupMark('main:sqlite end');
        purgeAppOwnedUyapPreviewDirs(userDataPath);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('SQLite / better-sqlite3 init failed:', err);
        dialog.showErrorBox(
            'UDFIX — Veritabanı modülü',
            [
                'SQLite yerel eklentisi (better-sqlite3) yüklenemedi. Proje kökünde şunu çalıştırın:',
                '',
                '  npx electron-rebuild -f -w better-sqlite3',
                '',
                'Ardından npm run dev ile yeniden deneyin. (postinstall bazen sandbox veya izin hatasıyla atlanabilir.)',
                '',
                `Ayrıntı: ${msg}`,
            ].join('\n'),
        );
    }
    registerDatabaseHandlers();
    startupMark('main:ipc db handlers');
    registerEntitlementHandlers(userDataPath);
    registerApplicationMenuIpc();
    startupMark('main:menu ipc');
    registerUpdateHandlers();
    initTelemetryService();
    registerTelemetryHandlers();

    ipcMain.handle('focus-main-window', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.focus();
            return true;
        }
        return false;
    });

    ipcMain.handle('app-show-native-notification', (_event, payload?: { title?: string; body?: string }) => {
        if (!Notification.isSupported()) return { ok: false };
        const note = new Notification({
            title: payload?.title || 'UDFIX',
            body: payload?.body || '',
            silent: false,
        });
        note.show();
        return { ok: true };
    });

    ipcMain.handle('fs-file-url', (_event, rawPath: string) => {
        const filePath = String(rawPath || '').trim();
        if (!filePath || !fs.existsSync(filePath)) return null;
        const normalized = filePath.replace(/\\/g, '/');
        return `nomai-file://${encodeURI(normalized)}`;
    });

    ipcMain.handle('app-preferences-get', (): AppPreferences => loadAppPreferences());

    ipcMain.handle('app-preferences-patch', (_, patch: Partial<AppPreferences>): AppPreferences => {
        const previous = loadAppPreferences();
        const preferences = patchAppPreferences(patch);
        handleAppPreferencesTelemetryChange(previous, preferences);
        rebuildApplicationMenu();
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
                win.webContents.send(MENU_CHANNEL, { type: 'preferences-changed', preferences });
            }
        }
        return preferences;
    });

    ipcMain.handle('fs-select-workspace-directory', async () => {
        const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
        const options: OpenDialogOptions = {
            title: 'Çalışma Klasörü Seç',
            properties: ['openDirectory', 'createDirectory'],
        };
        const res = win
            ? await dialog.showOpenDialog(win, options)
            : await dialog.showOpenDialog(options);
        if (res.canceled || res.filePaths.length === 0) return null;
        const picked = normalizeAbsolutePath(res.filePaths[0]);
        pushWorkspaceRecent(picked);
        rebuildApplicationMenu();
        const preferences = loadAppPreferences();
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
                win.webContents.send(MENU_CHANNEL, { type: 'preferences-changed', preferences });
            }
        }
        return picked;
    });

    ipcMain.handle('fs-list-directory', async (_, rawDirPath: string): Promise<FsListEntry[]> => {
        const dirPath = normalizeAbsolutePath(rawDirPath);
        const dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
        const entries = await Promise.all(
            dirents.map(async (dirent): Promise<FsListEntry> => {
                const fullPath = path.join(dirPath, dirent.name);
                const stats = await fs.promises.stat(fullPath);
                return {
                    name: dirent.name,
                    path: fullPath,
                    isDirectory: dirent.isDirectory(),
                    size: stats.size,
                    mtimeMs: stats.mtimeMs,
                };
            })
        );
        return entries.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' });
        });
    });

    ipcMain.handle('fs-create-directory', async (_, rawDirPath: string) => {
        const dirPath = normalizeAbsolutePath(rawDirPath);
        await fs.promises.mkdir(dirPath, { recursive: false });
        return { ok: true };
    });

    ipcMain.handle('fs-create-file', async (_, rawFilePath: string, content = '') => {
        const filePath = normalizeAbsolutePath(rawFilePath);
        await fs.promises.writeFile(filePath, String(content), { encoding: 'utf8', flag: 'wx' });
        return { ok: true };
    });

    ipcMain.handle('fs-rename-path', async (_, oldRawPath: string, newRawPath: string) => {
        const oldPath = normalizeAbsolutePath(oldRawPath);
        const newPath = normalizeAbsolutePath(newRawPath);
        await fs.promises.rename(oldPath, newPath);
        return { ok: true };
    });

    ipcMain.handle('fs-delete-path', async (_, rawPath: string) => {
        const targetPath = normalizeAbsolutePath(rawPath);
        await shell.trashItem(targetPath);
        return { ok: true };
    });

    ipcMain.handle('fs-show-item-in-folder', async (_, rawPath: string) => {
        const targetPath = normalizeAbsolutePath(rawPath);
        await fs.promises.access(targetPath);
        shell.showItemInFolder(targetPath);
        return { ok: true };
    });

    ipcMain.handle('fs-write-file-binary', async (_, rawFilePath: string, bytes: unknown) => {
        const filePath = normalizeAbsolutePath(rawFilePath);
        await fs.promises.writeFile(filePath, ipcBytesToBuffer(bytes));
        return { ok: true };
    });

    ipcMain.handle('fs-read-file-binary', async (_, rawFilePath: string) => {
        const filePath = normalizeAbsolutePath(rawFilePath);
        return fs.promises.readFile(filePath);
    });

    ipcMain.handle('fs-select-udf-files', async () => {
        const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
        const options: OpenDialogOptions = {
            title: 'UDF Dosyaları Seç',
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'UYAP UDF', extensions: ['udf'] }],
        };
        const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
        if (res.canceled || res.filePaths.length === 0) return [];
        return res.filePaths.map((p) => normalizeAbsolutePath(p));
    });

    ipcMain.handle('fs-select-output-directory', async () => {
        const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
        const options: OpenDialogOptions = {
            title: 'PDF Çıktı Klasörü Seç',
            properties: ['openDirectory', 'createDirectory'],
        };
        const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
        if (res.canceled || res.filePaths.length === 0) return null;
        return normalizeAbsolutePath(res.filePaths[0]);
    });

    ipcMain.handle(
        'fs-select-uyap-evrak-directory',
        async (): Promise<{ ok: boolean; path?: string; cancelled?: boolean; error?: string }> => {
            const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
            const prefs = loadAppPreferences();
            const last =
                typeof prefs.uyapEvrakDownloadDir === 'string' && prefs.uyapEvrakDownloadDir.trim()
                    ? prefs.uyapEvrakDownloadDir.trim()
                    : '';
            const options: OpenDialogOptions = {
                title: 'Evrak Klasörü Seç',
                properties: ['openDirectory', 'createDirectory'],
            };
            if (last && fs.existsSync(last)) options.defaultPath = last;
            const res = win
                ? await dialog.showOpenDialog(win, options)
                : await dialog.showOpenDialog(options);
            if (res.canceled || res.filePaths.length === 0) return { ok: false, cancelled: true };
            const picked = normalizeAbsolutePath(res.filePaths[0]);
            if (isAppOwnedEvrakPath(picked)) {
                return { ok: false, error: DEST_DIR_APP_OWNED };
            }
            patchAppPreferences({ uyapEvrakDownloadDir: picked });
            return { ok: true, path: picked };
        },
    );

    ipcMain.handle(
        'fs-show-save-udf-dialog',
        async (
            _,
            payload?: { suggestedFileName?: string; defaultDirectory?: string } | null,
        ): Promise<string | null> => {
            const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
            const suggested =
                typeof payload?.suggestedFileName === 'string' && payload.suggestedFileName.trim().length > 0
                    ? payload.suggestedFileName.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 200)
                    : 'Belge.udf';
            const withExt = suggested.toLowerCase().endsWith('.udf') ? suggested : `${suggested}.udf`;
            let defaultPath = withExt;
            if (typeof payload?.defaultDirectory === 'string' && payload.defaultDirectory.trim().length > 0) {
                try {
                    defaultPath = path.join(normalizeAbsolutePath(payload.defaultDirectory), withExt);
                } catch {
                    defaultPath = withExt;
                }
            }
            const result = win
                ? await dialog.showSaveDialog(win, {
                      title: 'UDF Farklı Kaydet',
                      defaultPath,
                      filters: [{ name: 'UDF Dosyası', extensions: ['udf'] }],
                  })
                : await dialog.showSaveDialog({
                      title: 'UDF Farklı Kaydet',
                      defaultPath,
                      filters: [{ name: 'UDF Dosyası', extensions: ['udf'] }],
                  });
            if (result.canceled || !result.filePath) return null;
            let filePath = normalizeAbsolutePath(result.filePath);
            if (!filePath.toLowerCase().endsWith('.udf')) {
                filePath = `${filePath}.udf`;
            }
            return filePath;
        },
    );

    ipcMain.handle(
        'fs-show-save-csv-dialog',
        async (
            _,
            payload?: { suggestedFileName?: string; defaultDirectory?: string } | null,
        ): Promise<string | null> => {
            const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
            const suggested =
                typeof payload?.suggestedFileName === 'string' && payload.suggestedFileName.trim().length > 0
                    ? payload.suggestedFileName.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 200)
                    : 'Rapor.csv';
            const withExt = suggested.toLowerCase().endsWith('.csv') ? suggested : `${suggested}.csv`;
            let defaultPath = withExt;
            if (typeof payload?.defaultDirectory === 'string' && payload.defaultDirectory.trim().length > 0) {
                try {
                    defaultPath = path.join(normalizeAbsolutePath(payload.defaultDirectory), withExt);
                } catch {
                    defaultPath = withExt;
                }
            }
            const result = win
                ? await dialog.showSaveDialog(win, {
                      title: 'CSV Kaydet',
                      defaultPath,
                      filters: [{ name: 'CSV', extensions: ['csv'] }],
                  })
                : await dialog.showSaveDialog({
                      title: 'CSV Kaydet',
                      defaultPath,
                      filters: [{ name: 'CSV', extensions: ['csv'] }],
                  });
            if (result.canceled || !result.filePath) return null;
            let filePath = normalizeAbsolutePath(result.filePath);
            if (!filePath.toLowerCase().endsWith('.csv')) {
                filePath = `${filePath}.csv`;
            }
            return filePath;
        },
    );

    ipcMain.handle(
        'fs-write-text-file',
        async (_, payload: { path?: string; contents?: string } | null): Promise<{ ok: boolean }> => {
            const filePath = normalizeAbsolutePath(String(payload?.path ?? ''));
            const contents = typeof payload?.contents === 'string' ? payload.contents : '';
            await fs.promises.writeFile(filePath, contents, { encoding: 'utf8' });
            return { ok: true };
        },
    );

    ipcMain.handle('udf-parse-detached-signature', async (_, bytes: unknown) => {
        const arr = ipcBytesToBuffer(bytes);
        return extractSignerInfoFromDetachedSignature(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
    });

    ipcMain.handle('fs-watch-start', async (_, rawRootPath: string) => {
        const rootPath = normalizeAbsolutePath(rawRootPath);
        if (fsWatchers.has(rootPath)) return { ok: true };
        const watcher = fs.watch(rootPath, { recursive: true }, (_eventType, filename) => {
            const changed = filename ? path.join(rootPath, String(filename)) : rootPath;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('fs-watch-event', {
                    rootPath,
                    changedPath: changed,
                });
            }
        });
        fsWatchers.set(rootPath, watcher);
        return { ok: true };
    });

    ipcMain.handle('fs-watch-stop', async (_, rawRootPath: string) => {
        const rootPath = normalizeAbsolutePath(rawRootPath);
        const watcher = fsWatchers.get(rootPath);
        if (watcher) {
            watcher.close();
            fsWatchers.delete(rootPath);
        }
        return { ok: true };
    });

    ipcMain.handle(
        'uyap-sign-detached',
        async (
            _event,
            payload: {
                contentXml: string;
                signRequest: UyapMainSignRequest;
                profile?: { standard?: string; digestAlgorithm?: string };
                verifyWithOpenSsl?: boolean;
                debug?: boolean;
            },
        ) => {
            if (!payload || typeof payload !== 'object') {
                throw new Error('İmzalama isteği geçersiz.');
            }
            const debug = isUyapSignDebugEnabledFromPayload(payload);
            const contentXml = typeof payload.contentXml === 'string' ? payload.contentXml : '';
            const signRequest =
                payload.signRequest && typeof payload.signRequest === 'object'
                    ? payload.signRequest
                    : null;
            const standard =
                payload.profile && typeof payload.profile.standard === 'string'
                    ? payload.profile.standard
                    : 'CAdES-BES';
            const digestAlgorithm =
                payload.profile && typeof payload.profile.digestAlgorithm === 'string'
                    ? payload.profile.digestAlgorithm
                    : 'SHA-256';
            if (!contentXml.trim()) {
                throw new Error('İmzalanacak content.xml boş olamaz.');
            }
            if (!signRequest || (signRequest.provider !== 'token' && signRequest.provider !== 'mobile')) {
                throw new Error('İmzalama isteği provider bilgisi içermeli.');
            }
            if (signRequest.provider === 'token' && !signRequest.tokenPin) {
                throw new Error('Token PIN bilgisi gerekli.');
            }
            if (
                signRequest.provider === 'mobile' &&
                (!signRequest.gsmNo || !signRequest.tcKimlikNo || !signRequest.operator)
            ) {
                throw new Error('Mobil imza için gsm, tc ve operator bilgisi zorunlu.');
            }
            if (debug) {
                console.info('[uyap-sign][main] invoke received', {
                    provider: signRequest.provider,
                    standard,
                    digestAlgorithm,
                    contentLength: contentXml.length,
                    verifyWithOpenSsl: payload.verifyWithOpenSsl === true,
                });
            }

            try {
                const signed = await signDetachedContentXml({
                    contentXml,
                    signRequest,
                    profile: { standard, digestAlgorithm },
                    verifyWithOpenSsl: payload.verifyWithOpenSsl === true,
                    debug,
                });
                if (debug) {
                    console.info('[uyap-sign][main] signer bridge completed', {
                        notesCount: signed.notes.length,
                        signatureLength: signed.signatureBytes.length,
                        signerName: signed.signerName ?? null,
                    });
                }
                return {
                    signatureBytes: Array.from(signed.signatureBytes),
                    notes: signed.notes,
                    signerName: signed.signerName,
                    signedAtIso: signed.signedAtIso,
                    certificateValidUntilIso: signed.certificateValidUntilIso,
                    providerId: process.env.UDFIX_UYAP_SIGNER_CMD || process.env.NOMAI_UYAP_SIGNER_CMD
                        ? 'udfix.command-signer'
                        : 'udfix.ma3-java-sidecar',
                };
            } catch (error) {
                if (debug) {
                    console.warn('[uyap-sign][main] signer bridge failed', {
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
                if (error instanceof UyapSigningError) {
                    throw new Error(`[[UYAP_SIGN:${error.code}]] ${error.message}`);
                }
                throw error;
            }
        },
    );

    startupMark('main:pre-window ipc block done');

    initMacOpenFileDelivery({
        createMainWindow: createWindow,
        getMainWindow: () => mainWindow,
    });
    initMacAppLifecycle({
        createMainWindow: createWindow,
        getMainWindow: () => mainWindow,
    });
    initMacMenuBarTray({
        createMainWindow: () => {
            const win = createWindow();
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
        },
    });

    await registerUdfixWithLaunchServices();
    await registerUdfQuickLookPlugins();
    await reassertUdfDefaultHandlerIfEnabled();

    const window = createWindow();
    scheduleFirstLaunchUdfPrompt(window);
    drainStartupUdfOpenRequests();
    await setupMacPlatformMenus();
    initUpdateService(userDataPath);
    startCalendarReminderService({
        showMainWindow: () => {
            const win = createWindow();
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
            return win;
        },
    });

    // Set Spellchecker to Turkish and English natively in Electron
    session.defaultSession.setSpellCheckerLanguages(['tr-TR', 'en-GB']);
    // PDF Export from HTML Handler (Scoped to Editor Content)
    console.log('[IPC] Registering export-pdf-from-html handler');
    ipcMain.handle(
        'export-pdf-from-html',
        async (event, payload: unknown, legacySuggestedBaseName?: string) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return;

        let documentHtml: string;
        let suggestedBaseName: string | undefined;

        const isNewPayload =
            payload !== null &&
            typeof payload === 'object' &&
            typeof (payload as { documentHtml?: unknown }).documentHtml === 'string';

        if (isNewPayload) {
            const p = payload as {
                documentHtml: string;
                suggestedBaseName?: string;
                printToPdfOptions?: Record<string, unknown>;
            };
            documentHtml = p.documentHtml;
            suggestedBaseName = p.suggestedBaseName;
        } else if (typeof payload === 'string') {
            documentHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Belge</title></head><body>${payload}</body></html>`;
            suggestedBaseName = legacySuggestedBaseName;
        } else {
            console.error('[export-pdf-from-html] Invalid payload');
            return;
        }

        const safe =
            (suggestedBaseName && String(suggestedBaseName).trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 200)) ||
            'Belge';
        const { filePath } = await dialog.showSaveDialog(win, {
            title: 'PDF Olarak Kaydet',
            defaultPath: `${safe}.pdf`,
            filters: [{ name: 'PDF Dosyası', extensions: ['pdf'] }]
        });

        if (filePath) {
            const printWin = new BrowserWindow({
                show: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            });
            // The default hidden-window viewport (~800px wide) reflows PaginationPlus
            // and produces extra PDF pages. Sizing the window to comfortably hold an
            // A4 column at 96 DPI keeps the float-based page geometry stable.
            printWin.setSize(1400, 2200);

            try {
                const printExtras =
                    isNewPayload && typeof (payload as { printToPdfOptions?: unknown }).printToPdfOptions === 'object'
                        ? ((payload as { printToPdfOptions?: Record<string, unknown> }).printToPdfOptions ?? {})
                        : {};

                await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(documentHtml));
                await waitForPrintWindowAssets(printWin);

                const useChromeHeaderFooter = (printExtras as Record<string, unknown>).displayHeaderFooter === true;
                const printOptions = normalizePdfPrintOptions(printExtras, useChromeHeaderFooter);
                const data = await printWin.webContents.printToPDF({
                    ...printOptions,
                } as any);
                await fs.promises.writeFile(filePath, data);
            } catch (error) {
                console.error('PDF export error:', error);
                throw error;
            } finally {
                printWin.close();
            }
        }
    }
    );

    // DOCX Export Handler — native OOXML buffer from renderer (`docx` package)
    console.log('[IPC] Registering export-docx handler');
    ipcMain.handle('export-docx', async (event, payload: unknown, legacySuggestedBaseName?: string) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return;

        let suggestedBaseName: string | undefined;
        let docxBuffer: Buffer | null = null;

        const isNativePayload =
            payload !== null &&
            typeof payload === 'object' &&
            Array.isArray((payload as { docxBuffer?: unknown }).docxBuffer);

        if (isNativePayload) {
            const p = payload as { docxBuffer: number[]; suggestedBaseName?: string };
            suggestedBaseName = p.suggestedBaseName;
            docxBuffer = Buffer.from(p.docxBuffer);
        } else {
            console.error('[export-docx] Invalid payload — expected { docxBuffer: number[] }');
            return;
        }

        void legacySuggestedBaseName;

        const safe =
            (suggestedBaseName && String(suggestedBaseName).trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 200)) ||
            'Belge';
        const { filePath } = await dialog.showSaveDialog(win, {
            title: 'Word Olarak Kaydet',
            defaultPath: `${safe}.docx`,
            filters: [{ name: 'Word Dosyası', extensions: ['docx'] }]
        });

        if (filePath && docxBuffer) {
            try {
                await fs.promises.writeFile(filePath, docxBuffer);
            } catch (error) {
                console.error('DOCX export error:', error);
                throw error;
            }
        }
    });

    // HTML to PDF Buffer Conversion (UDF viewer export + batch converter)
    console.log('[IPC] Registering convert-html-to-pdf handler');
    ipcMain.handle('convert-html-to-pdf', async (_event, payload: unknown) => {
        let documentHtml: string;
        let printExtras: Record<string, unknown> = {};

        if (payload !== null && typeof payload === 'object' && typeof (payload as { documentHtml?: unknown }).documentHtml === 'string') {
            const p = payload as { documentHtml: string; printToPdfOptions?: Record<string, unknown> };
            documentHtml = p.documentHtml;
            if (p.printToPdfOptions && typeof p.printToPdfOptions === 'object') {
                printExtras = p.printToPdfOptions;
            }
        } else if (typeof payload === 'string') {
            documentHtml = payload;
        } else {
            throw new Error('convert-html-to-pdf: geçersiz payload');
        }

        const printWin = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
            },
        });
        printWin.setSize(1400, 2200);

        try {
            await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(documentHtml));
            await waitForPrintWindowAssets(printWin);
            const printOptions = normalizePdfPrintOptions(
                { margins: { top: 0, bottom: 0, left: 0, right: 0 }, ...printExtras },
                false,
            );
            const data = await printWin.webContents.printToPDF(printOptions as never);
            return data;
        } catch (error) {
            console.error('HTML to PDF conversion error:', error);
            throw error;
        } finally {
            printWin.close();
        }
    });

    // Email Parsing Handler — accepts { buffer } (from blob/remote) or { path } (filesystem)
    console.log('[IPC] Registering parse-email handler');
    ipcMain.handle('parse-email', async (event, payload: { buffer?: ArrayBuffer | Uint8Array; path?: string }) => {
        try {
            let buffer: Buffer;
            if (payload.buffer) {
                buffer = Buffer.from(new Uint8Array(payload.buffer));
            } else if (payload.path) {
                buffer = await fs.promises.readFile(payload.path);
            } else {
                throw new Error('parse-email requires buffer or path');
            }
            const parsed = await simpleParser(buffer);
            
            const formatAddress = (addr: any) => {
                if (!addr) return '';
                if (Array.isArray(addr)) return addr.map((a: any) => a.text || '').join(', ');
                return addr.text || '';
            };

            return {
                subject: parsed.subject,
                from: formatAddress(parsed.from),
                to: formatAddress(parsed.to),
                cc: formatAddress(parsed.cc),
                date: parsed.date ? parsed.date.toLocaleString('tr-TR') : '',
                htmlBody: parsed.html || '',
                textBody: parsed.text || '',
                attachments: (parsed.attachments || []).map(att => ({
                    filename: att.filename,
                    contentType: att.contentType,
                    id: att.checksum,
                    size: att.size,
                    content: att.content // Node.js Buffer
                }))
            };
        } catch (error) {
            console.error('Email parsing error:', error);
            throw error;
        }
    });

    // Save attachment to temp and return path
    ipcMain.handle('save-attachment-temp', async (event, buffer: Buffer | ArrayBuffer | Uint8Array, filename: string) => {
        const tempDir = path.join(os.tmpdir(), 'nomai-attachments');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(new Uint8Array(buffer));
        const filePath = path.join(tempDir, Date.now() + '-' + filename);
        await fs.promises.writeFile(filePath, buf);
        return filePath;
    });

    // Open Separate Viewer Window
    ipcMain.handle('open-external-viewer', async (event, filePath: string, fileName: string) => {
        const viewerWin = new BrowserWindow({
            width: 1000,
            height: 700,
            title: `Önizleme - ${fileName}`,
            webPreferences: rendererWebPreferences(),
        });
        void viewerWin.webContents.setVisualZoomLevelLimits(1, 1);

        try {
            await viewerWin.loadURL(
                buildRendererEntryHref({
                    'view-file-path': filePath,
                    'view-file-name': fileName,
                }),
            );
            attachWindowTelemetryHandlers(viewerWin);
        } catch (err) {
            console.error('open-external-viewer: loadURL failed:', err);
            viewerWin.close();
            throw err;
        }
    });
}).catch((err: unknown) => {
    console.error('Application startup failed:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[main] unhandledRejection:', reason);
});

app.on('window-all-closed', () => {
    for (const watcher of fsWatchers.values()) watcher.close();
    fsWatchers.clear();
    disposeUpdateService();
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    stopCalendarReminderService();
    try {
        session.defaultSession.flushStorageData();
    } catch {
        /* ignore */
    }
});
