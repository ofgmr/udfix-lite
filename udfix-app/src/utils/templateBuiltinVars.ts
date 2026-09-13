/** Şablon ekleme anında düz metne çözülen yerleşik `{{…}}` anahtarları. */
export function resolveTemplateBuiltin(key: string): string | null {
    const k = key.trim().toLowerCase();
    const now = new Date();

    switch (k) {
        case 'date':
        case 'tarih':
        case 'today':
        case 'bugün':
        case 'bugun':
            return now.toLocaleDateString('tr-TR');
        case 'datetime':
        case 'tarihsaat':
            return now.toLocaleString('tr-TR');
        case 'time':
        case 'saat':
            return now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        case 'year':
        case 'yıl':
        case 'yil':
            return String(now.getFullYear());
        default:
            return null;
    }
}

export function isTemplateBuiltinKey(key: string): boolean {
    return resolveTemplateBuiltin(key) != null;
}
