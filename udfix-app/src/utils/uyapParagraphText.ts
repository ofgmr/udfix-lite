import type { UyapRenderedSpan } from './uyapFieldResolver';

/** UYAP gövde sekmesi (~72 pt ilk durak) → CSS `tab-size`. */
export const UYAP_DEFAULT_IMPORT_TAB_SIZE_PX = 72 * (96 / 72) * (4 / 3);

/** Editörde blok arası boşluk (`nomaiUyapBlockGap`); CDATA sonu ayrıca `nomaiUyapParagraphEnd`. */
export const UYAP_IMPORT_BLOCK_GAP_MARGIN = '0.65em';

export type UyapParagraphEnd = '\n' | '\n\n';

export interface UyapParagraphTextFinalize {
    spans: UyapRenderedSpan[];
    /** CDATA paragraf sonunda `\n` / `\n\n` vardı → UYAP’taki blok aralığı. */
    blockGapAfter: boolean;
    /** UDF export’ta paragraf kapanışı (CDATA); yoksa export tek `\n` yazar. */
    paragraphEnd: UyapParagraphEnd | null;
}

/** CDATA sonundaki satır sonlarını say (strip öncesi). */
export function detectUyapParagraphEnd(raw: string): UyapParagraphEnd | null {
    const match = raw.match(/\n+$/);
    if (!match) return null;
    return match[0].length >= 2 ? '\n\n' : '\n';
}

/**
 * UYAP CDATA’da paragraf sonu `\n` / `\n\n` akış ayırıcıdır; TipTap’te her `<paragraph>` zaten ayrı blok.
 * Metinde bırakılırsa çift boşluk olur; kırpıp yalnızca editörde `nomaiUyapBlockGap` ile tek satır boşluk verilir.
 */
export function finalizeUyapParagraphText(spans: UyapRenderedSpan[]): UyapParagraphTextFinalize {
    const raw = spans.map((s) => s.text ?? '').join('');
    const paragraphEnd = detectUyapParagraphEnd(raw);
    const blockGapAfter = paragraphEnd != null;

    if (spans.length === 0) {
        return { spans: [], blockGapAfter: false, paragraphEnd: null };
    }

    const out = spans.map((s) => ({ ...s, text: s.text ?? '' }));
    for (let i = out.length - 1; i >= 0; i -= 1) {
        if (!/\n+$/.test(out[i].text)) break;
        out[i] = { ...out[i], text: out[i].text.replace(/\n+$/, '') };
    }

    const trimmed = out.filter((s) => s.html || s.text.length > 0);
    return {
        spans: trimmed,
        blockGapAfter: blockGapAfter && trimmed.length > 0,
        paragraphEnd: trimmed.length > 0 ? paragraphEnd : null,
    };
}

export function uyapParagraphPlainText(spans: UyapRenderedSpan[]): string {
    return finalizeUyapParagraphText(spans)
        .spans.map((s) => s.text)
        .join('');
}

export function uyapParagraphHasTabCharacters(spans: UyapRenderedSpan[]): boolean {
    return uyapParagraphPlainText(spans).includes('\t');
}
