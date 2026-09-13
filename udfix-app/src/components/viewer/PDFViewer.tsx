import React, { useState, useEffect, useRef } from 'react';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Virtuoso } from 'react-virtuoso';
import { PDFPage } from './PDFPage';
import { cn } from '../../lib/utils';
import debounce from 'lodash/debounce';
import { buildPdfDocumentInit } from '../../utils/pdfjsDocument';

// Worker Setup (Legacy build for maximum compatibility)
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// PDF.js CSS — text layer seçim stili için gerekli
import 'pdfjs-dist/web/pdf_viewer.css';

interface PDFViewerProps {
    fileUrl: string;
    searchQuery?: string;
}

const PageTracker: React.FC<{ index: number; onVisible: (idx: number) => void; children: React.ReactNode }> = ({ index, onVisible, children }) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) onVisible(index + 1); },
            { rootMargin: '-50% 0px -50% 0px' },
        );
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, [index, onVisible]);

    return (
        <div ref={ref} className="flex justify-center min-w-full w-max py-0 px-0">
            <div className={cn(
                'w-max inline-block leading-[0] border border-[var(--main-color)] bg-[var(--main-color)] relative transition-shadow duration-300',
                'shadow-[0_0_25px_color-mix(in_srgb,var(--main-color)_20%,transparent)] dark:shadow-[0_0_25px_color-mix(in_srgb,var(--main-color)_80%,transparent)]',
            )}>
                {children}
            </div>
        </div>
    );
};

export const PDFViewer: React.FC<PDFViewerProps> = ({ fileUrl, searchQuery = '' }) => {
    const [pdfDocument, setPdfDocument] = useState<pdfjs.PDFDocumentProxy | null>(null);
    const [scale, setScale] = useState(1.0);
    const [viewerWidth, setViewerWidth] = useState(0);
    const [isEditingScale, setIsEditingScale] = useState(false);
    const [isEditingPage, setIsEditingPage] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [tempValue, setTempValue] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const virtuosoRef = useRef<any>(null);
    // Track the "current" doc so we can destroy the old one after the new one loads
    const docRef = useRef<pdfjs.PDFDocumentProxy | null>(null);

    const handleScaleSubmit = () => {
        const val = parseFloat(tempValue);
        if (!isNaN(val) && val >= 10 && val <= 500) setScale(val / 100);
        setIsEditingScale(false);
    };

    const handlePageSubmit = () => {
        const val = parseInt(tempValue);
        if (!isNaN(val) && val >= 1 && val <= (pdfDocument?.numPages || 1)) {
            virtuosoRef.current?.scrollToIndex(val - 1);
        }
        setIsEditingPage(false);
    };

    // ── Load Document ──────────────────────────────────────────────────────────
    // FIX: destroy the OLD doc AFTER the new one is set in state so that
    //      still-mounted PDFPage components don't call getPage() on a null transport.
    useEffect(() => {
        if (!fileUrl) return;
        let cancelled = false;

        const loadPdf = async () => {
            try {
                const ownerWindow =
                    containerRef.current?.ownerDocument.defaultView ?? window;
                const loadingTask = pdfjs.getDocument(buildPdfDocumentInit(fileUrl, ownerWindow));
                const newDoc = await loadingTask.promise;
                if (cancelled) { newDoc.destroy(); return; }

                // Swap in the new doc first — React will unmount old PDFPages
                // with the old doc reference still intact (no race).
                const oldDoc = docRef.current;
                docRef.current = newDoc;
                setPdfDocument(newDoc);

                // Now it's safe to destroy the old doc (all old PDFPage effects
                // will have run their cleanup and cancelled their render tasks).
                if (oldDoc) {
                    // Small delay so React can flush unmount effects before destroy
                    setTimeout(() => { try { oldDoc.destroy(); } catch { /* ignore */ } }, 300);
                }

                setCurrentPage(1);
            } catch (error) {
                if (!cancelled) console.error('Error loading PDF:', error);
            }
        };

        loadPdf();
        return () => { cancelled = true; };
    }, [fileUrl]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (docRef.current) { try { docRef.current.destroy(); } catch { /* ignore */ } }
        };
    }, []);

    // ── Container resize ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!containerRef.current) return;
        const debouncedResize = debounce((width: number) => setViewerWidth(width), 150);
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) debouncedResize(entry.contentRect.width - 40);
        });
        ro.observe(containerRef.current);
        return () => { ro.disconnect(); debouncedResize.cancel(); };
    }, []);

    // ── Mouse Wheel / Pinch Zoom ────────────────────────────────────────────────
    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) {
                return;
            }

            const delta = e.deltaY;
            const zoomFactor = 0.01;
            setScale(s => {
                const newScale = s - delta * zoomFactor;
                return Math.min(5, Math.max(0.1, parseFloat(newScale.toFixed(2))));
            });
        };

        const container = containerRef.current;
        if (!container) return;
        container.addEventListener('wheel', handleWheel, { passive: true });
        return () => container.removeEventListener('wheel', handleWheel);
    }, []);

    // ── Full Document Search ────────────────────────────────────────────────────
    const [globalMatchCount, setGlobalMatchCount] = useState(0);
    const [matchPages, setMatchPages] = useState<number[]>([]);
    const [currentGlobalMatch, setCurrentGlobalMatch] = useState(-1);

    useEffect(() => {
        if (!pdfDocument || !searchQuery.trim()) {
            setGlobalMatchCount(0);
            setMatchPages([]);
            setCurrentGlobalMatch(-1);
            if ((window as any).__pdfSearchNext) delete (window as any).__pdfSearchNext;
            if ((window as any).__pdfSearchPrevious) delete (window as any).__pdfSearchPrevious;
            if ((window as any).__pdfSearchCount !== undefined) delete (window as any).__pdfSearchCount;
            return;
        }

        let cancelled = false;
        const search = async () => {
            let total = 0;
            const pagesWithMatches: number[] = [];
            const q = searchQuery.toLowerCase();

            for (let i = 1; i <= pdfDocument.numPages; i++) {
                if (cancelled) return;
                try {
                    const page = await pdfDocument.getPage(i);
                    const tc = await page.getTextContent();
                    const text = tc.items.map((it: any) => it.str).join(' ');
                    
                    const lower = text.toLowerCase();
                    let pageMatches = 0;
                    let idx = lower.indexOf(q);
                    while (idx !== -1) {
                        pageMatches++;
                        idx = lower.indexOf(q, idx + q.length);
                    }
                    if (pageMatches > 0) {
                        total += pageMatches;
                        // her eşleşme için sayfa numarasını ekle (0-indexed virtuoso için)
                        for(let m=0; m<pageMatches; m++) pagesWithMatches.push(i - 1); 
                    }
                } catch { /* ignore per-page search failures */ }
            }
            if (!cancelled) {
                setGlobalMatchCount(total);
                setMatchPages(pagesWithMatches);
                setCurrentGlobalMatch(-1);
            }
        };
        search();

        return () => { cancelled = true; };
    }, [pdfDocument, searchQuery]);

    useEffect(() => {
        if (globalMatchCount > 0) {
            (window as any).__pdfSearchCount = globalMatchCount;
            (window as any).__pdfSearchNext = () => {
                let next = currentGlobalMatch + 1;
                if (next >= matchPages.length) next = 0;
                setCurrentGlobalMatch(next);
                const targetPage = matchPages[next];
                virtuosoRef.current?.scrollToIndex({ index: targetPage, align: 'center' });
                return { count: globalMatchCount, index: next };
            };
            (window as any).__pdfSearchPrevious = () => {
                let prev = currentGlobalMatch - 1;
                if (prev < 0) prev = matchPages.length - 1;
                setCurrentGlobalMatch(prev);
                const targetPage = matchPages[prev];
                virtuosoRef.current?.scrollToIndex({ index: targetPage, align: 'center' });
                return { count: globalMatchCount, index: prev };
            };
        } else {
            delete (window as any).__pdfSearchNext;
            delete (window as any).__pdfSearchPrevious;
            delete (window as any).__pdfSearchCount;
        }
        return () => {
            delete (window as any).__pdfSearchNext;
            delete (window as any).__pdfSearchPrevious;
            delete (window as any).__pdfSearchCount;
        };
    }, [globalMatchCount, matchPages, currentGlobalMatch]);

    return (
        <div ref={containerRef} className="h-full w-full flex flex-col relative overflow-hidden">
            {!pdfDocument ? (
                <div className="flex-1 flex items-center justify-center text-black">
                    <span className="animate-pulse font-medium">PDF Hazırlanıyor...</span>
                </div>
            ) : (
                <>
                    {/* Toolbar */}
                    <div
                        className="sticky top-0 z-20 flex items-center px-3 py-1.5 gap-2 border-b"
                        style={{
                            background: 'rgba(255, 255, 255, 0.8)',
                            backdropFilter: 'blur(12px)',
                            borderColor: 'rgba(0, 0, 0, 0.1)',
                        }}
                    >
                        {/* Zoom */}
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setScale(s => Math.max(0.1, parseFloat((s - 0.1).toFixed(2))))}
                                className="w-8 h-8 flex items-center justify-center rounded hover:opacity-60 transition-opacity"
                                style={{ color: 'black' }}
                                title="Uzaklaş"
                            >
                                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>remove</span>
                            </button>

                            {isEditingScale ? (
                                <input
                                    autoFocus
                                    className="w-14 h-7 text-center border rounded bg-transparent text-xs outline-none focus:ring-1"
                                    style={{ color: 'black', borderColor: 'rgba(0, 0, 0, 0.1)' }}
                                    value={tempValue}
                                    onChange={e => setTempValue(e.target.value)}
                                    onBlur={handleScaleSubmit}
                                    onKeyDown={e => e.key === 'Enter' && handleScaleSubmit()}
                                />
                            ) : (
                                <span
                                    className="px-2 font-mono text-xs min-w-[50px] text-center cursor-pointer rounded py-1 hover:opacity-60"
                                    style={{ color: 'black' }}
                                    onClick={() => { setTempValue(Math.round(scale * 100).toString()); setIsEditingScale(true); }}
                                >
                                    %{Math.round(scale * 100)}
                                </span>
                            )}

                            <button
                                onClick={() => setScale(s => Math.min(5, parseFloat((s + 0.1).toFixed(2))))}
                                className="w-8 h-8 flex items-center justify-center rounded hover:opacity-60 transition-opacity"
                                style={{ color: 'black' }}
                                title="Yaklaş"
                            >
                                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>add</span>
                            </button>
                        </div>

                        <div className="h-5 w-px mx-1" style={{ background: 'rgba(0, 0, 0, 0.1)' }} />

                        {/* Page counter */}
                        <div className="flex items-center font-medium">
                            {isEditingPage ? (
                                <input
                                    autoFocus
                                    className="w-10 h-7 text-center border rounded bg-transparent text-xs outline-none focus:ring-1"
                                    style={{ color: 'black', borderColor: 'rgba(0, 0, 0, 0.1)' }}
                                    value={tempValue}
                                    onChange={e => setTempValue(e.target.value)}
                                    onBlur={handlePageSubmit}
                                    onKeyDown={e => e.key === 'Enter' && handlePageSubmit()}
                                />
                            ) : (
                                <span
                                    className="cursor-pointer px-2 py-1 rounded text-xs hover:opacity-60 transition-opacity"
                                    style={{ color: 'black' }}
                                    onClick={() => { setTempValue(currentPage.toString()); setIsEditingPage(true); }}
                                >
                                    {currentPage}
                                </span>
                            )}
                            <span className="mx-1 text-xs" style={{ color: 'black' }}>/</span>
                            <span className="text-xs" style={{ color: 'black' }}>{pdfDocument.numPages} Sayfa</span>
                        </div>
                    </div>

                    {/* Sayfa listesi */}
                    <div className="flex-1 overflow-auto custom-scrollbar">
                        {viewerWidth > 0 && (
                            <Virtuoso
                                ref={virtuosoRef}
                                totalCount={pdfDocument.numPages}
                                style={{ height: '100%' }}
                                overscan={120}
                                rangeChanged={range => setCurrentPage(range.startIndex + 1)}
                                itemContent={index => (
                                    <PageTracker index={index} onVisible={setCurrentPage}>
                                        <PDFPage
                                            key={index}
                                            pdfDocument={pdfDocument}
                                            pageIndex={index}
                                            width={viewerWidth}
                                            scale={scale}
                                            searchQuery={searchQuery}
                                        />
                                    </PageTracker>
                                )}
                            />
                        )}
                    </div>
                </>
            )}
        </div>
    );
};