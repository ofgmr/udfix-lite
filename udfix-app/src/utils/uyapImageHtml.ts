import type { XmlImage, XmlParagraph } from '../types/uyapXml';
import { uyapPtStringToPx } from './uyapImportUnits';

/** Marker class shared with HfImageExtension — keep string literal to avoid React import cycle. */
const HF_SIZED_IMAGE_CLASS = 'hf-sized-img';

/** Standard base64 only — quotes/whitespace would break `src="data:…,${data}"`. */
const SAFE_IMAGE_BASE64 = /^[A-Za-z0-9+/]+=*$/;

function isSafeBase64ImageData(data: string): boolean {
    return SAFE_IMAGE_BASE64.test(data);
}

export function paragraphHasImages(p: XmlParagraph): boolean {
    return (p.image?.length ?? 0) > 0;
}

/**
 * Render UYAP `<image imageData>` nodes to HTML.
 * `hfSized` keeps width for header/footer mini editors / PaginationPlus.
 */
export function uyapImagesToHtml(
    images: XmlImage[] | undefined,
    opts?: { hfSized?: boolean },
): string {
    if (!images?.length) return '';
    let html = '';
    for (const img of images) {
        const data = img.$?.imageData?.trim();
        if (!data || !isSafeBase64ImageData(data)) continue;
        const src = `data:image/png;base64,${data}`;
        const widthPx = uyapPtStringToPx(img.$.width);
        const heightPx = uyapPtStringToPx(img.$.height);
        if (opts?.hfSized && widthPx != null && widthPx > 0) {
            const w = Math.round(widthPx);
            const h = heightPx != null && heightPx > 0 ? Math.round(heightPx) : undefined;
            const style = h
                ? `width:${w}px;height:${h}px;max-width:100%;vertical-align:middle;`
                : `width:${w}px;max-width:100%;height:auto;vertical-align:middle;`;
            html += `<img class="${HF_SIZED_IMAGE_CLASS}" src="${src}" data-hf-img-width="${w}px" width="${w}" style="${style}" />`;
            continue;
        }
        if (widthPx != null && widthPx > 0) {
            const w = Math.round(widthPx);
            html += `<img src="${src}" style="max-width:100%;width:${w}px;height:auto;display:block;margin:10px auto;" />`;
            continue;
        }
        html += `<img src="${src}" style="max-width:100%;height:auto;display:block;margin:10px auto;" />`;
    }
    return html;
}

export function uyapImagesToTipTapNodes(
    images: XmlImage[] | undefined,
): Array<{ type: 'image'; attrs: { src: string; width?: string } }> {
    if (!images?.length) return [];
    const nodes: Array<{ type: 'image'; attrs: { src: string; width?: string } }> = [];
    for (const img of images) {
        const data = img.$?.imageData?.trim();
        if (!data || !isSafeBase64ImageData(data)) continue;
        const widthPx = uyapPtStringToPx(img.$.width);
        nodes.push({
            type: 'image',
            attrs: {
                src: `data:image/png;base64,${data}`,
                ...(widthPx != null && widthPx > 0 ? { width: `${Math.round(widthPx)}px` } : {}),
            },
        });
    }
    return nodes;
}
