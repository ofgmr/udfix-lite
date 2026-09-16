import os from 'os';
import path from 'path';

export function normalizeAbsolutePath(rawPath: string): string {
    if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
        throw new Error('Invalid path');
    }
    const normalized = path.resolve(rawPath);
    if (!path.isAbsolute(normalized)) {
        throw new Error('Only absolute paths are allowed');
    }
    return normalized;
}

function isSameOrInside(candidate: string, root: string): boolean {
    const resolvedRoot = path.resolve(root);
    if (candidate === resolvedRoot) return true;
    const rel = path.relative(resolvedRoot, candidate);
    return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function deniedSecretRoots(): string[] {
    const home = os.homedir();
    const roots = [
        path.join(home, '.ssh'),
        path.join(home, '.gnupg'),
        path.join(home, '.aws'),
        path.join(home, '.kube'),
        '/etc/ssh',
        '/private/etc/ssh',
    ];
    if (process.platform === 'darwin') {
        roots.push(path.join(home, 'Library', 'Keychains'));
        roots.push('/etc/master.passwd');
    }
    roots.push('/etc/shadow', '/etc/sudoers', '/private/etc/shadow', '/private/etc/sudoers');
    return roots;
}

const DENIED_BASENAMES = new Set([
    'id_rsa',
    'id_rsa.pub',
    'id_ed25519',
    'id_ed25519.pub',
    'id_ecdsa',
    'id_dsa',
    'id_ecdsa.pub',
    'id_dsa.pub',
    '.netrc',
]);

/**
 * Local-first explorer may open any user folder except well-known secret stores.
 * Not a workspace jail (product constraint).
 */
export function assertUserFsPathAllowed(rawPath: string, extraDeniedRoots: string[] = []): string {
    const normalized = normalizeAbsolutePath(rawPath);
    for (const root of [...deniedSecretRoots(), ...extraDeniedRoots]) {
        if (isSameOrInside(normalized, root)) {
            throw new Error('Bu yol güvenlik nedeniyle kapalı');
        }
    }
    if (DENIED_BASENAMES.has(path.basename(normalized))) {
        throw new Error('Bu yol güvenlik nedeniyle kapalı');
    }
    return normalized;
}
