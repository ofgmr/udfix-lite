import path from 'path';
import {
    isMacViewerFilePath,
    isUdfFilePath,
    resolveMacOpenExtension,
} from './macViewerFileTypes';

export { isMacViewerFilePath, isUdfFilePath, resolveMacOpenExtension };

export type MacOpenableKind = 'udf' | 'viewer';

export type MacOpenablePath = {
    kind: MacOpenableKind;
    path: string;
};

export function classifyMacOpenPath(filePath: string): MacOpenableKind | null {
    if (isUdfFilePath(filePath)) return 'udf';
    if (isMacViewerFilePath(filePath)) return 'viewer';
    return null;
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

export function collectOpenablePathsFromArgv(argv: string[]): MacOpenablePath[] {
    const out: MacOpenablePath[] = [];
    for (const arg of argv) {
        if (arg.startsWith('-')) continue;
        const normalized = normalizeOpenPath(arg);
        if (!normalized) continue;
        const kind = classifyMacOpenPath(normalized);
        if (!kind) continue;
        if (out.some((item) => item.path === normalized)) continue;
        out.push({ kind, path: normalized });
    }
    return out;
}

export function collectUdfPathsFromArgv(argv: string[]): string[] {
    return collectOpenablePathsFromArgv(argv)
        .filter((item) => item.kind === 'udf')
        .map((item) => item.path);
}
