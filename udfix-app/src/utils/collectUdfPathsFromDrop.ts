import {
    NOMAI_FS_ENTRY_MIME,
    normalizeDroppedFsPath,
    resolveDroppedFilePath,
} from './droppedFilePath';

function isUdfPath(filePath: string): boolean {
    return /\.udf$/i.test(filePath.trim());
}

function normalizeUdfDroppedFsPath(raw: string): string | null {
    const fsPath = normalizeDroppedFsPath(raw);
    return fsPath && isUdfPath(fsPath) ? fsPath : null;
}

/** Collects absolute `.udf` paths from OS / explorer drag-and-drop. */
export function collectUdfPathsFromDataTransfer(dataTransfer: DataTransfer): string[] {
    const seen = new Set<string>();
    const out: string[] = [];

    const add = (path: string) => {
        const p = path.trim();
        if (!p || !isUdfPath(p) || seen.has(p)) return;
        seen.add(p);
        out.push(p);
    };

    const custom = dataTransfer.getData(NOMAI_FS_ENTRY_MIME);
    if (custom) {
        try {
            const parsed = JSON.parse(custom) as { path?: string };
            if (typeof parsed.path === 'string') add(parsed.path);
        } catch {
            /* noop */
        }
    }

    const plain = dataTransfer.getData('text/plain');
    if (plain) {
        for (const line of plain.split(/\r?\n/)) {
            const normalized = normalizeUdfDroppedFsPath(line);
            if (normalized) add(normalized);
        }
        const single = normalizeUdfDroppedFsPath(plain);
        if (single) add(single);
    }

    for (const file of Array.from(dataTransfer.files)) {
        const filePath = resolveDroppedFilePath(file);
        if (filePath) add(filePath);
    }

    return out;
}

/** User-facing hint when drop produced no `.udf` paths. */
export function describeUdfDropRejection(dataTransfer: DataTransfer): string | null {
    const files = Array.from(dataTransfer.files);
    if (files.length === 0) {
        const plain = dataTransfer.getData('text/plain').trim();
        if (plain) {
            return 'Sürüklenen yol tanınmadı. Finder’dan doğrudan .udf dosyasını bırakın veya UDF Ekle ile seçin.';
        }
        return null;
    }

    const names = files.map((f) => f.name);
    if (names.every((n) => /\.sgn$/i.test(n))) {
        return 'sign.sgn yalnızca imza dosyasıdır; paketin dışındaki .udf dosyasını sürükleyin.';
    }
    if (names.some((n) => /\.udf$/i.test(n))) {
        return 'UDF algılandı ancak dosya yolu okunamadı. UDF Ekle düğmesini kullanın veya Dosya Gezgininden sürükleyin.';
    }
    const sample = names.slice(0, 3).join(', ');
    const suffix = names.length > 3 ? '…' : '';
    return `Yalnızca .udf dosyaları eklenebilir (${sample}${suffix}).`;
}
