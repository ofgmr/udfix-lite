export const NOMAI_FS_ENTRY_MIME = 'application/x-nomai-fs-entry';

/** Absolute filesystem path from an OS / Electron drag-and-drop `File`. */
export function resolveDroppedFilePath(file: File): string | null {
    const legacy = (file as File & { path?: string }).path?.trim();
    if (legacy) return legacy;

    try {
        const fromBridge = window.electron?.getPathForFile?.(file)?.trim();
        if (fromBridge) return fromBridge;
    } catch {
        /* noop */
    }
    return null;
}

export function normalizeDroppedFsPath(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.includes('\n')) return null;

    let fsPath = trimmed;
    if (trimmed.startsWith('file://')) {
        try {
            const u = new URL(trimmed);
            fsPath = decodeURIComponent(u.pathname);
            if (
                typeof process !== 'undefined' &&
                process.platform === 'win32' &&
                fsPath.startsWith('/') &&
                /^[A-Za-z]:/.test(fsPath.slice(1, 3))
            ) {
                fsPath = fsPath.slice(1);
            }
        } catch {
            return null;
        }
    }

    const looksAbsolute =
        fsPath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(fsPath) || fsPath.startsWith('\\\\');
    return looksAbsolute ? fsPath : null;
}
