import { FileSystemService } from '../services/fileSystemService';
import { isLocalFileScheme, isRemoteFetchableUrl, toSystemPath } from './fileUrl';

const MIME_BY_EXT: Record<string, string> = {
    pdf: 'application/pdf',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    xml: 'application/xml',
    html: 'text/html',
    csv: 'text/csv',
    eml: 'message/rfc822',
    msg: 'application/vnd.ms-outlook',
    udf: 'application/octet-stream',
    zip: 'application/zip',
};

export function isProbablyLocalPath(input: string): boolean {
    if (!input) return false;
    if (isRemoteFetchableUrl(input)) return false;
    if (isLocalFileScheme(input)) return true;
    return input.startsWith('/') || /^[A-Za-z]:[\\/]/.test(input);
}

export { toSystemPath };

export function guessMimeType(fileName: string): string {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    return MIME_BY_EXT[ext] || 'application/octet-stream';
}

async function blobUrlAccessibleInWindow(blobUrl: string, targetWindow: Window): Promise<boolean> {
    try {
        const res = await targetWindow.fetch(blobUrl);
        return res.ok;
    } catch {
        return false;
    }
}

/** pdf.js XHR cannot load nomai-file:// from Vite http://localhost; IPC → blob. */
const IPC_BLOB_MAX_BYTES = 64 * 1024 * 1024;

export async function resolveToBlobUrl(
    input: string,
    fileName: string,
    targetWindow: Window = window,
): Promise<string> {
    if (input.startsWith('blob:')) {
        if (await blobUrlAccessibleInWindow(input, targetWindow)) return input;
        throw new Error('Blob URL is not accessible in this window');
    }
    if (!isProbablyLocalPath(input)) return input;

    const bytes = await FileSystemService.readFileBinary(toSystemPath(input));
    if (bytes.byteLength > IPC_BLOB_MAX_BYTES) {
        throw new Error('Dosya görüntülemek için çok büyük; yerel yol ile açılamadı.');
    }
    const view =
        bytes.buffer instanceof ArrayBuffer
            ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
            : Uint8Array.from(bytes).buffer;
    const blob = new Blob([view], {
        type: guessMimeType(fileName),
    });
    return globalThis.URL.createObjectURL(blob);
}
