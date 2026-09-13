import type { EditorTypographyPayload } from './editorTypography';

export type BlockStyleKey = 'p' | 'title' | 'subtitle' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

/** Kayıtlı varsayılan yokken satır altı için (≈ gövde / başlık ölçeği). */
const FALLBACK_SPEC_LINE: Record<BlockStyleKey, string> = {
    p: 'Inter · 11pt',
    title: 'Inter · 26pt',
    subtitle: 'Inter · 15pt',
    h1: 'Inter · 23pt',
    h2: 'Inter · 18pt',
    h3: 'Inter · 15pt',
    h4: 'Inter · 14pt',
    h5: 'Inter · 12pt',
    h6: 'Inter · 11pt',
};

function firstFontFromStack(stack: string | null | undefined): string | null {
    if (stack == null || String(stack).trim() === '') return null;
    const first = String(stack)
        .split(',')[0]
        .trim()
        .replace(/^["']|["']$/g, '');
    return first || null;
}

const ALIGN_ABBR: Record<string, string> = {
    left: '◀',
    center: '◆',
    right: '▶',
    justify: '≡',
};

/** Kayıtlı tipografi özet satırı: `Inter · 12pt · ◀ · BIU` */
export function formatTypographySpecLine(p: EditorTypographyPayload | null | undefined): string | null {
    if (!p) return null;
    const ff = firstFontFromStack(p.fontFamily ?? undefined);
    const fs = p.fontSize?.trim();
    let base: string | null = null;
    if (ff && fs) base = `${ff} · ${fs}`;
    else if (fs) base = fs;
    else if (ff) base = ff;

    const bits: string[] = [];
    if (base) bits.push(base);
    const ta = p.textAlign?.trim();
    if (ta && ALIGN_ABBR[ta]) bits.push(ALIGN_ABBR[ta]);
    const lh = p.lineHeight?.trim();
    if (lh) bits.push(`↕${lh}`);
    const marks: string[] = [];
    if (p.bold === true) marks.push('B');
    if (p.italic === true) marks.push('I');
    if (p.underline === true) marks.push('U');
    if (marks.length) bits.push(marks.join(''));

    if (bits.length === 0) return null;
    return bits.join(' · ');
}

export function hasBlockStylePayload(p: EditorTypographyPayload | null | undefined): boolean {
    if (!p) return false;
    const strFields = [p.fontFamily, p.fontSize, p.lineHeight, p.marginTop, p.marginBottom, p.textAlign, p.color];
    if (strFields.some((v) => v != null && String(v).trim() !== '')) return true;
    if (p.bold === true || p.italic === true || p.underline === true) return true;
    return false;
}

/** Menü satırı: kayıtlı payload veya fallback. */
export function getParagraphStyleSpecLine(key: BlockStyleKey, saved?: EditorTypographyPayload | null): string {
    const fromSaved = formatTypographySpecLine(saved ?? undefined);
    if (fromSaved) return fromSaved;
    return FALLBACK_SPEC_LINE[key];
}

/** Tetikleyicide: `Inter · 11pt` → `Inter` */
export function firstFontNameFromSpecLine(specLine: string): string {
    const part = specLine.split('·')[0]?.trim();
    return part || 'Inter';
}

/** Kompakt etiket: `H1-14`, `N-11` */
export function formatBlockStyleCompactTag(key: BlockStyleKey, specLine: string): string {
    const m = specLine.match(/(\d+)\s*pt/i);
    const pt = m ? m[1] : specLine.match(/(\d+)/)?.[1] ?? '?';
    if (key === 'p') return `N-${pt}`;
    if (key === 'title') return `B/T-${pt}`;
    if (key === 'subtitle') return `A/S-${pt}`;
    return `${key.toUpperCase()}-${pt}`;
}
