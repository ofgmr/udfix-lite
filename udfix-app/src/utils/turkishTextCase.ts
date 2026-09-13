/** Türkçe yerel kurallarıyla metin dönüşümleri (i/İ, ı/I, ş, ğ, …). */

export type TurkishCaseMode = 'title' | 'upper' | 'lower';

const WORD_SEP = /(\s+|[.,;:!?()[\]{}'"«»—–\-/\\]+)/;

function titleCaseWordTr(word: string): string {
    if (!word) return word;
    const lower = word.toLocaleLowerCase('tr-TR');
    const first = lower.charAt(0).toLocaleUpperCase('tr-TR');
    return first + lower.slice(1);
}

export function transformTurkishCaseText(text: string, mode: TurkishCaseMode): string {
    if (mode === 'upper') return text.toLocaleUpperCase('tr-TR');
    if (mode === 'lower') return text.toLocaleLowerCase('tr-TR');
    const parts = text.split(WORD_SEP);
    return parts.map((part) => (/^\s+$/.test(part) || /^[.,;:!?()[\]{}'"«»—–\-/\\]+$/.test(part) ? part : titleCaseWordTr(part))).join('');
}
