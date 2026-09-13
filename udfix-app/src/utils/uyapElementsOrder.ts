export type UyapTopLevelElementTag = 'paragraph' | 'table' | 'header' | 'footer' | 'page-break';

export interface UyapOrderedElement {
    tag: UyapTopLevelElementTag;
    /** Tam eleman (`<paragraph>…</paragraph>` vb.). */
    xml: string;
}

const TOP_LEVEL_TAGS = ['paragraph', 'table', 'header', 'footer', 'page-break'] as const;

function isTopLevelOpenTag(slice: string): { tag: UyapTopLevelElementTag; length: number } | null {
    for (const tag of TOP_LEVEL_TAGS) {
        const re = new RegExp(`^<${tag}(\\s|>|/)`, 'i');
        const m = slice.match(re);
        if (m) {
            return { tag, length: m[0].length };
        }
    }
    return null;
}

function findBalancedElementEnd(inner: string, start: number, tag: UyapTopLevelElementTag): number {
    const openRe = new RegExp(`<${tag}(\\s|>)`, 'gi');
    const closeRe = new RegExp(`</${tag}>`, 'gi');
    let depth = 0;
    let pos = start;
    while (pos < inner.length) {
        openRe.lastIndex = pos;
        closeRe.lastIndex = pos;
        const nextOpen = openRe.exec(inner);
        const nextClose = closeRe.exec(inner);
        if (!nextClose && !nextOpen) break;
        const openAt = nextOpen ? nextOpen.index : Number.POSITIVE_INFINITY;
        const closeAt = nextClose ? nextClose.index : Number.POSITIVE_INFINITY;
        if (closeAt < openAt) {
            depth -= 1;
            pos = closeAt + nextClose![0].length;
            if (depth === 0) return pos;
            continue;
        }
        depth += 1;
        pos = openAt + nextOpen![0].length;
    }
    return -1;
}

/**
 * `<elements>` altındaki üst düzey çocukları belgedeki sırayla döner (paragraf/tablo/HF/sayfa sonu).
 */
export function extractUyapElementsInOrder(contentXml: string): UyapOrderedElement[] {
    const openElements = contentXml.match(/<elements\b[^>]*>/i);
    if (!openElements || openElements.index === undefined) return [];
    const innerStart = openElements.index + openElements[0].length;
    const closeElements = contentXml.indexOf('</elements>', innerStart);
    if (closeElements === -1) return [];
    const inner = contentXml.slice(innerStart, closeElements);
    const out: UyapOrderedElement[] = [];
    let i = 0;
    while (i < inner.length) {
        while (i < inner.length && /\s/.test(inner[i])) i += 1;
        if (i >= inner.length) break;
        const open = isTopLevelOpenTag(inner.slice(i));
        if (!open) {
            i += 1;
            continue;
        }
        const end = findBalancedElementEnd(inner, i, open.tag);
        if (end === -1) break;
        out.push({ tag: open.tag, xml: inner.slice(i, end) });
        i = end;
    }
    return out;
}
