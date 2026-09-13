import path from 'path';

export function isUdfFilePath(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.udf';
}

export function normalizeOpenPath(rawPath: string): string | null {
    if (typeof rawPath !== 'string' || !rawPath.trim()) return null;
    const trimmed = rawPath.trim();
    if (!path.isAbsolute(trimmed)) return null;
    try {
        return path.resolve(trimmed);
    } catch {
        return null;
    }
}

export function collectUdfPathsFromArgv(argv: string[]): string[] {
    const out: string[] = [];
    for (const arg of argv) {
        if (arg.startsWith('-')) continue;
        const normalized = normalizeOpenPath(arg);
        if (normalized && isUdfFilePath(normalized) && !out.includes(normalized)) {
            out.push(normalized);
        }
    }
    return out;
}
