import { app, session, type Session, type WebContents } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';

/** Unpackaged dev build (`NODE_ENV=development`). */
export function isRendererDevelopmentHost(): boolean {
    return !app.isPackaged && process.env.NODE_ENV === 'development';
}

/** Dev loads renderer from Vite (`localhost:5173`). Set `UDFIX_RENDERER_FILE=1` to use `dist/` instead (`npm run dev:dist`). */
export function usesViteDevServer(): boolean {
    return isRendererDevelopmentHost() && process.env.UDFIX_RENDERER_FILE !== '1';
}

export function getRendererIndexHtmlPath(): string {
    return path.join(__dirname, '..', 'dist', 'index.html');
}

/** Base URL for popout / external viewer windows (includes trailing path to index.html). */
export function getRendererEntryHref(): string {
    if (usesViteDevServer()) {
        return 'http://localhost:5173/';
    }
    return pathToFileURL(getRendererIndexHtmlPath()).href;
}

export function buildRendererEntryHref(query?: Record<string, string>): string {
    const href = getRendererEntryHref();
    if (!query || Object.keys(query).length === 0) return href;
    const url = new URL(href);
    for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
    }
    return url.href;
}

export function isAllowedRendererNavigation(url: string, devMode: boolean): boolean {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }

    if (devMode) {
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
        }
    } else if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return false;
    }

    return (
        parsed.protocol === 'file:' ||
        parsed.protocol === 'nomai-file:' ||
        parsed.protocol === 'blob:' ||
        parsed.protocol === 'data:' ||
        parsed.protocol === 'about:'
    );
}

function productionContentSecurityPolicy(): string {
    return [
        "default-src 'self' file: nomai-file: blob: data: about:",
        "script-src 'self' 'wasm-unsafe-eval' file:",
        "style-src 'self' 'unsafe-inline' file:",
        "connect-src 'self' file: nomai-file: blob: data:",
        "img-src 'self' file: nomai-file: blob: data:",
        "font-src 'self' data: file:",
        "worker-src 'self' blob: file:",
        "frame-src 'self' blob: data: file: nomai-file:",
        "media-src 'self' blob: data: file: nomai-file:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
    ].join('; ');
}

function developmentContentSecurityPolicy(): string {
    const host = 'http://localhost:5173 http://127.0.0.1:5173';
    const ws = 'ws://localhost:5173 ws://127.0.0.1:5173 ws://localhost:* ws://127.0.0.1:*';
    return [
        `default-src 'self' ${host} ${ws} blob: data: about:`,
        `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${host}`,
        `style-src 'self' 'unsafe-inline' ${host}`,
        `connect-src 'self' ${host} ${ws} blob: data: http://127.0.0.1:* http://localhost:*`,
        `img-src 'self' data: blob: ${host}`,
        `font-src 'self' data: ${host}`,
        `worker-src 'self' blob: ${host}`,
        `frame-src 'self' blob: data: ${host}`,
        "object-src 'none'",
        "base-uri 'self'",
    ].join('; ');
}

export function getContentSecurityPolicy(devMode: boolean): string {
    return devMode ? developmentContentSecurityPolicy() : productionContentSecurityPolicy();
}

function isBrandedDialogHtml(url: string): boolean {
    return /About(Window|Credits)\.html(?:\?|$)/i.test(url);
}

export function configureSessionSecurity(targetSession: Session, devMode: boolean): void {
    const csp = getContentSecurityPolicy(devMode);

    targetSession.webRequest.onHeadersReceived((details, callback) => {
        const headers = { ...details.responseHeaders };
        // About / licenses windows ship their own meta CSP (inline script + file: logos).
        if (!isBrandedDialogHtml(details.url)) {
            headers['Content-Security-Policy'] = [csp];
        }
        callback({ responseHeaders: headers });
    });

    if (!devMode) {
        targetSession.webRequest.onBeforeRequest((details, callback) => {
            const url = details.url;
            if (url.startsWith('http://') || url.startsWith('https://')) {
                console.warn('[renderer-security] blocked remote request:', url.slice(0, 120));
                callback({ cancel: true });
                return;
            }
            callback({});
        });
    }
}

export function attachWebContentsSecurityGuards(webContents: WebContents, devMode: boolean): void {
    const denyNavigation = (event: Electron.Event, url: string, reason: string) => {
        if (isAllowedRendererNavigation(url, devMode)) return;
        event.preventDefault();
        console.warn(`[renderer-security] blocked ${reason}:`, url.slice(0, 160));
    };

    webContents.on('will-navigate', (event, url) => {
        denyNavigation(event, url, 'navigation');
    });

    webContents.setWindowOpenHandler(({ url }) => {
        if (isAllowedRendererNavigation(url, devMode)) {
            // Do not override webPreferences: that can load about:blank then
            // navigate to the requested URL and wipe Dockview's injected DOM.
            return { action: 'allow' };
        }
        console.warn('[renderer-security] blocked window.open:', url.slice(0, 160));
        return { action: 'deny' };
    });
}

export function registerRendererSecurityHandlers(): void {
    const devMode = isRendererDevelopmentHost();
    configureSessionSecurity(session.defaultSession, devMode);

    app.on('web-contents-created', (_event, webContents) => {
        attachWebContentsSecurityGuards(webContents, devMode);
    });
}
