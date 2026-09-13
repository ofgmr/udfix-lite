import React, { useEffect, useMemo, useState } from 'react';
import { usePartiesStore } from '../../stores/usePartiesStore';
import { useContextStore } from '../../stores/useContextStore';
import { useShallow } from 'zustand/react/shallow';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { type Party } from '../../services/dataService';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Button } from '../../components/ui/button';
import ClientWidget from '../widgets/ClientWidget';
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
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';
import { turkishHaystack, turkishHaystackIncludes } from '../../utils/turkishSearch';
import { FlyoutSearchInput } from '../layout/FlyoutSearchInput';
import { FlyoutVirtualList } from '../layout/FlyoutVirtualList';

const FILTER_ROLE: { id: string; label: string }[] = [
    { id: 'CLIENT', label: 'Müvekkiller' },
    { id: 'OTHER', label: 'Diğer taraflar' },
];

const FILTER_PARTY_TYPE: { id: string; label: string }[] = [
    { id: 'KISI', label: 'Kişi' },
    { id: 'KURUM', label: 'Kurum' },
];

function resolvePartyKind(p: Party): 'KISI' | 'KURUM' {
    if (p.party_kind === 'KISI' || p.party_kind === 'KURUM') return p.party_kind;
    return p.type === 'CORPORATE' ? 'KURUM' : 'KISI';
}

function partyPassesFilters(p: Party, active: string[]): boolean {
    if (active.length === 0) return true;

    const role = active.filter((id) => id === 'CLIENT' || id === 'OTHER');
    const kind = active.filter((id) => id === 'KISI' || id === 'KURUM');

    const matchRole =
        role.length === 0 ||
        role.some((id) => (id === 'CLIENT' ? p.is_client : !p.is_client));

    const matchKind = kind.length === 0 || kind.some((id) => resolvePartyKind(p) === id);

    return matchRole && matchKind;
}

function filterLabel(id: string): string {
    return (
        FILTER_ROLE.find((x) => x.id === id)?.label ??
        FILTER_PARTY_TYPE.find((x) => x.id === id)?.label ??
        id
    );
}

export const PartiesList: React.FC = () => {
    const { parties, clients, isLoading, fetchParties, deleteParty } = usePartiesStore();
    const { setContext, activeEntityId } = useContextStore();
    const { flyoutSearchQuery, openPartyFormFloating } = useLayoutStore(
        useShallow((s) => ({
            flyoutSearchQuery: s.flyoutSearchQuery,
            openPartyFormFloating: s.openPartyFormFloating,
        })),
    );
    const searchInputRef = useFlyoutSearchInputFocus('parties');
    const searchShortcut = getDatabaseSearchShortcutLabel('parties');
    const [activeFilters, setActiveFilters] = useState<string[]>([]);

    useEffect(() => {
        fetchParties();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
    }, []);

    const allParties = useMemo(
        () => [...(clients || []), ...(parties || []).filter((p) => !p.is_client)],
        [clients, parties]
    );

    const partyRows = useMemo(
        () =>
            allParties.map((party) => ({
                party,
                haystack: turkishHaystack([party.full_name, party.id_number]),
            })),
        [allParties],
    );

    const hasSearch = flyoutSearchQuery.trim().length > 0;
    const hasFilters = activeFilters.length > 0;
    const showResults = hasSearch || hasFilters;

    const filteredParties = useMemo(
        () =>
            partyRows
                .filter(
                    ({ party, haystack }) =>
                        (!hasSearch || turkishHaystackIncludes(haystack, flyoutSearchQuery)) &&
                        partyPassesFilters(party, activeFilters),
                )
                .map(({ party }) => party),
        [partyRows, flyoutSearchQuery, hasSearch, activeFilters],
    );

    const handleSuccess = () => {
        fetchParties();
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        toast('Taraf silinsin mi?', {
            description: 'Bu işlem geri alınamaz.',
            action: {
                label: 'Sil',
                onClick: () => {
                    void deleteParty(id);
                },
            },
            cancel: {
                label: 'Vazgeç',
                onClick: () => undefined,
            },
        });
    };

    const handleSelect = (party: Party) => {
        setContext('PARTY', party.id, party.full_name);
        openPartyFormFloating(party);
    };

    const toggleFilter = (typeId: string) => {
        setActiveFilters((prev) =>
            prev.includes(typeId) ? prev.filter((id) => id !== typeId) : [...prev, typeId]
        );
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <FlyoutSearchInput
                    inputRef={searchInputRef}
                    icon="group"
                    placeholder="Arama yap, filtrele"
                    title={`Taraflar (${searchShortcut})`}
                    ariaLabel={`Taraflar (${searchShortcut})`}
                />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg shrink-0 bg-white/5 hover:bg-white/10 border border-white/10"
                            title={`Taraf filtreleri · Arama ${searchShortcut}`}
                            aria-label={`Taraf filtreleri · Arama ${searchShortcut}`}
                        >
                            <MaterialIcon
                                icon="filter_list"
                                size={16}
                                className={hasFilters ? 'text-primary' : 'text-muted-foreground'}
                            />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 glass border-white/10">
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Rol
                        </DropdownMenuLabel>
                        {FILTER_ROLE.map((type) => (
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
                            Tür
                        </DropdownMenuLabel>
                        {FILTER_PARTY_TYPE.map((type) => (
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
                    title="Yeni taraf"
                    aria-label="Yeni taraf"
                    onClick={() => openPartyFormFloating()}
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
                            {filterLabel(filterId)}
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

            {showResults && (
                <div className="mt-1">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-6 opacity-50 italic text-xs">
                            Yükleniyor...
                        </div>
                    ) : (
                        <FlyoutVirtualList
                            items={filteredParties}
                            estimateSize={88}
                            getKey={(party) => party.id}
                            empty={
                                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground opacity-70">
                                    <MaterialIcon icon="person_search" size={24} className="mb-2" />
                                    <span className="text-xs text-center px-2">
                                        Sonuç bulunamadı. Arama veya filtreleri değiştirin.
                                    </span>
                                </div>
                            }
                            renderRow={(party) => (
                                <ClientWidget
                                    party={party}
                                    isActive={activeEntityId === party.id}
                                    onClick={() => handleSelect(party)}
                                    onEditSuccess={handleSuccess}
                                    onDelete={(e) => handleDelete(party.id, e)}
                                />
                            )}
                        />
                    )}
                </div>
            )}

        </div>
    );
};
