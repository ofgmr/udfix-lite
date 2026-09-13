/** Raster-only images in the legal editor; SVG is not inserted as document content (XSS/script surface). */

export const EDITOR_RASTER_IMAGE_EXTENSIONS = [
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'bmp',
    'tif',
    'tiff',
] as const;

const RASTER_EXT_SET = new Set<string>(EDITOR_RASTER_IMAGE_EXTENSIONS);

export function isEditorRasterImageExtension(ext: string): boolean {
    return RASTER_EXT_SET.has(ext.toLowerCase());
}

export function isEditorRasterImageMime(mime: string): boolean {
    const m = mime.toLowerCase().trim();
    return (
        m === 'image/png' ||
        m === 'image/jpeg' ||
        m === 'image/gif' ||
        m === 'image/webp' ||
        m === 'image/bmp' ||
        m === 'image/tiff'
    );
}

export function isBlockedEditorImageSrc(src: string): boolean {
    const s = src.trim().toLowerCase();
    if (s.startsWith('data:image/svg')) return true;
    if (/\.svg(?:[?#]|$)/i.test(s)) return true;
    return false;
}
