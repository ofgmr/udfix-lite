import { isEypTechnicalPath } from './eypMetadata';
import { canPreviewZipEntry } from './zipEntrySafety';
import { isUniversalViewerSupported } from './viewerSupportedFormats';

export interface ArchiveEntryLike {
    path: string;
    name: string;
    isDir: boolean;
}

function normalizePath(path: string): string {
    return path.replace(/\\/g, '/');
}

function dirPrefix(path: string): string {
    const norm = normalizePath(path);
    return norm.endsWith('/') ? norm : `${norm}/`;
}

function isFileUnderDir(filePath: string, dirPath: string): boolean {
    return normalizePath(filePath).startsWith(dirPrefix(dirPath));
}

export function canViewArchiveEntry(
    entryPath: string,
    fileName: string,
    options?: { eyp?: boolean }
): boolean {
    if (!canPreviewZipEntry(entryPath, fileName)) return false;
    if (!isUniversalViewerSupported(fileName)) return false;
    if (options?.eyp && isEypTechnicalPath(entryPath)) return false;
    return true;
}

/** Keep only folders that contain viewable files and viewable files themselves. */
export function filterViewableArchiveEntries<T extends ArchiveEntryLike>(
    entries: T[],
    options?: { eyp?: boolean }
): T[] {
    const viewableFiles = entries.filter(
        (entry) => !entry.isDir && canViewArchiveEntry(entry.path, entry.name, options)
    );

    return entries.filter((entry) => {
        if (!entry.isDir) {
            return viewableFiles.some((file) => file.path === entry.path);
        }
        return viewableFiles.some((file) => isFileUnderDir(file.path, entry.path));
    });
}
