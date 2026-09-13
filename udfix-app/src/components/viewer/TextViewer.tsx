import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchHighlight } from '../../hooks/useSearchHighlight';

interface TextViewerProps {
    fileUrl: string;
    searchQuery?: string;
    activeMatchIndex?: number | null;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

export const TextViewer: React.FC<TextViewerProps> = ({ fileUrl, searchQuery = '', activeMatchIndex = null }) => {
    const [content, setContent] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [totalSize, setTotalSize] = useState(0);
    const [loadedSize, setLoadedSize] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const contentRef = useRef<HTMLPreElement>(null);

    useSearchHighlight(contentRef, searchQuery, [content], activeMatchIndex);

    useEffect(() => {
        let cancelled = false;

        const loadText = async () => {
            try {
                setLoading(true);
                setContent('');
                setHasMore(false);
                setLoadedSize(0);

                const response = await fetch(fileUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
                setTotalSize(contentLength);

                const isLarge = contentLength > CHUNK_SIZE;

                if (isLarge && response.body) {
                    // Chunked reading — ilk 5MB
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder('utf-8');
                    let accumulated = '';
                    let bytesRead = 0;

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done || cancelled) break;
                        
                        bytesRead += value.byteLength;
                        accumulated += decoder.decode(value, { stream: true });

                        if (bytesRead >= CHUNK_SIZE) {
                            break;
                        }
                    }

                    if (!cancelled) {
                        setContent(accumulated);
                        setLoadedSize(bytesRead);
                        setHasMore(bytesRead < contentLength);
                        reader.cancel();
                    }
                } else {
                    const text = await response.text();
                    if (!cancelled) {
                        setContent(text);
                        setLoadedSize(text.length);
                        setHasMore(false);
                    }
                }
            } catch (err: any) {
                if (!cancelled) {
                    console.error("Metin Dosyası Yükleme Hatası:", err);
                    setError(err.message || "Dosya yüklenirken hata oluştu");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        if (fileUrl) loadText();
        return () => { cancelled = true; };
    }, [fileUrl]);

    const loadMore = useCallback(async () => {
        if (!hasMore || isLoadingMore) return;
        setIsLoadingMore(true);

        try {
            const response = await fetch(fileUrl, {
                headers: {
                    'Range': `bytes=${loadedSize}-${loadedSize + CHUNK_SIZE - 1}`,
                },
            });

            // Range not supported → load full file
            if (response.status === 200) {
                const text = await response.text();
                setContent(text);
                setHasMore(false);
                setLoadedSize(text.length);
            } else if (response.status === 206) {
                const text = await response.text();
                setContent(prev => prev + text);
                const newLoaded = loadedSize + text.length;
                setLoadedSize(newLoaded);
                setHasMore(newLoaded < totalSize);
            } else {
                // Fallback: try full text load
                const fullResponse = await fetch(fileUrl);
                const text = await fullResponse.text();
                setContent(text);
                setHasMore(false);
            }
        } catch (err) {
            console.error("Ek yükleme hatası:", err);
        } finally {
            setIsLoadingMore(false);
        }
    }, [fileUrl, loadedSize, totalSize, hasMore, isLoadingMore]);

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div className="h-full w-full bg-white overflow-y-auto flex justify-center custom-scrollbar">
            <div className="w-full max-w-4xl min-h-full p-7">
                {loading ? (
                    <div className="flex justify-center items-center h-full text-black">
                        <span className="animate-pulse font-medium">Metin Yükleniyor...</span>
                    </div>
                ) : error ? (
                    <div className="flex justify-center items-center h-full text-red-500">{error}</div>
                ) : (
                    <>
                        <pre
                            ref={contentRef}
                            className="whitespace-pre-wrap font-mono text-sm leading-relaxed break-words text-black"
                        >
                            {content}
                        </pre>

                        {hasMore && (
                            <div className="flex flex-col items-center gap-2 py-6 border-t border-black/5 mt-4">
                                <p className="text-xs text-black/40">
                                    {formatSize(loadedSize)} / {formatSize(totalSize)} yüklendi
                                </p>
                                <button
                                    onClick={loadMore}
                                    disabled={isLoadingMore}
                                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-black/10 hover:bg-black/5 transition-colors text-black disabled:opacity-50"
                                >
                                    <span className="material-symbols-rounded" style={{ fontSize: 16 }}>
                                        {isLoadingMore ? 'hourglass_empty' : 'expand_more'}
                                    </span>
                                    {isLoadingMore ? 'Yükleniyor...' : 'Daha fazla yükle (5MB)'}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
