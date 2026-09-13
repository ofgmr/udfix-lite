import React, { useEffect, useState, useRef } from 'react';
import DOMPurify from 'dompurify';
import { parseUyapToHtml } from '../../utils/converter';
import { isProbablyLocalPath, toSystemPath } from '../../utils/localResource';
import { UyapIO } from '../../utils/uyapIO';
import { buildUyapVerificationMeta } from '../../utils/uyapVerification';
import { syncUdfSignatureMetadataFromEntries } from '../../utils/udfSignatureFromEntries';
import { useSearchHighlight } from '../../hooks/useSearchHighlight';
import { UDF_CONTENT_PRINT_CSS } from '../../utils/udfPrintHtml';

interface UDFViewerProps {
    fileUrl: string;
    sourceFileUrl?: string | null;
    searchQuery?: string;
    activeMatchIndex?: number | null;
}

const getUdfDocumentId = (sourceFileUrl: string | null | undefined): string | null => {
    if (!sourceFileUrl || !isProbablyLocalPath(sourceFileUrl)) return null;
    return `udf:${encodeURIComponent(toSystemPath(sourceFileUrl))}`;
};

export const UDFViewer: React.FC<UDFViewerProps> = ({
    fileUrl,
    sourceFileUrl = null,
    searchQuery = '',
    activeMatchIndex = null,
}) => {
    const [htmlContent, setHtmlContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    useSearchHighlight(contentRef, searchQuery, [htmlContent], activeMatchIndex);

    useEffect(() => {
        const loadUdf = async () => {
            try {
                setLoading(true);
                const response = await fetch(fileUrl);
                const blob = await response.blob();
                const file = new File([blob], "temp.udf");

                const { contentXml, signatureEntries, documentPropertiesXml } =
                    await UyapIO.readUdfViewerParts(file);
                await syncUdfSignatureMetadataFromEntries(getUdfDocumentId(sourceFileUrl), signatureEntries);
                const verification = buildUyapVerificationMeta(contentXml, documentPropertiesXml);
                const html = await parseUyapToHtml(contentXml, { verification });
                setHtmlContent(
                    DOMPurify.sanitize(html || '', {
                        ADD_TAGS: ['header', 'footer'],
                        ADD_ATTR: ['data-hf-img-width', 'data-hf-align'],
                    }),
                );
                setLoading(false);
            } catch (err: any) {
                console.error("UDF Yüklenirken Hata Oluştu:", err);
                setError(err.message || "UDF Yüklenirken Hata Oluştu");
                setLoading(false);
            }
        };

        if (fileUrl) {
            loadUdf();
        }
    }, [fileUrl, sourceFileUrl]);

    if (loading) return <div className="flex justify-center items-center h-full text-gray-500">UDF Yükleniyor...</div>;
    if (error) return <div className="flex justify-center items-center h-full text-red-500">{error}</div>;

    return (
        <div className="h-full w-full bg-[#eeeeee] overflow-y-auto flex custom-scrollbar">
            <div className="w-full max-w-4xl min-h-full text-black p-7 md:p-7">
                <style>{UDF_CONTENT_PRINT_CSS}</style>
                <div
                    ref={contentRef}
                    className="udf-content"
                    dangerouslySetInnerHTML={{ __html: htmlContent || "" }}
                />
            </div>
        </div>
    );
};
