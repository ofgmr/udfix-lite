/**
 * Flattens Udfix ordered-list markers into visible text for exporters (e.g. html-to-docx)
 * that ignore CSS ::before counters.
 */

export type ListStyleType = 'default' | 'legal' | 'roman' | 'paren' | 'outline';

export function parseOlStart(ol: HTMLOListElement): number {
    const st = ol.getAttribute('start');
    if (st != null && st !== '') {
        const n = parseInt(st, 10);
        if (Number.isFinite(n)) return Math.max(0, n - 1);
    }
    const style = ol.getAttribute('style') || '';
    const m = style.match(/--start:\s*(-?\d+)/);
    if (m) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n)) return Math.max(0, n);
    }
    return 0;
}

export function listTypeOf(ol: HTMLOListElement): ListStyleType {
    const t = ol.getAttribute('data-list-type');
    if (t === 'legal' || t === 'roman' || t === 'paren' || t === 'outline') return t;
    return 'default';
}

const ROMAN_VALS: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
];

function toRoman(n: number, upper: boolean): string {
    let v = Math.max(1, Math.floor(n));
    let out = '';
    for (const [val, sym] of ROMAN_VALS) {
        while (v >= val) {
            out += sym;
            v -= val;
        }
    }
    return upper ? out : out.toLowerCase();
}

function toAlpha(n: number, upper: boolean): string {
    let v = Math.max(1, Math.floor(n));
    let s = '';
    while (v > 0) {
        v -= 1;
        const ch = String.fromCharCode((v % 26) + (upper ? 65 : 97));
        s = ch + s;
        v = Math.floor(v / 26);
    }
    return s;
}

export function formatDefault(depth: number, n: number): string {
    switch (depth) {
        case 1:
            return `${n}.`;
        case 2:
            return `${toAlpha(n, false)}.`;
        case 3:
            return `${toRoman(n, false)}.`;
        case 4:
            return `(${n})`;
        case 5:
            return `(${toAlpha(n, false)})`;
        default:
            return `${n}.`;
    }
}

export function formatRomanStyle(depth: number, n: number): string {
    switch (depth) {
        case 1:
            return `${toRoman(n, true)}.`;
        case 2:
            return `${toAlpha(n, true)}.`;
        case 3:
            return `${n}.`;
        case 4:
            return `${toAlpha(n, false)}.`;
        case 5:
            return `${toRoman(n, false)}.`;
        default:
            return `${n}.`;
    }
}

export function formatParen(depth: number, n: number): string {
    switch (depth) {
        case 1:
            return `${n})`;
        case 2:
            return `${toAlpha(n, false)})`;
        case 3:
            return `${toRoman(n, false)})`;
        case 4:
            return `[${n}]`;
        case 5:
            return `[${toAlpha(n, false)}]`;
        default:
            return `${n})`;
    }
}

export function formatOutline(depth: number, n: number): string {
    switch (depth) {
        case 1:
            return `${toAlpha(n, true)}.`;
        case 2:
            return `${n}.`;
        case 3:
            return `${toAlpha(n, false)}.`;
        case 4:
            return `${toRoman(n, false)}.`;
        case 5:
            return `${toAlpha(n, false)}${toAlpha(n, false)}.`;
        default:
            return `${n}.`;
    }
}

export function formatLegal(path: number[]): string {
    return `${path.join('.')}.`;
}

export function olDepthFromRoot(ol: HTMLOListElement): number {
    let d = 1;
    let cur: Element | null = ol;
    while (cur?.parentElement) {
        const li: Element | null = cur.parentElement.closest('li');
        if (!li) break;
        const po: Element | null = li.parentElement;
        if (!po || po.tagName !== 'OL') break;
        d += 1;
        cur = po;
    }
    return d;
}
