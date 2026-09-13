import React from 'react';
import { Button } from './button';
import { Input } from './input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import MaterialIcon from './MaterialIcon';
import { DataService, type EntityAttributeType, type EntityAttributeUpsertRow, type AttributeTagCatalogRow } from '../../services/dataService';
import { toast } from 'sonner';
import { isHiddenMatterAttribute, visibleMatterAttributeRows } from '../../utils/matterAttributeSearch';

interface TagDataRowsEditorProps {
    entityType: EntityAttributeType;
    rows: EntityAttributeUpsertRow[];
    onChange: (rows: EntityAttributeUpsertRow[]) => void;
    title?: string;
}

export const TagDataRowsEditor: React.FC<TagDataRowsEditorProps> = ({
    entityType,
    rows,
    onChange,
    title: _title = 'Etiketli veriler',
}) => {
    const [catalog, setCatalog] = React.useState<AttributeTagCatalogRow[]>([]);
    const [pickKey, setPickKey] = React.useState('__none__');
    const [draftValue, setDraftValue] = React.useState('');
    const [newKey, setNewKey] = React.useState('');

    const loadCatalog = React.useCallback(async () => {
        const list = await DataService.listAttributeTags(entityType);
        setCatalog((Array.isArray(list) ? list : []).filter((tag) => !isHiddenMatterAttribute(tag.key)));
    }, [entityType]);

    React.useEffect(() => {
        void loadCatalog();
    }, [loadCatalog]);

    const addRow = () => {
        const key = pickKey === '__none__' ? '' : pickKey;
        const value = draftValue.trim();
        if (!key || !value) return;
        onChange([...rows, { tag_key: key, tag_value: value, sort_order: rows.length }]);
        setDraftValue('');
    };

    const getTagLabel = React.useCallback(
        (key: string) => catalog.find((tag) => tag.key === key)?.label || key,
        [catalog],
    );

    const removeRow = (idx: number) => {
        onChange(rows.filter((_, i) => i !== idx).map((row, i) => ({ ...row, sort_order: i })));
    };

    const addNewTag = async () => {
        const keyRaw = newKey.trim().toLowerCase().replace(/\s+/g, '_');
        if (!keyRaw) return;
        const res = await DataService.addAttributeTag({
            entity_type: entityType,
            key: keyRaw,
            label: keyRaw.replace(/_/g, ' '),
        });
        if (!res.ok) {
            toast.error('Etiket eklenemedi');
            return;
        }
        setNewKey('');
        await loadCatalog();
        setPickKey(keyRaw);
    };

    const visibleRows = visibleMatterAttributeRows(rows);

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-[1fr_2fr_auto] gap-2 items-end">
                <Select value={pickKey} onValueChange={setPickKey}>
                    <SelectTrigger className="h-7 text-[10px] bg-white/5 border-white/10 text-muted-foreground focus:ring-0 py-0 px-2 rounded">
                        <SelectValue placeholder="Etiket..." />
                    </SelectTrigger>
                    <SelectContent className="glass border-white/10 max-h-48 min-w-[120px]">
                        <SelectItem value="__none__" className="text-[10px]">—</SelectItem>
                        {catalog.map((tag) => (
                            <SelectItem key={`${tag.entity_type}-${tag.key}`} value={tag.key} className="text-[10px]">
                                {tag.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Input
                    value={draftValue}
                    onChange={(e) => setDraftValue(e.target.value)}
                    placeholder="Veri..."
                    className="h-7 text-[10px] bg-white/5 border-white/10 py-0 px-2 rounded"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            addRow();
                        }
                    }}
                />
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20" title="Satır ekle" aria-label="Satır ekle" onClick={addRow} disabled={!draftValue.trim() || pickKey === '__none__'}>
                    <MaterialIcon icon="add" size={12} />
                </Button>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2 items-end opacity-70 hover:opacity-100 transition-opacity">
                <Input
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="Yeni etiket (örn: dava_degeri)"
                    className="h-6 text-[9px] bg-white/5 border-white/10 py-0 px-2 rounded"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            void addNewTag();
                        }
                    }}
                />
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 rounded hover:bg-white/10" title="Yeni etiket ekle" aria-label="Yeni etiket ekle" onClick={() => void addNewTag()} disabled={!newKey.trim()}>
                    <MaterialIcon icon="check" size={10} />
                </Button>
            </div>

            {visibleRows.length === 0 ? (
                <div className="bg-white/5 border border-white/10 rounded p-1.5 min-h-[28px] flex items-center justify-center">
                    <p className="text-[9px] text-muted-foreground/50 italic tracking-wider">EK VERİ YOK</p>
                </div>
            ) : (
                <ul className="space-y-1 mt-2">
                    {visibleRows.map((row) => {
                        const idx = rows.indexOf(row);
                        return (
                        <li key={`${row.tag_key}-${idx}`} className="group flex items-center gap-2 p-1.5 text-[10px] border border-white/10 rounded bg-white/5 hover:bg-white/10 transition-colors">
                            <span className="font-semibold text-muted-foreground shrink-0 uppercase tracking-widest text-[9px] w-20 truncate" title={getTagLabel(row.tag_key)}>
                                {getTagLabel(row.tag_key)}
                            </span>
                            <span className="flex-1 truncate select-text" title={row.tag_value}>
                                {row.tag_value}
                            </span>
                            <Button type="button" variant="ghost" size="icon" className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity" title="Satırı sil" aria-label="Satırı sil" onClick={() => removeRow(idx)}>
                                <MaterialIcon icon="close" size={10} />
                            </Button>
                        </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

