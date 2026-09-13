/** Resolve viewer extension; handles compound names like `.eyp.zip`. Ignores Turkish titles used as fake extensions. */
export function resolveViewerExtension(fileName: string): string {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.eyp.zip') || lower.endsWith('.eyp')) return 'eyp';
    const base = (fileName.split(/[\\/?#]/).pop() || fileName).split('?')[0];
    const dot = base.lastIndexOf('.');
    if (dot <= 0) return '';
    const ext = base.slice(dot + 1).toLowerCase();
    if (!/^[a-z0-9]{1,8}$/.test(ext)) return '';
    return ext;
}

export function isArchiveViewerExtension(extension: string): boolean {
    return extension === 'zip' || extension === 'jar' || extension === 'eyp';
}
