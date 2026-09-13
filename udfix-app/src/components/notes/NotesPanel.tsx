import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNotesStore } from '../../stores/useNotesStore';
import { useContextStore } from '../../stores/useContextStore';
import { useShallow } from 'zustand/react/shallow';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { type Note } from '../../services/dataService';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { Badge } from '../../components/ui/badge';
import { debounce } from 'lodash';
import { useFlyoutSearchInputFocus } from '../../hooks/useFlyoutSearchInputFocus';
import { FlyoutSearchInput } from '../layout/FlyoutSearchInput';
import { getDatabaseSearchShortcutLabel } from '../../shortcuts/databaseSearch';
import { emptyTipTapDocJson } from '../../utils/editorEmptyPlaceholder';
import { DataService } from '../../services/dataService';
import { exportNotesBulkMarkdown } from '../../utils/markdownExport';
import { toast } from 'sonner';

export const NotesPanel: React.FC = () => {
    const {
        notes,
        isLoading,
        fetchNotes,
        searchNotes,
        addNote,
        setActiveNote,
    } = useNotesStore();

    const {
        activeEntityType,
        activeEntityId,
        activeEntityName
    } = useContextStore();

    const { openNote, notesPanelSearchPulse, clearNotesPanelSearchPayload, flyoutSearchQuery } =
        useLayoutStore(
            useShallow((s) => ({
                openNote: s.openNote,
                notesPanelSearchPulse: s.notesPanelSearchPulse,
                clearNotesPanelSearchPayload: s.clearNotesPanelSearchPayload,
                flyoutSearchQuery: s.flyoutSearchQuery,
            })),
        );
    const searchInputRef = useFlyoutSearchInputFocus('notes');
    const searchShortcut = getDatabaseSearchShortcutLabel('notes');

    const [displayNotes, setDisplayNotes] = useState<Note[]>([]);
    /** When true, list/search ignore matter/party/document context (show all notes). */
    const [ignoreContextForList, setIgnoreContextForList] = useState(false);
    /** Shown when opened from NoteEditor chips (FTS preset). */
    const [editorSearchHint, setEditorSearchHint] = useState<string | null>(null);
    const [isBulkExporting, setIsBulkExporting] = useState(false);
    const parentRef = useRef<HTMLDivElement>(null);
    const lastOpenedContextRef = useRef<string | null>(null);

    useEffect(() => {
        if (notesPanelSearchPulse === 0) return;
        const { notesPanelSearchPayload, setFlyoutSearchQuery } = useLayoutStore.getState();
        if (!notesPanelSearchPayload) return;
        setFlyoutSearchQuery(notesPanelSearchPayload.query);
        setEditorSearchHint(notesPanelSearchPayload.hint ?? null);
        clearNotesPanelSearchPayload();
    }, [notesPanelSearchPulse, clearNotesPanelSearchPayload]);

    useEffect(() => {
        setIgnoreContextForList(false);
    }, [activeEntityType, activeEntityId]);

    useEffect(() => {
        if (!flyoutSearchQuery.trim()) {
            setDisplayNotes(notes);
        }
    }, [notes, flyoutSearchQuery]);

    const listFetchFilters = useMemo(() => {
        if (ignoreContextForList) return {};
        return {
            parentType:
                activeEntityType && activeEntityType !== 'NOTE' ? activeEntityType : undefined,
            parentId:
                activeEntityId && activeEntityType !== 'NOTE' ? activeEntityId : undefined,
        };
    }, [activeEntityType, activeEntityId, ignoreContextForList]);

    // Initial fetch based on active context
    useEffect(() => {
        fetchNotes(listFetchFilters);
    }, [listFetchFilters, fetchNotes]);

    // Debounced Search via SQLite FTS
    const contextFilters = useMemo(
        () =>
            !ignoreContextForList &&
            activeEntityType &&
            activeEntityType !== 'NOTE' &&
            activeEntityId
                ? { parentType: activeEntityType, parentId: activeEntityId }
                : undefined,
        [ignoreContextForList, activeEntityType, activeEntityId]
    );

    const debouncedSearch = useMemo(
        () => debounce(async (term: string) => {
            if (!term.trim()) {
                fetchNotes(listFetchFilters);
                return;
            }
            const results = await searchNotes(term.trim(), contextFilters);
            setDisplayNotes(results);
        }, 300),
        [fetchNotes, searchNotes, contextFilters, listFetchFilters]
    );

    useEffect(() => {
        debouncedSearch(flyoutSearchQuery);
        return () => debouncedSearch.cancel();
    }, [flyoutSearchQuery, debouncedSearch]);

    // Contextual Auto-Focus: Seamlessly pull up notes when navigating to a file
    useEffect(() => {
        const currentContext = activeEntityId ? `${activeEntityType}-${activeEntityId}` : 'GENERAL';
        
        // Once loading finishes for a NEW context switch
        if (!isLoading && currentContext !== lastOpenedContextRef.current) {
            lastOpenedContextRef.current = currentContext;
            
            // If we navigated to a specific file (Party/Matter) and notes exist,
            // automatically select the pinned one or the first one so the lawyer can read/type immediately.
            if (activeEntityId && displayNotes.length > 0) {
                const defaultNote = displayNotes.find(n => n.is_pinned) || displayNotes[0];
                setActiveNote(defaultNote);
                openNote(defaultNote.id, defaultNote.title || 'Not');
            }
        }
    }, [isLoading, activeEntityId, activeEntityType, displayNotes, setActiveNote, openNote]);

    const handleCreateNote = async () => {
        const id = crypto.randomUUID();
        const parentType: Note['parent_type'] =
            !activeEntityType ||
            activeEntityType === 'NOTE' ||
            activeEntityType === 'KNOWLEDGE'
                ? 'GENERAL'
                : activeEntityType;
        const parentId =
            !activeEntityId ||
            activeEntityType === 'NOTE' ||
            activeEntityType === 'KNOWLEDGE'
                ? undefined
                : activeEntityId;
        const newNote: Partial<Note> = {
            id,
            title: '',
            content_json: emptyTipTapDocJson(),
            content_plain: '',
            parent_type: parentType,
            parent_id: parentId,
            is_pinned: false,
        };
        await addNote(newNote);
        openNote(id, 'Yeni Not');
    };

    const handleSelectNote = (note: Note) => {
        setActiveNote(note);
        openNote(note.id, note.title || 'Not');
    };

    const handleBulkExportMarkdown = async () => {
        setIsBulkExporting(true);
        try {
            const notesWithBody = await DataService.getNotes();
            const exportable = Array.isArray(notesWithBody) ? notesWithBody : [];
            if (exportable.length === 0) {
                toast.error('Dışa aktarılacak not bulunamadı');
                return;
            }
            await exportNotesBulkMarkdown(exportable);
            toast.success(`${exportable.length} not markdown zip olarak indirildi`);
        } catch (error) {
            console.error(error);
            toast.error('Toplu markdown dışa aktarma başarısız');
        } finally {
            setIsBulkExporting(false);
        }
    };

    // Virtualization setup
    const rowVirtualizer = useVirtualizer({
        count: displayNotes.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 78,
        overscan: 5,
    });

    const showBlockingLoad = isLoading && displayNotes.length === 0;
    const showEmpty = !isLoading && displayNotes.length === 0;
    const showList = displayNotes.length > 0;

    const hasSearch = flyoutSearchQuery.trim().length > 0;
    const hasContextFilter = Boolean(
        !ignoreContextForList &&
            activeEntityType &&
            activeEntityType !== 'NOTE' &&
            activeEntityId
    );
    const showResults = hasSearch || hasContextFilter || ignoreContextForList;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 shrink-0">
                {/* Row 1: Search & Add */}
                <div className="flex items-center gap-2">
                    <FlyoutSearchInput
                        inputRef={searchInputRef}
                        icon="description"
                        placeholder="Arama yapın"
                        title={`Notlar (${searchShortcut})`}
                        ariaLabel={`Notlar (${searchShortcut})`}
                        onQueryChange={() => {
                            if (editorSearchHint) setEditorSearchHint(null);
                        }}
                    />
                    <Button
                        onClick={handleCreateNote}
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-lg shrink-0 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
                        title="Yeni not"
                        aria-label="Yeni not"
                    >
                        <MaterialIcon icon="add" size={18} />
                    </Button>
                    <Button
                        onClick={() => void handleBulkExportMarkdown()}
                        size="icon"
                        variant="ghost"
                        disabled={isBulkExporting}
                        className="h-8 w-8 rounded-lg shrink-0 text-muted-foreground hover:text-primary hover:bg-white/10"
                        title="Tüm notları indir"
                        aria-label="Tüm notları indir"
                    >
                        <MaterialIcon icon="download" size={18} />
                    </Button>
                </div>

                {showResults && editorSearchHint && (
                    <div className="flex items-center gap-1.5 min-h-7 px-2 py-1 rounded-lg border border-primary/20 bg-primary/5 text-[10px] text-foreground/85">
                        <MaterialIcon icon="filter_alt" size={14} className="text-primary shrink-0" />
                        <span className="flex-1 min-w-0 truncate font-medium">{editorSearchHint}</span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 rounded-md hover:bg-white/10"
                            title="Editör süzmesini kaldır"
                            aria-label="Editör süzmesini kaldır"
                            onClick={() => {
                                setEditorSearchHint(null);
                                useLayoutStore.getState().setFlyoutSearchQuery('');
                            }}
                        >
                            <MaterialIcon icon="close" size={14} />
                        </Button>
                    </div>
                )}

                {hasContextFilter && activeEntityName && (
                    <div
                        className={cn(
                            'flex items-center gap-1.5 min-h-8 pl-2 pr-1 py-0.5 rounded-lg border backdrop-blur-sm transition-all',
                            ignoreContextForList
                                ? 'bg-white/[0.03] border-white/10 text-muted-foreground'
                                : 'bg-primary/[0.07] border-primary/20'
                        )}
                    >
                        <MaterialIcon
                            icon={
                                activeEntityType === 'MATTER'
                                    ? 'gavel'
                                    : activeEntityType === 'PARTY'
                                      ? 'person'
                                      : activeEntityType === 'KNOWLEDGE'
                                        ? 'local_library'
                                        : 'description'
                            }
                            size={14}
                            className={cn('shrink-0', ignoreContextForList ? 'text-muted-foreground' : 'text-primary')}
                        />
                        <div className="flex-1 min-w-0">
                            <div className="text-[8px] font-semibold uppercase tracking-wider text-muted-foreground/75">
                                {ignoreContextForList ? 'Bağlam (yeni not için)' : 'Bağlam'}
                            </div>
                            <span
                                className={cn(
                                    'text-[10px] font-semibold truncate block leading-tight',
                                    ignoreContextForList ? 'text-foreground/65' : 'text-primary'
                                )}
                            >
                                {activeEntityName}
                            </span>
                        </div>
                        {!ignoreContextForList ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10"
                                title="Bağlam filtresini kaldır"
                                aria-label="Bağlam filtresini kaldır"
                                onClick={() => setIgnoreContextForList(true)}
                            >
                                <MaterialIcon icon="close" size={14} />
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 shrink-0 rounded-md px-2 text-[9px] font-semibold uppercase tracking-wide text-primary hover:bg-primary/12"
                                onClick={() => setIgnoreContextForList(false)}
                            >
                                Süz
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {showResults && (
                <div ref={parentRef} className="mt-2 overflow-auto custom-scrollbar pr-1 pb-2 relative max-h-[60vh]">
                    {showBlockingLoad ? (
                        <div className="flex flex-col items-center justify-center py-6 opacity-45 space-y-2 relative z-[1]">
                            <MaterialIcon icon="hourglass_empty" size={24} className="animate-spin text-primary" />
                            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                                Yükleniyor
                            </span>
                        </div>
                    ) : null}
                    {showEmpty ? (
                        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground px-3 text-center border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
                            <MaterialIcon icon="note_stack" size={24} className="mb-2 opacity-40" />
                            <span className="text-[10px] font-medium leading-snug opacity-90">
                                {flyoutSearchQuery.trim()
                                    ? 'Eşleşen not yok.'
                                    : contextFilters
                                      ? 'Bu kayda bağlı not yok.'
                                      : 'Henüz not yok.'}
                            </span>
                        </div>
                    ) : null}
                    {showList ? (
                        <div
                            style={{
                                height: `${rowVirtualizer.getTotalSize()}px`,
                                width: '100%',
                                position: 'relative',
                            }}
                        >
                            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                const note = displayNotes[virtualRow.index];
                                return (
                                    <div
                                        key={note.id}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '100%',
                                            height: `${virtualRow.size}px`,
                                            transform: `translateY(${virtualRow.start}px)`,
                                            paddingBottom: '8px',
                                        }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => handleSelectNote(note)}
                                            className={cn(
                                                'w-full h-full text-left p-3 rounded-xl border transition-colors duration-200 cursor-pointer group relative overflow-hidden backdrop-blur-sm',
                                                note.is_pinned
                                                    ? 'border-primary/30 bg-primary/[0.06] hover:bg-primary/[0.09]'
                                                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/15'
                                            )}
                                        >
                                            {!!note.is_pinned && (
                                                <div className="absolute top-2 right-2 opacity-70">
                                                    <MaterialIcon icon="push_pin" size={12} className="text-primary" filled />
                                                </div>
                                            )}
                                            <div className="font-semibold text-[12px] text-foreground/90 group-hover:text-primary transition-colors pr-6 truncate leading-snug">
                                                {note.title || 'Başlıksız Not'}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed mt-1 opacity-85">
                                                {note.content_plain || '—'}
                                            </div>
                                            <div className="mt-2 flex items-center justify-between gap-2">
                                                <span className="text-[9px] text-muted-foreground/70 tabular-nums">
                                                    {new Date(note.updated_at).toLocaleDateString('tr-TR')}
                                                </span>
                                                {note.parent_type !== 'GENERAL' && !activeEntityId && (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[7px] h-4 px-1.5 py-0 bg-black/20 border-white/10 uppercase tracking-wider rounded-md font-semibold"
                                                    >
                                                        {note.parent_type === 'MATTER'
                                                            ? 'Dava'
                                                            : note.parent_type === 'PARTY'
                                                              ? 'Taraf'
                                                              : note.parent_type}
                                                    </Badge>
                                                )}
                                            </div>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
            )}

        </div>
    );
};

