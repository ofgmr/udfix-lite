import type { TextContent } from 'pdfjs-dist/types/src/display/api';

function viteBasePath(): string {
    const base =
        (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';
    return base.endsWith('/') ? base : `${base}/`;
}

/**
 * Absolute trailing-slash base for pdfjs-dist assets (cmaps, standard_fonts, wasm).
 * Resolves against the hosting window so popout.html and index.html share the same asset root.
 */
export function pdfJsAssetBaseUrl(baseWindow?: Window): string {
    const normalized = viteBasePath();
    if (baseWindow?.location?.href) {
        return new URL(normalized, baseWindow.location.href).href;
    }
    return normalized;
}

export function pdfJsCMapUrl(baseWindow?: Window): string {
    return `${pdfJsAssetBaseUrl(baseWindow)}pdfjs/cmaps/`;
}

export function pdfJsStandardFontDataUrl(baseWindow?: Window): string {
    return `${pdfJsAssetBaseUrl(baseWindow)}pdfjs/standard_fonts/`;
}

export function pdfJsWasmUrl(baseWindow?: Window): string {
    return `${pdfJsAssetBaseUrl(baseWindow)}pdfjs/wasm/`;
}

/** Shared getDocument() options for viewer + tests (offline CMap / standard fonts). */
export function pdfJsDocumentInitOptions(baseWindow?: Window): {
    cMapUrl: string;
    cMapPacked: boolean;
    standardFontDataUrl: string;
    wasmUrl: string;
    useSystemFonts: boolean;
    disableFontFace: boolean;
    useWorkerFetch: boolean;
    verbosity: number;
} {
    return {
        cMapUrl: pdfJsCMapUrl(baseWindow),
        cMapPacked: true,
        standardFontDataUrl: pdfJsStandardFontDataUrl(baseWindow),
        wasmUrl: pdfJsWasmUrl(baseWindow),
        // Path-based glyph renderer: avoids broken @font-face subsets on later PDF pages in Electron.
        disableFontFace: true,
        useSystemFonts: true,
        useWorkerFetch: false,
        verbosity: 0,
    };
}

export function buildPdfDocumentInit(
    source: string | Uint8Array | ArrayBuffer,
    baseWindow?: Window,
): Record<string, unknown> {
    const shared = pdfJsDocumentInitOptions(baseWindow);
    if (typeof source === 'string') {
        return { url: source, ...shared };
    }
    const data = source instanceof Uint8Array ? source : new Uint8Array(source);
    return { data, ...shared };
}

/** True when PDF.js returned at least one non-empty text run (OCR should not run). */
export function hasExtractablePdfText(textContent: TextContent): boolean {
    return textContent.items.some(
        (item) => 'str' in item && typeof item.str === 'string' && item.str.trim().length > 0,
    );
}
