import React, { useState, useCallback, useEffect } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Badge } from './badge';
import MaterialIcon from './MaterialIcon';
import { DataService, type EntityAttributeType, type EntityAttributeUpsertRow, type AttributeTagCatalogRow } from '../../services/dataService';
import { toast } from 'sonner';
import { isHiddenMatterAttribute, visibleMatterAttributeRows } from '../../utils/matterAttributeSearch';

interface QuickTagPopoverProps {
    entityType: EntityAttributeType;
    entityId?: string;
    rows: EntityAttributeUpsertRow[];
    onChange: (rows: EntityAttributeUpsertRow[]) => void;
    trigger?: React.ReactNode;
    placeholder?: string;
    maxHeight?: number;
}

export const QuickTagPopover: React.FC<QuickTagPopoverProps> = ({
    entityType,
    entityId: _entityId,
    rows,
    onChange,
    trigger,
    placeholder = 'Veri ekle...',
    maxHeight = 200,
}) => {
    const [open, setOpen] = useState(false);
    const [catalog, setCatalog] = useState<AttributeTagCatalogRow[]>([]);
    const [selectedTag, setSelectedTag] = useState('');
    const [inputValue, setInputValue] = useState('');
    const [newTagName, setNewTagName] = useState('');
    const [_showNewTagInput, setShowNewTagInput] = useState(false);

    // Load catalog when popover opens
    useEffect(() => {
        if (!open) return;
        const loadCatalog = async () => {
            const list = await DataService.listAttributeTags(entityType);
            setCatalog((Array.isArray(list) ? list : []).filter((tag) => !isHiddenMatterAttribute(tag.key)));
        };
        void loadCatalog();
    }, [open, entityType]);

    const addRow = useCallback(() => {
        if (!selectedTag || !inputValue.trim()) {
            toast.error('Etiket ve değer gerekli');
            return;
        }
        
        const newRow: EntityAttributeUpsertRow = {
            tag_key: selectedTag,
            tag_value: inputValue.trim(),
            sort_order: rows.length,
        };
        
        onChange([...rows, newRow]);
        setInputValue('');
        setSelectedTag('');
        toast.success('Eklendi');
    }, [selectedTag, inputValue, rows, onChange]);

    const removeRow = useCallback((idx: number) => {
        onChange(rows.filter((_, i) => i !== idx).map((row, i) => ({ ...row, sort_order: i })));
    }, [rows, onChange]);

    const copyToClipboard = useCallback(async (text: string, label?: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(label ? `${label} kopyalandı` : 'Kopyalandı');
        } catch {
            toast.error('Kopyalama başarısız');
        }
    }, []);

    const addNewTag = useCallback(async () => {
        const keyRaw = newTagName.trim().toLowerCase().replace(/\s+/g, '_');
        if (!keyRaw) return;
        
        const res = await DataService.addAttributeTag({
            entity_type: entityType,
            key: keyRaw,
            label: newTagName.trim(),
        });
        
        if (!res.ok) {
            toast.error('Etiket eklenemedi');
            return;
        }
        
        // Refresh catalog and select new tag
        const list = await DataService.listAttributeTags(entityType);
        setCatalog((Array.isArray(list) ? list : []).filter((tag) => !isHiddenMatterAttribute(tag.key)));
        setSelectedTag(keyRaw);
        setNewTagName('');
        setShowNewTagInput(false);
        toast.success('Yeni etiket oluşturuldu');
    }, [newTagName, entityType]);

    const getTagLabel = useCallback((key: string) => {
        const tag = catalog.find(t => t.key === key);
        return tag?.label || key;
    }, [catalog]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && selectedTag && inputValue.trim()) {
            e.preventDefault();
            addRow();
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen} modal={true}>
            <PopoverTrigger asChild>
                {trigger || (
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                        <MaterialIcon icon="add" size={14} className="mr-1" />
                        {placeholder}
                    </Button>
                )}
            </PopoverTrigger>
            <PopoverContent
                className="w-80 p-0 overflow-hidden"
                align="end"
                side="top"
                sideOffset={4}
                avoidCollisions={true}
                data-radix-popover-content
                onInteractOutside={(e) => {
                    const target = e.target as HTMLElement;
                    const popoverContent = document.querySelector('[data-radix-popover-content]');
                    if (popoverContent?.contains(target)) {
                        e.preventDefault();
                    }
                }}
                onEscapeKeyDown={() => setOpen(false)}
            >
                {/* Header */}
                <div className="px-3 py-2 border-b bg-muted/30">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                        <MaterialIcon icon="label" size={14} className="text-primary" />
                        Etiketli Veriler
                        {rows.length > 0 && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1">
                                {rows.length}
                            </Badge>
                        )}
                    </h4>
                </div>

                {/* Quick Add Form */}
                <div className="p-3 space-y-2">
                    <div className="flex gap-2">
                        <Select value={selectedTag} onValueChange={setSelectedTag}>
                            <SelectTrigger className="h-8 text-xs flex-1">
                                <SelectValue placeholder="Etiket..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-48">
                                {catalog.map((tag) => (
                                    <SelectItem key={tag.key} value={tag.key} className="text-xs">
                                        {tag.label}
                                    </SelectItem>
                                ))}
                                <SelectItem value="__new__" className="text-xs text-primary">
                                    <span className="flex items-center gap-1">
                                        <MaterialIcon icon="add" size={12} />
                                        Yeni etiket...
                                    </span>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {selectedTag === '__new__' && (
                        <div className="flex gap-2 animate-in fade-in slide-in-from-top-1">
                            <Input
                                placeholder="Etiket adı..."
                                className="h-8 text-xs flex-1"
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addNewTag()}
                                autoFocus
                            />
                            <Button size="sm" className="h-8 px-2" onClick={addNewTag}>
                                <MaterialIcon icon="check" size={14} />
                            </Button>
                        </div>
                    )}

                    {selectedTag && selectedTag !== '__new__' && (
                        <div className="flex gap-2 animate-in fade-in slide-in-from-top-1">
                            <Input
                                placeholder="Değer girin..."
                                className="h-8 text-xs flex-1"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                autoFocus
                            />
                            <Button 
                                size="sm" 
                                className="h-8 px-2" 
                                onClick={addRow}
                                disabled={!inputValue.trim()}
                            >
                                <MaterialIcon icon="add" size={14} />
                            </Button>
                        </div>
                    )}
                </div>

                {/* Existing Rows - 60% opacity, clickable */}
                {visibleMatterAttributeRows(rows).length > 0 && (
                    <div 
                        className="border-t overflow-y-auto"
                        style={{ maxHeight }}
                    >
                        {visibleMatterAttributeRows(rows).map((row) => {
                            const idx = rows.indexOf(row);
                            return (
                            <div
                                key={`${row.tag_key}-${idx}`}
                                className="group flex items-center gap-2 px-3 py-2 text-xs border-b last:border-0 opacity-60 hover:opacity-100 hover:bg-muted/40 cursor-pointer transition-all duration-150"
                                onClick={() => copyToClipboard(row.tag_value, getTagLabel(row.tag_key))}
                            >
                                <span className="font-medium text-muted-foreground shrink-0">
                                    {getTagLabel(row.tag_key)}:
                                </span>
                                <span className="truncate flex-1 text-foreground">
                                    {row.tag_value}
                                </span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(`${row.tag_key}: ${row.tag_value}`);
                                        }}
                                    >
                                        <MaterialIcon icon="content_copy" size={12} />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-destructive"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeRow(idx);
                                        }}
                                    >
                                        <MaterialIcon icon="close" size={12} />
                                    </Button>
                                </div>
                            </div>
                            );
                        })}
                    </div>
                )}

                {rows.length === 0 && (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground border-t">
                        <MaterialIcon icon="info" size={14} className="mx-auto mb-1 opacity-50" />
                        Henüz veri yok. Etiket seçip ekleyin.
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
};

// Compact inline display of tag rows (for use in cards/lists)
interface TagRowBadgesProps {
    rows: EntityAttributeUpsertRow[];
    catalog?: AttributeTagCatalogRow[];
    maxDisplay?: number;
    onClick?: () => void;
}

export const TagRowBadges: React.FC<TagRowBadgesProps> = ({
    rows,
    catalog = [],
    maxDisplay = 3,
    onClick,
}) => {
    const visible = visibleMatterAttributeRows(rows);
    if (visible.length === 0) return null;

    const getLabel = (key: string) => catalog.find(t => t.key === key)?.label || key;
    const displayRows = visible.slice(0, maxDisplay);
    const remaining = visible.length - maxDisplay;

    return (
        <div className="flex flex-wrap gap-1.5">
            {displayRows.map((row, idx) => (
                <Badge
                    key={idx}
                    variant="secondary"
                    className="text-[10px] h-5 px-1.5 font-normal cursor-pointer hover:bg-secondary/80 transition-colors"
                    onClick={onClick}
                >
                    <span className="text-muted-foreground mr-1">{getLabel(row.tag_key)}:</span>
                    <span className="truncate max-w-[80px]">{row.tag_value}</span>
                </Badge>
            ))}
            {remaining > 0 && (
                <Badge
                    variant="outline"
                    className="text-[10px] h-5 px-1.5 cursor-pointer hover:bg-muted transition-colors"
                    onClick={onClick}
                >
                    +{remaining}
                </Badge>
            )}
        </div>
    );
};
