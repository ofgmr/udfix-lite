/**
 * ocrService.ts
 * Per-language Tesseract.js worker pool + serial OCR queues.
 */
import { createWorker } from 'tesseract.js';
import { pdfJsAssetBaseUrl } from '../utils/pdfjsDocument';

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>;

const TESSERACT_DIR = 'tesseract';

/** Absolute base for bundled public/tesseract assets in the hosting window (main or popout). */
export function tesseractAssetBaseUrl(baseWindow?: Window): string {
    const root = pdfJsAssetBaseUrl(baseWindow).replace(/\/?$/, '/');
    return `${root}${TESSERACT_DIR}`;
}

export const TESSERACT_WORKER = `${TESSERACT_DIR}/worker.min.js`;
export const TESSERACT_CORE = `${TESSERACT_DIR}/tesseract-core-lstm.wasm.js`;
export const TESSERACT_LANGS = TESSERACT_DIR;

function tesseractWorkerOptions(baseWindow: Window = window) {
    const prefix = tesseractAssetBaseUrl(baseWindow);
    return {
        workerPath: `${prefix}/worker.min.js`,
        corePath: `${prefix}/tesseract-core-lstm.wasm.js`,
        langPath: prefix,
        // Load worker script directly (not via blob: importScripts) so fetch/WASM/lang
        // assets resolve reliably in Dockview popouts and Electron file:// renderers.
        workerBlobURL: false,
    };
}

export type OcrBbox = { x0: number; y0: number; x1: number; y1: number };
export type OcrWord = { text: string; bbox: OcrBbox };

type TesseractWordLike = { text?: string; bbox?: unknown };
type TesseractLineLike = { words?: TesseractWordLike[] };
type TesseractBlockLike = { paragraphs?: { lines?: TesseractLineLike[] }[]; lines?: TesseractLineLike[] };

const workerPool  = new Map<string, Promise<TesseractWorker>>();
const queueMap    = new Map<string, Promise<void>>();

function normalizeBbox(w: TesseractWordLike): OcrBbox | null {
    const b = w?.bbox;
    if (!b) return null;
    if (
        typeof b === 'object' &&
        b !== null &&
        'x0' in b &&
        'y0' in b &&
        'x1' in b &&
        'y1' in b &&
        typeof (b as OcrBbox).x0 === 'number' &&
        typeof (b as OcrBbox).y0 === 'number' &&
        typeof (b as OcrBbox).x1 === 'number' &&
        typeof (b as OcrBbox).y1 === 'number'
    ) {
        const box = b as OcrBbox;
        return { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 };
    }
    if (Array.isArray(b) && b.length >= 4 && b.every((n) => typeof n === 'number')) {
        return { x0: b[0], y0: b[1], x1: b[2], y1: b[3] };
    }
    return null;
}

function collectWordsFromLine(line: TesseractLineLike, out: OcrWord[]): void {
    const ws = line?.words;
    if (!Array.isArray(ws)) return;
    for (const w of ws) {
        const t = typeof w?.text === 'string' ? w.text.trim() : '';
        if (!t) continue;
        const bbox = normalizeBbox(w);
        if (!bbox) continue;
        out.push({ text: w.text as string, bbox });
    }
}

function wordsFromBlocks(blocks: TesseractBlockLike[] | null | undefined): OcrWord[] {
    if (!Array.isArray(blocks) || blocks.length === 0) return [];
    const out: OcrWord[] = [];
    for (const block of blocks) {
        const paras = block?.paragraphs;
        if (Array.isArray(paras) && paras.length > 0) {
            for (const p of paras) {
                const lines = p?.lines;
                if (!Array.isArray(lines)) continue;
                for (const line of lines) collectWordsFromLine(line, out);
            }
        } else if (Array.isArray(block?.lines)) {
            for (const line of block.lines) collectWordsFromLine(line, out);
        }
    }
    return out;
}

function workerPoolKey(lang: string, baseWindow: Window): string {
    return `${tesseractAssetBaseUrl(baseWindow)}:${lang}`;
}

/** Cross-realm safe — popout canvas fails `instanceof HTMLCanvasElement` in the main JS realm. */
function isCanvasLike(value: unknown): value is HTMLCanvasElement {
    if (typeof value !== 'object' || value === null) return false;
    const el = value as HTMLCanvasElement;
    return el.tagName === 'CANVAS' && typeof el.getContext === 'function';
}

function isImageLike(value: unknown): value is HTMLImageElement {
    if (typeof value !== 'object' || value === null) return false;
    const el = value as HTMLImageElement;
    return el.tagName === 'IMG' && typeof el.src === 'string';
}

/** Snapshot canvas pixels immediately — before worker queue / Virtuoso recycle can clear the surface. */
async function prepareOcrImageInput(
    image: string | HTMLCanvasElement | HTMLImageElement,
): Promise<string | Uint8Array | HTMLImageElement> {
    if (typeof image === 'string') return image;
    if (isCanvasLike(image)) {
        const blob = await new Promise<Blob | null>((resolve) => {
            image.toBlob((b) => resolve(b), 'image/png');
        });
        if (!blob || blob.size === 0) {
            throw new Error(`OCR canvas boş (${image.width}x${image.height})`);
        }
        return new Uint8Array(await blob.arrayBuffer());
    }
    if (isImageLike(image)) return image;
    throw new Error('OCR için desteklenmeyen görüntü tipi');
}

export async function getOcrWorker(lang: string, baseWindow: Window = window): Promise<TesseractWorker> {
    const poolKey = workerPoolKey(lang, baseWindow);
    if (!workerPool.has(poolKey)) {
        const paths = tesseractWorkerOptions(baseWindow);
        const init = (async () => {
            console.log(`[OCR] Worker başlatılıyor (${lang})...`);
            const worker = await createWorker(lang, 1, {
                workerPath: paths.workerPath,
                corePath: paths.corePath,
                langPath: paths.langPath,
                gzip: true,
                workerBlobURL: false,
                logger: (m: { status?: string; progress?: number }) => {
                    const pct = Math.round((m.progress ?? 0) * 100);
                    console.log(`[OCR:${lang}] ${m.status} ${pct}%`);
                },
            });
            console.log(`[OCR] Worker hazır (${lang}).`);
            return worker;
        })().catch((err) => {
            workerPool.delete(poolKey);
            throw err;
        });

        workerPool.set(poolKey, init);
    }
    return workerPool.get(poolKey)!;
}

export function enqueueOcr(
    image: string | HTMLCanvasElement | HTMLImageElement,
    lang = 'tur',
    baseWindow?: Window,
): Promise<OcrWord[]> {
    const ownerWindow =
        baseWindow ??
        (isCanvasLike(image) || isImageLike(image)
            ? (image as HTMLCanvasElement | HTMLImageElement).ownerDocument.defaultView
            : null) ??
        window;
    const queueKey = workerPoolKey(lang, ownerWindow);
    if (!queueMap.has(queueKey)) queueMap.set(queueKey, Promise.resolve());

    // Capture PNG bytes before queued worker init — canvas may be cleared while waiting.
    const preparedImagePromise = prepareOcrImageInput(image);

    const result = queueMap.get(queueKey)!.then(async () => {
        const preparedImage = await preparedImagePromise;
        const worker = await getOcrWorker(lang, ownerWindow);
        const { data } = await worker.recognize(preparedImage as string, {}, { blocks: true, text: false });
        return wordsFromBlocks(data?.blocks as TesseractBlockLike[] | undefined);
    });

    queueMap.set(queueKey, result.then(() => undefined, () => undefined));
    return result;
}

export async function releaseOcrWorker(lang?: string): Promise<void> {
    for (const [poolKey, pending] of [...workerPool.entries()]) {
        if (lang && !poolKey.endsWith(`:${lang}`)) continue;
        const w = await pending.catch(() => null);
        if (w) {
            try {
                await w.terminate();
            } catch {
                /* ignore */
            }
        }
        workerPool.delete(poolKey);
        queueMap.delete(poolKey);
    }
}

export function applyWords(
    words: OcrWord[],
    container: HTMLElement,
    scaleX = 1,
    scaleY = scaleX,
) {
    words.forEach((word) => {
        if (!word?.text?.trim()) return;
        const ownerDocument = container.ownerDocument;
        const span = ownerDocument.createElement('span');
        span.textContent = word.text + ' ';
        span.className = 'ocr-word';
        span.style.left      = `${word.bbox.x0 * scaleX}px`;
        span.style.top       = `${word.bbox.y0 * scaleY}px`;
        span.style.width     = `${(word.bbox.x1 - word.bbox.x0) * scaleX}px`;
        span.style.height    = `${(word.bbox.y1 - word.bbox.y0) * scaleY}px`;
        span.style.fontSize  = `${(word.bbox.y1 - word.bbox.y0) * scaleY}px`;
        container.appendChild(span);
    });
}
