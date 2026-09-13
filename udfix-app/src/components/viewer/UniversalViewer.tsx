import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PDFViewer } from './PDFViewer';
import { ImageViewer } from './ImageViewer';
import { TIFFViewer } from './TIFFViewer';
import { UDFViewer } from './UDFViewer';
import { MarkdownViewer } from './MarkdownViewer';
import { DocxViewer } from './DocxViewer';
import { TextViewer } from './TextViewer';
import { XLSXViewer } from './XLSXViewer';
import { RTFViewer } from './RTFViewer';
import { EmailViewer } from './EmailViewer';
import { ZipViewer } from './ZipViewer';
import { EypViewer } from './EypViewer';
import { useThemeStore } from '../../stores/useThemeStore';
import { cn } from '../../lib/utils';
import { resolveToBlobUrl } from '../../utils/localResource';
import { isRemoteFetchableUrl } from '../../utils/fileUrl';
import { isArchiveViewerExtension, resolveViewerExtension } from '../../utils/viewerExtension';

/** `auto`: uygulama temasına uy; `original` / `adapted`: bu sekme için sabitle */
type ViewerDocumentColorMode = 'auto' | 'original' | 'adapted';

interface UniversalViewerProps {
    fileUrl: string | null;
    fileName: string | null; // Used for extension detection
    /** Sürüm metin farkı gibi, dosya yerine doğrudan HTML ile gösterim */
    embeddedDiffHtml?: string | null;
}

function resolveDocumentInvert(
    colorMode: ViewerDocumentColorMode,
    appDark: boolean
): boolean {
    if (colorMode === 'adapted') return true;
    if (colorMode === 'original') return false;
    return appDark;
}

export const UniversalViewer: React.FC<UniversalViewerProps> = ({
    fileUrl,
    fileName,
    embeddedDiffHtml = null,
}) => {
    const { mode } = useThemeStore();
    const [documentColorMode, setDocumentColorMode] = useState<ViewerDocumentColorMode>('auto');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchResultCount, setSearchResultCount] = useState(0);
    const [currentHighlight, setCurrentHighlight] = useState(-1);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const viewerContainerRef = useRef<HTMLDivElement>(null);
    const activeMatchIndex = currentHighlight >= 0 ? currentHighlight : null;
    const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
    const createdBlobUrlRef = useRef<string | null>(null);

    const isAppDark =
        mode === 'dark' ||
        (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const applyDocumentInvert = resolveDocumentInvert(documentColorMode, isAppDark);

    const toggleDocumentColorMode = useCallback(() => {
        setDocumentColorMode((prev) =>
            resolveDocumentInvert(prev, isAppDark) ? 'original' : 'adapted'
        );
    }, [isAppDark]);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            if (!fileUrl || !fileName) {
                setResolvedUrl(null);
                return;
            }
            const ownerWindow =
                viewerContainerRef.current?.ownerDocument.defaultView ?? window;
            try {
                const next = await resolveToBlobUrl(fileUrl, fileName, ownerWindow);
                if (cancelled) return;
                if (createdBlobUrlRef.current && createdBlobUrlRef.current !== next) {
                    ownerWindow.URL.revokeObjectURL(createdBlobUrlRef.current);
                    createdBlobUrlRef.current = null;
                }
                if (next.startsWith('blob:')) {
                    createdBlobUrlRef.current = next;
                } else {
                    createdBlobUrlRef.current = null;
                }
                setResolvedUrl(next);
            } catch {
                if (!cancelled) {
                    setResolvedUrl(isRemoteFetchableUrl(fileUrl) ? fileUrl : null);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [fileName, fileUrl]);

    useEffect(() => {
        return () => {
            if (createdBlobUrlRef.current) {
                const ownerWindow =
                    viewerContainerRef.current?.ownerDocument.defaultView ?? window;
                ownerWindow.URL.revokeObjectURL(createdBlobUrlRef.current);
                createdBlobUrlRef.current = null;
            }
        };
    }, []);

    // Dosya değiştiğinde aramayı ve belge renk modunu sıfırla
    useEffect(() => {
        setSearchQuery('');
        setIsSearchOpen(false);
        setSearchResultCount(0);
        setCurrentHighlight(-1);
        setDocumentColorMode('auto');
    }, [resolvedUrl]);

    // ── Count search results across viewer container ──
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResultCount(0);
            return;
        }
        // Debounce count to let mark.js / PDFPage finish rendering
        const timer = setTimeout(() => {
            if ((window as any).__pdfSearchCount !== undefined) {
                setSearchResultCount((window as any).__pdfSearchCount);
                setCurrentHighlight(-1);
                return;
            }

            const container = viewerContainerRef.current;
            if (!container) return;
            // Count all search highlights
            let count = 0;
            container.querySelectorAll('.viewer-search-highlight, .pdf-search-highlight').forEach(() => count++);
            container.querySelectorAll('.ocr-word').forEach((el: Element) => {
                if ((el as HTMLElement).style.backgroundColor) count++;
            });
            setSearchResultCount(count);
            setCurrentHighlight(-1);
        }, 350);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // ── Navigate between highlights (DOM / PDF / OCR) ──
    const navigateToNextHighlight = useCallback(() => {
        if ((window as any).__pdfSearchNext) {
            const result = (window as any).__pdfSearchNext();
            if (result) setCurrentHighlight(result.index);
            return;
        }

        const container = viewerContainerRef.current;
        if (!container || !searchQuery.trim()) return;
        const allMarks = container.querySelectorAll('.viewer-search-highlight, .pdf-search-highlight');
        const ocrWords: Element[] = [];
        container.querySelectorAll('.ocr-word').forEach((el: Element) => {
            if ((el as HTMLElement).style.backgroundColor) ocrWords.push(el);
        });
        const combined = [...Array.from(allMarks), ...ocrWords];
        if (combined.length === 0) return;

        const nextIdx = (currentHighlight + 1) % combined.length;
        setCurrentHighlight(nextIdx);

        container.querySelectorAll('.search-active-highlight').forEach((el) => {
            el.classList.remove('search-active-highlight');
        });

        const target = combined[nextIdx];
        if (target) {
            if (target.classList.contains('ocr-word')) {
                target.classList.add('search-active-highlight');
            }
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [currentHighlight, searchQuery]);

    const navigateToPreviousHighlight = useCallback(() => {
        if ((window as any).__pdfSearchPrevious) {
            const result = (window as any).__pdfSearchPrevious();
            if (result) setCurrentHighlight(result.index);
            return;
        }

        const container = viewerContainerRef.current;
        if (!container || !searchQuery.trim()) return;
        const allMarks = container.querySelectorAll('.viewer-search-highlight, .pdf-search-highlight');
        const ocrWords: Element[] = [];
        container.querySelectorAll('.ocr-word').forEach((el: Element) => {
            if ((el as HTMLElement).style.backgroundColor) ocrWords.push(el);
        });
        const combined = [...Array.from(allMarks), ...ocrWords];
        if (combined.length === 0) return;

        const n = combined.length;
        const prevIdx =
            currentHighlight < 0 ? n - 1 : (currentHighlight - 1 + n) % n;
        setCurrentHighlight(prevIdx);

        container.querySelectorAll('.search-active-highlight').forEach((el) => {
            el.classList.remove('search-active-highlight');
        });

        const target = combined[prevIdx];
        if (target) {
            if (target.classList.contains('ocr-word')) {
                target.classList.add('search-active-highlight');
            }
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [currentHighlight, searchQuery]);

    const extension =
        (fileName ? resolveViewerExtension(fileName) : '') ||
        (fileUrl ? resolveViewerExtension(fileUrl) : '');
    const isZipArchiveFile = isArchiveViewerExtension(extension);

    // ── Ctrl+F / Cmd+F kısayolu (ZIP arşiv listesinde toolbar yok) ─────────
    useEffect(() => {
        if (isZipArchiveFile) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                setIsSearchOpen(true);
                setTimeout(() => searchInputRef.current?.focus(), 50);
            }
            if (e.key === 'Escape' && isSearchOpen) {
                setIsSearchOpen(false);
                setSearchQuery('');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSearchOpen, isZipArchiveFile]);

    // ── Kaydet (Download) ───────────────────────────────────────────────────
    const handleDownload = useCallback(() => {
        if (!resolvedUrl || !fileName) return;
        const a = document.createElement('a');
        a.href = resolvedUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }, [resolvedUrl, fileName]);

    const floatingToolbarButtonStyle = {
        background: applyDocumentInvert ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(16px)',
        borderColor: 'var(--primary)',
        color: applyDocumentInvert ? 'white' : 'black',
        filter: applyDocumentInvert ? 'invert(1) hue-rotate(180deg)' : 'none',
    } as const;

    const renderFloatingToolbar = (options?: { showDownload?: boolean }) => {
        const showDownload = options?.showDownload ?? true;
        return (
        <div className="absolute top-1.5 right-3 z-50 flex items-center gap-1.3">
            {isSearchOpen && (
                <div
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm border shadow-sm"
                    style={{
                        background: applyDocumentInvert
                            ? 'rgba(30, 30, 30, 0.95)'
                            : 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(16px)',
                        borderColor: applyDocumentInvert
                            ? 'rgba(255, 255, 255, 0.15)'
                            : 'rgba(0, 0, 0, 0.1)',
                        filter: applyDocumentInvert ? 'invert(1) hue-rotate(180deg)' : 'none',
                    }}
                >
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Ara (⌘+F)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-32 h-7 text-xs bg-transparent outline-none"
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                                setIsSearchOpen(false);
                                setSearchQuery('');
                            }
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (e.shiftKey) navigateToPreviousHighlight();
                                else navigateToNextHighlight();
                            }
                        }}
                    />
                    {searchQuery && searchResultCount > 0 && (
                        <span className="text-[10px] font-sans whitespace-nowrap mr-1">
                            {currentHighlight >= 0 ? `${currentHighlight + 1}/` : ''}
                            {searchResultCount}
                        </span>
                    )}
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
                        >
                            <span className="material-symbols-rounded" style={{ fontSize: 14 }}>
                                close
                            </span>
                        </button>
                    )}
                </div>
            )}

            <button
                onClick={() => {
                    const next = !isSearchOpen;
                    setIsSearchOpen(next);
                    if (next) setTimeout(() => searchInputRef.current?.focus(), 50);
                    else setSearchQuery('');
                }}
                className="w-7 h-7 flex items-center justify-center rounded-lg border shadow-md transition-all hover:scale-105 active:scale-95"
                style={floatingToolbarButtonStyle}
                title="Ara (⌘+F)"
            >
                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>
                    search
                </span>
            </button>

            {showDownload && (
                <button
                    onClick={handleDownload}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border shadow-md transition-all hover:scale-105 active:scale-95"
                    style={floatingToolbarButtonStyle}
                    title="Dosyayı Kaydet"
                >
                    <span className="material-symbols-rounded" style={{ fontSize: 18 }}>
                        download
                    </span>
                </button>
            )}

            <button
                onClick={toggleDocumentColorMode}
                className={cn(
                    'w-7 h-7 flex items-center justify-center rounded-lg border shadow-md transition-all hover:scale-105 active:scale-95',
                    documentColorMode !== 'auto' && 'ring-1 ring-primary/60'
                )}
                style={floatingToolbarButtonStyle}
                title={
                    applyDocumentInvert
                        ? 'Orijinal belge renklerinde göster'
                        : 'Belgeyi karanlık moda uyarla'
                }
            >
                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>
                    {applyDocumentInvert ? 'lightbulb' : 'bedtime'}
                </span>
            </button>
        </div>
        );
    };

    if (embeddedDiffHtml) {
        return (
            <div
                className={cn(
                    'h-full w-full overflow-hidden relative flex flex-col',
                    applyDocumentInvert && 'dark-mode-pdf-canvas'
                )}
            >
                {renderFloatingToolbar({ showDownload: false })}
                <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6 bg-background/95 custom-scrollbar">
                    <div
                        className="max-w-none text-sm leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: embeddedDiffHtml }}
                    />
                </div>
            </div>
        );
    }

    if (!resolvedUrl || !fileName) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center bg-gray-50/50 text-gray-400 gap-4">
                <div className="p-6 rounded-full bg-gray-100">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
                <div className="text-sm font-medium">Görüntülenecek bir dosya seçin</div>
            </div>
        );
    }

    const renderViewer = () => {
        switch (extension) {
            // PDF
            case 'pdf':
                return <PDFViewer fileUrl={resolvedUrl} searchQuery={searchQuery} />;

            // Images
            case 'jpg':
            case 'jpeg':
            case 'png':
            case 'webp':
            case 'gif':
            case 'bmp':
            case 'svg':
                return <ImageViewer src={resolvedUrl} alt={fileName} searchQuery={searchQuery} />;

            // TIFF
            case 'tiff':
            case 'tif':
                return <TIFFViewer fileUrl={resolvedUrl} searchQuery={searchQuery} />;

            // UYAP / UDF
            case 'udf':
                return (
                    <UDFViewer
                        fileUrl={resolvedUrl}
                        sourceFileUrl={fileUrl}
                        searchQuery={searchQuery}
                        activeMatchIndex={activeMatchIndex}
                    />
                );

            // Markdown
            case 'md':
            case 'markdown':
                return <MarkdownViewer fileUrl={resolvedUrl} searchQuery={searchQuery} activeMatchIndex={activeMatchIndex} />;

            // Word / DOCX (DOC handled by mammoth too)
            case 'docx':
            case 'doc':
            case 'odt':
                return <DocxViewer fileUrl={resolvedUrl} searchQuery={searchQuery} activeMatchIndex={activeMatchIndex} />;

            // RTF — dedicated viewer
            case 'rtf':
                return <RTFViewer fileUrl={resolvedUrl} searchQuery={searchQuery} activeMatchIndex={activeMatchIndex} />;

            // Excel / Spreadsheets
            case 'xlsx':
            case 'xls':
            case 'csv':
                return <XLSXViewer fileUrl={resolvedUrl} searchQuery={searchQuery} activeMatchIndex={activeMatchIndex} />;

            // Plain Text
            case 'txt':
            case 'text':
            case 'log':
            case 'json':
            case 'xml':
            case 'yaml':
            case 'yml':
            case 'toml':
            case 'ini':
            case 'env':
            case 'sh':
            case 'ts':
            case 'tsx':
            case 'js':
            case 'jsx':
            case 'css':
            case 'html':
            case 'py':
            case 'java':
            case 'c':
            case 'cpp':
            case 'rs':
                return <TextViewer fileUrl={resolvedUrl} searchQuery={searchQuery} activeMatchIndex={activeMatchIndex} />;

            // Email
            case 'eml':
            case 'msg':
                return <EmailViewer fileUrl={resolvedUrl} searchQuery={searchQuery} />;

            // ZIP archives
            case 'zip':
            case 'jar':
                return <ZipViewer fileUrl={resolvedUrl} />;

            // EYP (Elektronik Yazışma Paketi — OOXML/ZIP tabanlı)
            case 'eyp':
                return <EypViewer fileUrl={resolvedUrl} />;

            default:
                return (
                    <div className="h-full w-full flex flex-col items-center justify-center gap-4 text-gray-500">
                        <span className="material-symbols-sharp text-4xl opacity-40">draft</span>
                        <p className="text-sm">Desteklenmeyen dosya formatı: <strong>.{extension}</strong></p>
                        <a href={resolvedUrl} download className="mt-2 px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:opacity-80 transition-opacity">
                            Dosyayı İndir
                        </a>
                    </div>
                );
        }
    };

    return (
        <div
            className={cn(
                'h-full w-full overflow-hidden relative',
                 applyDocumentInvert && 'dark-mode-pdf-canvas'
            )}
        >
            {!isZipArchiveFile && renderFloatingToolbar()}

            <div ref={viewerContainerRef} className="h-full w-full">
                {renderViewer()}
            </div>
        </div>
    );
};
