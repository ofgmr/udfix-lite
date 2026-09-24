import React, { useState, useEffect, useRef } from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { DataService } from '../../services/dataService';
import type { KnowledgeItem, EntityAttributeUpsertRow } from '../../services/dataService';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { ReadOnlyField } from '../../components/ui/ReadOnlyField';
import { ReadOnlyTags } from '../../components/ui/ReadOnlyTags';
import { toast } from 'sonner';
import { Separator } from '../../components/ui/separator';
import { TagDataRowsEditor } from '../../components/ui/TagDataRowsEditor';
import { EntityFormPopoutButton } from '../layout/EntityFormPopoutButton';
import { knowledgeTypeLabel } from '../../utils/entityCopyText';
import { KnowledgeBodyView } from './KnowledgeBodyView';

export interface KnowledgeFormContentProps {
    item?: Partial<KnowledgeItem> | null;
    onSuccess?: () => void;
    onCancel?: () => void;
    panelApi?: IDockviewPanelProps['api'];
}

const DEFAULT_FORM_DATA: Partial<KnowledgeItem> = {
    type: 'PRECEDENT',
    title: '',
    author: '',
    content: '',
    tags: '',
    source_url: '',
};

type WritableKnowledgeType = 'PRECEDENT' | 'BOOK' | 'ARTICLE';

function isWritableKnowledgeType(value: unknown): value is WritableKnowledgeType {
    return value === 'PRECEDENT' || value === 'BOOK' || value === 'ARTICLE';
}

function coerceWritableKnowledgeType(value: unknown): WritableKnowledgeType {
    if (isWritableKnowledgeType(value)) return value;
    return 'PRECEDENT';
}

function isKnowledgeType(value: unknown): value is KnowledgeItem['type'] {
    return isWritableKnowledgeType(value) || value === 'LEGISLATIVE';
}

function normalizeKnowledgeItem(item?: Partial<KnowledgeItem> | null): Partial<KnowledgeItem> {
    if (!item) return DEFAULT_FORM_DATA;
    const rawMetadata = (item as { metadata?: unknown }).metadata;
    const metadataObject =
        rawMetadata && typeof rawMetadata === 'object'
            ? (rawMetadata as Record<string, unknown>)
            : null;
    const metadataString = typeof rawMetadata === 'string' ? rawMetadata : undefined;
    const metadataValue = (key: string) => {
        const value = metadataObject?.[key];
        return typeof value === 'string' ? value : undefined;
    };
    const typeFromMetadata = metadataObject?.type;

    return {
        ...DEFAULT_FORM_DATA,
        id: item.id,
        type: coerceWritableKnowledgeType(
            item.type ?? (isKnowledgeType(typeFromMetadata) ? typeFromMetadata : 'PRECEDENT'),
        ),
        title: item.title ?? metadataValue('title') ?? '',
        author: item.author ?? metadataValue('author') ?? '',
        content: item.content ?? '',
        tags: item.tags ?? metadataValue('tags') ?? '',
        source_url: item.source_url ?? metadataValue('source_url') ?? '',
        metadata: metadataString,
        created_at: item.created_at ?? metadataValue('created_at') ?? '',
    };
}

export const KnowledgeFormContent: React.FC<KnowledgeFormContentProps> = ({
    item,
    onSuccess,
    onCancel,
    panelApi,
}) => {
    const isExisting = Boolean(item?.id);
    const [isEditing, setIsEditing] = useState(!isExisting);
    const [formData, setFormData] = useState<Partial<KnowledgeItem>>(DEFAULT_FORM_DATA);
    const [attributeRows, setAttributeRows] = useState<EntityAttributeUpsertRow[]>([]);
    const [loading, setLoading] = useState(false);
    const contentRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!panelApi?.group?.api) return;
        const ownerWindow =
            typeof (panelApi as { getWindow?: () => Window }).getWindow === 'function'
                ? (panelApi as { getWindow: () => Window }).getWindow()
                : window;
        const maxHeight = Math.min(
            isEditing ? 620 : 540,
            Math.max(280, ownerWindow.innerHeight - 80),
        );
        if (isEditing) {
            panelApi.group.api.setSize({ width: 430, height: maxHeight });
        } else {
            panelApi.group.api.setSize({ width: 400, height: maxHeight });
        }
    }, [isEditing, panelApi]);

    useEffect(() => {
        setFormData(normalizeKnowledgeItem(item));
        setIsEditing(!item?.id);
    }, [item]);

    useEffect(() => {
        if (!item?.id) {
            setAttributeRows([]);
            return;
        }
        let cancelled = false;
        void DataService.getEntityAttributes('KNOWLEDGE', item.id).then((rows) => {
            if (cancelled) return;
            setAttributeRows(
                rows.map((row, idx) => ({
                    tag_key: row.tag_key,
                    tag_value: row.tag_value,
                    sort_order: row.sort_order ?? idx,
                }))
            );
        });
        return () => {
            cancelled = true;
        };
    }, [item?.id]);

    const mergedMetadata = (
        existing: string | undefined,
        rows: EntityAttributeUpsertRow[],
    ): string | null => {
        const base: Record<string, unknown> = {};
        try {
            if (existing) Object.assign(base, JSON.parse(existing));
        } catch {
            // no-op
        }
        for (const row of rows) {
            const key = String(row.tag_key || '').trim();
            const value = String(row.tag_value || '').trim();
            if (!key) continue;
            if (value) base[key] = value;
            else delete base[key];
        }
        const keys = Object.keys(base);
        return keys.length ? JSON.stringify(base) : null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.title) {
            toast.error('Başlık zorunludur');
            return;
        }

        setLoading(true);
        try {
            const id = item?.id ?? `kb-${Date.now()}`;
            const now = new Date().toISOString();
            const metadata = mergedMetadata(formData.metadata, attributeRows) ?? undefined;
            const payload: Partial<KnowledgeItem> & { id: string } = {
                ...formData,
                content: contentRef.current?.value ?? formData.content,
                id,
                metadata,
                created_at: formData.created_at || now,
            };

            if (isExisting) {
                await DataService.updateKnowledgeBase(payload);
            } else {
                await DataService.addKnowledgeBase(payload);
            }
            await DataService.upsertEntityAttributes({
                entity_type: 'KNOWLEDGE',
                entity_id: id,
                rows: attributeRows,
            });

            toast.success(isExisting ? 'Bilgi kaydı güncellendi' : 'Bilgi başarıyla eklendi');
            onSuccess?.();
            
            if (!item?.id) {
                onCancel?.(); // close panel if it was newly created
            } else {
                setIsEditing(false); // return to view mode
            }
        } catch (error) {
            console.error('Failed to save KB item:', error);
            toast.error('Kaydetme sırasında bir hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const headerTitle = isExisting
        ? formData.title?.trim() || 'Bilgi Kaydı'
        : 'Bilgi Bankasına Ekle';
    const headerIcon = isExisting ? 'menu_book' : 'library_add';
    const handleDelete = () => {
        if (!item?.id) return;
        toast('Bilgi kaydı silinsin mi?', {
            description: formData.title || item.title || 'Bu işlem geri alınamaz.',
            action: {
                label: 'Sil',
                onClick: () => {
                    void (async () => {
                        setLoading(true);
                        try {
                            await DataService.deleteKnowledgeBase(item.id!);
                            toast.success('Kayıt silindi');
                            onSuccess?.();
                            onCancel?.();
                        } catch (error) {
                            console.error('Failed to delete KB item:', error);
                            toast.error('Silme sırasında bir hata oluştu');
                        } finally {
                            setLoading(false);
                        }
                    })();
                },
            },
            cancel: {
                label: 'Vazgeç',
                onClick: () => undefined,
            },
        });
    };

    return (
        <div className="flex h-full min-h-0 flex-col bg-background">
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur">
                <h4 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
                    <MaterialIcon icon={headerIcon} className="text-primary" size={18} />
                    {isEditing ? (
                        <Input
                            placeholder="Belge veya karar başlığı..."
                            className="h-7 text-xs glass-input min-w-[230px]"
                            value={formData.title}
                            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                            autoFocus={!isExisting}
                        />
                    ) : (
                        <span className="truncate">{headerTitle}</span>
                    )}
                </h4>
                {!isEditing && isExisting && (
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditing(true)}
                        className="h-7 px-2 text-[10px]"
                    >
                        <MaterialIcon icon="edit" size={12} className="mr-1" />
                        Düzenle
                    </Button>
                )}
                {isExisting && (
                    <div className="flex items-stretch gap-1">
                        <EntityFormPopoutButton panelApi={panelApi} disabled={loading} />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-[32px] w-6 rounded-sm border border-transparent bg-destructive/10 text-destructive transition-colors hover:border-destructive/30 hover:bg-destructive/20 hover:text-destructive"
                            onClick={() => void handleDelete()}
                            disabled={loading}
                            title="Sil"
                            aria-label="Sil"
                        >
                            <MaterialIcon icon="delete" size={14} />
                        </Button>
                        {!isEditing && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-[32px] w-6 rounded-sm border border-transparent bg-white/5 text-muted-foreground transition-colors hover:border-white/10 hover:bg-white/10 hover:text-foreground"
                                onClick={() => onCancel?.()}
                                disabled={loading}
                                title="Kapat"
                                aria-label="Kapat"
                            >
                                <MaterialIcon icon="close" size={14} />
                            </Button>
                        )}
                    </div>
                )}
                {!isExisting && (
                    <EntityFormPopoutButton panelApi={panelApi} disabled={loading} />
                )}
            </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                <div className="flex-1 space-y-4 overflow-y-auto p-3">
                    {isExisting && !isEditing ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <ReadOnlyField label="Tür" value={knowledgeTypeLabel(formData.type ?? 'PRECEDENT')} icon="category" />
                                <ReadOnlyField label="Yazar / Kaynak" value={formData.author || '—'} icon="person" />
                            </div>

                            {formData.content && <Separator className="my-1 border-white/5" />}

                            {formData.content && (
                                <div className="space-y-1.5">
                                    <Label className="text-[9px] text-muted-foreground uppercase tracking-widest flex items-center gap-1 opacity-70">
                                        <MaterialIcon icon="subject" size={10} />
                                        İçerik
                                    </Label>
                                    <KnowledgeBodyView text={formData.content} />
                                </div>
                            )}

                            {(formData.tags || formData.source_url) && <Separator className="my-1 border-white/5" />}

                            {attributeRows.length > 0 && <Separator className="my-1 border-white/5" />}

                            {attributeRows.length > 0 && (
                                <div className="space-y-2">
                                    <Label className="text-[9px] text-muted-foreground uppercase tracking-widest flex items-center gap-1 opacity-70">
                                        <MaterialIcon icon="label" size={10} />
                                        Ek Veriler
                                    </Label>
                                    <div className="space-y-1.5">
                                        {attributeRows.map((row, i) => (
                                            <ReadOnlyField key={i} label={row.tag_key || '—'} value={row.tag_value} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <ReadOnlyTags label="Etiketler" tags={formData.tags} icon="label" />
                                <ReadOnlyField label="URL" value={formData.source_url} icon="link" />
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-[9px] text-muted-foreground uppercase tracking-widest opacity-80">Tür</Label>
                                    <Select
                                        value={formData.type}
                                        onValueChange={(v) =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                type: coerceWritableKnowledgeType(v),
                                            }))
                                        }
                                    >
                                        <SelectTrigger className="h-7 text-xs glass-input py-0">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="glass">
                                            <SelectItem value="PRECEDENT" className="text-xs">İçtihat</SelectItem>
                                            <SelectItem value="BOOK" className="text-xs">Kitap</SelectItem>
                                            <SelectItem value="ARTICLE" className="text-xs">Makale</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[9px] text-muted-foreground uppercase tracking-widest opacity-80">Yazar / Kaynak</Label>
                                    <Input
                                        placeholder="Örn: Yargıtay 9. HD"
                                        className="h-7 text-xs glass-input"
                                        value={formData.author}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, author: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <TagDataRowsEditor
                                entityType="KNOWLEDGE"
                                rows={attributeRows}
                                onChange={setAttributeRows}
                                title="Ek veriler / Metadatalar"
                            />

                            <div className="space-y-1.5">
                                <Label className="text-[9px] text-muted-foreground uppercase tracking-widest opacity-80">İçerik (Özet veya Tam Metin)</Label>
                                <Textarea
                                    key={`${item?.id ?? 'new'}-${isEditing ? 'edit' : 'view'}`}
                                    ref={contentRef}
                                    defaultValue={formData.content}
                                    placeholder="Açıklamalar aramada bulunabilir, içerik ekleyin..."
                                    className="glass-input min-h-[120px] max-h-[min(28rem,50vh)] resize-y text-xs select-text"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-[9px] text-muted-foreground uppercase tracking-widest opacity-80">Etiketler</Label>
                                    <Input
                                        placeholder="tazminat, iş hukuku..."
                                        className="h-7 text-xs glass-input"
                                        value={formData.tags}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, tags: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[9px] text-muted-foreground uppercase tracking-widest opacity-80">URL</Label>
                                    <Input
                                        placeholder="https://..."
                                        className="h-7 text-xs glass-input"
                                        value={formData.source_url}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, source_url: e.target.value }))}
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {isEditing && (
                    <div className="sticky bottom-0 px-3 py-2 border-t bg-background/95 backdrop-blur flex justify-end gap-2 mt-auto">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                if (!isExisting) onCancel?.();
                                else setIsEditing(false);
                            }}
                            className="h-7 px-2 text-[10px]"
                            disabled={loading}
                        >
                            {isExisting ? 'Vazgeç' : 'İptal'}
                        </Button>
                        <Button
                            type="submit"
                            size="sm"
                            disabled={loading}
                            className="bg-primary text-primary-foreground shadow-lg shadow-primary/20 h-7 text-[10px] px-3"
                        >
                            {loading ? 'Kaydediliyor...' : isExisting ? 'Kaydet' : 'Bilgiyi Kaydet'}
                        </Button>
                    </div>
                )}
            </form>
        </div>
    );
};

export default KnowledgeFormContent;
