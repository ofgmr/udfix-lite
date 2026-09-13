import { ALL_OFFLINE_FONTS } from '../../fonts/offlineFontRegistry';

const FONT_LOOKUP = new Map<string, string>();

for (const entry of ALL_OFFLINE_FONTS) {
    FONT_LOOKUP.set(entry.name.toLowerCase(), entry.name);
    FONT_LOOKUP.set(entry.stack.toLowerCase(), entry.name);
    const first = entry.stack.split(',')[0]?.trim().replace(/^["']|["']$/g, '');
    if (first) FONT_LOOKUP.set(first.toLowerCase(), entry.name);
}

/** Map CSS font-family stacks to Word-friendly primary family names. */
export function mapFontFamilyForDocx(raw: string | undefined, fallback: string): string {
    if (!raw?.trim()) return fallback;
    const first = raw.split(',')[0]?.trim().replace(/^["']|["']$/g, '') ?? '';
    if (!first) return fallback;
    return FONT_LOOKUP.get(first.toLowerCase()) ?? first;
}
