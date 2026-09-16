import path from 'path';

/** Navigable HTML/SVG/JS must not ride `nomai-file:` (CSP or script execution). */
const BLOCKED_NOMAI_FILE_EXTENSIONS = new Set([
    'html',
    'htm',
    'shtml',
    'xhtml',
    'svg',
    'js',
    'mjs',
    'cjs',
    'hta',
]);

export function isNomaiFileServingAllowed(filePath: string): boolean {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    if (!ext) return true;
    return !BLOCKED_NOMAI_FILE_EXTENSIONS.has(ext);
}
