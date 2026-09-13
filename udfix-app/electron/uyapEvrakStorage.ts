import fs from 'fs';
import os from 'os';
import path from 'path';

export const DEST_DIR_REQUIRED = 'İndirme klasörü seçin.';
export const DEST_DIR_MISSING = 'İndirme klasörü bulunamadı.';
export const DEST_DIR_APP_OWNED =
    'Uygulama veri klasörüne kaydedilmez. Kendi klasörünüzü seçin.';

export const PREVIEW_TEMP_DIRNAME = 'udfix-uyap-preview';

export function previewTempRoot(): string {
    return path.join(os.tmpdir(), PREVIEW_TEMP_DIRNAME);
}

function slashPath(filePath: string): string {
    return String(filePath || '').replace(/\\/g, '/');
}

/** Application Support keep/preview piles — not a user Desktop folder named uyap-evrak. */
export function isAppOwnedEvrakPath(filePath: string | null | undefined): boolean {
    const n = slashPath(filePath || '').toLowerCase();
    if (!n) return false;
    return n.includes('/udfix-data/uyap-evrak') || n.includes('/nomai-data/uyap-evrak');
}

export function isPreviewTempPath(filePath: string | null | undefined): boolean {
    const raw = String(filePath || '').trim();
    if (!raw) return false;
    const abs = path.resolve(raw);
    const root = path.resolve(previewTempRoot());
    return abs === root || abs.startsWith(`${root}${path.sep}`);
}

export function isUserKeptEvrakPath(filePath: string | null | undefined): boolean {
    const raw = String(filePath || '').trim();
    if (!raw) return false;
    try {
        if (!fs.existsSync(raw) || !fs.statSync(raw).isFile()) return false;
    } catch {
        return false;
    }
    if (isAppOwnedEvrakPath(raw) || isPreviewTempPath(raw)) return false;
    return true;
}

function previewCacheFromMetadata(metadata: unknown): boolean {
    if (metadata && typeof metadata === 'object') {
        const uyap = (metadata as { uyap?: { previewCache?: unknown } }).uyap;
        return Boolean(uyap && typeof uyap === 'object' && uyap.previewCache === true);
    }
    if (typeof metadata === 'string' && metadata.trim()) {
        try {
            return previewCacheFromMetadata(JSON.parse(metadata) as unknown);
        } catch {
            return false;
        }
    }
    return false;
}

/** Path the UI may open. App-support archives are hidden; preview temp stays visible. */
export function publicEvrakFilePath(
    filePath: string | null | undefined,
    metadata?: unknown,
): string | null {
    const raw = String(filePath || '').trim();
    if (!raw) return null;
    try {
        if (!fs.existsSync(raw)) return null;
    } catch {
        return null;
    }
    if (previewCacheFromMetadata(metadata) || isPreviewTempPath(raw)) return raw;
    if (isAppOwnedEvrakPath(raw)) return null;
    return raw;
}

/** Delete leftover preview dirs only — never the user keep folder or uyap-evrak archive. */
export function purgeAppOwnedUyapPreviewDirs(userDataPath: string): void {
    const dirs = [
        path.join(userDataPath, 'udfix-data', 'uyap-evrak-preview'),
        path.join(userDataPath, 'nomai-data', 'uyap-evrak-preview'),
        previewTempRoot(),
    ];
    for (const dir of dirs) {
        try {
            if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
        } catch (err) {
            console.warn('UYAP preview purge failed:', dir, err);
        }
    }
}
