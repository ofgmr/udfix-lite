import { HF_SIZED_IMAGE_CLASS } from '../extensions/HfImageExtension';
import {
    applyHfImageAlignStylesInHtml,
    ensureParagraphAlignFromImgDataAlignInHtml,
} from './hfImageAlignExport';

const IMG_TAG_RE = /<img\b([^>]*?)>/gi;

function readAttr(attrs: string, name: string): string | null {
    const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
    const m = attrs.match(re);
    return m ? (m[1] ?? m[2] ?? null) : null;
}

function readStyleWidth(attrs: string): string | null {
    const style = readAttr(attrs, 'style');
    if (!style) return null;
    const m = style.match(/(?:^|;)\s*width\s*:\s*([^;]+)/i);
    return m?.[1]?.trim() || null;
}

function parseWidthPx(raw: string | null | undefined): number | null {
    if (!raw) return null;
    const m = raw.trim().match(/^([\d.]+)\s*px$/i);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function upsertAttr(attrs: string, name: string, value: string): string {
    // Anchor at attribute boundary — avoid matching `width` inside `data-hf-img-width`.
    const re = new RegExp(`(^|\\s)(${name})\\s*=\\s*(?:"[^"]*"|'[^']*')`, 'i');
    if (re.test(attrs)) {
        return attrs.replace(re, `$1${name}="${value}"`);
    }
    return `${attrs.trimEnd()} ${name}="${value}"`;
}

function upsertStyleWidth(attrs: string, width: string): string {
    const style = readAttr(attrs, 'style');
    const widthDecl = `width:${width}`;
    if (!style) {
        return upsertAttr(
            attrs,
            'style',
            `${widthDecl};max-width:100%;height:auto;vertical-align:middle;display:inline-block;`,
        );
    }
    const nextStyle = /(?:^|;)\s*width\s*:/i.test(style)
        ? style.replace(/(?:^|;)\s*width\s*:\s*[^;]+/i, `;${widthDecl}`).replace(/^;/, '')
        : `${widthDecl};${style}`;
    return upsertAttr(attrs, 'style', nextStyle);
}

function readParagraphStyleAttr(pAttrs: string): string {
    return readAttr(pAttrs, 'style')?.trim() ?? '';
}

function readParagraphTextAlign(pAttrs: string): string | null {
    const styleMatch = pAttrs.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const style = styleMatch?.[1] ?? styleMatch?.[2] ?? '';
    const alignMatch = style.match(/(?:^|;)\s*text-align\s*:\s*([^;]+)/i);
    if (!alignMatch) return null;
    const align = alignMatch[1].trim().toLowerCase();
    return align || null;
}

function wrapWithTextAlignIfNeeded(inner: string, align: string | null): string {
    if (!align || align === 'left' || align === 'start') return inner;
    const stamped = stampImgDataAlign(inner, align);
    return `<div style="text-align:${align}">${stamped}</div>`;
}

function stampImgDataAlign(inner: string, align: string): string {
    if (/\bdata-hf-align\s*=/.test(inner)) return inner;
    return inner.replace(/<img\b/i, `<img data-hf-align="${align}" `);
}

/** Restore alignment when store only has bare `<img data-hf-align="center">` without wrapper. */
export function ensureHfExportImageAlignment(html: string): string {
    const trimmed = (html || '').trim();
    if (!trimmed || !/<img\b/i.test(trimmed)) return html;
    if (/text-align\s*:\s*(center|right|end)/i.test(trimmed)) return html;

    const alignFromData = trimmed.match(/\bdata-hf-align\s*=\s*"([^"]+)"/i)?.[1]?.trim().toLowerCase();
    if (!alignFromData || alignFromData === 'left' || alignFromData === 'start') return html;

    if (/^<div\b/i.test(trimmed)) return html;

    const imgOnly = /^<img\b[\s\S]*>$/i.test(trimmed);
    if (imgOnly) {
        return `<div style="text-align:${alignFromData}">${trimmed}</div>`;
    }
    return html;
}

/**
 * Merge adjacent simple paragraph blocks into `<br>` separators for HF band output.
 * Editor mode keeps `<p style="text-align:…">` for TipTap round-trip.
 * Export mode unwraps to div + data-hf-align for raster/html2canvas.
 */
export function normalizeHfLineBreaksInHtml(html: string, opts?: { forExport?: boolean }): string {
    const forExport = opts?.forExport === true;
    const trimmed = html.trim();
    if (!trimmed) return html;
    // Simple alignment wrappers may stay; skip only structural blocks.
    if (/<(?:ul|ol|li|table|blockquote|h[1-6])\b/i.test(trimmed)) return html;

    let result = trimmed;
    if (/<\/p>/i.test(result)) {
        result = result.replace(/<\/p>\s*<p[^>]*>/gi, '<br>');
        const singleWrap = result.trim().match(/^<p(\s[^>]*?)?>([\s\S]*)<\/p>$/i);
        if (singleWrap) {
            const attrs = singleWrap[1] ?? '';
            const inner = singleWrap[2];
            const align = readParagraphTextAlign(attrs);
            if (!forExport) {
                // Keep full <p> wrapper for TipTap round-trip (trailing spaces, marks, alignment).
                if (align && align !== 'left' && align !== 'start') {
                    return stampImgDataAlign(trimmed, align);
                }
                return result.trim();
            }
            // Export: keep styled paragraphs so line-height / explicit text-align survive compile.
            if (readParagraphStyleAttr(attrs)) {
                if (align && align !== 'left' && align !== 'start') {
                    return stampImgDataAlign(result.trim(), align);
                }
                return result.trim();
            }
            result = wrapWithTextAlignIfNeeded(inner, align);
        } else if (forExport) {
            result = result.replace(/^<p[^>]*>/i, '').replace(/<\/p>$/i, '');
        }
    }

    // Bare text + <br> without wrapper — wrap for stable editor round-trip.
    if (!/^<[a-z]/i.test(result) && /<br\b/i.test(result)) {
        return `<p>${result}</p>`;
    }
    return result;
}

/** Normalize HF column HTML for mini-editor store (TipTap round-trip safe). */
export function normalizeHfColumnHtml(html: string): string {
    const sized = normalizeHfSizedImagesInHtml(html);
    const lineBreaks = normalizeHfLineBreaksInHtml(sized, { forExport: false });
    return ensureParagraphAlignFromImgDataAlignInHtml(lineBreaks);
}

/** Normalize HF column HTML for PDF/UDF compile + raster (margin styles, unwrap). */
export function normalizeHfColumnHtmlForExport(html: string): string {
    return applyHfImageAlignStylesInHtml(
        ensureHfExportImageAlignment(
            normalizeHfLineBreaksInHtml(normalizeHfSizedImagesInHtml(html), { forExport: true }),
        ),
    );
}

/**
 * Ensures HF column HTML carries hf-sized-img markers before compile/inject.
 * Idempotent; safe to run on every compile pass.
 */
export function normalizeHfSizedImagesInHtml(html: string): string {
    if (!html || !/<img\b/i.test(html)) return html;

    return html.replace(IMG_TAG_RE, (full, rawAttrs: string) => {
        let attrs = rawAttrs ?? '';
        if (/\bclass\s*=/i.test(attrs) && attrs.includes(HF_SIZED_IMAGE_CLASS)) {
            return full;
        }

        const dataWidth = readAttr(attrs, 'data-hf-img-width');
        const styleWidth = readStyleWidth(attrs);
        const attrWidthPx = parseWidthPx(readAttr(attrs, 'width'));
        const width =
            styleWidth ||
            dataWidth ||
            (attrWidthPx != null ? `${attrWidthPx}px` : null);

        if (!width) return full;

        attrs = upsertStyleWidth(attrs, width);
        attrs = upsertAttr(attrs, 'data-hf-img-width', width);
        if (!/\bclass\s*=/i.test(attrs)) {
            attrs = upsertAttr(attrs, 'class', HF_SIZED_IMAGE_CLASS);
        } else if (!attrs.includes(HF_SIZED_IMAGE_CLASS)) {
            attrs = attrs.replace(
                /\bclass\s*=\s*"([^"]*)"/i,
                (_m, cls: string) => `class="${cls} ${HF_SIZED_IMAGE_CLASS}"`,
            );
        }
        const widthPx = parseWidthPx(width);
        if (widthPx != null) {
            attrs = upsertAttr(attrs, 'width', String(widthPx));
        }
        return `<img${attrs}>`;
    });
}
