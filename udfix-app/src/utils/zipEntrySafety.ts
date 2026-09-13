/** Zip slip and risky entry types when previewing archives in-app (no writes to disk). */

const BLOCKED_PREVIEW_EXTENSIONS = new Set([
    'exe',
    'msi',
    'dmg',
    'app',
    'bat',
    'cmd',
    'com',
    'scr',
    'vbs',
    'ps1',
    'sh',
    'jar',
    'dll',
    'so',
    'dylib',
    'deb',
    'rpm',
    'apk',
    'ipa',
    'reg',
    'hta',
    'cpl',
    'inf',
    'lnk',
]);

export function isUnsafeZipEntryPath(entryPath: string): boolean {
    const normalized = entryPath.replace(/\\/g, '/');
    if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return true;
    const segments = normalized.split('/').filter((s) => s.length > 0);
    return segments.some((seg) => seg === '..' || seg === '.');
}

export function isBlockedZipPreviewExtension(fileName: string): boolean {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    return BLOCKED_PREVIEW_EXTENSIONS.has(ext);
}

export function canPreviewZipEntry(entryPath: string, fileName: string): boolean {
    if (isUnsafeZipEntryPath(entryPath)) return false;
    if (isBlockedZipPreviewExtension(fileName)) return false;
    return true;
}
