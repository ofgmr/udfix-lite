/**
 * Shortcut reference rows for the macOS "Kısayollar" menu (display only).
 * Keep in sync with src/shortcuts/registry.ts — accelerators are built at menu render time.
 */

export type ShortcutMenuRow = {
    actionTr: string;
    mod?: boolean;
    shift?: boolean;
    alt?: boolean;
    key: string;
};

export type ShortcutMenuGroup = {
    label: string;
    rows: ShortcutMenuRow[];
};

export const SHORTCUT_MENU_GROUPS: ShortcutMenuGroup[] = [
    {
        label: 'Uygulama',
        rows: [
            { actionTr: 'Komut paleti (arama)', mod: true, key: 'K' },
            { actionTr: 'Komut paleti — şablonlar', mod: true, shift: true, key: 'S' },
            { actionTr: 'Komut paleti — Katır', mod: true, shift: true, key: 'K' },
            { actionTr: 'Komut paleti — Yapılacaklar', mod: true, shift: true, key: 'T' },
            { actionTr: 'Yeni belge sekmesi', mod: true, key: 'N' },
            { actionTr: 'Yeni not', mod: true, shift: true, key: 'N' },
            { actionTr: 'Aktif sekmeyi kapat', mod: true, key: 'W' },
            { actionTr: 'Dosya gezgini aç/kapat', mod: true, shift: true, key: 'E' },
            { actionTr: 'Görüntüleyiciye odaklan/aç', mod: true, shift: true, key: 'V' },
            { actionTr: 'Yorumlar paneli', mod: true, shift: true, key: 'C' },
            { actionTr: 'Zen modu', mod: true, shift: true, key: 'M' },
            { actionTr: 'UDF kaydet', mod: true, key: 'S' },
            { actionTr: 'UDF farklı kaydet', mod: true, alt: true, key: 'S' },
            { actionTr: 'Dosyalar araması', mod: true, alt: true, key: '1' },
            { actionTr: 'Taraflar araması', mod: true, alt: true, key: '2' },
            { actionTr: 'Bilgi Bankası araması', mod: true, alt: true, key: '3' },
            { actionTr: 'Notlar araması', mod: true, alt: true, key: '4' },
            { actionTr: 'Takvim paneli', mod: true, alt: true, key: '5' },
            { actionTr: 'Mevzuat araması', mod: true, alt: true, key: '6' },
        ],
    },
    {
        label: 'Belge editörü',
        rows: [
            { actionTr: 'Belgede bul', mod: true, key: 'F' },
            { actionTr: 'Sürüm geçmişi', mod: true, shift: true, key: 'H' },
            { actionTr: 'Geri al', mod: true, key: 'Z' },
            { actionTr: 'Yinele', mod: true, shift: true, key: 'Z' },
            { actionTr: 'Kalın', mod: true, key: 'B' },
            { actionTr: 'İtalik', mod: true, key: 'I' },
            { actionTr: 'Altı çizili', mod: true, key: 'U' },
            { actionTr: 'Hedef stile yapıştır', mod: true, shift: true, key: 'V' },
            { actionTr: 'Sayfa sonu', mod: true, key: 'Enter' },
            { actionTr: 'Dipnot', mod: true, shift: true, key: 'F' },
            { actionTr: 'Paragraf varsayılanını kaydet (N)', mod: true, alt: true, key: '0' },
            { actionTr: 'Başlık 1 varsayılanını kaydet', mod: true, alt: true, key: '1' },
            { actionTr: 'Başlık 2 varsayılanını kaydet', mod: true, alt: true, key: '2' },
            { actionTr: 'Başlık 3 varsayılanını kaydet', mod: true, alt: true, key: '3' },
            { actionTr: 'Başlık 4 varsayılanını kaydet', mod: true, alt: true, key: '4' },
            { actionTr: 'Başlık 5 varsayılanını kaydet', mod: true, alt: true, key: '5' },
            { actionTr: 'Başlık 6 varsayılanını kaydet', mod: true, alt: true, key: '6' },
            { actionTr: 'Belge başlığı varsayılanını kaydet', mod: true, alt: true, key: '7' },
            { actionTr: 'Alt başlık varsayılanını kaydet', mod: true, alt: true, key: '8' },
            { actionTr: 'Girinti / liste içe', key: 'Tab' },
            { actionTr: 'Girinti azalt', shift: true, key: 'Tab' },
        ],
    },
    {
        label: 'Görüntüleyici',
        rows: [
            { actionTr: 'Ara', mod: true, key: 'F' },
            { actionTr: 'Aramayı kapat', key: 'Escape' },
        ],
    },
];

export function rowToElectronAccelerator(row: ShortcutMenuRow): string | undefined {
    const parts: string[] = [];
    if (row.mod) parts.push('Cmd');
    if (row.shift) parts.push('Shift');
    if (row.alt) parts.push('Alt');
    const key = row.key.length === 1 ? row.key.toUpperCase() : row.key;
    if (parts.length === 0 && key === 'Tab') return 'Tab';
    if (parts.length === 0 && key === 'Escape') return 'Esc';
    parts.push(key);
    return parts.join('+');
}
