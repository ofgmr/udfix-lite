/** Turkish Title Case for Katır labels. Does not rewrite file numbers (`2026/26456`). */

const FILE_NUMBER_RE = /^\d{2,4}\/\d+(-\d+)?$/;
const KEEP_ACRONYM = new Set(['BAM', 'AYM', 'CBS', 'UYAP', 'VDDK']);

function titleCaseToken(token: string): string {
    if (!token) return token;
    if (FILE_NUMBER_RE.test(token)) return token;
    if (KEEP_ACRONYM.has(token)) return token;
    let out = '';
    let cap = true;
    for (const ch of token) {
        if (cap && /\S/.test(ch) && ch !== '.' && ch !== '(' && ch !== ')') {
            out += ch.toLocaleLowerCase('tr-TR').toLocaleUpperCase('tr-TR');
            cap = false;
            continue;
        }
        out += cap ? ch : ch.toLocaleLowerCase('tr-TR');
        if (ch === '(' || ch === '-' || ch === '/') cap = true;
    }
    return out;
}

export function toTurkishTitleCase(raw: unknown): string {
    const text = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!text) return '';
    if (FILE_NUMBER_RE.test(text)) return text;
    return text
        .split(/(\s+)/)
        .map((part) => (/^\s+$/.test(part) ? part : titleCaseToken(part)))
        .join('');
}

export function displayCourtName(raw: unknown, empty = 'Belirtilmemiş'): string {
    const titled = toTurkishTitleCase(raw);
    return titled || empty;
}
