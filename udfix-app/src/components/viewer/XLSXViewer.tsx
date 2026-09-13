import React, { useEffect, useState, useRef } from 'react';
import DOMPurify from 'dompurify';
import type { Config as DOMPurifyConfig } from 'dompurify';
import { useSearchHighlight } from '../../hooks/useSearchHighlight';

/** Untrusted workbook parse: no VBA, formulas, or embedded HTML. */
const XLSX_READ_OPTIONS = {
    type: 'array' as const,
    bookVBA: false,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    bookProps: false,
    bookSheets: false,
};

/** Strip executable markup from sheet_to_html output before innerHTML. */
const XLSX_HTML_SANITIZE: DOMPurifyConfig = {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'base', 'style'],
    FORBID_ATTR: [
        'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur',
        'href', 'src', 'xlink:href', 'formaction',
    ],
    ALLOW_DATA_ATTR: false,
};

interface XLSXViewerProps {
    fileUrl: string;
    searchQuery?: string;
    activeMatchIndex?: number | null;
}

export const XLSXViewer: React.FC<XLSXViewerProps> = ({ fileUrl, searchQuery = '', activeMatchIndex = null }) => {
    const [sheetNames, setSheetNames] = useState<string[]>([]);
    const [workbookRef, setWorkbookRef] = useState<any>(null);
    const [xlsxMod, setXlsxMod] = useState<any>(null);
    const [activeSheet, setActiveSheet] = useState(0);
    const [activeHtml, setActiveHtml] = useState('');
    const [sheetHtmlCache, setSheetHtmlCache] = useState<Map<number, string>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    useSearchHighlight(contentRef, searchQuery, [activeHtml], activeMatchIndex);

    // 1. Dosyayı yükle — sadece sheet isimlerini kaydet
    useEffect(() => {
        const loadXlsx = async () => {
            try {
                setLoading(true);
                const XLSX = await import('xlsx');
                const response = await fetch(fileUrl);
                const arrayBuffer = await response.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer, XLSX_READ_OPTIONS);

                setSheetNames(workbook.SheetNames);
                setWorkbookRef(workbook);
                setXlsxMod(XLSX);
                setActiveSheet(0);
                setSheetHtmlCache(new Map());
            } catch (err: any) {
                console.error("XLSX Yükleme Hatası:", err);
                setError(err.message || "Dosya yüklenirken hata oluştu");
            } finally {
                setLoading(false);
            }
        };

        if (fileUrl) loadXlsx();
    }, [fileUrl]);

    // 2. Aktif sayfa değiştiğinde lazy render
    useEffect(() => {
        if (!workbookRef || !xlsxMod || sheetNames.length === 0) return;

        if (sheetHtmlCache.has(activeSheet)) {
            setActiveHtml(sheetHtmlCache.get(activeSheet)!);
            return;
        }

        const name = sheetNames[activeSheet];
        const ws = workbookRef.Sheets[name];
        const html = DOMPurify.sanitize(
            xlsxMod.utils.sheet_to_html(ws, { id: `sheet-${name}`, editable: false }),
            XLSX_HTML_SANITIZE,
        );
        setSheetHtmlCache(prev => new Map(prev).set(activeSheet, html));
        setActiveHtml(html);
    }, [activeSheet, workbookRef, xlsxMod, sheetNames, sheetHtmlCache]);

    if (loading) return (
        <div className="flex justify-center items-center h-full text-black">
            <span className="animate-pulse font-medium">Tablo Yükleniyor...</span>
        </div>
    );
    if (error) return <div className="flex justify-center items-center h-full text-red-500">{error}</div>;

    return (
        <div className="h-full w-full flex flex-col overflow-hidden" style={{ background: 'white' }}>
            {/* Sayfa Sekmeleri (Gerekiyorsa) */}
            {sheetNames.length > 1 && (
                <div className="flex items-center gap-1 px-4 pt-2 border-b overflow-x-auto flex-shrink-0" style={{ background: '#f5f5f7' }}>
                    {sheetNames.map((name, i) => (
                        <button
                            key={i}
                            onClick={() => setActiveSheet(i)}
                            className={`px-4 py-1.5 text-xs font-medium rounded-t-md border-t border-x transition-colors whitespace-nowrap ${
                                activeSheet === i
                                    ? 'bg-white border-black/10 text-black'
                                    : 'bg-black/5 border-transparent text-black/40 hover:bg-black/10'
                            }`}
                        >
                            {name}
                        </button>
                    ))}
                </div>
            )}

            {/* Tablo İçeriği */}
            <div className="flex-1 overflow-auto custom-scrollbar p-4">
                <style>{`
                    .xlsx-content table {
                        border-collapse: collapse;
                        width: 100%;
                        font-size: 13px;
                        background: white;
                        color: black;
                    }
                    .xlsx-content td, .xlsx-content th {
                        border: 1px solid rgba(0,0,0,0.1);
                        padding: 4px 8px;
                        min-width: 80px;
                        white-space: nowrap;
                    }
                    .xlsx-content th {
                        background: rgba(0,0,0,0.05);
                        color: black;
                        font-weight: 600;
                        text-align: center;
                        position: sticky;
                        top: 0;
                        z-index: 1;
                    }
                    .xlsx-content tr:nth-child(even) td {
                        background: rgba(0,0,0,0.02);
                    }
                    .xlsx-content tr:hover td {
                        background: rgba(0,0,0,0.05);
                    }
                `}</style>
                <div 
                    ref={contentRef}
                    className="xlsx-content"
                    dangerouslySetInnerHTML={{ __html: activeHtml }}
                />
            </div>
        </div>
    );
};
