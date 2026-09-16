/** True when an IPC invoke may come from this renderer URL (no Electron types). */
export function isAllowedIpcSenderUrl(url: string): boolean {
    if (typeof url !== 'string' || url.length === 0) return false;

    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }

    if (parsed.protocol === 'about:') {
        return parsed.pathname === 'blank';
    }
    if (parsed.protocol === 'file:') {
        return true;
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    }
    return false;
}
