import React, { useState } from 'react';
import { DataService } from '../../services/dataService';
import type { KnowledgeItem, EntityAttributeUpsertRow } from '../../services/dataService';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { toast } from 'sonner';
import { TagDataRowsEditor } from '../../components/ui/TagDataRowsEditor';

interface AddKnowledgeDialogProps {
    onSuccess: () => void;
    children?: React.ReactNode;
}

export const AddKnowledgeDialog: React.FC<AddKnowledgeDialogProps> = ({ onSuccess, children }) => {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<Partial<KnowledgeItem>>({
        type: 'PRECEDENT',
        title: '',
        author: '',
        content: '',
        tags: '',
        source_url: ''
    });
    const [attributeRows, setAttributeRows] = useState<EntityAttributeUpsertRow[]>([]);

    const mergedMetadata = (
        existing: string | undefined,
        rows: EntityAttributeUpsertRow[]
    ): string | undefined => {
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
        return keys.length ? JSON.stringify(base) : undefined;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.title) {
            toast.error('Başlık zorunludur');
            return;
        }

        setLoading(true);
        try {
            const id = `kb-${Date.now()}`;
            const now = new Date().toISOString();

            // 1. Add to SQLite
            await DataService.addKnowledgeBase({
                ...formData,
                id,
                metadata: mergedMetadata(formData.metadata, attributeRows),
                created_at: now
            });
            await DataService.upsertEntityAttributes({
                entity_type: 'KNOWLEDGE',
                entity_id: id,
                rows: attributeRows,
            });

            toast.success('Bilgi başarıyla eklendi');
            setOpen(false);
            onSuccess();
            setFormData({ type: 'PRECEDENT', title: '', author: '', content: '', tags: '', source_url: '' });
            setAttributeRows([]);
        } catch (error) {
            console.error('Failed to add KB item:', error);
            toast.error('Ekleme sırasında bir hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children || (
                    <Button className="rounded-full h-12 w-12 shadow-xl shadow-primary/20 bg-primary hover:bg-primary/90">
                        <MaterialIcon icon="add" size={24} />
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] glass-panel border-white/10 shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <MaterialIcon icon="library_add" className="text-primary" />
                        Bilgi Bankasına Ekle
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Başlık</Label>
                        <Input
                            placeholder="Belge veya karar başlığı..."
                            className="glass-input bg-white/5 border-white/10"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Tür</Label>
                            <Select
                                value={formData.type}
                                onValueChange={(v) =>
                                    setFormData({
                                        ...formData,
                                        type: v === 'BOOK' || v === 'ARTICLE' || v === 'PRECEDENT' ? v : 'PRECEDENT',
                                    })
                                }
                            >
                                <SelectTrigger className="glass-input bg-white/5 border-white/10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="glass border-white/10">
                                    <SelectItem value="PRECEDENT">İçtihat</SelectItem>
                                    <SelectItem value="BOOK">Kitap</SelectItem>
                                    <SelectItem value="ARTICLE">Makale</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Yazar / Kaynak</Label>
                            <Input
                                placeholder="Örn: Yargıtay 9. HD"
                                className="glass-input bg-white/5 border-white/10"
                                value={formData.author}
                                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                            />
                        </div>
                    </div>

                    <TagDataRowsEditor
                        entityType="KNOWLEDGE"
                        rows={attributeRows}
                        onChange={setAttributeRows}
                        title="Bilgi kaydi etiketli veri satirlari"
                    />

                    <div className="space-y-2">
                        <Label>İçerik (Özet veya Tam Metin)</Label>
                        <Textarea
                            placeholder="Açıklamalar aramada bulunabilir..."
                            className="glass-input bg-white/5 border-white/10 min-h-[120px] resize-none"
                            value={formData.content}
                            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Etiketler</Label>
                            <Input
                                placeholder="tazminat, iş hukuku..."
                                className="glass-input bg-white/5 border-white/10"
                                value={formData.tags}
                                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>URL</Label>
                            <Input
                                placeholder="https://..."
                                className="glass-input bg-white/5 border-white/10"
                                value={formData.source_url}
                                onChange={(e) => setFormData({ ...formData, source_url: e.target.value })}
                            />
                        </div>
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>İptal</Button>
                        <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
                            {loading ? 'Ekleniyor...' : 'Bilgiyi Kaydet'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
