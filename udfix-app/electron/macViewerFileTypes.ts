import path from 'path';

/**
 * Finder / Launch Services claims for Universal Viewer formats.
 * Source-code and config extensions are intentionally omitted so UDFIX
 * does not appear as an editor for .ts / .json / .html and similar.
 */
export const MACOS_VIEWER_EXTENSIONS = new Set([
    'pdf',
    'md',
    'markdown',
    'docx',
    'doc',
    'odt',
    'rtf',
    'txt',
    'xlsx',
    'xls',
    'csv',
    'jpg',
    'jpeg',
    'png',
    'webp',
    'gif',
    'bmp',
    'svg',
    'tiff',
    'tif',
    'eml',
    'msg',
    'zip',
    'jar',
    'eyp',
]);

export type MacosDocumentTypeRank = 'Owner' | 'Alternate';
export type MacosDocumentTypeRole = 'Editor' | 'Viewer';

export type MacosDocumentTypeClaim = {
    ext: string[];
    name: string;
    role: MacosDocumentTypeRole;
    rank: MacosDocumentTypeRank;
    utis: string[];
    mimeType?: string;
};

/** Must stay aligned with `package.json` `build.fileAssociations`. */
export const MACOS_DOCUMENT_TYPE_CLAIMS: MacosDocumentTypeClaim[] = [
    {
        ext: ['udf'],
        name: 'UYAP UDF Belgesi',
        role: 'Editor',
        rank: 'Owner',
        utis: ['com.ofg.udfix.udf'],
        mimeType: 'application/x-uyap-udf',
    },
    {
        ext: ['eyp'],
        name: 'EYP Paketi',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['com.ofg.udfix.eyp'],
        mimeType: 'application/x-eyp',
    },
    {
        ext: ['pdf'],
        name: 'PDF Belgesi',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['com.adobe.pdf'],
        mimeType: 'application/pdf',
    },
    {
        ext: ['md', 'markdown'],
        name: 'Markdown Belgesi',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['net.daringfireball.markdown'],
        mimeType: 'text/markdown',
    },
    {
        ext: ['docx', 'doc'],
        name: 'Word Belgesi',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['org.openxmlformats.wordprocessingml.document', 'com.microsoft.word.doc'],
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    {
        ext: ['odt'],
        name: 'OpenDocument Metin',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['org.oasis-open.opendocument.text'],
        mimeType: 'application/vnd.oasis.opendocument.text',
    },
    {
        ext: ['rtf'],
        name: 'RTF Belgesi',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['public.rtf'],
        mimeType: 'text/rtf',
    },
    {
        ext: ['txt'],
        name: 'Metin Belgesi',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['public.plain-text'],
        mimeType: 'text/plain',
    },
    {
        ext: ['xlsx', 'xls'],
        name: 'Excel Çalışma Kitabı',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['org.openxmlformats.spreadsheetml.sheet', 'com.microsoft.excel.xls'],
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    {
        ext: ['csv'],
        name: 'CSV Tablosu',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['public.comma-separated-values-text'],
        mimeType: 'text/csv',
    },
    {
        ext: ['jpg', 'jpeg'],
        name: 'JPEG Görüntü',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['public.jpeg'],
        mimeType: 'image/jpeg',
    },
    {
        ext: ['png'],
        name: 'PNG Görüntü',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['public.png'],
        mimeType: 'image/png',
    },
    {
        ext: ['webp'],
        name: 'WebP Görüntü',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['org.webmproject.webp'],
        mimeType: 'image/webp',
    },
    {
        ext: ['gif'],
        name: 'GIF Görüntü',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['com.compuserve.gif'],
        mimeType: 'image/gif',
    },
    {
        ext: ['bmp'],
        name: 'BMP Görüntü',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['com.microsoft.bmp'],
        mimeType: 'image/bmp',
    },
    {
        ext: ['svg'],
        name: 'SVG Görüntü',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['public.svg-image'],
        mimeType: 'image/svg+xml',
    },
    {
        ext: ['tiff', 'tif'],
        name: 'TIFF Görüntü',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['public.tiff'],
        mimeType: 'image/tiff',
    },
    {
        ext: ['eml'],
        name: 'E-posta',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['com.apple.mail.email'],
        mimeType: 'message/rfc822',
    },
    {
        ext: ['msg'],
        name: 'Outlook E-posta',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['com.microsoft.outlook.msg'],
        mimeType: 'application/vnd.ms-outlook',
    },
    {
        ext: ['zip'],
        name: 'ZIP Arşivi',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['public.zip-archive'],
        mimeType: 'application/zip',
    },
    {
        ext: ['jar'],
        name: 'JAR Arşivi',
        role: 'Viewer',
        rank: 'Alternate',
        utis: ['com.sun.java-archive'],
        mimeType: 'application/java-archive',
    },
];

export function utiByExtension(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const claim of MACOS_DOCUMENT_TYPE_CLAIMS) {
        for (let i = 0; i < claim.ext.length; i += 1) {
            const ext = claim.ext[i];
            const uti = claim.utis[i] ?? claim.utis[0];
            if (ext && uti) out[ext] = uti;
        }
    }
    return out;
}

export function resolveMacOpenExtension(filePath: string): string {
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.eyp.zip') || lower.endsWith('.eyp')) return 'eyp';
    const ext = path.extname(filePath).toLowerCase();
    return ext.startsWith('.') ? ext.slice(1) : '';
}

export function isUdfFilePath(filePath: string): boolean {
    return resolveMacOpenExtension(filePath) === 'udf';
}

export function isMacViewerFilePath(filePath: string): boolean {
    const ext = resolveMacOpenExtension(filePath);
    return ext !== 'udf' && MACOS_VIEWER_EXTENSIONS.has(ext);
}
