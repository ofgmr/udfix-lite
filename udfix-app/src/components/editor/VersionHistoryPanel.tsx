import React, { useCallback, useEffect, useState } from 'react';
import type { DocumentVersionRow } from '../../services/dataService';
import { DataService } from '../../services/dataService';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { buildVersionPairDiffHtml } from '../../utils/versionDiffHtml';
import MaterialIcon from '../ui/MaterialIcon';

interface VersionHistoryModalProps {
    // Artık anchorRect (koordinat hesabı) yok!
    versions: DocumentVersionRow[];
    isLoading: boolean;
    onClose: () => void;
    onRestore: (versionId: string) => void;
    onVersionsChanged?: () => void;
}

const VersionHistoryPanel: React.FC<VersionHistoryModalProps> = ({
    versions,
    isLoading,
    onClose,
    onRestore,
    onVersionsChanged,
}) => {
    const [compareA, setCompareA] = useState<string>('');
    const [compareB, setCompareB] = useState<string>('');

    const openDiffInViewerTab = useLayoutStore((s) => s.openDiffInViewerTab);

    // Escape ile kapatma ve arka plan scroll'unu kilitleme (Mükemmel pencere hissi için)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden'; 
        
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [onClose]);

    const runCompare = useCallback(() => {
        if (!compareA || !compareB || compareA === compareB) return;
        const rowA = versions.find((v) => v.id === compareA);
        const rowB = versions.find((v) => v.id === compareB);
        if (!rowA || !rowB) return;
        const html = buildVersionPairDiffHtml(rowA, rowB);
        const title = `Metin farkı · v${rowA.version_no} ↔ v${rowB.version_no}`;
        openDiffInViewerTab({ html, title });
    }, [compareA, compareB, versions, openDiffInViewerTab]);

    useEffect(() => {
        if (versions.length >= 2 && !compareA && !compareB) {
            setCompareA(versions[0].id);
            setCompareB(versions[1].id);
        }
    }, [versions, compareA, compareB]);

    const saveLabel = async (versionId: string, raw: string) => {
        const trimmed = raw.trim();
        await DataService.updateDocumentVersionLabel(versionId, trimmed.length ? trimmed.slice(0, 120) : null);
        onVersionsChanged?.();
    };

    return (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 sm:p-6">
            {/* Arka plan karartması - Tıklayınca kapanır */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
                onClick={onClose}
                aria-label="Kapat"
            />

            {/* Mükemmel Modal Penceresi */}
            <div className="relative flex w-full max-w-[500px] max-h-[85vh] flex-col overflow-hidden rounded-xl border border-white/10 bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-200 sm:rounded-2xl">
                
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-3">
                    <div className="flex items-center gap-2">
                        <MaterialIcon icon="history" size={20} className="shrink-0 text-primary/90" />
                        <h3 className="text-sm font-semibold tracking-tight text-foreground">Versiyon Geçmişi</h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                    >
                        <MaterialIcon icon="close" size={18} />
                    </button>
                </div>

                {/* Body - Scroll Alanı */}
                <div className="min-h-[250px] flex-1 overflow-y-auto px-4 py-3 custom-scrollbar">
                    {isLoading ? (
                        <div className="flex h-full flex-col items-center justify-center gap-3 py-10">
                            <MaterialIcon icon="sync" size={26} className="animate-spin text-primary/80" />
                            <span className="text-sm text-muted-foreground">Yükleniyor…</span>
                        </div>
                    ) : versions.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center gap-2 py-10">
                            <MaterialIcon icon="history_toggle_off" size={32} className="text-white/20" />
                            <p className="text-sm text-muted-foreground">Henüz kayıtlı sürüm yok.</p>
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {versions.map((v) => (
                                <div
                                    key={v.id}
                                    className="rounded-xl bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]"
                                >
                                    <input
                                        type="text"
                                        defaultValue={v.label ?? ''}
                                        placeholder="Sürüm adı (isteğe bağlı)"
                                        className="mb-2 w-full rounded-md bg-black/20 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/40"
                                        onBlur={(e) => void saveLabel(v.id, e.target.value)}
                                    />
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-foreground/90">
                                                {v.label?.trim()
                                                    ? v.label
                                                    : new Date(v.created_at).toLocaleString('tr-TR')}
                                            </p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                v{v.version_no} · {v.source} · {(v.size_bytes / 1024).toFixed(1)} KB
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => onRestore(v.id)}
                                            className="shrink-0 rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/25"
                                        >
                                            Geri yükle
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer - Karşılaştırma ve Bilgi Alanı */}
                {versions.length >= 2 && (
                    <div className="shrink-0 bg-black/20 px-4 py-3">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                            Belgeleri karşılaştır
                        </p>
                        <div className="flex items-center gap-2">
                            <select
                                value={compareA}
                                onChange={(e) => setCompareA(e.target.value)}
                                className="flex-1 cursor-pointer rounded-md bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/40 hover:bg-white/3"
                            >
                                {versions.map((v) => (
                                    <option key={v.id} value={v.id}>
                                        v{v.version_no}{v.label ? ` — ${v.label}` : ''}
                                    </option>
                                ))}
                            </select>
                            <MaterialIcon icon="compare_arrows" size={18} className="shrink-0 text-muted-foreground" />
                            <select
                                value={compareB}
                                onChange={(e) => setCompareB(e.target.value)}
                                className="flex-1 cursor-pointer rounded-md bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/40 hover:bg-white/3"
                            >
                                {versions.map((v) => (
                                    <option key={v.id} value={v.id}>
                                        v{v.version_no}{v.label ? ` — ${v.label}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button
                            type="button"
                            onClick={runCompare}
                            className="mt-3 w-full rounded-lg bg-white/10 py-2 text-xs font-medium text-foreground transition-colors hover:bg-white/15"
                        >
                            Metin farkını göster
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
};

export default VersionHistoryPanel;