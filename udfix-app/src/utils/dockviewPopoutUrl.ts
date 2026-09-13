/**
 * Dockview `window.open` URL.
 *
 * Electron (Vite or packaged) must use `about:blank`. A real HTML navigation
 * (`/popout.html`) either resolves to `file:///popout.html`, a unique `file://`
 * origin, or a native BrowserWindow whose `load` never reaches Dockview — chrome
 * appears, the panel body stays blank. `about:blank` inherits the opener origin.
 *
 * Non-Electron browsers keep a sibling `popout.html`.
 */
export function resolveDockviewPopoutUrl(
    locationHref = typeof window !== 'undefined' ? window.location.href : '',
    runtime: { isElectron?: boolean } = {},
): string {
    const electron =
        runtime.isElectron ??
        (typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent));
    if (electron) return 'about:blank';
    try {
        const here = new URL(locationHref);
        if (here.protocol === 'file:') {
            return 'about:blank';
        }
        return new URL('popout.html', here).href;
    } catch {
        return '/popout.html';
    }
}
