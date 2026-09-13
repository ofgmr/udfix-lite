import React, { useEffect, useState, useRef, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { useViewerHost } from './viewer-host-context';
import Mark from 'mark.js';

interface EmailViewerProps {
    fileUrl: string;
    searchQuery?: string;
}

export const EmailViewer: React.FC<EmailViewerProps> = ({ fileUrl, searchQuery = '' }) => {
    const viewerHost = useViewerHost();
    const [email, setEmail] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const textBodyRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const markInstanceRef = useRef<Mark | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                if (!fileUrl) return;
                setLoading(true);
                const invoke = window.electron?.invoke;
                if (!invoke) throw new Error('Electron IPC is not available');

                const isBlobOrRemote = fileUrl.startsWith('blob:') || fileUrl.startsWith('http://') || fileUrl.startsWith('https://');
                let payload: { buffer?: ArrayBuffer; path?: string };

                if (isBlobOrRemote) {
                    const response = await fetch(fileUrl);
                    const buffer = await response.arrayBuffer();
                    payload = { buffer };
                } else {
                    let resolvedPath = fileUrl;
                    if (resolvedPath.startsWith('file://')) {
                        try {
                            const u = new URL(resolvedPath);
                            resolvedPath = decodeURIComponent(u.pathname);
                            if (/^\/[A-Za-z]:\//.test(resolvedPath)) {
                                resolvedPath = resolvedPath.slice(1);
                            }
                        } catch {
                            resolvedPath = decodeURIComponent(resolvedPath.replace(/^file:\/\//, ''));
                        }
                    } else {
                        resolvedPath = decodeURIComponent(resolvedPath);
                    }
                    payload = { path: resolvedPath };
                }

                const result = await invoke('parse-email', payload);
                setEmail(result);
            } catch (err: any) {
                console.error("E-posta Parse Hatası:", err);
                setError("E-posta formatı çözümlenemedi.");
            } finally {
                setLoading(false);
            }
        };

        if (fileUrl) load();
    }, [fileUrl]);

    // ── Search highlighting — MUST be before any conditional returns ──
    useEffect(() => {
        if (!email) return;

        // Text body highlighting
        if (textBodyRef.current) {
            if (!markInstanceRef.current) markInstanceRef.current = new Mark(textBodyRef.current);
            markInstanceRef.current.unmark({
                done: () => {
                    if (searchQuery.trim() && markInstanceRef.current) {
                        markInstanceRef.current.mark(searchQuery, {
                            className: 'viewer-search-highlight',
                            separateWordSearch: false,
                            acrossElements: true,
                        });
                    }
                }
            });
        }

        // Iframe (HTML body) highlighting
        const iframe = iframeRef.current;
        if (iframe) {
            const tryHighlight = () => {
                try {
                    const doc = iframe.contentDocument;
                    if (!doc?.body) return;
                    doc.querySelectorAll('.email-search-hl').forEach((el: Element) => {
                        const parent = el.parentNode;
                        if (parent) {
                            parent.replaceChild(document.createTextNode(el.textContent || ''), el);
                            parent.normalize();
                        }
                    });
                    if (!searchQuery.trim()) return;
                    if (!doc.getElementById('search-hl-style')) {
                        const style = doc.createElement('style');
                        style.id = 'search-hl-style';
                        style.textContent = '.email-search-hl { background-color: rgba(255, 213, 0, 0.45); border-radius: 2px; padding: 0 1px; }';
                        doc.head.appendChild(style);
                    }
                    const markInst = new Mark(doc.body);
                    markInst.mark(searchQuery, {
                        className: 'email-search-hl',
                        separateWordSearch: false,
                        acrossElements: true,
                    });
                } catch { /* cross-origin safety */ }
            };
            setTimeout(tryHighlight, 200);
        }
    }, [searchQuery, email]);

    const openAttachment = useCallback((att: any) => {
        try {
            const { openInNewViewerTab } = useLayoutStore.getState();
            const ownerWindow = viewerHost?.getOwnerWindow() ?? window;
            const viewerOpts = viewerHost?.panelId
                ? { targetViewerPanelId: viewerHost.panelId, forceSiblingTab: true }
                : undefined;

            // Handle IPC Buffer object from Electron
            let arr: Uint8Array;
            if (att.content && att.content.type === 'Buffer' && Array.isArray(att.content.data)) {
                arr = new Uint8Array(att.content.data);
            } else if (att.content instanceof Uint8Array) {
                arr = att.content;
            } else {
                arr = new Uint8Array(att.content);
            }

            // Derive MIME type to help ImageViewer and others
            const ext = (att.filename || '').split('.').pop()?.toLowerCase();
            const mimes: Record<string, string> = {
                'pdf': 'application/pdf',
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'gif': 'image/gif',
                'svg': 'image/svg+xml',
                'webp': 'image/webp',
            };
            const mimeType = mimes[ext || ''] || 'application/octet-stream';

            const blob = new Blob([arr as unknown as BlobPart], { type: mimeType });
            const url = globalThis.URL.createObjectURL(blob);
            openInNewViewerTab({ url, name: att.filename }, viewerOpts);
        } catch (err) {
            console.error("Ek açılamadı:", err);
        }
    }, [viewerHost]);

    if (loading) return (
        <div className="flex justify-center items-center h-full text-black bg-white">
            <span className="animate-pulse font-medium">E-posta Çözümleniyor...</span>
        </div>
    );
    if (error) return <div className="flex justify-center items-center h-full text-red-500 bg-white">{error}</div>;
    if (!email) return null;

    const sanitizedHtml = email.htmlBody ? DOMPurify.sanitize(email.htmlBody) : '';

    return (
        <div className="h-full w-full bg-white overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col items-center">
                <div className="w-full max-w-4xl min-h-full">
                    {/* Header Card */}
                    <div className="p-10 space-y-6" style={{ background: 'rgba(0, 0, 0, 0.005)', borderBottom: '1px solid rgba(0, 0, 0, 0.03)' }}>
                        <h1 className="text-3xl font-bold text-black leading-tight tracking-tight">
                            {email.subject || '(Konu Yok)'}
                        </h1>

                        <div className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-sm">
                            <span className="text-black/40 font-semibold tracking-wide uppercase text-[10px] self-center">GÖNDEREN</span>
                            <span className="text-black font-semibold text-base">{email.from}</span>

                            {email.to && (
                                <>
                                    <span className="text-black/40 font-semibold tracking-wide uppercase text-[10px] self-center">ALICI</span>
                                    <span className="text-black/70">{email.to}</span>
                                </>
                            )}

                            {email.cc && (
                                <>
                                    <span className="text-black/40 font-semibold tracking-wide uppercase text-[10px] self-center">CC</span>
                                    <span className="text-black/70">{email.cc}</span>
                                </>
                            )}

                            {email.date && (
                                <>
                                    <span className="text-black/40 font-semibold tracking-wide uppercase text-[10px] self-center">TARİH</span>
                                    <span className="text-black/70">{email.date}</span>
                                </>
                            )}
                        </div>

                        {/* Attachments */}
                        {email.attachments && email.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-6 border-t" style={{ borderColor: 'rgba(0, 0, 0, 0.04)' }}>
                                {email.attachments.map((att: any, i: number) => (
                                    <button
                                        key={i}
                                        onClick={() => openAttachment(att)}
                                        className="flex items-center gap-2 text-xs px-4 py-2 rounded-xl border transition-all hover:bg-black/5 active:scale-95 shadow-sm"
                                        style={{ background: 'rgba(255, 255, 255, 0.7)', borderColor: 'rgba(0, 0, 0, 0.1)', color: 'black' }}
                                    >
                                        <span className="material-symbols-rounded" style={{ fontSize: 18 }}>attach_file</span>
                                        <span className="font-semibold">{att.filename}</span>
                                        <span className="text-[10px] text-black/30 font-mono">({Math.round(att.size / 1024)} KB)</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Body */}
                    <div className="p-10 text-black leading-relaxed">
                        {sanitizedHtml ? (
                            <iframe
                                ref={iframeRef}
                                srcDoc={`<!DOCTYPE html><html><head><style>body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: black; background: white; line-height: 1.6; } img { max-width: 100%; height: auto; }</style></head><body>${sanitizedHtml}</body></html>`}
                                className="w-full min-h-[800px] border-0"
                                sandbox="allow-same-origin"
                                title="email-body"
                            />
                        ) : (
                            <div
                                ref={textBodyRef}
                                className="whitespace-pre-wrap font-sans text-base leading-relaxed break-words bg-black/[0.01] p-6 rounded-2xl border border-black/[0.03]"
                            >
                                {email.textBody}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
