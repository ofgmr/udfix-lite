import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DataService } from '../../services/dataService';
import type { KnowledgeItem } from '../../services/dataService';
import { cn } from '../../lib/utils';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { useShallow } from 'zustand/react/shallow';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { useContextStore } from '../../stores/useContextStore';
import { useFlyoutSearchInputFocus } from '../../hooks/useFlyoutSearchInputFocus';
import { getDatabaseSearchShortcutLabel } from '../../shortcuts/databaseSearch';
import { CopyContentButton } from '../../components/ui/CopyContentButton';
import { formatKnowledgeCopyText } from '../../utils/entityCopyText';
import { FlyoutSearchInput } from '../layout/FlyoutSearchInput';
import { FlyoutVirtualList } from '../layout/FlyoutVirtualList';
import { parseAttributesSearchBlob } from '../../utils/matterAttributeSearch';
import { TagRowBadges } from '../../components/ui/QuickTagPopover';

const KNOWLEDGE_TYPES = [
    { id: 'PRECEDENT', label: 'İçtihat' },
    { id: 'BOOK', label: 'Kitap' },
    { id: 'ARTICLE', label: 'Makale' },
] as const;

export const KnowledgeBasePanel: React.FC = () => {
    const [items, setItems] = useState<KnowledgeItem[]>([]);
    const [loading, setLoading] = useState(true);
    const { flyoutSearchQuery, openKnowledgeFormFloating } = useLayoutStore(
        useShallow((s) => ({
            flyoutSearchQuery: s.flyoutSearchQuery,
            openKnowledgeFormFloating: s.openKnowledgeFormFloating,
        })),
    );
    const searchInputRef = useFlyoutSearchInputFocus('knowledge_base');
    const searchShortcut = getDatabaseSearchShortcutLabel('knowledge_base');
    const { activeEntityType, activeEntityId, activeEntityName } = useContextStore();
    const [activeFilters, setActiveFilters] = useState<string[]>([]);
    const [ignoreContextForList, setIgnoreContextForList] = useState(false);
    const contextPartyId =
        !ignoreContextForList && activeEntityType === 'PARTY' ? activeEntityId : null;
    const contextMatterId =
        !ignoreContextForList && activeEntityType === 'MATTER' ? activeEntityId : null;
    const hasContextFilter = Boolean(contextPartyId || contextMatterId);

    useEffect(() => {
        setIgnoreContextForList(false);
    }, [activeEntityType, activeEntityId]);

    const loadKnowledge = useCallback(async () => {
        setLoading(true);
        try {
            const data = await DataService.getKnowledgeBase({
                linked_party_id: contextPartyId || undefined,
                linked_matter_id: contextMatterId || undefined,
                query: flyoutSearchQuery.trim() || undefined,
            });
            setItems(data);
        } catch (error) {
            console.error('Failed to load KB:', error);
            toast.error('Bilgi bankası yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    }, [contextPartyId, contextMatterId, flyoutSearchQuery]);

    useEffect(() => {
        void loadKnowledge();
    }, [loadKnowledge]);

    useEffect(() => {
        const onRefresh = () => void loadKnowledge();
        window.addEventListener('nomai-knowledge-refresh', onRefresh);
        return () => window.removeEventListener('nomai-knowledge-refresh', onRefresh);
    }, [loadKnowledge]);

    const searchQuery = flyoutSearchQuery.trim();
    const hasSearch = searchQuery.length > 0;
    const hasFilters = activeFilters.length > 0;
    const showResults = hasSearch || hasFilters || hasContextFilter;

    const filteredItems = useMemo(
        () =>
            hasFilters ? items.filter((item) => activeFilters.includes(item.type)) : items,
        [items, hasFilters, activeFilters],
    );

    const toggleFilter = (typeId: string) => {
        setActiveFilters(prev =>
            prev.includes(typeId) ? prev.filter(id => id !== typeId) : [...prev, typeId]
        );
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Row 1: Search, Filter & Add */}
            <div className="flex items-center gap-2">
                <FlyoutSearchInput
                    inputRef={searchInputRef}
                    icon="local_library"
                    placeholder="Arama yap, filtrele"
                    title={`Bilgi Bankası (${searchShortcut})`}
                    ariaLabel={`Bilgi Bankası (${searchShortcut})`}
                />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg shrink-0 bg-white/5 hover:bg-white/10 border border-white/10"
                            title={`Bilgi Bankası filtreleri · Arama ${searchShortcut}`}
                            aria-label={`Bilgi Bankası filtreleri · Arama ${searchShortcut}`}
                        >
                            <MaterialIcon icon="filter_list" size={16} className={hasFilters ? "text-primary" : "text-muted-foreground"} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40 glass border-white/10">
                        {KNOWLEDGE_TYPES.map(type => (
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
                    title="Yeni bilgi kaydı"
                    aria-label="Yeni bilgi kaydı"
                    onClick={() => openKnowledgeFormFloating()}
                >
                    <MaterialIcon icon="add" size={18} />
                </Button>
            </div>

            {/* Row 2: Active Filter Chips */}
            {hasFilters && (
                <div className="flex flex-wrap gap-1.5">
                    {activeFilters.map(filterId => {
                        const label = KNOWLEDGE_TYPES.find(t => t.id === filterId)?.label;
                        return (
                            <Badge key={filterId} variant="outline" className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 text-[10px] px-2 py-0 h-5 flex items-center gap-1 cursor-pointer" onClick={() => toggleFilter(filterId)}>
                                {label}
                                <MaterialIcon icon="close" size={10} className="opacity-70 hover:opacity-100" />
                            </Badge>
                        );
                    })}
                    <button onClick={() => setActiveFilters([])} className="text-[10px] text-muted-foreground hover:text-foreground underline ml-1">
                        Temizle
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

            {ignoreContextForList && (activeEntityType === 'PARTY' || activeEntityType === 'MATTER') && activeEntityId && (
                <div className="flex items-center gap-1.5 min-h-7 px-2 py-1 rounded-lg border border-white/10 bg-white/[0.03] text-[10px] text-muted-foreground">
                    <MaterialIcon icon="filter_alt_off" size={12} className="shrink-0" />
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

            {/* Results Area */}
            {showResults && (
                <div className="mt-2">
                    {loading ? (
                        <div className="flex items-center justify-center py-6 opacity-50 italic text-xs">Yükleniyor...</div>
                    ) : (
                        <FlyoutVirtualList
                            items={filteredItems}
                            estimateSize={120}
                            getKey={(item) => item.id}
                            empty={
                                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground opacity-50">
                                    <MaterialIcon icon="inventory_2" size={24} className="mb-2" />
                                    <span className="text-xs">Sonuç bulunamadı.</span>
                                </div>
                            }
                            renderRow={(item) => (
                                <KnowledgeCard
                                    item={item}
                                    onOpen={() => {
                                        useContextStore
                                            .getState()
                                            .setContext('KNOWLEDGE', item.id, item.title);
                                        openKnowledgeFormFloating(item);
                                    }}
                                />
                            )}
                        />
                    )}
                </div>
            )}

        </div>
    );
};

function knowledgeCardIcon(type: KnowledgeItem['type']): string {
    switch (type) {
        case 'PRECEDENT':
            return 'gavel';
        case 'BOOK':
            return 'menu_book';
        case 'ARTICLE':
            return 'article';
        case 'LEGISLATIVE':
            return 'policy';
        default: {
            const _exhaustive: never = type;
            return _exhaustive;
        }
    }
}

const KnowledgeCard: React.FC<{ item: KnowledgeItem; onOpen?: () => void }> = ({
    item,
    onOpen,
}) => {
    const typeIcon = knowledgeCardIcon(item.type);
    const attributeRows = parseAttributesSearchBlob(item.attributes_search);
    const legacyTags = (item.tags ?? '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

    return (
        <Card
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen?.();
                }
            }}
            className={cn(
                "group relative glass-card p-3 border-white/5 hover:border-primary/30 transition-all duration-300 cursor-pointer overflow-hidden select-text",
            )}
        >
            <div className="flex gap-3">
                <div className="h-10 w-10 shrink-0 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                    <MaterialIcon
                        icon={typeIcon}
                        size={20}
                        className="text-muted-foreground group-hover:text-primary transition-colors"
                    />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                        <h5 className="text-sm font-semibold truncate leading-tight mb-1 flex-1 min-w-0">
                            {item.title}
                        </h5>
                        <CopyContentButton
                            text={formatKnowledgeCopyText(item)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity -mt-0.5"
                        />
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {item.author && (
                            <span className="flex items-center gap-1">
                                <MaterialIcon icon="person" size={12} />
                                <span className="truncate max-w-[100px]">{item.author}</span>
                            </span>
                        )}
                        <span className="flex items-center gap-1">
                            <MaterialIcon icon="schedule" size={12} />
                            <span>{new Date(item.created_at || Date.now()).toLocaleDateString('tr-TR')}</span>
                        </span>
                    </div>
                </div>
            </div>

            {item.content && (
                <p className="mt-2 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed select-text">
                    {item.content}
                </p>
            )}

            {(attributeRows.length > 0 || legacyTags.length > 0) && (
                <div className="mt-3 flex flex-col gap-1.5">
                    {attributeRows.length > 0 && (
                        <TagRowBadges rows={attributeRows} maxDisplay={4} />
                    )}
                    {legacyTags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {legacyTags.map((tag) => (
                                <Badge key={tag} variant="secondary" className="bg-white/5 text-[9px] h-4 px-1 border-none text-muted-foreground">
                                    #{tag}
                                </Badge>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
};
