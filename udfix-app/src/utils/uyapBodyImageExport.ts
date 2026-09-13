/**
 * Inline and scale body images before UDF export so UYAP receives PNG base64
 * (data URLs) within practical XML size limits.
 */

import type { JSONContent } from '../types/tiptapContent';

const BODY_IMG_MAX_WIDTH_PT = 520;
const BODY_IMG_MAX_HEIGHT_PT = 720;

function ptToPx(pt: number): number {
    return (pt * 96) / 72;
}

async function loadImageElement(src: string): Promise<HTMLImageElement | null> {
    if (typeof document === 'undefined') return null;
    return new Promise((resolve) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
    });
}

async function resolveImageSrcToDataUrl(src: string): Promise<string | null> {
    const trimmed = src.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('data:image/') && trimmed.includes(',')) return trimmed;

    if (typeof fetch === 'undefined') return null;
    try {
        const res = await fetch(trimmed);
        if (!res.ok) return null;
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) return null;
        return await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

async function scaleDataUrlForUyap(
    dataUrl: string,
    maxWidthPt: number,
    maxHeightPt: number,
): Promise<{ dataUrl: string; widthPx: number; heightPx: number } | null> {
    if (typeof document === 'undefined') return null;
    const image = await loadImageElement(dataUrl);
    if (!image) return null;

    const iw = image.naturalWidth || 1;
    const ih = image.naturalHeight || 1;
    const maxPxW = ptToPx(maxWidthPt);
    const maxPxH = ptToPx(maxHeightPt);
    const scale = Math.min(maxPxW / iw, maxPxH / ih, 1);
    const tw = Math.max(1, Math.round(iw * scale));
    const th = Math.max(1, Math.round(ih * scale));

    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, tw, th);
    return { dataUrl: canvas.toDataURL('image/png'), widthPx: tw, heightPx: th };
}

async function preprocessImageNode(node: JSONContent): Promise<JSONContent> {
    const src = node.attrs?.src;
    if (typeof src !== 'string' || !src.trim()) return node;

    const dataUrl = await resolveImageSrcToDataUrl(src);
    if (!dataUrl) return node;

    const scaled = await scaleDataUrlForUyap(dataUrl, BODY_IMG_MAX_WIDTH_PT, BODY_IMG_MAX_HEIGHT_PT);
    if (!scaled) {
        return { ...node, attrs: { ...node.attrs, src: dataUrl } };
    }

    return {
        ...node,
        attrs: {
            ...node.attrs,
            src: scaled.dataUrl,
            width: `${scaled.widthPx}px`,
            height: `${scaled.heightPx}px`,
        },
    };
}

async function walkJson(node: JSONContent): Promise<JSONContent> {
    if (node.type === 'image') {
        return preprocessImageNode(node);
    }
    if (!node.content?.length) return node;
    const content = await Promise.all(node.content.map(walkJson));
    return { ...node, content };
}

/** Ensures block/inline images in TipTap JSON are PNG data URLs sized for UYAP. */
export async function preprocessTipTapImagesForUyapExport(json: JSONContent): Promise<JSONContent> {
    if (typeof document === 'undefined') return json;
    return walkJson(json);
}
