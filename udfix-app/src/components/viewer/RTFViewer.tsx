import React, { useEffect, useState, useRef } from 'react';
import DOMPurify from 'dompurify';
import { useSearchHighlight } from '../../hooks/useSearchHighlight';

interface RTFViewerProps {
    fileUrl: string;
    searchQuery?: string;
    activeMatchIndex?: number | null;
}

// RTF formatını temel HTML'e dönüştüren basit parser
function rtfToHtml(rtf: string): string {
    // RTF özel karakterleri temizle
    let text = rtf;

    // RTF header ve kontrol kelimelerini kaldır
    text = text.replace(/\{\\rtf1[^}]*\}/g, '');
    
    // Renk ve font tablolarını kaldır
    text = text.replace(/\{\\colortbl[^}]*\}/g, '');
    text = text.replace(/\{\\fonttbl[^}]*\}/g, '');
    text = text.replace(/\{\\stylesheet[^}]*\}/g, '');
    text = text.replace(/\{\\info[^}]*\}/g, '');

    // Paragraf kontrolleri
    text = text.replace(/\\pard\b[^\\]*/g, '<p>');
    text = text.replace(/\\par\b/g, '</p><p>');
    text = text.replace(/\\line\b/g, '<br/>');

    // Stil kontrolleri
    text = text.replace(/\\b\b/g, '<strong>');
    text = text.replace(/\\b0\b/g, '</strong>');
    text = text.replace(/\\i\b/g, '<em>');
    text = text.replace(/\\i0\b/g, '</em>');
    text = text.replace(/\\ul\b/g, '<u>');
    text = text.replace(/\\ulnone\b/g, '</u>');

    // Özel karakterler
    text = text.replace(/\\'/g, '&#');
    text = text.replace(/\\~/g, '&nbsp;');
    text = text.replace(/\\\*/g, '');
    text = text.replace(/\\-/g, '-');

    // Kalan RTF kontrol kelimeleri
    text = text.replace(/\\[a-zA-Z0-9-]+ ?/g, '');
    text = text.replace(/[{}]/g, '');
    
    // Boş paragrafları temizle
    text = text.replace(/\n{3,}/g, '\n\n');

    return `<div>${text}</div>`;
}

export const RTFViewer: React.FC<RTFViewerProps> = ({ fileUrl, searchQuery = '', activeMatchIndex = null }) => {
    const [htmlContent, setHtmlContent] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    useSearchHighlight(contentRef, searchQuery, [htmlContent], activeMatchIndex);

    useEffect(() => {
        const loadRtf = async () => {
            try {
                setLoading(true);
                
                // RTF için de mammoth kullanıyoruz, mevcut bağımlılık
                const mammoth = await import('mammoth');
                const response = await fetch(fileUrl);
                const arrayBuffer = await response.arrayBuffer();
                
                try {
                    // Mammoth RTF'i de işleyebilir
                    const result = await mammoth.convertToHtml({ arrayBuffer });
                    setHtmlContent(DOMPurify.sanitize(result.value));
                } catch {
                    // Mammoth başarısız olursa basit RTF parser kullan
                    const text = await (await fetch(fileUrl)).text();
                    setHtmlContent(DOMPurify.sanitize(rtfToHtml(text)));
                }
            } catch (err: any) {
                console.error("RTF Yükleme Hatası:", err);
                setError(err.message || "Dosya yüklenirken hata oluştu");
            } finally {
                setLoading(false);
            }
        };

        if (fileUrl) loadRtf();
    }, [fileUrl]);

    return (
        <div className="h-full w-full bg-white overflow-y-auto flex justify-center custom-scrollbar">
            <div className="w-full max-w-4xl min-h-full p-7">
                {loading ? (
                    <div className="flex justify-center items-center h-full text-black">
                        <span className="animate-pulse font-medium">RTF Yükleniyor...</span>
                    </div>
                ) : error ? (
                    <div className="flex justify-center items-center h-full text-red-500">{error}</div>
                ) : (
                    <div
                        ref={contentRef}
                        className="prose prose-slate max-w-none text-black"
                        dangerouslySetInnerHTML={{ __html: htmlContent }}
                    />
                )}
            </div>
        </div>
    );
};
