import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { katirEnvOverride } from './appEditionEnv';

export type UdixEdition = 'lite' | 'katir';
export { katirEnvOverride } from './appEditionEnv';

export const KATIR_BRIDGE_ENTRY = path.join('uyap-import', 'uyap-import.mjs');

export function packagedHasKatirBridge(): boolean {
    try {
        return fs.existsSync(path.join(process.resourcesPath, KATIR_BRIDGE_ENTRY));
    } catch {
        return false;
    }
}

function readBakedEdition(): UdixEdition | null {
    const fromEnv = String(process.env.UDFIX_EDITION ?? '')
        .trim()
        .toLowerCase();
    if (fromEnv === 'katir') return 'katir';
    if (fromEnv === 'lite') return 'lite';
    try {
        const pkgPath = path.join(app.getAppPath(), 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { udfixEdition?: unknown };
        if (pkg.udfixEdition === 'katir') return 'katir';
        if (pkg.udfixEdition === 'lite') return 'lite';
    } catch {
        /* unpackaged or unreadable */
    }
    return null;
}

/** Packaged artifact kind. Presence of the köprü tree wins over metadata. */
export function resolvePackagedEdition(): UdixEdition {
    if (packagedHasKatirBridge()) return 'katir';
    return readBakedEdition() ?? 'lite';
}

/**
 * Live UYAP (spawn köprü, İndir) is on only for a Katır binary, or
 * unpackaged private checkout with UDFIX_KATIR=1.
 */
export function isKatirRuntimeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    const flag = katirEnvOverride(env);
    if (flag === false) return false;
    if (flag === true) return true;
    try {
        if (!app.isPackaged) return false;
    } catch {
        return false;
    }
    return resolvePackagedEdition() === 'katir';
}

export function resolveDevUyapImportEntry(): string | null {
    const fromApp = path.join(app.getAppPath(), '..', 'scripts', 'uyap-import', 'uyap-import.mjs');
    if (fs.existsSync(fromApp)) return fromApp;
    const fromCwd = path.join(process.cwd(), '..', 'scripts', 'uyap-import', 'uyap-import.mjs');
    if (fs.existsSync(fromCwd)) return fromCwd;
    return null;
}

export function resolvePackagedUyapImportEntry(): string | null {
    const packaged = path.join(process.resourcesPath, KATIR_BRIDGE_ENTRY);
    return fs.existsSync(packaged) ? packaged : null;
}
