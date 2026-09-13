import React, { useEffect, useRef, useState, useCallback } from 'react';
import UTIF from 'utif';
import { TransformWrapper, TransformComponent, useControls } from 'react-zoom-pan-pinch';
import { enqueueOcr, applyWords } from '../../services/ocrService';

interface TIFFViewerProps {
    fileUrl: string;
    /** Tesseract dil kodu — public/tesseract/<lang>.traineddata.gz (örn. 'tur', 'eng', 'ara') */
    lang?: string;
    searchQuery?: string;
}

type ViewMode = 'pan' | 'select';

// OCR cache: fileUrl + pageIndex → words[] (version bumps when OCR pipeline changes)
const tiffOcrCache = new Map<string, any[]>();
function tiffCacheKey(url: string, page: number) { return `${url}__${page}__v2-blocks`; }

// ─── Toolbar bileşeni — useControls, TransformWrapper context'i gerektirir ───
const TiffToolbar: React.FC<{
    mode: ViewMode;
    onModeChange: (m: ViewMode) => void;
    pageIndex: number;
    totalPages: number;
    loading: boolean;
    isOcr: boolean;
    ocrDone: boolean;
    ocrError: string | null;
    onPrev: () => void;
    onNext: () => void;
}> = ({ mode, onModeChange, pageIndex, totalPages, loading, isOcr, ocrDone, ocrError, onPrev, onNext }) => {
    const { zoomIn, zoomOut, resetTransform } = useControls();
    const isPan = mode === 'pan';
    const isSelect = mode === 'select';

    return (
        <div
            className="flex items-center px-3 py-1.5 gap-2 border-b flex-shrink-0"
            style={{
                background: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(12px)',
                borderColor: 'rgba(0, 0, 0, 0.1)',
            }}
        >
            {/* Zoom kontrolleri */}
            <button
                onClick={() => zoomOut()}
                title="Uzaklaş"
                className="w-8 h-8 flex items-center justify-center rounded hover:opacity-60 transition-opacity"
                style={{ color: 'black' }}
            >
                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>remove</span>
            </button>
            <button
                onClick={() => resetTransform()}
                title="Sıfırla"
                className="w-8 h-8 flex items-center justify-center rounded hover:opacity-60 transition-opacity"
                style={{ color: 'black' }}
            >
                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>fit_screen</span>
            </button>
            <button
                onClick={() => zoomIn()}
                title="Yaklaş"
                className="w-8 h-8 flex items-center justify-center rounded hover:opacity-60 transition-opacity"
                style={{ color: 'black' }}
            >
                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>add</span>
            </button>

            <div className="h-5 w-px mx-1" style={{ background: 'rgba(0, 0, 0, 0.1)' }} />

            {/* Sayfa navigasyon */}
            {totalPages > 1 && (
                <>
                    <button
                        onClick={onPrev}
                        disabled={pageIndex === 0 || loading}
                        title="Önceki Sayfa"
                        className="w-8 h-8 flex items-center justify-center rounded transition-opacity disabled:opacity-30"
                        style={{ color: 'black' }}
                    >
                        <span className="material-symbols-rounded" style={{ fontSize: 18 }}>chevron_left</span>
                    </button>
                    <span className="text-xs font-mono" style={{ color: 'black' }}>
                        {pageIndex + 1} / {totalPages}
                    </span>
                    <button
                        onClick={onNext}
                        disabled={pageIndex >= totalPages - 1 || loading}
                        title="Sonraki Sayfa"
                        className="w-8 h-8 flex items-center justify-center rounded transition-opacity disabled:opacity-30"
                        style={{ color: 'black' }}
                    >
                        <span className="material-symbols-rounded" style={{ fontSize: 18 }}>chevron_right</span>
                    </button>

                    <div className="h-5 w-px mx-1" style={{ background: 'rgba(0, 0, 0, 0.1)' }} />
                </>
            )}

            {/* Pan / Metin seç modu */}
            <div className="flex rounded overflow-hidden border" style={{ borderColor: 'rgba(0, 0, 0, 0.1)' }}>
                <button
                    onClick={() => onModeChange('pan')}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs transition-colors hover:opacity-80"
                    style={{
                        background: isPan ? '#294545' : 'transparent',
                        color: isPan ? 'white' : 'black',
                    }}
                >
                    <span className="material-symbols-rounded" style={{ fontSize: 18 }}>pan_tool</span>
                </button>
                <button
                    onClick={() => onModeChange('select')}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs transition-colors hover:opacity-80"
                    style={{
                        background: isSelect ? '#294545' : 'transparent',
                        color: isSelect ? 'white' : 'black',
                    }}
                >
                    <span className="material-symbols-rounded" style={{ fontSize: 18 }}>text_select_start</span>
                    {isOcr && <span className="ml-1 animate-pulse opacity-70">…</span>}
                </button>
            </div>

            {ocrError && (
                <span className="text-xs text-red-500 ml-1">{ocrError}</span>
            )}
            {ocrDone && isSelect && !ocrError && (
                <span className="text-xs opacity-60 flex items-center gap-1 ml-1" style={{ color: 'black' }}>
                    <span className="material-symbols-rounded" style={{ fontSize: 18 }}>check_circle</span>
                </span>
            )}
        </div>
    );
};

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────
export const TIFFViewer: React.FC<TIFFViewerProps> = ({ fileUrl, lang = 'tur', searchQuery = '' }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);

    // UI State
    const [mode, setMode] = useState<ViewMode>('pan');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pageIndex, setPageIndex] = useState(0);

    // OCR state
    const [isOcr, setIsOcr] = useState(false);
    const [ocrDone, setOcrDone] = useState(false);
    const [ocrError, setOcrError] = useState<string | null>(null);

    // TIFF Data
    const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
    const [pages, setPages] = useState<Array<any>>([]);
    const [imageData, setImageData] = useState<ImageData | null>(null);
    const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

    // ── 1. Dosyayı yükle ve TIFF yapısını ayrıştır ─────────────────────────
    useEffect(() => {
        const loadTiff = async () => {
            try {
                setLoading(true);
                setError(null);
                setPageIndex(0);
                setOcrDone(false);
                setOcrError(null);

                const response = await fetch(fileUrl);
                const arrayBuffer = await response.arrayBuffer();
                const ifds = UTIF.decode(arrayBuffer);

                if (!ifds || ifds.length === 0) throw new Error('TIFF Yüklenirken Hata Oluştu');

                setBuffer(arrayBuffer);
                setPages(ifds);
            } catch (err: any) {
                console.error('TIFF Yüklenirken Hata Oluştu:', err);
                setError(err.message || 'TIFF Yüklenirken Hata Oluştu');
                setLoading(false);
            }
        };
        if (fileUrl) loadTiff();
    }, [fileUrl]);

    // ── 2. Sayfa değişince görüntü verisini çöz ────────────────────────────
    useEffect(() => {
        if (!buffer || pages.length === 0) return;
        try {
            setLoading(true);
            // Sayfa değişince OCR overlay'i sıfırla
            setOcrDone(false);
            setOcrError(null);
            if (overlayRef.current) overlayRef.current.innerHTML = '';

            const tiffPage = pages[pageIndex];
            UTIF.decodeImage(buffer, tiffPage);
            const rgba = UTIF.toRGBA8(tiffPage);
            const newImageData = new ImageData(new Uint8ClampedArray(rgba), tiffPage.width, tiffPage.height);

            setDimensions({ width: tiffPage.width, height: tiffPage.height });
            setImageData(newImageData);
            setLoading(false);
        } catch (err: any) {
            console.error('Kod Çözüm Hatası:', err);
            setError('Kod Çözüm Hatası Oluştu');
            setLoading(false);
        }
    }, [pageIndex, pages, buffer]);

    // ── 3. Canvas'a çiz ────────────────────────────────────────────────────
    useEffect(() => {
        if (!imageData || !canvasRef.current || !dimensions) return;
        const canvas = canvasRef.current;
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
        canvas.style.width = `${dimensions.width}px`;
        canvas.style.height = `${dimensions.height}px`;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.putImageData(imageData, 0, 0);
        }
    }, [imageData, dimensions]);

    // ── OCR çalıştır ────────────────────────────────────────────────────────
    const runOcr = useCallback(async () => {
        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        if (!canvas || !overlay || isOcr || ocrDone) return;

        const key = tiffCacheKey(fileUrl, pageIndex);

        // Cache hit — anında geri yükle
        if (tiffOcrCache.has(key)) {
            overlay.innerHTML = '';
            applyWords(tiffOcrCache.get(key)!, overlay, 1);
            setOcrDone(true);
            return;
        }

        setIsOcr(true);
        setOcrError(null);
        try {
            // RAM dostu: CSS boyutunda küçültülmüş canvas kullan
            const cssW = Math.min(canvas.width, 2400);
            const cssH = Math.round((cssW / canvas.width) * canvas.height);
            const ocrCanvas = document.createElement('canvas');
            ocrCanvas.width = cssW;
            ocrCanvas.height = cssH;
            ocrCanvas.getContext('2d')?.drawImage(canvas, 0, 0, cssW, cssH);

            const words = await enqueueOcr(ocrCanvas, lang);

            tiffOcrCache.set(key, words);
            overlay.innerHTML = '';
            // canvas CSS px / ocrCanvas px = effective scale
            const scaleX = canvas.clientWidth / cssW;
            const scaleY = canvas.clientHeight / cssH;
            applyWords(words, overlay, scaleX, scaleY);
            setOcrDone(true);
        } catch (err: any) {
            console.error('[OCR] TIFF tarama başarısız:', err);
            setOcrError('OCR başarısız oldu.');
        } finally {
            setIsOcr(false);
        }
    }, [fileUrl, pageIndex, lang, isOcr, ocrDone]);

    const handleModeChange = (newMode: ViewMode) => {
        setMode(newMode);
        if (newMode === 'select' && !ocrDone && !isOcr) runOcr();
    };

    // ── OCR search highlighting ──
    useEffect(() => {
        const overlay = overlayRef.current;
        if (!overlay) return;
        overlay.querySelectorAll('.ocr-word').forEach((span: Element) => {
            (span as HTMLElement).style.backgroundColor = '';
        });
        if (!searchQuery.trim()) return;
        const q = searchQuery.toLowerCase();
        overlay.querySelectorAll('.ocr-word').forEach((span: Element) => {
            const text = (span.textContent || '').toLowerCase();
            if (text.includes(q)) {
                (span as HTMLElement).style.backgroundColor = 'rgba(255, 213, 0, 0.45)';
            }
        });
    }, [searchQuery, ocrDone]);

    const isSelect = mode === 'select';

    if (error) return (
        <div className="flex justify-center items-center h-full text-black">
            <span className="material-symbols-rounded mr-2" style={{ fontSize: 20 }}>error</span>
            {error}
        </div>
    );

    return (
        <div className="h-full w-full flex flex-col overflow-hidden" style={{ background: 'white' }}>

            {loading && (
                <div
                    className="absolute inset-0 z-50 flex items-center justify-center bg-white/80"
                    style={{
                        backdropFilter: 'blur(8px)',
                    }}
                >
                    <span className="animate-pulse text-sm text-black/60">
                        {pages.length > 0 ? `Sayfa ${pageIndex + 1} Yükleniyor...` : 'TIFF Yükleniyor...'}
                    </span>
                </div>
            )}

            <TransformWrapper
                initialScale={1}
                minScale={0.2}
                maxScale={10}
                centerOnInit
                disabled={isSelect}
                panning={{ disabled: isSelect }}
                pinch={{ disabled: isSelect }}
            >
                <TiffToolbar
                    mode={mode}
                    onModeChange={handleModeChange}
                    pageIndex={pageIndex}
                    totalPages={pages.length}
                    loading={loading}
                    isOcr={isOcr}
                    ocrDone={ocrDone}
                    ocrError={ocrError}
                    onPrev={() => setPageIndex(p => Math.max(0, p - 1))}
                    onNext={() => setPageIndex(p => Math.min(pages.length - 1, p + 1))}
                />

                <div className="flex-1 overflow-hidden">
                    <TransformComponent
                        wrapperStyle={{
                            width: '100%',
                            height: '100%',
                            ...(isSelect ? { userSelect: 'text' as const } : {}),
                        }}
                        contentStyle={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}
                    >
                        {/* Canvas + OCR overlay aynı transform container'ında */}
                        <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
                            <canvas
                                ref={canvasRef}
                                style={{
                                    display: imageData ? 'block' : 'none',
                                    maxWidth: '90vw',
                                    maxHeight: '85vh',
                                    userSelect: 'none',
                                    pointerEvents: isSelect ? 'none' : 'auto',
                                }}
                            />

                            {/* Invisible OCR text overlay — .ocr-overlay CSS kuralları */}
                            <div
                                ref={overlayRef}
                                className="ocr-overlay"
                                data-select={isSelect ? 'true' : 'false'}
                            />

                            {isOcr && (
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
                        </div>
                    </TransformComponent>
                </div>
            </TransformWrapper>
        </div>
    );
};