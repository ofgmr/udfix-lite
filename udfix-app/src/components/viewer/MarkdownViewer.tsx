import React, { useEffect, useState, useRef } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useSearchHighlight } from '../../hooks/useSearchHighlight';

interface MarkdownViewerProps {
    fileUrl: string;
    searchQuery?: string;
    activeMatchIndex?: number | null;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ fileUrl, searchQuery = '', activeMatchIndex = null }) => {
    const [htmlContent, setHtmlContent] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    useSearchHighlight(contentRef, searchQuery, [htmlContent], activeMatchIndex);

    useEffect(() => {
        const loadMarkdown = async () => {
            try {
                setLoading(true);
                const response = await fetch(fileUrl);
                const text = await response.text();
                
                // Markdown'u HTML'e çevir ve sanitize et
                const rawHtml = await marked.parse(text, { async: true });
                setHtmlContent(DOMPurify.sanitize(rawHtml));
                setLoading(false);
            } catch (err: any) {
                console.error("Markdown Load Error:", err);
                setError(err.message || "Failed to load Markdown");
                setLoading(false);
            }
        };

        if (fileUrl) {
            loadMarkdown();
        }
    }, [fileUrl]);

    if (loading) return <div className="flex justify-center items-center h-full text-gray-500">Markdown Yükleniyor...</div>;
    if (error) return <div className="flex justify-center items-center h-full text-red-500">{error}</div>;

    return (
        <div className="h-full w-full bg-[#eeeeee] overflow-y-auto flex justify-center custom-scrollbar">
            <div className="w-full max-w-4xl min-h-full text-black p-7">
                <style>{`
                    .md-content { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
                    .md-content h1 { font-size: 2em; font-weight: 700; margin: 0.67em 0; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 0.3em; }
                    .md-content h2 { font-size: 1.5em; font-weight: 600; margin: 0.83em 0; border-bottom: 1px solid rgba(0,0,0,0.06); padding-bottom: 0.3em; }
                    .md-content h3 { font-size: 1.25em; font-weight: 600; margin: 1em 0; }
                    .md-content h4 { font-size: 1em; font-weight: 600; margin: 1em 0; }
                    .md-content p { margin: 1em 0; line-height: 1.7; }
                    .md-content ul, .md-content ol { padding-left: 2em; margin: 1em 0; }
                    .md-content li { margin: 0.25em 0; line-height: 1.6; }
                    .md-content code { background: rgba(0,0,0,0.06); padding: 0.2em 0.4em; border-radius: 4px; font-size: 0.85em; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
                    .md-content pre { background: rgba(0,0,0,0.04); padding: 16px; border-radius: 8px; overflow-x: auto; margin: 1em 0; }
                    .md-content pre code { background: none; padding: 0; }
                    .md-content blockquote { border-left: 4px solid rgba(0,0,0,0.15); margin: 1em 0; padding: 0.5em 1em; color: rgba(0,0,0,0.6); }
                    .md-content table { border-collapse: collapse; width: 100%; margin: 1em 0; }
                    .md-content td, .md-content th { border: 1px solid rgba(0,0,0,0.1); padding: 6px 12px; }
                    .md-content th { background: rgba(0,0,0,0.04); font-weight: 600; }
                    .md-content a { color: #0969da; text-decoration: none; }
                    .md-content a:hover { text-decoration: underline; }
                    .md-content img { max-width: 100%; height: auto; border-radius: 8px; margin: 1em 0; }
                    .md-content hr { border: none; border-top: 1px solid rgba(0,0,0,0.1); margin: 2em 0; }
                `}</style>
                <div
                    ref={contentRef}
                    className="md-content"
                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                />
            </div>
        </div>
    );
};
