/**
 * Header/footer HTML → UYAP `content.xml` paragraf segmentleri (metin biçimi + görseller).
 * Renderer’da çalışır (`document`, `Image`, `canvas`).
 */

/** Üst / alt bantta görünür yükseklik (~px marj bandına denk pt). */
export const HF_EXPORT_IMG_MAX_HEIGHT_PT = 30;
export const HF_EXPORT_IMG_MAX_WIDTH_PT = 200;

function escapeXmlAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

/** İlk font ailesi (XML kaçışı emit aşamasında). */
function firstFontFamily(cssStack: string): string {
    return String(cssStack).split(',')[0].trim().replace(/^["']|["']$/g, '');
}

function stripUnitToUyapSize(fontSize: string): string {
    const raw = String(fontSize).trim();
    const m = raw.match(/^([\d.]+)\s*(pt|px)?$/i);
    if (!m) return raw.replace(/pt/gi, '').replace(/px/gi, '').trim();
    const n = parseFloat(m[1]);
    if (!Number.isFinite(n) || n <= 0) return '11';
    const unit = (m[2] || 'pt').toLowerCase();
    if (unit === 'px') return String(Math.round((n * 72) / 96));
    return String(Math.round(n));
}

/** CSS renk → UYAP `foreground` (Java ARGB imzalı tam sayı dizesi). */
export function cssColorToUyapForeground(color: string): string | null {
    const c = color.trim();
    if (!c) return null;
    if (/^-?\d+$/.test(c)) return c;

    if (c.startsWith('#')) {
        let hex = c.slice(1);
        if (hex.length === 3) {
            hex = hex
                .split('')
                .map((ch) => ch + ch)
                .join('');
        }
        if (hex.length !== 6) return null;
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        if (![r, g, b].every((n) => Number.isFinite(n))) return null;
        const n = (255 << 24) | (r << 16) | (g << 8) | b;
        return String(n | 0);
    }

    const m = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (!m) return null;
    const r = Math.round(Number(m[1]));
    const g = Math.round(Number(m[2]));
    const b = Math.round(Number(m[3]));
    if (![r, g, b].every((n) => n >= 0 && n <= 255)) return null;
    const n = (255 << 24) | (r << 16) | (g << 8) | b;
    return String(n | 0);
}

export interface HfContentMark {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strike?: boolean;
    superscript?: boolean;
    subscript?: boolean;
    foreground?: string;
    background?: string;
    family?: string;
    size?: string;
}

export const HF_EXPORT_DEFAULT_FONT_SIZE = '11';

export type HfExportSegment =
    | { type: 'image'; base64: string; widthPt: string; heightPt: string }
    | { type: 'text'; text: string; mark: HfContentMark };

const defaultMark = (): HfContentMark => ({
    family: 'Times New Roman',
    size: HF_EXPORT_DEFAULT_FONT_SIZE,
});

function markSig(m: HfContentMark): string {
    return JSON.stringify({
        b: !!m.bold,
        i: !!m.italic,
        u: !!m.underline,
        s: !!m.strike,
        sup: !!m.superscript,
        sub: !!m.subscript,
        fg: m.foreground ?? '',
        bg: m.background ?? '',
        ff: m.family ?? '',
        sz: m.size ?? '',
    });
}

function parseInlineStyle(style: string): Record<string, string> {
    const parts: Record<string, string> = {};
    for (const chunk of style.split(';')) {
        const i = chunk.indexOf(':');
        if (i === -1) continue;
        const k = chunk.slice(0, i).trim().toLowerCase();
        const v = chunk.slice(i + 1).trim();
        parts[k] = v;
    }
    return parts;
}

function mergeMark(base: HfContentMark, el: Element): HfContentMark {
    const m: HfContentMark = { ...base };
    const tag = el.tagName.toUpperCase();
    if (tag === 'MARK') {
        const st = el.getAttribute('style') || '';
        const parts = parseInlineStyle(st);
        const bgc = parts['background-color'];
        if (bgc) {
            const low = bgc.toLowerCase();
            if (low.includes('yellow') || low.includes('#ffff') || low.includes('rgb(255, 255, 0)')) {
                m.background = '-256';
            }
        } else {
            m.background = '-256';
        }
    }
    if (tag === 'STRONG' || tag === 'B') m.bold = true;
    if (tag === 'EM' || tag === 'I') m.italic = true;
    if (tag === 'U') m.underline = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') m.strike = true;
    if (tag === 'SUP') m.superscript = true;
    if (tag === 'SUB') m.subscript = true;

    if (tag === 'SPAN' || tag === 'FONT') {
        const st = el.getAttribute('style');
        if (st) {
            const parts = parseInlineStyle(st);
            const fw = parts['font-weight'];
            if (fw && (fw === 'bold' || fw === '700' || fw === '600')) m.bold = true;
            const fs = parts['font-style'];
            if (fs === 'italic' || fs === 'oblique') m.italic = true;
            const td = (parts['text-decoration'] || '').toLowerCase();
            if (td.includes('underline')) m.underline = true;
            if (td.includes('line-through')) m.strike = true;
            if (parts['color']) {
                const fg = cssColorToUyapForeground(parts['color']);
                if (fg) m.foreground = fg;
            }
            if (parts['font-family']) {
                const fam = firstFontFamily(parts['font-family']);
                if (fam) m.family = fam;
            }
            if (parts['font-size']) {
                const sz = stripUnitToUyapSize(parts['font-size']);
                if (sz) m.size = sz;
            }
            const bgc = parts['background-color'];
            if (bgc) {
                const low = bgc.toLowerCase();
                if (low.includes('yellow') || low.includes('#ffff') || low.includes('rgb(255, 255, 0)')) {
                    m.background = '-256';
                }
            }
        }
        if (tag === 'FONT') {
            const col = el.getAttribute('color');
            if (col) {
                const fg = cssColorToUyapForeground(col.startsWith('#') ? col : `#${col}`);
                if (fg) m.foreground = fg;
            }
            const face = el.getAttribute('face');
            if (face) {
                const fam = firstFontFamily(face);
                if (fam) m.family = fam;
            }
        }
    }
    return m;
}

function pushText(segments: HfExportSegment[], text: string, mark: HfContentMark): void {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last && last.type === 'text' && markSig(last.mark) === markSig(mark)) {
        last.text += text;
        return;
    }
    segments.push({ type: 'text', text, mark: { ...mark } });
}

function walkInline(node: Node, mark: HfContentMark, segments: HfExportSegment[]): void {
    if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent ?? '';
        if (t) pushText(segments, t, mark);
        return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toUpperCase();

    if (tag === 'IMG') {
        const src = el.getAttribute('src') || '';
        const m = src.match(/^data:image\/[^;]+;base64,(.+)$/i);
        if (!m) return;
        const wm = el.getAttribute('width');
        const hm = el.getAttribute('height');
        const widthPt = wm && /^[\d.]+$/.test(wm) ? wm : '48.0';
        const heightPt = hm && /^[\d.]+$/.test(hm) ? hm : '18.0';
        segments.push({ type: 'image', base64: m[1], widthPt, heightPt });
        return;
    }

    if (tag === 'BR') {
        pushText(segments, '\n', mark);
        return;
    }

    if (tag === 'P' || tag === 'DIV' || tag === 'LI') {
        const next = mergeMark(mark, el);
        for (const ch of Array.from(el.childNodes)) {
            walkInline(ch, next, segments);
        }
        return;
    }

    const next = mergeMark(mark, el);
    for (const ch of Array.from(el.childNodes)) {
        walkInline(ch, next, segments);
    }
}

function flattenParagraphTags(html: string): string {
    let s = html.trim();
    if (!s) return '';
    s = s.replace(/<\/p>\s*<p\b[^>]*>/gi, '<br>');
    s = s.replace(/^\s*<p\b[^>]*>/i, '');
    s = s.replace(/<\/p>\s*$/i, '');
    return s;
}

/**
 * HF mini editöründen gelen HTML’i UYAP segment listesine çevirir (görseller + biçimli metin).
 * `document` yoksa yalnızca düz metin + img src regex (biçim kaybı).
 */
export function parseHfHtmlToExportSegments(html: string): HfExportSegment[] {
    const trimmed = (html || '').trim();
    if (!trimmed) return [];

    if (typeof document === 'undefined') {
        const segments: HfExportSegment[] = [];
        const re = /<img\b([\s\S]*?)>/gi;
        let last = 0;
        let m: RegExpExecArray | null;
        const plainFrom = (chunk: string) => {
            const t = chunk.replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ');
            if (t) segments.push({ type: 'text', text: t, mark: defaultMark() });
        };
        while ((m = re.exec(trimmed)) !== null) {
            plainFrom(trimmed.slice(last, m.index));
            const tag = m[0];
            const inner = m[1];
            const srcM = inner.match(/\bsrc\s*=\s*["'](data:image\/[^;]+;base64,([^"']+))["']/i);
            if (srcM) {
                const wm = tag.match(/\bwidth\s*=\s*["']?([\d.]+)/i);
                const hm = tag.match(/\bheight\s*=\s*["']?([\d.]+)/i);
                segments.push({
                    type: 'image',
                    base64: srcM[2],
                    widthPt: wm?.[1] ?? '48.0',
                    heightPt: hm?.[1] ?? '18.0',
                });
            }
            last = m.index + m[0].length;
        }
        plainFrom(trimmed.slice(last));
        return segments;
    }

    const wrap = document.createElement('div');
    wrap.innerHTML = flattenParagraphTags(trimmed);
    const segments: HfExportSegment[] = [];
    const base = defaultMark();

    for (const child of Array.from(wrap.childNodes)) {
        walkInline(child, base, segments);
    }

    while (segments.length && segments[0].type === 'text' && /^\s+$/.test(segments[0].text)) {
        segments.shift();
    }
    while (segments.length) {
        const last = segments[segments.length - 1];
        if (last.type !== 'text' || !/^\s+$/.test(last.text)) break;
        segments.pop();
    }

    return segments;
}

/** `<p>`, `<div>`, `<br>` ile ayrılmış HF blok satırları (DOM gerektirmez). */
function splitHfHtmlBlockLines(html: string): string[] {
    let s = (html || '').trim();
    if (!s) return [];
    s = s.replace(/<\/p>\s*<p\b[^>]*>/gi, '\n');
    s = s.replace(/<\/div>\s*<div\b[^>]*>/gi, '\n');
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/^\s*<p\b[^>]*>/i, '');
    s = s.replace(/<\/p>\s*$/i, '');
    s = s.replace(/^\s*<div\b[^>]*>/i, '');
    s = s.replace(/<\/div>\s*$/i, '');
    return s
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
}

/**
 * HF sütun HTML'ini satır satır segment listelerine böler.
 * UYAP TabSet yalnızca tek satırda geçerli; `\n` sonrası sütun hizası kaybolur.
 */
export function parseHfHtmlToLineSegmentRows(html: string): HfExportSegment[][] {
    const blocks = splitHfHtmlBlockLines(html);
    if (!blocks.length) return [];

    const rows: HfExportSegment[][] = [];
    for (const block of blocks) {
        const segments = parseHfHtmlToExportSegments(block);
        if (!segments.length) continue;

        const inlineRows: HfExportSegment[][] = [[]];
        for (const seg of segments) {
            if (seg.type === 'image') {
                inlineRows[inlineRows.length - 1].push(seg);
                continue;
            }
            const parts = seg.text.split('\n');
            for (let i = 0; i < parts.length; i++) {
                if (i > 0) inlineRows.push([]);
                if (parts[i].length > 0) {
                    inlineRows[inlineRows.length - 1].push({ type: 'text', text: parts[i], mark: seg.mark });
                }
            }
        }
        for (const row of inlineRows) {
            if (row.length > 0) rows.push(row);
        }
    }
    return rows;
}

export function estimateMaxCharsForHfColumn(columnWidthPt: number, fontSizePt: number): number {
    const fs = Math.max(8, fontSizePt);
    // UYAP sütun genişliği CSS tahmininden dar; güvenlik payı ile taşmayı önle.
    return Math.max(6, Math.floor((columnWidthPt * 0.82) / (fs * 0.62)));
}

/**
 * UYAP satır içi sarma tab duraklarını sıfırlar; uzun metni kelime sınırında
 * ayrı export satırlarına böler (adres taşması sol sütuna kaymasın).
 */
export function wrapHfLineSegmentRows(rows: HfExportSegment[][], maxChars: number): HfExportSegment[][] {
    const out: HfExportSegment[][] = [];
    for (const row of rows) {
        if (row.some((s) => s.type === 'image')) {
            out.push(row);
            continue;
        }
        const textSegs = row.filter((s): s is Extract<HfExportSegment, { type: 'text' }> => s.type === 'text');
        const fullText = textSegs.map((s) => s.text).join('');
        if (!fullText.trim()) continue;
        const mark = textSegs[0]?.mark ?? defaultMark();
        if (fullText.length <= maxChars) {
            out.push(row);
            continue;
        }
        let remaining = fullText.trim();
        while (remaining.length > maxChars) {
            let breakAt = remaining.lastIndexOf(' ', maxChars);
            if (breakAt <= 0) breakAt = maxChars;
            const piece = remaining.slice(0, breakAt).trimEnd();
            if (piece) out.push([{ type: 'text', text: piece, mark: { ...mark } }]);
            remaining = remaining.slice(breakAt).trimStart();
        }
        if (remaining) out.push([{ type: 'text', text: remaining, mark: { ...mark } }]);
    }
    return out;
}

function parseImgDimsPtFromTag(tag: string): { w: number; h: number } | null {
    const wm = tag.match(/\bwidth\s*=\s*["']?([\d.]+)/i);
    const hm = tag.match(/\bheight\s*=\s*["']?([\d.]+)/i);
    if (!wm || !hm) return null;
    const w = parseFloat(wm[1]);
    const h = parseFloat(hm[1]);
    if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
    return { w, h };
}

function fitPt(w: number, h: number, maxW: number, maxH: number): { w: number; h: number } {
    if (w <= 0 || h <= 0) return { w: maxW, h: maxH };
    const r = Math.min(maxW / w, maxH / h, 1);
    return {
        w: Math.max(8, Math.round(w * r * 10) / 10),
        h: Math.max(6, Math.round(h * r * 10) / 10),
    };
}

/**
 * `data:` img’leri canvas ile küçültür; `width` / `height` özniteliklerini pt yazar (UYAP `<image width height>`).
 */
export async function scaleDataUrlsInHfHtml(html: string, _slot: 'header' | 'footer'): Promise<string> {
    if (!html?.trim() || typeof document === 'undefined') return html;
    const maxH = HF_EXPORT_IMG_MAX_HEIGHT_PT;
    const maxW = HF_EXPORT_IMG_MAX_WIDTH_PT;

    const div = document.createElement('div');
    div.innerHTML = html;
    const imgs = Array.from(div.querySelectorAll<HTMLImageElement>('img[src^="data:"]'));
    if (!imgs.length) return html;

    await Promise.all(
        imgs.map(
            (img) =>
                new Promise<void>((resolve) => {
                    const src = img.getAttribute('src') || '';
                    const m = src.match(/^data:image\/[^;]+;base64,(.+)$/i);
                    if (!m) {
                        resolve();
                        return;
                    }
                    const image = new Image();
                    image.onload = () => {
                        try {
                            const iw = image.naturalWidth || 1;
                            const ih = image.naturalHeight || 1;
                            const maxPxW = (maxW * 96) / 72;
                            const maxPxH = (maxH * 96) / 72;
                            const scale = Math.min(maxPxW / iw, maxPxH / ih, 1);
                            const tw = Math.max(1, Math.round(iw * scale));
                            const th = Math.max(1, Math.round(ih * scale));
                            const canvas = document.createElement('canvas');
                            canvas.width = tw;
                            canvas.height = th;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                                ctx.drawImage(image, 0, 0, tw, th);
                                const dataUrl = canvas.toDataURL('image/png');
                                img.setAttribute('src', dataUrl);
                            }
                            const wPt = (tw * 72) / 96;
                            const hPt = (th * 72) / 96;
                            img.setAttribute('width', String(Math.round(wPt * 10) / 10));
                            img.setAttribute('height', String(Math.round(hPt * 10) / 10));
                        } catch {
                            const tag = img.outerHTML;
                            const parsed = parseImgDimsPtFromTag(tag);
                            if (parsed) {
                                const f = fitPt(parsed.w, parsed.h, maxW, maxH);
                                img.setAttribute('width', String(f.w));
                                img.setAttribute('height', String(f.h));
                            } else {
                                img.setAttribute('width', String(maxW));
                                img.setAttribute('height', String(Math.min(24, maxH)));
                            }
                        }
                        resolve();
                    };
                    image.onerror = () => {
                        const tag = img.outerHTML;
                        const parsed = parseImgDimsPtFromTag(tag);
                        if (parsed) {
                            const f = fitPt(parsed.w, parsed.h, maxW, maxH);
                            img.setAttribute('width', String(f.w));
                            img.setAttribute('height', String(f.h));
                        }
                        resolve();
                    };
                    image.src = src;
                }),
        ),
    );

    return div.innerHTML;
}

export async function preprocessHfExportImages(hf: {
    headerLeftHtml: string;
    headerCenterHtml: string;
    headerRightHtml: string;
    footerLeftHtml: string;
    footerCenterHtml: string;
    footerRightHtml: string;
}): Promise<typeof hf> {
    const [headerLeftHtml, headerCenterHtml, headerRightHtml, footerLeftHtml, footerCenterHtml, footerRightHtml] =
        await Promise.all([
            scaleDataUrlsInHfHtml(hf.headerLeftHtml, 'header'),
            scaleDataUrlsInHfHtml(hf.headerCenterHtml, 'header'),
            scaleDataUrlsInHfHtml(hf.headerRightHtml, 'header'),
            scaleDataUrlsInHfHtml(hf.footerLeftHtml, 'footer'),
            scaleDataUrlsInHfHtml(hf.footerCenterHtml, 'footer'),
            scaleDataUrlsInHfHtml(hf.footerRightHtml, 'footer'),
        ]);
    return {
        headerLeftHtml,
        headerCenterHtml,
        headerRightHtml,
        footerLeftHtml,
        footerCenterHtml,
        footerRightHtml,
    };
}

/** HTML/CSS font-size → UYAP `size` (yalnızca eksikse editör varsayılanı 11). */
export function hfFontSizeForUyapExport(size: string | undefined): string {
    if (!size?.trim()) return HF_EXPORT_DEFAULT_FONT_SIZE;
    const raw = size.replace(/px$/i, '').replace(/pt$/i, '').trim();
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) return HF_EXPORT_DEFAULT_FONT_SIZE;
    return String(Math.round(n));
}

export function hfMarkToContentXmlAttrs(mark: HfContentMark): string {
    let a = '';
    if (mark.bold) a += ' bold="true"';
    if (mark.italic) a += ' italic="true"';
    if (mark.underline) a += ' underline="true"';
    if (mark.strike) a += ' strikethrough="true"';
    if (mark.superscript) a += ' superscript="true"';
    if (mark.subscript) a += ' subscript="true"';
    if (mark.foreground) a += ` foreground="${escapeXmlAttr(mark.foreground)}"`;
    if (mark.background) a += ` background="${escapeXmlAttr(mark.background)}"`;
    const fam = mark.family || 'Times New Roman';
    const sz = hfFontSizeForUyapExport(mark.size);
    a += ` family="${escapeXmlAttr(fam)}" size="${escapeXmlAttr(sz)}"`;
    return a;
}

