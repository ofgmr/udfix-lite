import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from '../../components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { useShallow } from 'zustand/react/shallow';
import { useLayoutStore } from '../../stores/useLayoutStore';
import {
    DataService,
    type EditorDocumentRecoveryItem,
    type NoteSummary,
    type RecentFileRow,
    type SearchResults,
    type SearchAllScope,
    type Matter,
} from '../../services/dataService';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { useThemeStore, THEME_PALETTES } from '../../stores/useThemeStore';
import { useContextStore } from '../../stores/useContextStore';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Switch } from '../../components/ui/switch';
import { useShowUserGuidanceLabels } from '../../hooks/useShowUserGuidanceLabels';
import { pushEditorPreferenceToggle } from '../../preferences/pushEditorPreferences';
import CommandResultCard from './CommandResultCard';
import { TemplateLibraryCommandTab } from './TemplateLibraryCommandTab';
import { TasksCommandTab } from './TasksCommandTab';
import { UyapCommandTab } from './UyapCommandTab';
import { toast } from 'sonner';
import { formatShortcutKeys } from '../../shortcuts/format';
import { matchesCombo } from '../../shortcuts/match';
import { getRegistryEntry } from '../../shortcuts/registry';
import { OFFICE_MATTER_TYPE_LABELS } from '../../data/uyap/uyapDosyaTurMapping';
import { emptyTipTapDocJson } from '../../utils/editorEmptyPlaceholder';
import {
    formatKnowledgeCopyText,
    formatMatterCopyText,
    formatPartyCopyText,
} from '../../utils/entityCopyText';
import { copyTextWithToast } from '../../utils/copyText';
import { cn } from '../../lib/utils';
import {
    COMMAND_PALETTE_OPEN_EVENT,
    COMMAND_PALETTE_CLOSE_EVENT,
    type CommandPaletteOpenEventDetail,
    type CommandPaletteTab,
} from './commandPaletteEvents';

type ContinueItems = {
    document: EditorDocumentRecoveryItem | null;
    note: NoteSummary | null;
    file: RecentFileRow | null;
    loading: boolean;
};

function timestampValue(ts?: string | null): number {
    if (!ts) return 0;
    const time = new Date(ts).getTime();
    return Number.isNaN(time) ? 0 : time;
}

function fileNameFromPath(path: string): string {
    return path.split(/[\\/]/).filter(Boolean).pop() || path;
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

function noteTitle(note: Pick<NoteSummary, 'title'>): string {
    return note.title?.trim() || 'Başlıksız Not';
}

function matterFileLabel(matter: Pick<Matter, 'file_number' | 'esas_no' | 'internal_id'>): string {
    return matter.file_number || matter.esas_no || matter.internal_id || 'Esas no yok';
}

function matterSearchSubtitle(matter: Matter): string {
    const court = matter.court_name || 'Mahkeme bilgisi yok';
    return `${court} • ${matterFileLabel(matter)}`;
}

function truncateSearchField(value: string, max = 96): string {
    const trimmed = value.trim();
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, max - 1)}…`;
}

type MatterSearchHit = Matter & {
    vekiller_list?: string | null;
    attributes_search?: string | null;
};

function parseUyapMetadataValue(metadata?: string | null, key?: string): string {
    if (!metadata) return '';
    try {
        const parsed = JSON.parse(metadata) as { uyap?: Record<string, unknown> };
        const value = parsed?.uyap?.[key ?? ''];
        return typeof value === 'string' ? value.trim() : '';
    } catch {
        return '';
    }
}

function attributeValueFromSearchBlob(
    attributesSearch: string | null | undefined,
    tagKey: string,
): string {
    if (!attributesSearch) return '';
    for (const chunk of attributesSearch.split(' | ')) {
        const prefix = `${tagKey}: `;
        if (chunk.startsWith(prefix)) return chunk.slice(prefix.length).trim();
    }
    return '';
}

function matterExtraSearchMeta(matter: MatterSearchHit): Array<{ label: string; value: string }> {
    const meta: Array<{ label: string; value: string }> = [];
    if (matter.matter_category) {
        meta.push({ label: 'Merci', value: matter.matter_category });
    }

    const konu =
        parseUyapMetadataValue(matter.metadata, 'davaTurleriStr') ||
        attributeValueFromSearchBlob(matter.attributes_search, 'uyap_dava_turu') ||
        parseUyapMetadataValue(matter.metadata, 'dosyaTur');
    if (konu) {
        meta.push({ label: 'Konu', value: truncateSearchField(konu) });
    }

    const takipYolu = attributeValueFromSearchBlob(matter.attributes_search, 'uyap_icra_takip_yolu');
    if (takipYolu) {
        meta.push({ label: 'Takip yolu', value: truncateSearchField(takipYolu) });
    }

    if (matter.vekiller_list?.trim()) {
        meta.push({ label: 'Vekil', value: truncateSearchField(matter.vekiller_list) });
    }

    return meta;
}

function partyVekilFromMetadata(metadata?: string | null): string {
    return parseUyapMetadataValue(metadata, 'vekil');
}

type SearchScope = SearchAllScope;

const SEARCH_SCOPE_OPTIONS: { id: SearchScope; label: string; icon: string }[] = [
    { id: 'all', label: 'Tümü', icon: 'search' },
    { id: 'matters', label: 'Dosyalar', icon: 'gavel' },
    { id: 'parties', label: 'Taraflar', icon: 'group' },
    { id: 'notes', label: 'Notlar', icon: 'description' },
    { id: 'knowledge', label: 'Bilgi', icon: 'local_library' },
];

const PALETTE_SEARCH_COMMIT_MS = 300;

function PaletteSearchInput({
    inputRef,
    committedQuery,
    onCommit,
}: {
    inputRef: React.RefObject<HTMLInputElement | null>;
    committedQuery: string;
    onCommit: (value: string) => void;
}) {
    const [draft, setDraft] = useState(committedQuery);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setDraft(committedQuery);
    }, [committedQuery]);

    useEffect(
        () => () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        },
        [],
    );

    return (
        <div
            className="flex items-center border-b border-slate-200 bg-white px-3 dark:border-white/10 dark:bg-neutral-950"
            cmdk-input-wrapper=""
        >
            <MaterialIcon icon="search" size={16} className="mr-2 shrink-0 opacity-50" />
            <input
                ref={inputRef}
                value={draft}
                placeholder="Arama yapın veya bir komut yazın (Müvekkil, Dosya, Not...)"
                className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm text-slate-950 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-50 dark:placeholder:text-neutral-400"
                onChange={(event) => {
                    const next = event.target.value;
                    setDraft(next);
                    if (timerRef.current) {
                        clearTimeout(timerRef.current);
                        timerRef.current = null;
                    }
                    if (next.trim().length < 2) {
                        onCommit(next);
                        return;
                    }
                    timerRef.current = setTimeout(() => {
                        timerRef.current = null;
                        onCommit(next);
                    }, PALETTE_SEARCH_COMMIT_MS);
                }}
                onBlur={() => {
                    if (timerRef.current) {
                        clearTimeout(timerRef.current);
                        timerRef.current = null;
                    }
                    onCommit(draft);
                }}
            />
        </div>
    );
}

const CommandPalette: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<CommandPaletteTab>('search');
    const [query, setQuery] = useState('');
    const [searchScope, setSearchScope] = useState<SearchScope>('all');
    const [results, setResults] = useState<SearchResults | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [continueItems, setContinueItems] = useState<ContinueItems>({
        document: null,
        note: null,
        file: null,
        loading: false,
    });
    const searchInputRef = useRef<HTMLInputElement>(null);

    const {
        openNote,
        openMatterFormFloating,
        openPartyFormFloating,
        openKnowledgeFormFloating,
    } = useLayoutStore(
        useShallow((s) => ({
            openNote: s.openNote,
            openMatterFormFloating: s.openMatterFormFloating,
            openPartyFormFloating: s.openPartyFormFloating,
            openKnowledgeFormFloating: s.openKnowledgeFormFloating,
        })),
    );
    const { palette, mode, setPalette, setMode } = useThemeStore();
    const showGuidance = useShowUserGuidanceLabels();

    const commitSearchQuery = useCallback((value: string) => {
        setQuery((prev) => (prev === value ? prev : value));
    }, []);

    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) {
            setResults(null);
            setIsSearching(false);
            return;
        }
        let cancelled = false;
        setIsSearching(true);
        void DataService.searchAll(query, undefined, searchScope)
            .then((res) => {
                if (!cancelled) setResults(res);
            })
            .catch((error) => {
                console.error('Global search failed:', error);
            })
            .finally(() => {
                if (!cancelled) setIsSearching(false);
            });
        return () => {
            cancelled = true;
        };
    }, [query, searchScope]);

    const loadContinueItems = useCallback(async () => {
        setContinueItems((current) => ({ ...current, loading: true }));
        try {
            const [documents, note, files] = await Promise.all([
                DataService.listDocumentRecoveryItems(12),
                DataService.getRecentNoteSummary(),
                DataService.getRecentFiles(1),
            ]);

            const document =
                documents
                    .filter((item) => item.kind === 'editor' && item.document_id)
                    .sort(
                        (a, b) =>
                            timestampValue(b.last_opened_at ?? b.sort_at ?? b.updated_at) -
                            timestampValue(a.last_opened_at ?? a.sort_at ?? a.updated_at),
                    )[0] ?? null;
            setContinueItems({
                document,
                note: note ?? null,
                file: Array.isArray(files) ? files[0] ?? null : null,
                loading: false,
            });
        } catch (error) {
            console.error('Command palette continue items failed:', error);
            setContinueItems({ document: null, note: null, file: null, loading: false });
        }
    }, []);

    useEffect(() => {
        if (!open || tab !== 'search' || query.trim().length > 0) return;
        void loadContinueItems();
    }, [loadContinueItems, open, query, tab]);

    useEffect(() => {
        const templatesShortcut = getRegistryEntry('command-palette-templates');
        const tasksShortcut = getRegistryEntry('command-palette-tasks');
        const paletteShortcut = getRegistryEntry('command-palette');

        const down = (e: KeyboardEvent) => {
            if (templatesShortcut && matchesCombo(e, templatesShortcut.combo)) {
                e.preventDefault();
                e.stopPropagation();
                setTab('templates');
                setOpen(true);
                return;
            }
            if (tasksShortcut && matchesCombo(e, tasksShortcut.combo)) {
                e.preventDefault();
                e.stopPropagation();
                setTab('tasks');
                setOpen(true);
                return;
            }
            if (!paletteShortcut || !matchesCombo(e, paletteShortcut.combo)) return;

            // Capture phase: Chromium treats Mod+K as "insert link" in contenteditable before bubble.
            e.preventDefault();
            e.stopPropagation();
            setOpen((prev) => {
                if (!prev) setTab('search');
                return !prev;
            });
        };

        window.addEventListener('keydown', down, true);
        return () => window.removeEventListener('keydown', down, true);
    }, []);

    useEffect(() => {
        const openFromShell = (event: Event) => {
            const detail = (event as CustomEvent<CommandPaletteOpenEventDetail>).detail;
            setTab(detail?.tab ?? 'search');
            setOpen(true);
        };

        window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, openFromShell);
        return () => window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, openFromShell);
    }, []);

    useEffect(() => {
        const closeFromShell = () => setOpen(false);
        window.addEventListener(COMMAND_PALETTE_CLOSE_EVENT, closeFromShell);
        return () => window.removeEventListener(COMMAND_PALETTE_CLOSE_EVENT, closeFromShell);
    }, []);

    const createNoteFromPalette = useCallback(() => {
        void (async () => {
            const id = crypto.randomUUID();
            try {
                await DataService.addNote({
                    id,
                    title: 'Yeni Not',
                    content_json: emptyTipTapDocJson(),
                    content_plain: '',
                    parent_type: 'GENERAL',
                    is_pinned: false,
                });
                openNote(id, 'Yeni Not');
            } catch (error) {
                console.error('Command palette note create failed:', error);
                toast.error('Not oluşturulamadı');
            }
        })();
    }, [openNote]);

    const runCommand = (command: () => void) => {
        setOpen(false);
        setQuery('');
        setTab('search');
        command();
    };

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) {
            setQuery('');
            setSearchScope('all');
            setTab('search');
        }
    };

    const focusSearchInput = useCallback(() => {
        requestAnimationFrame(() => {
            searchInputRef.current?.focus();
        });
    }, []);

    const openSearchResult = useCallback(
        (type: 'MATTER' | 'PARTY' | 'NOTE' | 'KNOWLEDGE', id: string, name: string) => {
            setOpen(false);
            setQuery('');
            setTab('search');

            switch (type) {
                case 'NOTE':
                    openNote(id, name);
                    break;
                case 'MATTER':
                    useContextStore.getState().setContext('MATTER', id, name);
                    openMatterFormFloating({ id, title: name });
                    break;
                case 'PARTY':
                    useContextStore.getState().setContext('PARTY', id, name);
                    openPartyFormFloating({ id, full_name: name });
                    break;
                case 'KNOWLEDGE':
                    useContextStore.getState().setContext('KNOWLEDGE', id, name);
                    openKnowledgeFormFloating({ id, title: name });
                    break;
            }
        },
        [openNote, openMatterFormFloating, openPartyFormFloating, openKnowledgeFormFloating]
    );

    const refreshResults = useCallback(async () => {
        if (query.length < 2) {
            setResults(null);
            return;
        }
        const res = await DataService.searchAll(query, undefined, searchScope);
        setResults(res);
    }, [query, searchScope]);

    const handleDeleteMatter = useCallback((id: string) => {
        toast('Dosya silinsin mi?', {
            description: 'Bu işlem geri alınamaz.',
            action: {
                label: 'Sil',
                onClick: () => {
                    void (async () => {
                        try {
                            await DataService.deleteMatter(id);
                            toast.success('Dosya silindi');
                            await refreshResults();
                        } catch (error) {
                            console.error('Matter delete failed:', error);
                            toast.error('Dosya silinemedi');
                        }
                    })();
                },
            },
            cancel: {
                label: 'Vazgeç',
                onClick: () => undefined,
            },
        });
    }, [refreshResults]);

    const handleDeleteParty = useCallback((id: string) => {
        toast('Kişi silinsin mi?', {
            description: 'Bu işlem geri alınamaz.',
            action: {
                label: 'Sil',
                onClick: () => {
                    void (async () => {
                        try {
                            await DataService.deleteParty(id);
                            toast.success('Kişi silindi');
                            await refreshResults();
                        } catch (error) {
                            console.error('Party delete failed:', error);
                            toast.error('Kişi silinemedi');
                        }
                    })();
                },
            },
            cancel: {
                label: 'Vazgeç',
                onClick: () => undefined,
            },
        });
    }, [refreshResults]);

    const handleDeleteKnowledge = useCallback((id: string) => {
        toast('Kayıt silinsin mi?', {
            description: 'Bu işlem geri alınamaz.',
            action: {
                label: 'Sil',
                onClick: () => {
                    void (async () => {
                        try {
                            await DataService.deleteKnowledgeBase(id);
                            toast.success('Kayıt silindi');
                            await refreshResults();
                        } catch (error) {
                            console.error('Knowledge delete failed:', error);
                            toast.error('Kayıt silinemedi');
                        }
                    })();
                },
            },
            cancel: {
                label: 'Vazgeç',
                onClick: () => undefined,
            },
        });
    }, [refreshResults]);

    const scopedResults = useMemo(() => {
        if (!results) return null;
        if (searchScope === 'all') return results;
        return {
            matters: searchScope === 'matters' ? results.matters ?? [] : [],
            parties: searchScope === 'parties' ? results.parties ?? [] : [],
            notes: searchScope === 'notes' ? results.notes ?? [] : [],
            knowledge: searchScope === 'knowledge' ? results.knowledge ?? [] : [],
        };
    }, [results, searchScope]);

    const scopedResultCount = useMemo(() => {
        if (!scopedResults) return 0;
        return (
            (scopedResults.matters?.length ?? 0) +
            (scopedResults.parties?.length ?? 0) +
            (scopedResults.notes?.length ?? 0) +
            (scopedResults.knowledge?.length ?? 0)
        );
    }, [scopedResults]);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                className="nomai-command-palette z-[var(--z-command-palette)] overflow-hidden gap-0 p-0 shadow-2xl max-w-[min(960px,96vw)] border border-border/70 text-foreground"
                overlayClassName="z-[var(--z-command-palette)]"
                variant="glass"
                animated={false}
                aria-describedby={undefined}
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    if (tab === 'search') {
                        focusSearchInput();
                    }
                }}
            >
                <DialogTitle className="sr-only">Komut paleti</DialogTitle>
                <Tabs
                    value={tab}
                    onValueChange={(v) => setTab(v as CommandPaletteTab)}
                    className="flex h-[min(640px,88vh)] min-h-[320px] flex-col"
                >
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-background/45 py-2 pl-3 pr-14 backdrop-blur-xl">
                        <TabsList className="h-9 border border-border/70 bg-card/55 p-0.5 text-muted-foreground shadow-sm backdrop-blur-xl" variant="default">
                            <TabsTrigger
                                value="search"
                                className="gap-1.5 px-3 text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-foreground sm:text-sm"
                            >
                                <MaterialIcon icon="search" size={16} />
                                Arama
                            </TabsTrigger>
                            <TabsTrigger
                                value="templates"
                                className="gap-1.5 px-3 text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-foreground sm:text-sm"
                            >
                                <MaterialIcon icon="stylus_note" size={16} />
                                Şablonlar
                            </TabsTrigger>
                            <TabsTrigger
                                value="tasks"
                                className="gap-1.5 px-3 text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-foreground sm:text-sm"
                            >
                                <MaterialIcon icon="checklist" size={16} />
                                Yapılacaklar
                            </TabsTrigger>
                            <TabsTrigger
                                value="uyap"
                                className="gap-1.5 px-3 text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-foreground sm:text-sm"
                            >
                                <MaterialIcon icon="sync_desktop" size={16} />
                                Katır
                            </TabsTrigger>
                        </TabsList>
                        <span className="mr-2 hidden shrink-0 whitespace-nowrap text-[10px] text-muted-foreground lg:block">
                            <kbd className="rounded border border-border/70 bg-background/50 px-1 text-foreground">⌘</kbd>+
                            <kbd className="rounded border border-border/70 bg-background/50 px-1 text-foreground">K</kbd> arama ·{' '}
                            <kbd className="rounded border border-border/70 bg-background/50 px-1 text-foreground">⇧</kbd>K şablon ·{' '}
                            <kbd className="rounded border border-border/70 bg-background/50 px-1 text-foreground">⇧</kbd>T görev
                        </span>
                    </div>

                    <TabsContent
                        value="search"
                        className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
                    >
                        <Command shouldFilter={false} className="flex min-h-0 flex-1 flex-col rounded-none border-0 bg-transparent text-foreground">
                            <PaletteSearchInput
                                inputRef={searchInputRef}
                                committedQuery={query}
                                onCommit={commitSearchQuery}
                            />
                            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/50 px-3 py-2">
                                {SEARCH_SCOPE_OPTIONS.map((option) => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => setSearchScope(option.id)}
                                        className={cn(
                                            'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors',
                                            searchScope === option.id
                                                ? 'border-primary/35 bg-primary/12 text-foreground'
                                                : 'border-border/60 bg-background/35 text-muted-foreground hover:text-foreground'
                                        )}
                                    >
                                        <MaterialIcon icon={option.icon} size={12} />
                                        {option.label}
                                    </button>
                                ))}
                                {query.length > 1 && scopedResults ? (
                                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                                        {scopedResultCount} sonuç bulundu
                                    </span>
                                ) : <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                                        {scopedResultCount} sonuç bulundu
                                    </span>}
                            </div>
                            <CommandList className="max-h-[min(520px,70vh)] flex-1 overflow-hidden">
                                <ScrollArea className="h-[min(500px,68vh)]">
                                    {isSearching && (
                                        <div className="p-4 text-center text-xs text-muted-foreground animate-pulse">
                                            Aranıyor...
                                        </div>
                                    )}

                                    <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                                        {query.length > 1
                                            ? searchScope === 'all'
                                                ? 'Sonuç bulunamadı. Bilgi bankasında arama için etikete tıklayın.'
                                                : searchScope === 'knowledge'
                                                  ? 'Başlık, yazar veya etikette sonuç yok. Tam metin araması için bilgi bankası etiketine tıklayın.'
                                                  : 'Bu kategoride sonuç bulunamadı.'
                                            : 'Aramak için en az 2 karakter yazın…'}
                                    </CommandEmpty>

                                    {scopedResults && (
                                        <div className="space-y-4 p-2">
                                            {(scopedResults.matters?.length ?? 0) > 0 && (
                                                <CommandGroup heading="Dosyalar & Davalar">
                                                    {scopedResults.matters.map((m) => {
                                                        const matter = m as MatterSearchHit;
                                                        const extraMeta = matterExtraSearchMeta(matter);
                                                        return (
                                                        <CommandItem
                                                            key={matter.id}
                                                            value={matter.title + matter.file_number}
                                                            onSelect={() =>
                                                                openSearchResult('MATTER', matter.id, matter.title)
                                                            }
                                                            className="p-0 aria-selected:bg-transparent select-text"
                                                        >
                                                            <CommandResultCard
                                                                type="MATTER"
                                                                title={matter.title}
                                                                subtitle={matterSearchSubtitle(matter)}
                                                                copyText={formatMatterCopyText(matter)}
                                                                metadata={[
                                                                    {
                                                                        label: 'Durum',
                                                                        value: matter.status === 'OPEN' ? 'Açık' : 'Kapalı',
                                                                    },
                                                                    {
                                                                        label: 'Tür',
                                                                        value:
                                                                            OFFICE_MATTER_TYPE_LABELS[matter.matter_type] ??
                                                                            matter.matter_type,
                                                                    },
                                                                    ...extraMeta,
                                                                    ...(matter.parties_list
                                                                        ? [
                                                                              {
                                                                                  label: 'Taraflar',
                                                                                  value: truncateSearchField(
                                                                                      matter.parties_list,
                                                                                  ),
                                                                              },
                                                                          ]
                                                                        : []),
                                                                ]}
                                                                className="w-full"
                                                                accent="primary"
                                                                rightRailAction={{
                                                                    icon: 'delete',
                                                                    label: 'Dosyayı sil',
                                                                    onClick: () => {
                                                                        void handleDeleteMatter(matter.id);
                                                                    },
                                                                }}
                                                                actions={[
                                                                    {
                                                                        icon: 'visibility',
                                                                        label: 'Görüntüle',
                                                                        onClick: () =>
                                                                            openSearchResult('MATTER', matter.id, matter.title),
                                                                    },
                                                                    {
                                                                        icon: 'content_copy',
                                                                        label: 'İçerik kopyala',
                                                                        onClick: () =>
                                                                            void copyTextWithToast(
                                                                                formatMatterCopyText(matter),
                                                                            ),
                                                                    },
                                                                ]}
                                                            />
                                                        </CommandItem>
                                                        );
                                                    })}
                                                </CommandGroup>
                                            )}

                                            {(scopedResults.parties?.length ?? 0) > 0 && (
                                                <CommandGroup heading="Taraflar & Müvekkiller">
                                                    {scopedResults.parties.map((p) => {
                                                        const vekil = partyVekilFromMetadata(p.metadata);
                                                        return (
                                                        <CommandItem
                                                            key={p.id}
                                                            value={p.full_name}
                                                            onSelect={() =>
                                                                openSearchResult('PARTY', p.id, p.full_name)
                                                            }
                                                            className="p-0 aria-selected:bg-transparent select-text"
                                                        >
                                                            <CommandResultCard
                                                                type="PARTY"
                                                                title={p.full_name}
                                                                subtitle={
                                                                    p.email ||
                                                                    p.phone ||
                                                                    vekil ||
                                                                    'İletişim bilgisi yok'
                                                                }
                                                                copyText={formatPartyCopyText(p)}
                                                                metadata={[
                                                                    {
                                                                        label: 'Tip',
                                                                        value:
                                                                            p.type === 'INDIVIDUAL' ? 'Şahıs' : 'Kurum',
                                                                    },
                                                                    { label: 'TCKN/VKN', value: p.id_number || '-' },
                                                                    ...(vekil
                                                                        ? [{ label: 'Vekil', value: vekil }]
                                                                        : []),
                                                                    ...(p.address
                                                                        ? [
                                                                              {
                                                                                  label: 'Adres',
                                                                                  value: truncateSearchField(p.address),
                                                                              },
                                                                          ]
                                                                        : []),
                                                                ]}
                                                                className="w-full"
                                                                accent="primary"
                                                                rightRailAction={{
                                                                    icon: 'delete',
                                                                    label: 'Kişiyi sil',
                                                                    onClick: () => {
                                                                        void handleDeleteParty(p.id);
                                                                    },
                                                                }}
                                                                actions={[
                                                                    {
                                                                        icon: 'person',
                                                                        label: 'Profil',
                                                                        onClick: () =>
                                                                            openSearchResult('PARTY', p.id, p.full_name),
                                                                    },
                                                                    {
                                                                        icon: 'content_copy',
                                                                        label: 'İçerik kopyala',
                                                                        onClick: () =>
                                                                            void copyTextWithToast(
                                                                                formatPartyCopyText(p),
                                                                            ),
                                                                    },
                                                                ]}
                                                            />
                                                        </CommandItem>
                                                        );
                                                    })}
                                                </CommandGroup>
                                            )}

                                            {(scopedResults.knowledge?.length ?? 0) > 0 && (
                                                <CommandGroup heading="Bilgi Kayıtları">
                                                    {scopedResults.knowledge!.map((k) => (
                                                        <CommandItem
                                                            key={k.id}
                                                            value={`${k.title} ${k.author || ''}`}
                                                            onSelect={() => openSearchResult('KNOWLEDGE', k.id, k.title)}
                                                            className="p-0 aria-selected:bg-transparent select-text"
                                                        >
                                                            <CommandResultCard
                                                                type="DOCUMENT"
                                                                title={k.title}
                                                                subtitle={k.author || k.content || '—'}
                                                                copyText={formatKnowledgeCopyText(k)}
                                                                metadata={[
                                                                    { label: 'Tür', value: k.type },
                                                                ]}
                                                                className="w-full"
                                                                accent="primary"
                                                                rightRailAction={{
                                                                    icon: 'delete',
                                                                    label: 'Kaydı sil',
                                                                    onClick: () => {
                                                                        void handleDeleteKnowledge(k.id);
                                                                    },
                                                                }}
                                                                actions={[
                                                                    {
                                                                        icon: 'content_copy',
                                                                        label: 'İçerik kopyala',
                                                                        onClick: () =>
                                                                            void copyTextWithToast(
                                                                                formatKnowledgeCopyText(k),
                                                                            ),
                                                                    },
                                                                ]}
                                                            />
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            )}

                                            {(scopedResults.notes?.length ?? 0) > 0 && (
                                                <CommandGroup heading="Notlar">
                                                    {scopedResults.notes.map((n) => (
                                                        <CommandItem
                                                            key={n.id}
                                                            value={n.title || 'Başlıksız Not'}
                                                            onSelect={() =>
                                                                openSearchResult(
                                                                    'NOTE',
                                                                    n.id,
                                                                    n.title || 'Başlıksız Not'
                                                                )
                                                            }
                                                            className="p-0 aria-selected:bg-transparent select-text"
                                                        >
                                                            <CommandResultCard
                                                                type="NOTE"
                                                                title={n.title || 'Başlıksız Not'}
                                                                subtitle={truncateSearchField(n.content_plain || '', 120)}
                                                                copyText={[n.title, n.content_plain]
                                                                    .filter(Boolean)
                                                                    .join('\n\n')}
                                                                className="w-full"
                                                                accent="primary"
                                                                actions={[
                                                                    {
                                                                        icon: 'edit',
                                                                        label: 'Düzenle',
                                                                        onClick: () =>
                                                                            openSearchResult(
                                                                                'NOTE',
                                                                                n.id,
                                                                                n.title || 'Başlıksız Not'
                                                                            ),
                                                                    },
                                                                    {
                                                                        icon: 'content_copy',
                                                                        label: 'İçerik kopyala',
                                                                        onClick: () =>
                                                                            void copyTextWithToast(
                                                                                [n.title, n.content_plain]
                                                                                    .filter(Boolean)
                                                                                    .join('\n\n'),
                                                                            ),
                                                                    },
                                                                ]}
                                                            />
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            )}
                                            <CommandSeparator />
                                        </div>
                                    )}

                                    {!results && (
                                        <div className="space-y-3 p-2">
                                            {(continueItems.document || continueItems.note || continueItems.file || continueItems.loading) && (
                                                <>
                                                    <CommandGroup
                                                        heading="Devam Et"
                                                        className="[&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:grid-cols-1 [&_[cmdk-group-items]]:gap-2 md:[&_[cmdk-group-items]]:grid-cols-3"
                                                    >
                                                        {continueItems.document && (
                                                            <CommandItem
                                                                value={`son belge ${continueItems.document.title}`}
                                                                onSelect={() =>
                                                                    runCommand(() =>
                                                                        useLayoutStore.getState().openEditorDocument(
                                                                            continueItems.document!.document_id,
                                                                            continueItems.document!.title || 'Belge',
                                                                        )
                                                                    )
                                                                }
                                                                className="items-start gap-3 rounded-xl border border-border/70 bg-card/45 p-3 hover:bg-accent/70"
                                                            >
                                                                <MaterialIcon icon="description" size={18} className="mt-0.5 shrink-0 text-primary" />
                                                                <span className="min-w-0 flex-1">
                                                                    <span className="block truncate text-sm font-medium">Son açılan belge</span>
                                                                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                                                        {continueItems.document.title || 'Belge'}
                                                                    </span>
                                                                    {continueItems.document.last_opened_at && (
                                                                        <span className="mt-1 block truncate text-[11px] text-muted-foreground/80">
                                                                            {formatAudit(continueItems.document.last_opened_at)}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            </CommandItem>
                                                        )}
                                                        {continueItems.note && (
                                                            <CommandItem
                                                                value={`son not ${noteTitle(continueItems.note)}`}
                                                                onSelect={() =>
                                                                    runCommand(() =>
                                                                        openNote(continueItems.note!.id, noteTitle(continueItems.note!))
                                                                    )
                                                                }
                                                                className="items-start gap-3 rounded-xl border border-border/70 bg-card/45 p-3 hover:bg-accent/70"
                                                            >
                                                                <MaterialIcon icon="sticky_note_2" size={18} className="mt-0.5 shrink-0 text-primary" />
                                                                <span className="min-w-0 flex-1">
                                                                    <span className="block truncate text-sm font-medium">Son düzenlenen not</span>
                                                                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                                                        {noteTitle(continueItems.note)}
                                                                    </span>
                                                                    <span className="mt-1 block truncate text-[11px] text-muted-foreground/80">
                                                                        {formatAudit(continueItems.note.updated_at)}
                                                                    </span>
                                                                </span>
                                                            </CommandItem>
                                                        )}
                                                        {continueItems.file && (
                                                            <CommandItem
                                                                value={`son dosya pdf ${fileNameFromPath(continueItems.file.path)}`}
                                                                onSelect={() =>
                                                                    runCommand(() => {
                                                                        const fileName = fileNameFromPath(continueItems.file!.path);
                                                                        useLayoutStore.getState().openInNewViewerTab({
                                                                            url: continueItems.file!.path,
                                                                            name: fileName,
                                                                        });
                                                                        void DataService.touchRecentFile(continueItems.file!.path);
                                                                    })
                                                                }
                                                                className="items-start gap-3 rounded-xl border border-border/70 bg-card/45 p-3 hover:bg-accent/70"
                                                            >
                                                                <MaterialIcon icon="picture_as_pdf" size={18} className="mt-0.5 shrink-0 text-primary" />
                                                                <span className="min-w-0 flex-1">
                                                                    <span className="block truncate text-sm font-medium">Son görüntülenen dosya/PDF</span>
                                                                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                                                        {fileNameFromPath(continueItems.file.path)}
                                                                    </span>
                                                                    <span className="mt-1 block truncate text-[11px] text-muted-foreground/80">
                                                                        {formatAudit(continueItems.file.opened_at)}
                                                                    </span>
                                                                </span>
                                                            </CommandItem>
                                                        )}
                                                        {continueItems.loading && !continueItems.document && !continueItems.note && !continueItems.file && (
                                                            <CommandItem disabled className="col-span-full rounded-xl border border-border/70 bg-card/35 p-3 text-muted-foreground">
                                                                <MaterialIcon icon="progress_activity" size={16} className="mr-2 animate-spin" />
                                                                Son çalışma öğeleri yükleniyor…
                                                            </CommandItem>
                                                        )}
                                                    </CommandGroup>
                                                    <CommandSeparator className="my-2" />
                                                </>
                                            )}

                                            <CommandGroup
                                                heading="Hızlı Başlat"
                                                className="[&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:grid-cols-1 [&_[cmdk-group-items]]:gap-2 sm:[&_[cmdk-group-items]]:grid-cols-2"
                                            >
                                                <CommandItem
                                                    value="yeni belge"
                                                    onSelect={() =>
                                                        runCommand(() =>
                                                            useLayoutStore.getState().openEditorInNewTab()
                                                        )
                                                    }
                                                    className="items-start gap-3 rounded-xl border border-border/70 bg-card/45 p-3 hover:bg-accent/70"
                                                >
                                                    <MaterialIcon icon="edit_square" size={18} className="mt-0.5 shrink-0 text-primary" />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block font-medium">Yeni Belge</span>
                                                        <span className="block text-xs text-muted-foreground">Boş UDFIX editör sekmesi aç</span>
                                                    </span>
                                                    <CommandShortcut>
                                                        {formatShortcutKeys(getRegistryEntry('new-document')!.combo)}
                                                    </CommandShortcut>
                                                </CommandItem>
                                                <CommandItem
                                                    value="yeni not"
                                                    onSelect={() => runCommand(createNoteFromPalette)}
                                                    className="items-start gap-3 rounded-xl border border-border/70 bg-card/45 p-3 hover:bg-accent/70"
                                                >
                                                    <MaterialIcon icon="note_add" size={18} className="mt-0.5 shrink-0 text-primary" />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block font-medium">Yeni Not</span>
                                                        <span className="block text-xs text-muted-foreground">Not oluşturun, kişiler, dosyalar ve kaynaklarla bağlantılandırın.</span>
                                                    </span>
                                                    <CommandShortcut>
                                                        {formatShortcutKeys(getRegistryEntry('new-note')!.combo)}
                                                    </CommandShortcut>
                                                </CommandItem>
                                                <CommandItem
                                                    value="yeni dosya dava"
                                                    onSelect={() => runCommand(() => openMatterFormFloating(null))}
                                                    className="items-start gap-3 rounded-xl border border-border/70 bg-card/45 p-3 hover:bg-accent/70"
                                                >
                                                    <MaterialIcon icon="source_environment" size={18} className="mt-0.5 shrink-0 text-primary" />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block font-medium">Yeni Dosya</span>
                                                        <span className="block text-xs text-muted-foreground">Dava veya iş kaydı oluşturun.</span>
                                                    </span>
                                                </CommandItem>
                                                <CommandItem
                                                    value="yeni taraf kişi müvekkil"
                                                    onSelect={() => runCommand(() => openPartyFormFloating(null))}
                                                    className="items-start gap-3 rounded-xl border border-border/70 bg-card/45 p-3 hover:bg-accent/70"
                                                >
                                                    <MaterialIcon icon="person_add" size={18} className="mt-0.5 shrink-0 text-primary" />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block font-medium">Yeni Taraf</span>
                                                        <span className="block text-xs text-muted-foreground">Kişi, kurum veya müvekkil bilgilerini bir kez kaydedin.</span>
                                                    </span>
                                                </CommandItem>
                                            </CommandGroup>
                                            <CommandSeparator className="my-2" />
                                            <CommandGroup
                                                heading="Komutlar / Araçlar"
                                                className="[&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:grid-cols-1 [&_[cmdk-group-items]]:gap-2 sm:[&_[cmdk-group-items]]:grid-cols-2"
                                            >
                                                <CommandItem
                                                    value="katır katir uyap"
                                                    onSelect={() => {
                                                        setQuery('');
                                                        setTab('uyap');
                                                    }}
                                                    className="items-start gap-3 rounded-xl border border-border/70 bg-card/45 p-3 hover:bg-accent/70"
                                                >
                                                    <MaterialIcon icon="sync_desktop" size={18} className="mt-0.5 shrink-0 text-primary" />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block font-medium">Katır</span>
                                                        <span className="block text-xs text-muted-foreground">UYAP dosya özeti. Canlı yol Katır kesiminde.</span>
                                                    </span>
                                                </CommandItem>
                                                <CommandItem
                                                    value="belge kurtarma"
                                                    onSelect={() =>
                                                        runCommand(() =>
                                                            useLayoutStore.getState().openDocumentRecoveryCenter()
                                                        )
                                                    }
                                                    className="items-start gap-3 rounded-xl border border-border/70 bg-card/45 p-3 hover:bg-accent/70"
                                                >
                                                    <MaterialIcon icon="restore_page" size={18} className="mt-0.5 shrink-0 text-primary" />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block font-medium">Belge Kurtarma</span>
                                                        <span className="block text-xs text-muted-foreground">Son/kayıp editör belgelerini inceleyin.</span>
                                                    </span>
                                                </CommandItem>
                                                <CommandItem
                                                    value="udf pdf dönüştürücü converter batch"
                                                    onSelect={() =>
                                                        runCommand(() =>
                                                            useLayoutStore.getState().openUdfBatchConverter()
                                                        )
                                                    }
                                                    className="items-start gap-3 rounded-xl border border-border/70 bg-card/45 p-3 hover:bg-accent/70"
                                                >
                                                    <MaterialIcon icon="transform" size={18} className="mt-0.5 shrink-0 text-primary" />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block font-medium">UDF → PDF Toplu Dönüştürücü</span>
                                                        <span className="block text-xs text-muted-foreground">
                                                            Birden fazla UDF dosyasını yerel olarak PDF&apos;e çevirir.
                                                        </span>
                                                    </span>
                                                </CommandItem>
                                                <CommandItem
                                                    value="yeni araç yakında"
                                                    onSelect={() => toast.info('Yeni araçlar yakında.')}
                                                    className="items-start gap-3 rounded-xl border border-dashed border-border/80 bg-card/30 p-3 hover:bg-accent/60"
                                                >
                                                    <MaterialIcon icon="add_circle" size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block font-medium">Yeni Araçlar</span>
                                                        <span className="block text-xs text-muted-foreground">Geliştirme ve üçüncü parti entegrasyon çalışmalarımız sürüyor.</span>
                                                    </span>
                                                    <CommandShortcut className="tracking-normal">Yakında</CommandShortcut>
                                                </CommandItem>
                                            </CommandGroup>
                                            <CommandSeparator className="my-2" />
                                            <div className="rounded-xl border border-border/70 bg-card/45 overflow-hidden">
                                                <div className="px-3 pt-2 text-xs font-medium text-muted-foreground">Tema</div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2">
                                                    <CommandGroup
                                                        heading="Görünüm"
                                                        className="p-2 sm:border-r sm:border-border/70"
                                                    >
                                                        <CommandItem
                                                            value="tema görünüm açık mod light"
                                                            onSelect={() => runCommand(() => setMode('light'))}
                                                            className={cn('rounded-lg', mode === 'light' && 'bg-primary/10')}
                                                        >
                                                            <MaterialIcon icon="light_mode" size={16} className="mr-2" />
                                                            <span>Açık Mod</span>
                                                        </CommandItem>
                                                        <CommandItem
                                                            value="tema görünüm koyu mod dark"
                                                            onSelect={() => runCommand(() => setMode('dark'))}
                                                            className={cn('rounded-lg', mode === 'dark' && 'bg-primary/10')}
                                                        >
                                                            <MaterialIcon icon="dark_mode" size={16} className="mr-2" />
                                                            <span>Koyu Mod</span>
                                                        </CommandItem>
                                                        <CommandItem
                                                            value="tema görünüm sistem modu"
                                                            onSelect={() => runCommand(() => setMode('system'))}
                                                            className={cn('rounded-lg', mode === 'system' && 'bg-primary/10')}
                                                        >
                                                            <MaterialIcon icon="laptop" size={16} className="mr-2" />
                                                            <span>Sistem Modu</span>
                                                        </CommandItem>
                                                        <CommandItem
                                                            value="rehber modu kullanıcı rehberi etiketler"
                                                            onSelect={() => {
                                                                void pushEditorPreferenceToggle({
                                                                    showUserGuidanceLabels: !showGuidance,
                                                                });
                                                            }}
                                                            className={cn('rounded-lg', showGuidance && 'bg-primary/10')}
                                                        >
                                                            <MaterialIcon icon="label" size={16} className="mr-2" />
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block font-medium">Rehber modu</span>
                                                                <span className="block text-xs text-muted-foreground">Kenar çubuğu etiketleri</span>
                                                            </span>
                                                            <Switch
                                                                checked={showGuidance}
                                                                tabIndex={-1}
                                                                className="pointer-events-none ml-2"
                                                                aria-hidden
                                                            />
                                                        </CommandItem>
                                                    </CommandGroup>
                                                    <CommandGroup heading="Palet" className="p-2">
                                                        {THEME_PALETTES.map((p) => (
                                                            <CommandItem
                                                                key={p.id}
                                                                value={`tema palet ${p.name} ${p.description}`}
                                                                onSelect={() => runCommand(() => setPalette(p.id))}
                                                                className={cn(
                                                                    'rounded-lg',
                                                                    palette === p.id && 'bg-primary/10',
                                                                )}
                                                            >
                                                                <span
                                                                    className="mr-2 h-3 w-3 rounded-full border border-border"
                                                                    style={{ background: p.lightAccent }}
                                                                />
                                                                <span>
                                                                    {p.name} — {p.description}
                                                                </span>
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </ScrollArea>
                            </CommandList>
                        </Command>
                    </TabsContent>

                    <TabsContent
                        value="templates"
                        className="m-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
                    >
                        <TemplateLibraryCommandTab onClose={() => handleOpenChange(false)} />
                    </TabsContent>

                    <TabsContent
                        value="tasks"
                        className="m-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
                    >
                        <TasksCommandTab onClose={() => handleOpenChange(false)} />
                    </TabsContent>

                    <TabsContent
                        value="uyap"
                        className="m-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
                    >
                        {tab === 'uyap' ? <UyapCommandTab /> : null}
                    </TabsContent>

                </Tabs>
            </DialogContent>
        </Dialog>
    );
};

export default CommandPalette;
