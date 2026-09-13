import React, { useState, useEffect, useRef } from 'react';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
// In pdfjs-dist v4+, TextLayer moved to the main pdf.mjs module.
// Do NOT import from pdf_viewer.mjs — it doesn't export TextLayer.
import { cn } from '../../lib/utils';
import { enqueueOcr, applyWords } from '../../services/ocrService';
import { hasExtractablePdfText } from '../../utils/pdfjsDocument';

// ─── Module-level OCR result cache ───────────────────────────────────────────
// PDF fingerprint + sayfa indexi → words[]
// Component unmount/remount (Virtuoso scroll) sonrası anında geri yükler
const ocrCache = new Map<string, any[]>();

function pageKey(pdfDoc: pdfjs.PDFDocumentProxy, idx: number): string {
    const fp = (pdfDoc as any).fingerprints?.[0] ?? (pdfDoc as any)._pdfInfo?.fingerprint ?? 'doc';
    return `${fp}_${idx}_v2-blocks`;
}

// ─── Component ───────────────────────────────────────────────────────────────
interface PDFPageProps {
    pdfDocument: pdfjs.PDFDocumentProxy | null;
    pageIndex: number; // 0-based
    width: number;
    scale: number;
    className?: string;
    onDimensionsLoad?: (height: number) => void;
    /** Tesseract dil kodu — public/tesseract/<lang>.traineddata.gz */
    lang?: string;
    searchQuery?: string;
}

export const PDFPage: React.FC<PDFPageProps> = ({
    pdfDocument, pageIndex, width, scale, className, onDimensionsLoad, lang = 'tur', searchQuery = '',
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const textLayerRef = useRef<HTMLDivElement>(null);
    const renderTaskRef = useRef<any>(null);
    const textLayerInst = useRef<any>(null); // TextLayer instance for cancel
    const renderGenRef = useRef(0);
    const ocrDoneRef = useRef(false);

    const [pageHeight, setPageHeight] = useState<number>(0);
    const [pageWidth, setPageWidth] = useState<number>(0);
    const [isRendering, setIsRendering] = useState(false);
    const [isOcrRunning, setIsOcrRunning] = useState(false);

    useEffect(() => {
        if (!pdfDocument || !width) return;

        ocrDoneRef.current = false;
        const generation = ++renderGenRef.current;
        let mounted = true;
        let ocrTimer: ReturnType<typeof setTimeout> | null = null;
        const canvasEl = canvasRef.current;
        const targetPageIndex = pageIndex;

        const textLayerEl = textLayerRef.current;
        if (textLayerEl) textLayerEl.innerHTML = '';
        if (textLayerInst.current) {
            try { textLayerInst.current.cancel(); } catch { /* ignore */ }
            textLayerInst.current = null;
        }

        const isStale = () =>
            !mounted
            || generation !== renderGenRef.current
            || targetPageIndex !== pageIndex;

        const renderPage = async () => {
            try {
                const page = await pdfDocument.getPage(targetPageIndex + 1);
                if (isStale()) return;

                const viewport = page.getViewport({ scale: 1.0 });
                const calculatedScale = (width / viewport.width) * scale;
                const scaledViewport = page.getViewport({ scale: calculatedScale });

                const height = Math.floor(scaledViewport.height);
                const calcWidth = Math.floor(scaledViewport.width);
                setPageHeight(height);
                setPageWidth(calcWidth);
                onDimensionsLoad?.(height);

                const canvas = canvasRef.current;
                if (!canvas || isStale()) return;
                const ownerDocument = canvas.ownerDocument;
                const ownerWindow = ownerDocument.defaultView ?? window;
                const context = canvas.getContext('2d');
                if (!context) return;

                let outputScale = ownerWindow.devicePixelRatio || 1;
                if (scaledViewport.width * outputScale > 4000) outputScale = 4000 / scaledViewport.width;
                canvas.width = Math.floor(scaledViewport.width * outputScale);
                canvas.height = Math.floor(scaledViewport.height * outputScale);
                canvas.style.width = `${Math.floor(scaledViewport.width)}px`;
                canvas.style.height = `${Math.floor(scaledViewport.height)}px`;

                const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

                if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
                setIsRendering(true);

                const renderTask = page.render({ canvasContext: context, viewport: scaledViewport, transform } as any);
                renderTaskRef.current = renderTask;
                await renderTask.promise;
                renderTaskRef.current = null;
                if (isStale()) return;
                setIsRendering(false);

                const tl = textLayerRef.current;
                if (!tl || isStale()) return;
                tl.innerHTML = '';

                if (textLayerInst.current) {
                    try { textLayerInst.current.cancel(); } catch { /* ignore */ }
                    textLayerInst.current = null;
                }

                const textContent = await page.getTextContent();
                if (isStale()) return;

                tl.style.setProperty('--scale-factor', String(calculatedScale));

                if (hasExtractablePdfText(textContent)) {
                    const textLayer = new (pdfjs as any).TextLayer({
                        textContentSource: textContent,
                        container: tl,
                        viewport: scaledViewport,
                    });
                    textLayerInst.current = textLayer;
                    await textLayer.render();
                    if (isStale()) {
                        try { textLayer.cancel(); } catch { /* ignore */ }
                        tl.innerHTML = '';
                        return;
                    }
                } else if (!ocrDoneRef.current) {
                    const key = pageKey(pdfDocument!, targetPageIndex);

                    if (ocrCache.has(key)) {
                        applyWords(ocrCache.get(key)!, tl, 1);
                    } else {
                        ocrTimer = window.setTimeout(() => {
                            void (async () => {
                                if (isStale()) return;
                                ocrDoneRef.current = true;
                                setIsOcrRunning(true);
                                try {
                                    const cssW = Math.floor(scaledViewport.width);
                                    const cssH = Math.floor(scaledViewport.height);
                                    const ocrCanvas = ownerDocument.createElement('canvas');
                                    ocrCanvas.width = cssW;
                                    ocrCanvas.height = cssH;
                                    const ocrCtx = ocrCanvas.getContext('2d');
                                    ocrCtx?.drawImage(
                                        canvas,
                                        0,
                                        0,
                                        canvas.width,
                                        canvas.height,
                                        0,
                                        0,
                                        cssW,
                                        cssH,
                                    );

                                    const words = await enqueueOcr(ocrCanvas, lang);
                                    if (isStale()) return;
                                    ocrCache.set(key, words);
                                    applyWords(words, tl, 1);
                                } catch (err) {
                                    ocrDoneRef.current = false;
                                    console.error(`[OCR] Sayfa ${targetPageIndex + 1} başarısız:`, err);
                                } finally {
                                    if (!isStale()) setIsOcrRunning(false);
                                }
                            })();
                        }, 700);
                    }
                }
            } catch (error: any) {
                if (
                    error?.name !== 'RenderingCancelledException' &&
                    error?.message !== 'Worker was destroyed'
                ) {
                    console.error(`Render error (page ${targetPageIndex + 1}):`, error);
                }
            } finally {
                if (!isStale()) setIsRendering(false);
            }
        };

        renderPage();

        return () => {
            mounted = false;
            if (ocrTimer) window.clearTimeout(ocrTimer);
            if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
            if (textLayerInst.current) { try { textLayerInst.current.cancel(); } catch { /* ignore */ } textLayerInst.current = null; }
            if (canvasEl) { canvasEl.width = 0; canvasEl.height = 0; }
        };
    }, [pdfDocument, pageIndex, width, scale, lang]);

    // ── Search highlighting (native PDF text + OCR words) ──
    useEffect(() => {
        const tl = textLayerRef.current;
        if (!tl) return;
        const ownerDocument = tl.ownerDocument;

        tl.querySelectorAll('.ocr-word').forEach((span: Element) => {
            (span as HTMLElement).style.backgroundColor = '';
        });

        tl.querySelectorAll('.pdf-search-highlight').forEach((mark: Element) => {
            const parent = mark.parentNode;
            if (parent) {
                parent.replaceChild(ownerDocument.createTextNode(mark.textContent || ''), mark);
                parent.normalize();
            }
        });

        if (!searchQuery.trim()) return;
        const q = searchQuery.toLowerCase();

        tl.querySelectorAll('.ocr-word').forEach((span: Element) => {
            const text = (span.textContent || '').toLowerCase();
            if (text.includes(q)) {
                (span as HTMLElement).style.backgroundColor = 'rgba(255, 213, 0, 0.45)';
            }
        });

        tl.querySelectorAll('span:not(.ocr-word):not(.pdf-search-highlight)').forEach((span: Element) => {
            const text = span.textContent || '';
            const lowerText = text.toLowerCase();
            if (!lowerText.includes(q)) return;

            const frag = ownerDocument.createDocumentFragment();
            let remaining = text;
            let lowerRemaining = lowerText;
            let idx: number;
            while ((idx = lowerRemaining.indexOf(q)) !== -1) {
                if (idx > 0) frag.appendChild(ownerDocument.createTextNode(remaining.slice(0, idx)));
                const mark = ownerDocument.createElement('mark');
                mark.className = 'pdf-search-highlight viewer-search-highlight';
                mark.style.position = 'relative';
                mark.textContent = remaining.slice(idx, idx + q.length);
                frag.appendChild(mark);
                remaining = remaining.slice(idx + q.length);
                lowerRemaining = lowerRemaining.slice(idx + q.length);
            }
            if (remaining) frag.appendChild(ownerDocument.createTextNode(remaining));
            span.textContent = '';
            span.appendChild(frag);
        });
    }, [searchQuery, pageIndex]);

    return (
        <div
            style={{
                height: pageHeight ? `${pageHeight}px` : 'auto',
                width: pageWidth ? `${pageWidth}px` : (width ? `${width}px` : 'auto'),
                position: 'relative',
            }}
            className={cn(
                'pdf-page bg-white mb-3 mx-auto transition-opacity duration-300',
                isRendering ? 'opacity-50' : 'opacity-100',
                className,
            )}
        >
            <canvas ref={canvasRef} className="block" />

            <div
                ref={textLayerRef}
                className="textLayer"
                style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    userSelect: 'text',
                    WebkitUserSelect: 'text',
                    pointerEvents: 'auto',
                    cursor: 'text',
                    overflow: 'hidden',
                }}
            />

            {isOcrRunning && (
                <div
                    className="absolute top-2 right-2 text-xs px-2 py-1 rounded flex items-center gap-1 animate-pulse"
                    style={{
                        background: 'rgba(255, 255, 255, 0.8)',
                        backdropFilter: 'blur(8px)',
                        color: 'black',
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                        pointerEvents: 'none',
                    }}
                >
                    <span className="material-symbols-rounded" style={{ fontSize: 14 }}>plagiarism</span>
                    Metin Taranıyor...
                </div>
            )}
            {!pageHeight && (
                <div className="absolute inset-0 flex items-center justify-center bg-white text-black">
                    <span className="animate-pulse">Sayfa Hazırlanıyor...</span>
                </div>
            )}
        </div>
    );
};
