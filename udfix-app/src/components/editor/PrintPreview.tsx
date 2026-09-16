import React, { useEffect, useRef, useState } from 'react';
import { Previewer } from 'pagedjs';
import { stripNestedStyleTagTokens } from '../../utils/stripHtmlTags';
import { sanitizeTrustedDocumentHtml } from '../../utils/sanitizeDocumentHtml';

interface PrintPreviewProps {
    content: string;
    onClose: () => void;
    headerContent?: string;
    footerContent?: string;
}

function cssGeneratedContent(raw: string): string {
    return raw
        .split(/\{\{pageNumber\}\}/g)
        .map((part) => JSON.stringify(stripNestedStyleTagTokens(part)))
        .join(' counter(page) ');
}

const PrintPreview: React.FC<PrintPreviewProps> = ({ content, onClose, headerContent = '', footerContent = '' }) => {
    const previewContainerRef = useRef<HTMLDivElement>(null);
    const [isRendering, setIsRendering] = useState(true);

    useEffect(() => {
        if (!previewContainerRef.current) return;
        // Clear previous content
        previewContainerRef.current.innerHTML = '';
        setIsRendering(true);
        const previewer = new Previewer();

        // Create a temporary container for the content
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = sanitizeTrustedDocumentHtml(content);

        // Prepare safe CSS content strings
        // Replace {{pageNumber}} with Paged.js counter syntax
        // Escape double quotes in the content
        const safeHeader = headerContent ? cssGeneratedContent(headerContent) : 'none';

        const safeFooter = footerContent ? cssGeneratedContent(footerContent) : 'none';

        // Add some basic styles for the preview
        const style = document.createElement('style');
        style.innerHTML = `
                @page {
                    size: A4;
                    margin: 25mm;
                    
                    @top-center {
                        content: ${safeHeader};
                        font-size: 10pt;
                        color: #666;
                        border-bottom: ${headerContent ? '1px solid #ddd' : 'none'};
                        margin-bottom: 2mm;
                        padding-bottom: 2mm;
                    }
                    
                    @bottom-center {
                        content: ${safeFooter};
                        font-size: 10pt;
                        color: #666;
                        border-top: ${footerContent ? '1px solid #ddd' : 'none'};
                        margin-top: 2mm;
                        padding-top: 2mm;
                    }
                }
                .pagedjs_page {
                    background: white;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                    margin-bottom: 20px;
                }
                /* Ensure content styles are preserved */
                p { margin-bottom: 1em; }
                h1, h2, h3 { margin-top: 1em; margin-bottom: 0.5em; }
                table { width: 100%; border-collapse: collapse; }
                td, th { border: 1px solid #ddd; padding: 8px; }
            `;
        contentDiv.appendChild(style);
        let polisher: { destroy?: () => void } | undefined;
        void previewer.preview(contentDiv, [], previewContainerRef.current).then((flow) => {
            polisher = flow as { destroy?: () => void };
            setIsRendering(false);
        });
        return () => {
            polisher?.destroy?.();
        };
    }, [content, headerContent, footerContent]);

    return (
        <div className="fixed inset-0 bg-gray-800 z-[var(--z-modal)] flex flex-col">
            <div className="bg-white p-4 flex justify-between items-center shadow-md">
                <h2 className="text-xl font-bold">Baskı Önizleme (Paged.js)</h2>
                <div className="flex gap-2">
                    <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                        Yazdır
                    </button>
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">
                        Kapat
                    </button>
                </div>
            </div>
            <div className="flex-1 overflow-auto p-8 bg-gray-100 flex justify-center relative">
                <div ref={previewContainerRef} className={`print-preview-content ${isRendering ? 'opacity-50' : 'opacity-100'} transition-opacity`}>
                    {/* Paged.js will render pages here */}
                </div>
                {isRendering && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 text-white font-bold text-xl z-10">
                        Sayfalar oluşturuluyor...
                    </div>
                )}
            </div>
        </div>
    );
};

export default PrintPreview;
