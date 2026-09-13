import React, { useEffect, useState, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import {
    type EypMetadata,
    parseEypUstveri,
    resolveEypEntryLabel,
} from '../../utils/eypMetadata';
import { canViewArchiveEntry, filterViewableArchiveEntries } from '../../utils/archiveViewerEntries';

interface ZipEntry {
    name: string;
    path: string;
    isDir: boolean;
    size: number;
    compressedSize: number;
}

export type ZipViewerVariant = 'zip' | 'eyp';

interface ZipViewerProps {
    fileUrl: string;
    variant?: ZipViewerVariant;
}

const FILE_SIZE_LIMIT = 1 * 1024 * 1024 * 1024; // 1 GB

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
    if (['pdf'].includes(ext)) return 'picture_as_pdf';
    if (['doc', 'docx', 'odt'].includes(ext)) return 'article';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'table_chart';
    if (['ppt', 'pptx'].includes(ext)) return 'slideshow';
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return 'audio_file';
    if (['mp4', 'mkv', 'mov', 'avi'].includes(ext)) return 'video_file';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'folder_zip';
    if (['txt', 'md', 'log'].includes(ext)) return 'text_snippet';
    if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'cpp', 'c', 'rs'].includes(ext)) return 'code';
    return 'description';
}

export const ZipViewer: React.FC<ZipViewerProps> = ({ fileUrl, variant = 'zip' }) => {
    const isEyp = variant === 'eyp';
    const [entries, setEntries] = useState<ZipEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState<string | null>(null);
    const [zipRef, setZipRef] = useState<JSZip | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [largeFileWarning, setLargeFileWarning] = useState<string | null>(null);
    const [eypMetadata, setEypMetadata] = useState<EypMetadata | null>(null);
    const autoOpenedUstYaziRef = useRef(false);

    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
        () => new Set(isEyp ? ['', 'UstYazi/', 'Ekler/'] : [''])
    );

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                const response = await fetch(fileUrl);
                const arrayBuffer = await response.arrayBuffer();
                const zip = await JSZip.loadAsync(arrayBuffer);
                setZipRef(zip);

                const allEntries: ZipEntry[] = [];
                zip.forEach((relativePath, zipEntry) => {
                    // Normalize: remove leading/trailing slashes but keep directory hint
                    const segments = relativePath.split('/').filter(Boolean);
                    allEntries.push({
                        name: segments.pop() || '',
                        path: relativePath,
                        isDir: zipEntry.dir,
                        size: (zipEntry as any)._data?.uncompressedSize || 0,
                        compressedSize: (zipEntry as any)._data?.compressedSize || 0,
                    });
                });

                allEntries.sort((a, b) => {
                    if (a.isDir && !b.isDir) return -1;
                    if (!a.isDir && b.isDir) return 1;
                    return a.path.localeCompare(b.path);
                });

                setEntries(allEntries);

                if (variant === 'eyp') {
                    const ustveriPath = Object.keys(zip.files).find((p) =>
                        /^Ustveri\/Ustveri\.xml$/i.test(p.replace(/\\/g, '/'))
                    );
                    if (ustveriPath) {
                        const xml = await zip.file(ustveriPath)!.async('string');
                        setEypMetadata(parseEypUstveri(xml));
                    } else {
                        setEypMetadata({ ekLabels: new Map() });
                    }
                }
            } catch (err: any) {
                setError(err.message || (isEyp ? 'EYP paketi açılamadı' : 'ZIP dosyası açılamadı'));
            } finally {
                setLoading(false);
            }
        };
        if (fileUrl) load();
    }, [fileUrl, isEyp, variant]);

    const openFile = useCallback(async (entry: ZipEntry) => {
        if (!zipRef || entry.isDir) return;
        if (!canViewArchiveEntry(entry.path, entry.name, { eyp: isEyp })) return;
        if (entry.size > FILE_SIZE_LIMIT) {
            setLargeFileWarning(entry.name);
            return;
        }
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewLoading(true);
        setPreviewName(entry.name);
        try {
            const blob = await zipRef.file(entry.path)!.async('blob');
            const url = URL.createObjectURL(blob);
            setPreviewUrl(url);
            setIsDrawerOpen(false);
        } catch (err) {
            console.error("Dosya açılamadı:", err);
        } finally {
            setPreviewLoading(false);
        }
    }, [zipRef, previewUrl, isEyp]);

    useEffect(() => {
        if (!isEyp || !zipRef || entries.length === 0 || autoOpenedUstYaziRef.current) return;

        const ustYaziEntry =
            entries.find(
                (entry) =>
                    !entry.isDir &&
                    /^UstYazi\//i.test(entry.path.replace(/\\/g, '/')) &&
                    /\.pdf$/i.test(entry.name)
            ) ??
            entries.find(
                (entry) =>
                    !entry.isDir &&
                    eypMetadata?.ustYaziFileName &&
                    entry.name.toLowerCase() === eypMetadata.ustYaziFileName.toLowerCase()
            );

        if (ustYaziEntry) {
            autoOpenedUstYaziRef.current = true;
            void openFile(ustYaziEntry);
        }
    }, [isEyp, zipRef, entries, eypMetadata, openFile]);

    const getEntryLabel = useCallback(
        (entry: ZipEntry) => {
            if (!isEyp) return entry.name;
            return resolveEypEntryLabel(entry.path, entry.name, eypMetadata);
        },
        [isEyp, eypMetadata]
    );

    const visibleEntries = filterViewableArchiveEntries(entries, { eyp: isEyp });

    const toggleDir = (path: string) => {
        setExpandedDirs((prev: Set<string>) => {
            const next = new Set(prev);
            // Ensure path starts with leading slash for comparison or is consistent
            // Actually, keep it simple: match path exactly
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    const [isDrawerOpen, setIsDrawerOpen] = useState(true);

    if (loading) return (
        <div className="flex justify-center items-center h-full text-black bg-white">
            <span className="animate-pulse font-medium">{isEyp ? 'EYP Paketi Açılıyor...' : 'ZIP Açılıyor...'}</span>
        </div>
    );
    if (error) return <div className="flex justify-center items-center h-full text-red-500 bg-white">{error}</div>;

    return (
        <div className="h-full w-full flex flex-col overflow-hidden relative" style={{ background: 'white' }}>
            <button
                onClick={() => setIsDrawerOpen(true)}
                className="absolute top-4 right-4 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-xl border border-black/10 transition-all hover:scale-105 active:scale-95 shadow-lg bg-white/80"
                style={{ color: 'black' }}
            >
                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>list</span>
                {isEyp ? 'Paket İçeriği' : 'Dosya Listesi'}
            </button>

            <div className="flex-1 min-h-0 overflow-hidden" style={{ background: 'white' }}>
                {largeFileWarning ? (
                    <div className="h-full flex flex-col items-center justify-center gap-4 text-black/60">
                        <span className="material-symbols-rounded text-amber-500" style={{ fontSize: 48 }}>warning</span>
                        <div className="text-center max-w-sm">
                            <p className="font-semibold text-black/80 text-sm mb-1">{largeFileWarning}</p>
                            <p className="text-xs text-black/50">Bu dosya çok büyük (1GB+). Uygulamanın donmasını önlemek için lütfen arşivi dışa aktarıp dosyayı doğrudan açın.</p>
                        </div>
                        <button
                            onClick={() => setLargeFileWarning(null)}
                            className="px-4 py-2 text-xs font-semibold rounded-lg border border-black/10 hover:bg-black/5 transition-colors text-black"
                        >
                            Tamam
                        </button>
                    </div>
                ) : !previewUrl ? (
                    <div className="h-full flex flex-col items-center justify-center gap-4 text-black/20">
                        <div className="w-20 h-20 rounded-3xl bg-black/[0.02] flex items-center justify-center">
                            <span className="material-symbols-rounded" style={{ fontSize: 48 }}>inventory_2</span>
                        </div>
                        <div className="text-center">
                            <p className="font-semibold text-black/50 tracking-tight">
                                {isEyp ? 'EYP Paketi Hazır' : 'Arşiv Hazır'}
                            </p>
                            <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">
                                {isEyp ? 'Üst yazı veya ek seçin' : 'Önizlemek için bir dosya seçin'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-black/[0.03]" style={{ background: 'rgba(0,0,0,0.01)' }}>
                            <span className="material-symbols-rounded" style={{ fontSize: 18, color: 'black' }}>{getFileIcon(previewName || '')}</span>
                            <span className="text-xs font-bold truncate text-black">
                                {previewName
                                    ? resolveEypEntryLabel(
                                          entries.find((e) => e.name === previewName)?.path ?? '',
                                          previewName,
                                          isEyp ? eypMetadata : null
                                      )
                                    : previewName}
                            </span>
                            <button
                                onClick={() => { setPreviewUrl(null); setPreviewName(null); }}
                                className="ml-auto w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 text-black transparency transition-colors"
                            >
                                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>close</span>
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-hidden">
                            {previewLoading ? (
                                <div className="flex justify-center items-center h-full text-black">
                                    <span className="animate-pulse">Dosya Açılıyor...</span>
                                </div>
                            ) : (
                                <UniversalViewerInner fileUrl={previewUrl!} fileName={previewName!} />
                            )}
                        </div>
                    </div>
                )}
            </div>

            {isDrawerOpen && (
                <div className="absolute inset-0 z-40 flex flex-col justify-end pointer-events-none">
                    <div
                        className="absolute inset-0 bg-black/10 pointer-events-auto transition-opacity"
                        onClick={() => setIsDrawerOpen(false)}
                    />
                    <div
                        className="relative w-full h-[70%] max-h-full rounded-t-3xl border-t border-black/5 flex flex-col min-h-0 overflow-hidden pointer-events-auto shadow-[0_-12px_40px_rgba(0,0,0,0.15)] bg-white/98 backdrop-blur-3xl animate-in slide-in-from-bottom duration-300"
                        onWheel={(e) => e.stopPropagation()}
                    >
                        <div className="w-12 h-1.5 bg-black/10 rounded-full mx-auto my-4 shrink-0" />
                        <div className="px-6 pb-6 flex flex-col flex-1 min-h-0 overflow-hidden">
                            <div className="flex items-start justify-between mb-4 flex-shrink-0 gap-3">
                                <div className="min-w-0 flex-1 pr-4">
                                    <h3 className="text-sm font-bold text-black flex items-center gap-2">
                                        <span className="material-symbols-rounded" style={{ fontSize: 20 }}>
                                            {isEyp ? 'mail' : 'folder_managed'}
                                        </span>
                                        {isEyp ? 'EYP Paketi' : 'Arşiv İçeriği'}
                                    </h3>
                                    {isEyp && eypMetadata?.konu && (
                                        <p className="text-xs text-black/60 mt-1 line-clamp-2">{eypMetadata.konu}</p>
                                    )}
                                    <p className="text-[10px] text-black/30 font-bold uppercase tracking-widest mt-0.5">
                                        {visibleEntries.filter((e) => !e.isDir).length} DOSYA ·{' '}
                                        {visibleEntries.filter((e) => e.isDir).length} KLASÖR
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIsDrawerOpen(false)}
                                    className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 text-black/20 hover:text-black transition-all"
                                >
                                    <span className="material-symbols-rounded" style={{ fontSize: 24 }}>expand_more</span>
                                </button>
                            </div>

                            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar border border-black/[0.04] rounded-2xl bg-black/[0.005]">
                                {visibleEntries.map((entry: ZipEntry) => {
                                    const segments = entry.path.split('/').filter(Boolean);
                                    const depth = segments.length - (entry.isDir ? 1 : 0);

                                    // Robust Hierarchy Logic
                                    // Check if all parent segments are in expandedDirs
                                    let show = true;
                                    let runningPath = '';
                                    for (let i = 0; i < segments.length - 1; i++) {
                                        runningPath += segments[i] + '/';
                                        if (!expandedDirs.has(runningPath)) {
                                            show = false;
                                            break;
                                        }
                                    }

                                    if (!show) return null;
                                    const isExpanded = expandedDirs.has(entry.path);

                                    return (
                                        <div
                                            key={entry.path}
                                            style={{ paddingLeft: `${depth * 28 + 16}px` }}
                                            className={`flex items-center gap-4 px-4 py-4 text-sm cursor-pointer border-b border-black/[0.02] last:border-0 transition-all hover:bg-black/[0.03] active:bg-black/[0.05] ${previewName === entry.name && !entry.isDir ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                                                }`}
                                            onClick={() => entry.isDir ? toggleDir(entry.path) : openFile(entry)}
                                        >
                                            <span className="material-symbols-rounded text-xl shrink-0" style={{
                                                color: entry.isDir ? '#f59e0b' : 'rgba(0,0,0,0.2)'
                                            }}>
                                                {entry.isDir
                                                    ? (isExpanded ? 'folder_open' : 'folder')
                                                    : getFileIcon(getEntryLabel(entry))}
                                            </span>
                                            <span className={`flex-1 truncate ${entry.isDir ? 'font-semibold text-black/70' : 'text-black/60'}`}>
                                                {getEntryLabel(entry)}
                                            </span>
                                            {!entry.isDir && entry.size > 0 && (
                                                <span className="text-[10px] font-mono font-bold shrink-0 px-2 py-0.5 rounded bg-black/5 text-black/30">
                                                    {formatBytes(entry.size)}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const UniversalViewerInner: React.FC<{ fileUrl: string; fileName: string }> = ({ fileUrl, fileName }) => {
    const [Viewer, setViewer] = useState<React.ComponentType<{ fileUrl: string; fileName: string }> | null>(null);
    useEffect(() => {
        import('./UniversalViewer').then(mod => {
            setViewer(() => mod.UniversalViewer);
        });
    }, []);
    if (!Viewer) return (
        <div className="flex justify-center items-center h-full">
            <div className="w-4 h-4 rounded-full border border-black/20 border-t-black animate-spin" />
        </div>
    );
    return <Viewer fileUrl={fileUrl} fileName={fileName} />;
};
