import React, { useState, useRef, useCallback, useEffect } from 'react';
import { TransformWrapper, TransformComponent, useControls } from 'react-zoom-pan-pinch';
import { enqueueOcr, applyWords } from '../../services/ocrService';

interface ImageViewerProps {
    src: string;
    alt?: string;
    /** Tesseract dil kodu — public/tesseract/<lang>.traineddata.gz (örn. 'tur', 'eng', 'ara') */
    lang?: string;
    searchQuery?: string;
}

type ViewMode = 'pan' | 'select';

// ─── Zoom toolbar içi bileşen (useControls TransformWrapper context'i gerektirir) ──
const ZoomBar: React.FC<{
    mode: ViewMode;
    onModeChange: (m: ViewMode) => void;
    isOcr: boolean;
    ocrDone: boolean;
    ocrError: string | null;
}> = ({ mode, onModeChange, isOcr, ocrDone, ocrError }) => {
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
            <button onClick={() => zoomOut()} title="Uzaklaş"
                className="w-8 h-8 flex items-center justify-center rounded hover:opacity-60 transition-opacity"
                style={{ color: 'black' }}>
                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>remove</span>
            </button>
            <button onClick={() => resetTransform()} title="Sıfırla"
                className="w-8 h-8 flex items-center justify-center rounded hover:opacity-60 transition-opacity"
                style={{ color: 'black' }}>
                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>fit_screen</span>
            </button>
            <button onClick={() => zoomIn()} title="Yaklaş"
                className="w-8 h-8 flex items-center justify-center rounded hover:opacity-60 transition-opacity"
                style={{ color: 'black' }}>
                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>add</span>
            </button>

            <div className="h-5 w-px mx-1" style={{ background: 'rgba(0, 0, 0, 0.1)' }} />

            {/* Mod seçici */}
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

            {ocrError && <span className="text-xs text-red-500 ml-1">{ocrError}</span>}
            {ocrDone && isSelect && !ocrError && (
                <span className="text-xs opacity-60 flex items-center gap-1 ml-1" style={{ color: 'black' }}>
                    <span className="material-symbols-rounded" style={{ fontSize: 14 }}>check_circle</span>
                </span>
            )}
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const ImageViewer: React.FC<ImageViewerProps> = ({ src, alt = 'Image', lang = 'tur', searchQuery = '' }) => {
    const imgRef = useRef<HTMLImageElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);

    const [mode, setMode] = useState<ViewMode>('pan');
    const [isPanning, setIsPanning] = useState(false);
    const [isOcr, setIsOcr] = useState(false);
    const [ocrDone, setOcrDone] = useState(false);
    const [ocrError, setOcrError] = useState<string | null>(null);

    const isSelect = mode === 'select';

    const runOcr = useCallback(async () => {
        const img = imgRef.current;
        const overlay = overlayRef.current;
        if (!img || !overlay || isOcr || ocrDone) return;

        setIsOcr(true);
        setOcrError(null);
        try {
            // RAM dostu: max 2400px genişliğe indir
            const maxW = Math.min(img.naturalWidth, 2400);
            const maxH = Math.round((maxW / img.naturalWidth) * img.naturalHeight);
            const canvas = document.createElement('canvas');
            canvas.width = maxW;
            canvas.height = maxH;
            canvas.getContext('2d')?.drawImage(img, 0, 0, maxW, maxH);

            const words = await enqueueOcr(canvas, lang);

            // OCR bbox koordinatları maxW/maxH canvas'a göre;
            // img.clientWidth/Height → ekrandaki CSS piksel boyutu
            const scaleX = img.clientWidth / maxW;
            const scaleY = img.clientHeight / maxH;
            overlay.innerHTML = '';
            applyWords(words, overlay, scaleX, scaleY);
            setOcrDone(true);
        } catch (err: any) {
            console.error('[OCR] Görsel tarama başarısız:', err);
            setOcrError('OCR başarısız oldu.');
        } finally {
            setIsOcr(false);
        }
    }, [isOcr, ocrDone, lang]);

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

    return (
        <div className="h-full w-full flex flex-col overflow-hidden" style={{ background: 'white' }}>
            <TransformWrapper
                initialScale={1}
                minScale={0.2}
                maxScale={10}
                centerOnInit={false}
                centerZoomedOut={false}
                limitToBounds={false}
                disabled={isSelect}
                panning={{ disabled: isSelect }}
                pinch={{ disabled: isSelect }}
                onPanningStart={() => setIsPanning(true)}
                onPanningStop={() => setIsPanning(false)}
            >
                {/* ZoomBar, TransformWrapper'ın context'inden useControls ile besleniyor */}
                <ZoomBar
                    mode={mode}
                    onModeChange={handleModeChange}
                    isOcr={isOcr}
                    ocrDone={ocrDone}
                    ocrError={ocrError}
                />

                <div className="flex-1 overflow-hidden">
                    <TransformComponent
                        wrapperStyle={{
                            width: '100%',
                            height: '100%',
                            cursor: isSelect ? 'text' : isPanning ? 'grabbing' : 'grab',
                            // react-zoom-pan-pinch injects user-select:none on the wrapper; override in text mode so OCR spans are selectable
                            ...(isSelect ? { userSelect: 'text' as const } : {}),
                        }}
                        contentStyle={{
                            display: 'inline-flex',
                            alignItems: 'flex-start',
                            justifyContent: 'flex-start',
                            width: 'max-content',
                            height: 'max-content',
                            cursor: isSelect ? 'text' : isPanning ? 'grabbing' : 'grab',
                        }}
                    >
                        {/* Görsel + OCR overlay aynı transform container'ında → zoom birlikte ölçeklenir */}
                        <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
                            <img
                                ref={imgRef}
                                src={src}
                                alt={alt}
                                draggable={false}
                                style={{
                                    maxWidth: '90vw',
                                    maxHeight: '85vh',
                                    display: 'block',
                                    userSelect: 'none',
                                    pointerEvents: isSelect ? 'none' : 'auto',
                                    cursor: isSelect ? 'default' : 'grab',
                                }}
                            />

                            {/* Invisible OCR text overlay — .ocr-overlay CSS kuralları ile yönetilir */}
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
