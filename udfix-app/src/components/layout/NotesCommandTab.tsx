import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { debounce } from 'lodash';
import { DataService, type Note, type NoteSummary } from '../../services/dataService';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import MaterialIcon from '../ui/MaterialIcon';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { emptyTipTapDocJson } from '../../utils/editorEmptyPlaceholder';

type Props = { onClose: () => void };

function noteTitle(n: Pick<NoteSummary, 'title'>): string {
    return n.title?.trim() || 'Başlıksız Not';
}

function formatAudit(ts?: string | null): string {
    if (!ts) return '';
    try {
        const d = new Date(ts);
        return Number.isNaN(d.getTime()) ? ts : d.toLocaleString('tr-TR');
    } catch {
        return ts ?? '';
    }
}

function noteToSummary(n: Note): NoteSummary {
    return {
        id: n.id,
        title: n.title ?? '',
        content_preview:
            n.content_plain && n.content_plain.length > 220
                ? `${n.content_plain.slice(0, 220)}…`
                : n.content_plain || null,
        parent_type: n.parent_type,
        parent_id: n.parent_id ?? null,
        is_pinned: n.is_pinned,
        metadata: n.metadata ?? null,
        created_at: n.created_at,
        updated_at: n.updated_at,
    };
}

export const NotesCommandTab: React.FC<Props> = ({ onClose }) => {
    const openNote = useLayoutStore((s) => s.openNote);
    const openRightPanel = useLayoutStore((s) => s.openRightPanel);
    const [q, setQ] = useState('');
    const [rows, setRows] = useState<NoteSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);

    const loadRecent = useCallback(async () => {
        setLoading(true);
        try {
            const list = await DataService.getNotesSummary();
            setRows(Array.isArray(list) ? list.slice(0, 80) : []);
        } catch (error) {
            console.error('Notes command tab load failed:', error);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const searchNotes = useMemo(
        () =>
            debounce(async (query: string) => {
                const trimmed = query.trim();
                if (!trimmed) {
                    await loadRecent();
                    return;
                }
                setLoading(true);
                try {
                    const list = await DataService.searchNotes(trimmed, 80);
                    setRows(Array.isArray(list) ? list.map(noteToSummary) : []);
                } catch (error) {
                    console.error('Notes command tab search failed:', error);
                    setRows([]);
                } finally {
                    setLoading(false);
                }
            }, 220),
        [loadRecent]
    );

    useEffect(() => {
        void loadRecent();
    }, [loadRecent]);

    useEffect(() => {
        searchNotes(q);
        return () => searchNotes.cancel();
    }, [q, searchNotes]);

    const pinned = rows.filter((n) => !!n.is_pinned);
    const recent = rows.filter((n) => !n.is_pinned);

    const openRow = (row: NoteSummary) => {
        openNote(row.id, noteTitle(row));
        onClose();
    };

    const createNote = async () => {
        const id = crypto.randomUUID();
        setCreating(true);
        try {
            await DataService.addNote({
                id,
                title: '',
                content_json: emptyTipTapDocJson(),
                content_plain: '',
                parent_type: 'GENERAL',
                is_pinned: false,
            });
            openNote(id, 'Yeni Not');
            onClose();
        } catch (error) {
            console.error('Notes command tab create failed:', error);
            toast.error('Not oluşturulamadı');
        } finally {
            setCreating(false);
        }
    };

    const renderSection = (title: string, items: NoteSummary[]) => {
        if (!items.length) return null;
        return (
            <section className="space-y-1.5">
                <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-neutral-400">
                    {title}
                </h3>
                <div className="space-y-1.5">
                    {items.map((n) => (
                        <button
                            key={n.id}
                            type="button"
                            className={cn(
                                'flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left shadow-sm transition-colors',
                                'border-slate-200/80 bg-white/70 text-slate-950 hover:bg-white/90',
                                'dark:border-white/10 dark:bg-neutral-900/70 dark:text-neutral-50 dark:hover:bg-white/10'
                            )}
                            onClick={() => openRow(n)}
                        >
                            <div
                                className={cn(
                                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                                    n.is_pinned
                                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                                )}
                            >
                                <MaterialIcon icon={n.is_pinned ? 'keep' : 'edit_note'} size={17} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="truncate text-sm font-semibold">{noteTitle(n)}</span>
                                    {n.is_pinned ? (
                                        <span className="shrink-0 rounded-full border border-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                                            Sabit
                                        </span>
                                    ) : null}
                                </div>
                                {n.content_preview ? (
                                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-neutral-400">
                                        {n.content_preview}
                                    </p>
                                ) : (
                                    <p className="mt-0.5 text-xs italic text-slate-500 dark:text-neutral-500">
                                        İçerik yok
                                    </p>
                                )}
                                <p className="mt-1 text-[10px] text-slate-500 dark:text-neutral-500">
                                    {formatAudit(n.updated_at)}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            </section>
        );
    };

    return (
        <div className="flex h-[min(560px,78vh)] min-h-0 w-full flex-col bg-white/45 text-slate-950 dark:bg-neutral-950/45 dark:text-neutral-50">
            <div className="shrink-0 space-y-2 border-b border-slate-200/80 p-3 dark:border-white/10">
                <div className="relative">
                    <MaterialIcon
                        icon="search"
                        size={18}
                        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-neutral-400"
                    />
                    <Input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Not ara…"
                        className="h-10 border-slate-300 bg-white/70 pl-9 text-slate-950 placeholder:text-slate-500 dark:border-white/10 dark:bg-neutral-900/70 dark:text-neutral-50 dark:placeholder:text-neutral-400"
                        autoFocus
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        size="sm"
                        className="gap-1.5"
                        disabled={creating}
                        onClick={() => void createNote()}
                    >
                        <MaterialIcon icon="add" size={16} />
                        Yeni not
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-slate-300 bg-white/70 text-slate-950 hover:bg-white/90 dark:border-white/10 dark:bg-neutral-900/70 dark:text-neutral-50 dark:hover:bg-white/10"
                        onClick={() => {
                            openRightPanel('notes');
                            onClose();
                        }}
                    >
                        <MaterialIcon icon="dock_to_right" size={16} />
                        Notlar paneli
                    </Button>
                </div>
                {loading ? <p className="text-[11px] text-slate-600 dark:text-neutral-400">Yükleniyor…</p> : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
                {!rows.length && !loading ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-600 dark:text-neutral-400">
                        {q.trim() ? 'Eşleşen not yok.' : 'Henüz not yok.'}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {renderSection('Sabitlenenler', pinned)}
                        {renderSection(q.trim() ? 'Arama sonuçları' : 'Son notlar', recent)}
                    </div>
                )}
            </div>
        </div>
    );
};

