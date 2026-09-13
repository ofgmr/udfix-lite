export interface EypMetadata {
    konu?: string;
    belgeNo?: string;
    olusturan?: string;
    ustYaziFileName?: string;
    /** Lowercase lookup key (GUID, filename stem, etc.) → display label */
    ekLabels: Map<string, string>;
}

const EYP_TECHNICAL_TOP_FOLDERS = new Set([
    '_rels',
    'imzalar',
    'muhur',
    'muhurler',
    'nihaiozet',
    'nihaiustveri',
    'paketozeti',
    'package',
    'docprops',
    'belgehedef',
    'ustveri',
]);

function regexText(xml: string, tag: string): string | undefined {
    const re = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, 'i');
    const match = xml.match(re);
    const text = match?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text || undefined;
}

function regexAttr(xml: string, tag: string, attr: string): string | undefined {
    const re = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?\\s${attr}="([^"]+)"`, 'i');
    return xml.match(re)?.[1]?.trim();
}

function registerEkLabel(map: Map<string, string>, key: string | undefined, label: string | undefined) {
    if (!key || !label) return;
    map.set(key.toLowerCase(), label);
}

function parseEkBlocks(xml: string, ekLabels: Map<string, string>) {
    const blockRe = /<(?:[\w-]+:)?Ek\b[\s\S]*?<\/(?:[\w-]+:)?Ek>/gi;
    for (const block of xml.match(blockRe) ?? []) {
        const ad = regexText(block, 'Ad') || regexText(block, 'DosyaAdi');
        const dosyaAdi = regexText(block, 'DosyaAdi');
        const ozId = regexText(block, 'OzId');
        const idValue = regexAttr(block, 'Id', 'Value');

        registerEkLabel(ekLabels, ozId, ad);
        registerEkLabel(ekLabels, idValue, ad);
        if (dosyaAdi) {
            registerEkLabel(ekLabels, dosyaAdi.replace(/\.[^.]+$/, ''), ad);
            registerEkLabel(ekLabels, dosyaAdi, ad);
        }
    }
}

function stripEkBlocks(xml: string): string {
    return xml.replace(/<(?:[\w-]+:)?Ekler\b[\s\S]*?<\/(?:[\w-]+:)?Ekler>/gi, '');
}

export function parseEypUstveri(xml: string): EypMetadata {
    const meta: EypMetadata = { ekLabels: new Map() };

    try {
        meta.konu = regexText(xml, 'Konu');
        meta.belgeNo = regexText(xml, 'BelgeNo');
        meta.ustYaziFileName = regexText(stripEkBlocks(xml), 'DosyaAdi');
        meta.olusturan = regexText(xml, 'Adi') || undefined;
        parseEkBlocks(xml, meta.ekLabels);
    } catch {
        /* keep partial/empty metadata */
    }

    return meta;
}

export function isEypTechnicalPath(path: string): boolean {
    const normalized = path.replace(/\\/g, '/').replace(/\/$/, '');
    if (normalized === '[Content_Types].xml') return true;
    const top = normalized.split('/').filter(Boolean)[0]?.toLowerCase() ?? '';
    return EYP_TECHNICAL_TOP_FOLDERS.has(top);
}

export function resolveEypEntryLabel(path: string, name: string, meta: EypMetadata | null): string {
    const normPath = path.replace(/\\/g, '/');
    if (/^UstYazi\//i.test(normPath) && /\.pdf$/i.test(name)) return 'Üst Yazı';

    if (meta) {
        const stem = name.replace(/\.[^.]+$/, '').toLowerCase();
        const direct = meta.ekLabels.get(stem) || meta.ekLabels.get(name.toLowerCase());
        if (direct) return direct;

        for (const [key, label] of meta.ekLabels) {
            if (normPath.toLowerCase().includes(key)) return label;
        }
    }

    return name;
}
