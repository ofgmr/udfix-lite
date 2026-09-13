/**
 * Local file URLs for viewers.
 *
 * `nomai-file://` is a privileged Electron protocol (images, packaged file:// app).
 * pdf.js uses XHR. Vite's renderer origin is `http://localhost:5173`, and Chromium
 * CORS does not allow XHR to nomai-file / file from http(s). Viewers must convert
 * those sources to a `blob:` URL via IPC (`resolveToBlobUrl`).
 */
export function toNomaiFileUrl(systemPath: string): string {
    const normalized = String(systemPath || '').replace(/\\/g, '/');
    return `nomai-file://${encodeURI(normalized)}`;
}

export function isRemoteFetchableUrl(fileUrl: string): boolean {
    return /^(https?:|blob:|data:)/i.test(fileUrl);
}

export function isLocalFileScheme(fileUrl: string): boolean {
    return /^(nomai-file:|file:)/i.test(fileUrl);
}

/** True only when the renderer itself is file: / nomai-file: (packaged). Vite is http:. */
export function rendererOriginAllowsNomaiFileFetch(): boolean {
    if (typeof window === 'undefined' || !window.location?.protocol) return false;
    return window.location.protocol === 'file:' || window.location.protocol === 'nomai-file:';
}

export function toSystemPath(input: string): string {
    if (!input) return input;
    if (!isLocalFileScheme(input)) {
        try {
            return decodeURIComponent(input);
        } catch {
            return input;
        }
    }
    const stripped = input.replace(/^(nomai-file:|file:)/i, '');
    let rest = stripped.replace(/^\/+/, '/');
    try {
        rest = decodeURIComponent(rest);
    } catch {
        /* keep encoded */
    }
    if (/^\/[A-Za-z]:\//.test(rest)) rest = rest.slice(1);
    return rest;
}

export function toFetchableUrl(fileUrl: string): string {
    if (isRemoteFetchableUrl(fileUrl)) return fileUrl;

    if (isLocalFileScheme(fileUrl) || (fileUrl.startsWith('/') || /^[A-Za-z]:[\\/]/.test(fileUrl))) {
        if (!rendererOriginAllowsNomaiFileFetch()) {
            return isLocalFileScheme(fileUrl) ? toSystemPath(fileUrl) : fileUrl.replace(/\\/g, '/');
        }
        if (/^nomai-file:/i.test(fileUrl)) return fileUrl;
        if (typeof window !== 'undefined' && window.electron) {
            const systemPath = isLocalFileScheme(fileUrl) ? toSystemPath(fileUrl) : fileUrl.replace(/\\/g, '/');
            return toNomaiFileUrl(systemPath);
        }
        return fileUrl;
    }

    const normalized = fileUrl.replace(/\\/g, '/');

    if (/^[A-Za-z]:\//.test(normalized)) {
        return `file:///${normalized}`;
    }

    if (normalized.startsWith('/')) {
        return `file://${normalized}`;
    }

    return `file:///${normalized}`;
}
