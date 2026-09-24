import React, { useEffect, useMemo, useState } from 'react';
import { useMattersStore } from '../../stores/useMattersStore';
import { useContextStore } from '../../stores/useContextStore';
import { useShallow } from 'zustand/react/shallow';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { type Matter } from '../../services/dataService';
import {
    MATTER_MERCI_OPTIONS,
    MATTER_RECORD_TYPE_OPTIONS,
    normalizeMatterMerci,
} from '../../data/matterTaxonomy';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import FileWidget from '../widgets/FileWidget';
import { useFlyoutSearchInputFocus } from '../../hooks/useFlyoutSearchInputFocus';
import { getDatabaseSearchShortcutLabel } from '../../shortcuts/databaseSearch';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from '../../components/ui/dropdown-menu';
import { toast } from 'sonner';
import { turkishHaystack, turkishHaystackIncludes } from '../../utils/turkishSearch';
import { FlyoutSearchInput } from '../layout/FlyoutSearchInput';
import { FlyoutVirtualList } from '../layout/FlyoutVirtualList';

/** Kayıt türü (`matter_type`) */
const FILTER_MATTER_TYPE = MATTER_RECORD_TYPE_OPTIONS.map((opt) => ({
    id: `mt_${opt.value}`,
    label: opt.label,
}));

/** Merci (`matter_category`) */
const FILTER_MERCI = MATTER_MERCI_OPTIONS.map((opt) => ({
    id: `mc_${opt.value}`,
    label: opt.label,
}));

const FILTER_STATUS: { id: string; label: string }[] = [
    { id: 'st_OPEN', label: 'Açık' },
    { id: 'st_CLOSED', label: 'Kapalı' },
    { id: 'st_ARCHIVED', label: 'Arşiv' },
    { id: 'st_APPEAL', label: 'İstinaf/Temyiz' },
];

function matterPassesFilters(m: Matter, active: string[]): boolean {
    if (active.length === 0) return true;

    const mt = active.filter((id) => id.startsWith('mt_'));
    const mc = active.filter((id) => id.startsWith('mc_'));
    const st = active.filter((id) => id.startsWith('st_'));

    const matchMt =
        mt.length === 0 ||
        mt.some((id) => {
            const t = id.replace('mt_', '');
            return m.matter_type === t;
        });

    const normalizedMerci = normalizeMatterMerci(m.matter_category);
    const matchMc =
        mc.length === 0 ||
        mc.some((id) => {
            const c = id.replace('mc_', '');
            return normalizedMerci === c;
        });

    const matchSt =
        st.length === 0 ||
        st.some((id) => {
            const s = id.replace('st_', '');
            return m.status === s;
        });

    return matchMt && matchMc && matchSt;
}

function filterLabel(all: { id: string; label: string }[], id: string): string {
    return all.find((x) => x.id === id)?.label ?? id;
}

export const MattersList: React.FC = () => {
    const { matters, isLoading, fetchMatters, deleteMatter } = useMattersStore();
    const { setContext, activeEntityId, activeEntityType, activeEntityName } = useContextStore();
    const { flyoutSearchQuery, openMatterFormFloating } = useLayoutStore(
        useShallow((s) => ({
            flyoutSearchQuery: s.flyoutSearchQuery,
            openMatterFormFloating: s.openMatterFormFloating,
        })),
    );
    const searchInputRef = useFlyoutSearchInputFocus('matters');
    const searchShortcut = getDatabaseSearchShortcutLabel('matters');
    const [activeFilters, setActiveFilters] = useState<string[]>([]);
    const [ignoreContextForList, setIgnoreContextForList] = useState(false);
    const contextPartyId =
        !ignoreContextForList && activeEntityType === 'PARTY' ? activeEntityId : null;
    const hasContextFilter = Boolean(contextPartyId);

    useEffect(() => {
        setIgnoreContextForList(false);
    }, [activeEntityType, activeEntityId]);

    useEffect(() => {
        void fetchMatters({
            party_id: contextPartyId || undefined,
        });
    }, [fetchMatters, contextPartyId]);

    const allFilterDefs = useMemo(
        () => [...FILTER_MATTER_TYPE, ...FILTER_MERCI, ...FILTER_STATUS],
        [],
    );

    const matterRows = useMemo(
        () =>
            (matters || []).map((matter) => ({
                matter,
                haystack: turkishHaystack([
                    matter.title,
                    matter.file_number,
                    matter.internal_id,
                    matter.court_name,
                    matter.parties_list,
                ]),
            })),
        [matters],
    );

    const hasSearch = flyoutSearchQuery.trim().length > 0;
    const hasFilters = activeFilters.length > 0;
    const showResults = hasSearch || hasFilters || hasContextFilter;

    const filteredMatters = useMemo(
        () =>
            matterRows
                .filter(
                    ({ matter, haystack }) =>
                        (!hasSearch || turkishHaystackIncludes(haystack, flyoutSearchQuery)) &&
                        matterPassesFilters(matter, activeFilters),
                )
                .map(({ matter }) => matter),
        [matterRows, flyoutSearchQuery, hasSearch, activeFilters],
    );

    const handleSuccess = () => {
        void fetchMatters({
            party_id: contextPartyId || undefined,
        });
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        toast('Dosya silinsin mi?', {
            description: 'Bu işlem geri alınamaz.',
            action: {
                label: 'Sil',
                onClick: () => {
                    void deleteMatter(id);
                },
            },
            cancel: {
                label: 'Vazgeç',
                onClick: () => undefined,
            },
        });
    };

    const handleSelect = (matter: Matter) => {
        setContext('MATTER', matter.id, matter.title);
        openMatterFormFloating(matter);
    };

    const toggleFilter = (typeId: string) => {
        setActiveFilters((prev) =>
            prev.includes(typeId) ? prev.filter((id) => id !== typeId) : [...prev, typeId],
        );
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <FlyoutSearchInput
                    inputRef={searchInputRef}
                    icon="gavel"
                    placeholder="Arama yap, filtrele"
                    title={`Dosyalar (${searchShortcut})`}
                    ariaLabel={`Dosyalar (${searchShortcut})`}
                />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg shrink-0 bg-white/5 hover:bg-white/10 border border-white/10"
                            title={`Dosya filtreleri · Arama ${searchShortcut}`}
                            aria-label={`Dosya filtreleri · Arama ${searchShortcut}`}
                        >
                            <MaterialIcon
                                icon="filter_list"
                                size={16}
                                className={hasFilters ? 'text-primary' : 'text-muted-foreground'}
                            />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 max-h-[min(70vh,420px)] overflow-y-auto glass border-border">
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Kayıt türü
                        </DropdownMenuLabel>
                        {FILTER_MATTER_TYPE.map((type) => (
                            <DropdownMenuCheckboxItem
                                key={type.id}
                                checked={activeFilters.includes(type.id)}
                                onCheckedChange={() => toggleFilter(type.id)}
                                className="text-xs"
                            >
                                {type.label}
                            </DropdownMenuCheckboxItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Merci
                        </DropdownMenuLabel>
                        {FILTER_MERCI.map((type) => (
                            <DropdownMenuCheckboxItem
                                key={type.id}
                                checked={activeFilters.includes(type.id)}
                                onCheckedChange={() => toggleFilter(type.id)}
                                className="text-xs"
                            >
                                {type.label}
                            </DropdownMenuCheckboxItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Durum
                        </DropdownMenuLabel>
                        {FILTER_STATUS.map((type) => (
                            <DropdownMenuCheckboxItem
                                key={type.id}
                                checked={activeFilters.includes(type.id)}
                                onCheckedChange={() => toggleFilter(type.id)}
                                className="text-xs"
                            >
                                {type.label}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-lg shrink-0 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
                    title="Yeni dosya"
                    aria-label="Yeni dosya"
                    onClick={() => openMatterFormFloating()}
                >
                    <MaterialIcon icon="add" size={18} />
                </Button>
            </div>

            {hasFilters && (
                <div className="flex flex-wrap gap-1.5">
                    {activeFilters.map((filterId) => (
                        <Badge
                            key={filterId}
                            variant="outline"
                            className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 text-[10px] px-2 py-0 h-5 flex items-center gap-1 cursor-pointer"
                            onClick={() => toggleFilter(filterId)}
                        >
                            {filterLabel(allFilterDefs, filterId)}
                            <MaterialIcon icon="close" size={10} className="opacity-70 hover:opacity-100" />
                        </Badge>
                    ))}
                    <button
                        type="button"
                        onClick={() => setActiveFilters([])}
                        className="text-[10px] text-muted-foreground hover:text-foreground underline ml-1"
                    >
                        Filtreleri temizle
                    </button>
                </div>
            )}

            {hasContextFilter && (
                <div className="flex items-center gap-1.5 min-h-7 px-2 py-1 rounded-lg border border-primary/20 bg-primary/5 text-[10px] text-foreground/90">
                    <MaterialIcon icon="filter_alt" size={12} className="text-primary shrink-0" />
                    <span className="truncate">
                        Bağlam filtresi:{' '}
                        <span className="font-semibold">{activeEntityName || 'Seçili bağlam'}</span>
                    </span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-6 w-6 shrink-0 rounded-md hover:bg-white/10"
                        title="Bağlam filtresini kaldır"
                        aria-label="Bağlam filtresini kaldır"
                        onClick={() => setIgnoreContextForList(true)}
                    >
                        <MaterialIcon icon="close" size={13} />
                    </Button>
                </div>
            )}

            {ignoreContextForList && activeEntityType === 'PARTY' && activeEntityId && (
                <div className="flex items-center gap-1.5 min-h-7 px-2 py-1 rounded-lg border border-white/10 bg-white/[0.03] text-[10px] text-muted-foreground">
                    <MaterialIcon icon="person_off" size={12} className="shrink-0" />
                    <span className="truncate">Bağlam süzmesi kapalı</span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-6 px-2 text-[9px] font-semibold uppercase tracking-wide text-primary hover:bg-primary/12"
                        onClick={() => setIgnoreContextForList(false)}
                    >
                        Süz
                    </Button>
                </div>
            )}

            {showResults && (
                <div className="mt-1">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-6 opacity-50 italic text-xs">
                            Yükleniyor...
                        </div>
                    ) : (
                        <FlyoutVirtualList
                            items={filteredMatters}
                            estimateSize={108}
                            getKey={(matter) => matter.id}
                            empty={
                                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground opacity-70">
                                    <MaterialIcon icon="folder_off" size={24} className="mb-2" />
                                    <span className="text-xs text-center px-2">
                                        Sonuç bulunamadı. Arama veya filtreleri değiştirin.
                                    </span>
                                </div>
                            }
                            renderRow={(matter) => (
                                <FileWidget
                                    matter={matter}
                                    isActive={activeEntityId === matter.id}
                                    onClick={() => handleSelect(matter)}
                                    onEditSuccess={handleSuccess}
                                    onDelete={(e) => handleDelete(matter.id, e)}
                                />
                            )}
                        />
                    )}
                </div>
            )}

        </div>
    );
};
