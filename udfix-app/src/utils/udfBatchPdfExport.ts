import { buildUyapVerificationMeta } from './uyapVerification';
import { UyapIO } from './uyapIO';
import { FileSystemService } from '../services/fileSystemService';
import { renderUdfContentXmlToPdfBytes } from './udfHeadlessPdfExport';
import { trackExportAction } from '../telemetry/trackEvent';

export type UdfBatchItemStatus = 'pending' | 'running' | 'done' | 'error';

export type UdfBatchPdfItem = {
    inputPath: string;
    fileName: string;
    status: UdfBatchItemStatus;
    outputPath?: string;
    error?: string;
};

function pathBasename(filePath: string): string {
    return filePath.split(/[/\\]/).pop() ?? 'belge';
}

function joinPath(dir: string, file: string): string {
    const sep = dir.includes('\\') ? '\\' : '/';
    const trimmed = dir.replace(/[/\\]+$/, '');
    return `${trimmed}${sep}${file}`;
}

export function udfBaseName(filePath: string): string {
    const name = pathBasename(filePath);
    return name.replace(/\.udf$/i, '') || 'belge';
}

export function pdfOutputPathForUdf(outputDir: string, udfPath: string): string {
    const base = udfBaseName(udfPath);
    return joinPath(outputDir, `${base}.pdf`);
}

export async function convertSingleUdfFileToPdf(
    inputPath: string,
    outputPath: string,
): Promise<void> {
    const bytes = await FileSystemService.readFileBinary(inputPath);
    const arrayBuffer =
        bytes.buffer instanceof ArrayBuffer
            ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
            : Uint8Array.from(bytes).buffer;
    const file = new File([arrayBuffer], pathBasename(inputPath));

    const { contentXml, documentPropertiesXml } = await UyapIO.readUdfViewerParts(file);
    const verification = buildUyapVerificationMeta(contentXml, documentPropertiesXml);
    const pdfBytes = await renderUdfContentXmlToPdfBytes(contentXml, {
        title: udfBaseName(inputPath),
        verificationMeta: verification,
    });
    await FileSystemService.writeFileBinary(outputPath, pdfBytes);
}

export type UdfBatchProgress = {
    index: number;
    total: number;
    item: UdfBatchPdfItem;
};

export async function runUdfBatchPdfExport(options: {
    inputPaths: string[];
    outputDir: string;
    onProgress?: (progress: UdfBatchProgress) => void;
    signal?: AbortSignal;
}): Promise<{ succeeded: number; failed: number; items: UdfBatchPdfItem[] }> {
    const { inputPaths, outputDir, onProgress, signal } = options;
    const items: UdfBatchPdfItem[] = inputPaths.map((inputPath) => ({
        inputPath,
        fileName: pathBasename(inputPath),
        status: 'pending' as const,
    }));

    let succeeded = 0;
    let failed = 0;

    for (let index = 0; index < items.length; index++) {
        if (signal?.aborted) break;

        const item = items[index]!;
        item.status = 'running';
        item.outputPath = pdfOutputPathForUdf(outputDir, item.inputPath);
        item.error = undefined;
        onProgress?.({ index, total: items.length, item });

        try {
            await convertSingleUdfFileToPdf(item.inputPath, item.outputPath);
            item.status = 'done';
            succeeded += 1;
        } catch (err) {
            item.status = 'error';
            item.error = err instanceof Error ? err.message : String(err);
            failed += 1;
        }

        onProgress?.({ index, total: items.length, item });
    }

    if (!signal?.aborted && succeeded > 0) {
        trackExportAction('udf_pdf_bulk');
    }

    return { succeeded, failed, items };
}
