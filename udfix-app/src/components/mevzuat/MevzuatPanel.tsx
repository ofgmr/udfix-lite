import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { useFlyoutSearchInputFocus } from '../../hooks/useFlyoutSearchInputFocus';
import { FlyoutSearchInput } from '../layout/FlyoutSearchInput';
import { FlyoutVirtualList } from '../layout/FlyoutVirtualList';
import { getDatabaseSearchShortcutLabel } from '../../shortcuts/databaseSearch';
import MaterialIcon from '../ui/MaterialIcon';
import { Button } from '../ui/button';
import { CopyContentButton } from '../ui/CopyContentButton';
import { searchMevzuat, type MevzuatSearchHit } from '../../data/mevzuat/searchCorpus';
import { loadMevzuatInstrumentById, loadMevzuatManifest, loadAllMevzuatInstruments } from '../../data/mevzuat/loadCorpus';
import {
    bundledMevzuatQuickFilters,
    type MevzuatQuickFilter,
} from '../../data/mevzuat/quickFilters';
import {
    buildMevzuatAliasIndex,
    formatMaddeCitation,
    findFikraRange,
    parseMevzuatCitation,
} from '../../utils/mevzuatCitation';
import { siblingMadde, scheduleMevzuatBodyIndex, warmMevzuatSearchIndex } from '../../utils/mevzuatSearch';
import { formatMaddeSectionPath } from '../../../electron/mevzuatHeadings';
import type { MevzuatInstrumentFile } from '../../../electron/mevzuatCorpusTypes';

const CITATION_EXAMPLES = ['tbk 45', '5237/33', 'tck 33', 'hmk 114', 'İİK 67'];

const CHIP_CLASS =
    'inline-flex h-6 shrink-0 items-center rounded-md border border-white/10 bg-white/5 px-1.5 text-[10px] font-medium leading-none text-foreground/85 hover:bg-white/10 hover:text-foreground';

function filterForMadde(
    hit: Pick<MevzuatSearchHit, 'instrumentId' | 'shortName' | 'title' | 'instrumentNo'>,
    chips: readonly MevzuatQuickFilter[],
): MevzuatQuickFilter {
    return (
        chips.find((chip) => chip.instrumentId === hit.instrumentId) ?? {
            instrumentId: hit.instrumentId,
            label: hit.shortName,
            kanunNo: hit.instrumentNo,
            title: hit.title,
        }
    );
}

function queryFitsGlobalSearch(query: string, filter: MevzuatQuickFilter): boolean {
    const trimmed = query.trim();
    if (!trimmed) return false;
    if (parseMevzuatCitation(trimmed, buildMevzuatAliasIndex())) return false;
    const folded = trimmed.toLocaleLowerCase('tr');
    if (folded === filter.label.toLocaleLowerCase('tr')) return false;
    if (folded === filter.kanunNo) return false;
    if (folded === filter.title.toLocaleLowerCase('tr')) return false;
    return true;
}

function copyPayload(hit: MevzuatSearchHit): string {
    const breadcrumb = formatMaddeSectionPath(hit);
    const lines = [formatMaddeCitation(hit)];
    if (breadcrumb) lines.push(breadcrumb);
    lines.push(hit.title, '', hit.heading, hit.text);
    return lines.join('\n');
}

function FikraText({ text, fikra }: { text: string; fikra?: number }) {
    const range = useMemo(() => (fikra ? findFikraRange(text, fikra) : null), [text, fikra]);
    if (!range) {
        return <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">{text}</p>;
    }
    return (
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
            {text.slice(0, range.start)}
            <mark className="rounded-sm bg-primary/20 text-foreground">{text.slice(range.start, range.end)}</mark>
            {text.slice(range.end)}
        </p>
    );
}

export const MevzuatPanel: React.FC = () => {
    const flyoutSearchQuery = useLayoutStore((s) => s.flyoutSearchQuery);
    const searchInputRef = useFlyoutSearchInputFocus('mevzuat');
    const searchShortcut = getDatabaseSearchShortcutLabel('mevzuat');
    const packagedCount = loadMevzuatManifest().instruments.length;
    const quickFilters = useMemo(() => bundledMevzuatQuickFilters(), []);

    const [draftEmpty, setDraftEmpty] = useState(!flyoutSearchQuery.trim());
    const [activeFilter, setActiveFilter] = useState<MevzuatQuickFilter | null>(null);
    const [hits, setHits] = useState<MevzuatSearchHit[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<MevzuatSearchHit | null>(null);
    const [instrument, setInstrument] = useState<MevzuatInstrumentFile | null>(null);

    const query = flyoutSearchQuery.trim();
    const lastSearchedQueryRef = useRef(query);
    const placeholder = activeFilter
        ? `${activeFilter.label} içinde ara…`
        : 'tbk 45, 5237/33…';

    useEffect(() => {
        let stopBodyIndex: (() => void) | undefined;
        let cancelled = false;
        void loadAllMevzuatInstruments().then((rows) => {
            if (cancelled) return;
            warmMevzuatSearchIndex(rows);
            const stop = scheduleMevzuatBodyIndex(rows);
            if (cancelled) {
                stop();
                return;
            }
            stopBodyIndex = stop;
        });
        return () => {
            cancelled = true;
            stopBodyIndex?.();
        };
    }, []);

    const handleDraftChange = useCallback((draft: string) => {
        const empty = !draft.trim();
        setDraftEmpty((prev) => (prev === empty ? prev : empty));
    }, []);

    const focusSearch = useCallback(() => {
        searchInputRef.current?.focus({ preventScroll: true });
    }, [searchInputRef]);

    const applyInstrumentScope = useCallback(
        (hit: Pick<MevzuatSearchHit, 'instrumentId' | 'shortName' | 'title' | 'instrumentNo'>) => {
            setActiveFilter((prev) => {
                if (prev?.instrumentId === hit.instrumentId) return prev;
                return filterForMadde(hit, quickFilters);
            });
        },
        [quickFilters],
    );

    const openMadde = useCallback(
        (hit: MevzuatSearchHit) => {
            setSelected(hit);
            applyInstrumentScope(hit);
        },
        [applyInstrumentScope],
    );

    const exitScope = useCallback(() => {
        const typed = searchInputRef.current?.value ?? '';
        const keepQuery = activeFilter ? queryFitsGlobalSearch(typed, activeFilter) : false;
        setActiveFilter(null);
        setSelected(null);
        if (!keepQuery) {
            useLayoutStore.getState().setFlyoutSearchQuery('');
        }
        focusSearch();
    }, [activeFilter, focusSearch]);

    const applyFilter = useCallback(
        (chip: MevzuatQuickFilter) => {
            setActiveFilter(chip);
            setSelected(null);
            focusSearch();
        },
        [focusSearch],
    );

    const onSearchKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key !== 'Escape') return;
            if (event.currentTarget.value.trim()) return;
            if (!activeFilter) return;
            event.preventDefault();
            event.stopPropagation();
            event.nativeEvent.stopImmediatePropagation();
            exitScope();
        },
        [activeFilter, exitScope],
    );

    useEffect(() => {
        let cancelled = false;
        if (!query) {
            lastSearchedQueryRef.current = query;
            setHits([]);
            if (!activeFilter) setSelected(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        const queryChanged = lastSearchedQueryRef.current !== query;
        lastSearchedQueryRef.current = query;
        void searchMevzuat(query, activeFilter ? { instrumentId: activeFilter.instrumentId } : undefined)
            .then((next) => {
                if (cancelled) return;
                setHits(next);
                const auto = next.length === 1 && next[0].matchKind === 'citation' ? next[0] : null;
                if (auto) {
                    setSelected(auto);
                    applyInstrumentScope(auto);
                    return;
                }
                if (!queryChanged) {
                    setSelected((prev) =>
                        prev && next.some((hit) => hit.id === prev.id) ? prev : null,
                    );
                    return;
                }
                setSelected(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [query, activeFilter, applyInstrumentScope]);

    useEffect(() => {
        if (!selected) {
            setInstrument(null);
            return;
        }
        let cancelled = false;
        void loadMevzuatInstrumentById(selected.instrumentId).then((row) => {
            if (!cancelled) setInstrument(row);
        });
        return () => {
            cancelled = true;
        };
    }, [selected]);

    const goSibling = (direction: -1 | 1) => {
        if (!selected || !instrument) return;
        const next = siblingMadde(instrument, selected.id, direction);
        if (!next) return;
        const nextHit: MevzuatSearchHit = {
            ...selected,
            id: next.id,
            heading: next.heading,
            maddeKind: next.maddeKind,
            maddeNo: next.maddeNo,
            preview: next.preview,
            text: next.text,
            kitap: next.kitap ?? null,
            kisim: next.kisim ?? null,
            bolum: next.bolum ?? null,
            ayirim: next.ayirim ?? null,
            maddeBaslik: next.maddeBaslik ?? null,
            sectionPath: next.sectionPath ?? [],
            fikra: undefined,
        };
        setSelected(nextHit);
        applyInstrumentScope(nextHit);
    };

    const selectedBody =
        instrument?.maddeler.find((madde) => madde.id === selected?.id)?.text ?? selected?.text ?? '';

    const showChipGrid = draftEmpty && !activeFilter;
    const emptyFilterHint = activeFilter && draftEmpty && !selected;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
                {activeFilter ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground"
                        title="Tüm mevzuatta ara"
                        aria-label="Tüm mevzuatta ara"
                        onClick={exitScope}
                    >
                        <MaterialIcon icon="arrow_back" size={18} />
                    </Button>
                ) : null}
                <FlyoutSearchInput
                    inputRef={searchInputRef}
                    icon="balance"
                    placeholder={placeholder}
                    title={`Mevzuat (${searchShortcut})`}
                    ariaLabel={`Mevzuat (${searchShortcut})`}
                    onDraftChange={handleDraftChange}
                    onKeyDown={onSearchKeyDown}
                />
            </div>

            {activeFilter ? (
                <div className="flex items-center gap-1">
                    <span
                        className="inline-flex h-6 items-center gap-0.5 rounded-md border border-primary/25 bg-primary/10 pl-1.5 pr-0.5 text-[10px] font-semibold text-primary"
                        title={`${activeFilter.title} · ${activeFilter.kanunNo}`}
                    >
                        {activeFilter.label}
                        <button
                            type="button"
                            className="rounded p-0.5 text-primary/80 hover:bg-primary/20 hover:text-primary"
                            title="Kanun filtresini kaldır"
                            aria-label="Kanun filtresini kaldır"
                            onClick={exitScope}
                        >
                            <MaterialIcon icon="close" size={12} />
                        </button>
                    </span>
                </div>
            ) : showChipGrid ? (
                <div className="flex flex-wrap gap-1">
                    {quickFilters.map((chip) => (
                        <button
                            key={chip.instrumentId}
                            type="button"
                            className={CHIP_CLASS}
                            title={`${chip.title} · ${chip.kanunNo}`}
                            aria-label={`${chip.title} (${chip.kanunNo})`}
                            onClick={() => applyFilter(chip)}
                        >
                            {chip.label}
                        </button>
                    ))}
                </div>
            ) : null}

            {selected ? (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-1">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:bg-white/10"
                            title="Sonuçlara dön"
                            aria-label="Sonuçlara dön"
                            onClick={() => setSelected(null)}
                        >
                            <MaterialIcon icon="arrow_back" size={16} />
                        </Button>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-semibold text-foreground">
                                {formatMaddeCitation(selected)}
                            </div>
                            <div className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">
                                {formatMaddeSectionPath(selected) || selected.title}
                            </div>
                        </div>
                        <CopyContentButton
                            text={copyPayload({ ...selected, text: selectedBody })}
                            label="Madde metnini kopyala"
                            successMessage="Madde kopyalandı"
                        />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] text-muted-foreground hover:bg-white/10"
                            disabled={!instrument || instrument.maddeler[0]?.id === selected.id}
                            onClick={() => goSibling(-1)}
                        >
                            Önceki madde
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] text-muted-foreground hover:bg-white/10"
                            disabled={
                                !instrument ||
                                instrument.maddeler[instrument.maddeler.length - 1]?.id === selected.id
                            }
                            onClick={() => goSibling(1)}
                        >
                            Sonraki madde
                        </Button>
                    </div>
                    <div className="max-h-[52vh] overflow-y-auto overflow-x-hidden rounded-lg border border-white/10 bg-white/5 p-2.5 custom-scrollbar">
                        <FikraText text={selectedBody} fikra={selected.fikra} />
                    </div>
                </div>
            ) : emptyFilterHint ? (
                <div className="px-0.5 py-1 text-[11px] leading-relaxed text-muted-foreground">
                    {activeFilter.label} maddelerinde başlık veya metin arayın.
                </div>
            ) : showChipGrid ? (
                <div className="px-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    Kanun seçin veya atıf yazın:{' '}
                    {CITATION_EXAMPLES.map((example, index) => (
                        <React.Fragment key={example}>
                            {index > 0 ? ', ' : null}
                            <span className="font-mono text-foreground/80">{example}</span>
                        </React.Fragment>
                    ))}
                    .
                    {packagedCount === 0 ? (
                        <p className="mt-1.5">
                            Paketlenmiş mevzuat henüz yok. Geliştirici:{' '}
                            <span className="font-mono">npm run mevzuat:fetch</span>
                        </p>
                    ) : (
                        <p className="mt-1.5">{packagedCount} metin uygulama ile birlikte gelir.</p>
                    )}
                </div>
            ) : loading ? (
                <div className="px-1 py-6 text-center text-[12px] text-muted-foreground">Aranıyor…</div>
            ) : !query ? null : (
                <FlyoutVirtualList
                    items={hits}
                    estimateSize={72}
                    getKey={(item) => item.id}
                    renderRow={(item) => (
                        <button
                            type="button"
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-left hover:bg-white/10"
                            onClick={() => openMadde(item)}
                        >
                            <div className="truncate text-[12px] font-semibold text-foreground">
                                {formatMaddeCitation(item)}
                            </div>
                            <div className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                                {formatMaddeSectionPath(item) || item.preview || item.title}
                            </div>
                        </button>
                    )}
                    empty={
                        <div className="px-1 py-6 text-center text-[12px] text-muted-foreground">
                            {activeFilter
                                ? `${activeFilter.label} içinde bu arama için madde bulunamadı.`
                                : 'Bu arama için madde bulunamadı.'}
                        </div>
                    }
                />
            )}
        </div>
    );
};
