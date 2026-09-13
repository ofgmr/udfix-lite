import React, { useEffect, useState, useRef } from 'react';
import DOMPurify from 'dompurify';
import { useSearchHighlight } from '../../hooks/useSearchHighlight';

interface DocxViewerProps {
    fileUrl: string;
    searchQuery?: string;
    /** 0 tabanlı aktif eşleşme; UniversalViewer navigasyonu ile senkron */
    activeMatchIndex?: number | null;
}

export const DocxViewer: React.FC<DocxViewerProps> = ({ fileUrl, searchQuery = '', activeMatchIndex = null }) => {
    const [htmlContent, setHtmlContent] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    useSearchHighlight(contentRef, searchQuery, [htmlContent], activeMatchIndex);

    useEffect(() => {
        const loadDocx = async () => {
            try {
                setLoading(true);

                // Dynamically import mammoth
                const mammoth = await import('mammoth');

                const response = await fetch(fileUrl);
                const arrayBuffer = await response.arrayBuffer();

                const result = await mammoth.convertToHtml({ arrayBuffer });
                setHtmlContent(DOMPurify.sanitize(result.value));
                setLoading(false);
            } catch (err: any) {
                console.error("DOCX Load Error:", err);
                setError(err.message || "DOCX Yüklenirken Hata Oluştu");
                setLoading(false);
            }
        };

        if (fileUrl) {
            loadDocx();
        }
    }, [fileUrl]);

    if (loading) return <div className="flex justify-center items-center h-full text-gray-500">DOCX Yükleniyor...</div>;
    if (error) return <div className="flex justify-center items-center h-full text-red-500">{error}</div>;

    return (
        <div className="h-full w-full bg-[#eeeeee] overflow-y-auto flex justify-center custom-scrollbar">
            <div className="w-full max-w-4xl min-h-full text-black p-7">
                <div
                    ref={contentRef}
                    className="prose prose-slate max-w-none"
                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                />
            </div>
        </div>
    );
};
