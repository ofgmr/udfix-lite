export const ZIP_MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;
export const ZIP_MAX_ENTRIES = 4000;
export const ZIP_MAX_ENTRY_UNCOMPRESSED = 80 * 1024 * 1024;
export const ZIP_MAX_TOTAL_UNCOMPRESSED = 200 * 1024 * 1024;
export const ZIP_MAX_COMPRESSION_RATIO = 100;
const ZIP_RATIO_MIN_UNCOMPRESSED = 10 * 1024 * 1024;

export class ZipBombError extends Error {
    constructor(message = 'Arşiv güvenlik limiti aşıldı.') {
        super(message);
        this.name = 'ZipBombError';
    }
}

export function assertArchiveByteLimit(byteLength: number): void {
    if (byteLength > ZIP_MAX_ARCHIVE_BYTES) {
        throw new ZipBombError('Arşiv çok büyük.');
    }
}

export type ZipSizeHint = {
    uncompressed: number;
    compressed: number;
};

export function assertZipSizeHints(entries: ZipSizeHint[]): void {
    if (entries.length > ZIP_MAX_ENTRIES) {
        throw new ZipBombError('Arşivde çok fazla dosya var.');
    }
    let totalUncompressed = 0;
    for (const entry of entries) {
        const uncompressed = Math.max(0, Number(entry.uncompressed) || 0);
        const compressed = Math.max(0, Number(entry.compressed) || 0);
        if (uncompressed > ZIP_MAX_ENTRY_UNCOMPRESSED) {
            throw new ZipBombError('Arşiv girdisi çok büyük.');
        }
        if (
            compressed > 0 &&
            uncompressed > ZIP_RATIO_MIN_UNCOMPRESSED &&
            uncompressed / compressed > ZIP_MAX_COMPRESSION_RATIO
        ) {
            throw new ZipBombError('Arşiv sıkıştırma oranı şüpheli.');
        }
        totalUncompressed += uncompressed;
        if (totalUncompressed > ZIP_MAX_TOTAL_UNCOMPRESSED) {
            throw new ZipBombError('Arşiv açılmış boyutu çok büyük.');
        }
    }
}

type JsZipLike = {
    forEach: (cb: (relativePath: string, file: { dir?: boolean; _data?: { uncompressedSize?: number; compressedSize?: number } }) => void) => void;
};

export function assertLoadedZipBudget(zip: JsZipLike): void {
    const hints: ZipSizeHint[] = [];
    zip.forEach((_relativePath, file) => {
        if (file.dir) return;
        hints.push({
            uncompressed: file._data?.uncompressedSize ?? 0,
            compressed: file._data?.compressedSize ?? 0,
        });
    });
    assertZipSizeHints(hints);
}
