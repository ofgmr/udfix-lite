/** Sekme / belge başlığından güvenli dosya adı gövdesi (uzantısız). */
export function sanitizeExportBaseName(name: string | undefined | null): string {
    const raw = (name ?? '').trim();
    // eslint-disable-next-line no-control-regex -- strip control chars from export filenames
    const cleaned = raw.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^\.+$/, '');
    const sliced = cleaned.slice(0, 200);
    return sliced || 'Belge';
}
