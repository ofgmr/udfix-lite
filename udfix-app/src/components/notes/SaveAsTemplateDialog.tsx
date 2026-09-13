import React, { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import { Textarea } from '../ui/textarea';
import { DataService, type TextTemplateCategory } from '../../services/dataService';
import { toast } from 'sonner';

const CATEGORIES: { value: TextTemplateCategory; label: string }[] = [
    { value: 'PETITION', label: 'Dilekçe' },
    { value: 'LETTER', label: 'Yazı' },
    { value: 'CONTRACT', label: 'Sözleşme' },
    { value: 'CLAUSE', label: 'Fıkra / madde' },
    { value: 'DEFINITION', label: 'Tanım' },
    { value: 'PROCEDURE', label: 'Prosedür' },
    { value: 'LEGISLATION', label: 'Kanun / yönetmelik' },
    { value: 'CUSTOM', label: 'Özel' },
];

export type SaveAsTemplateDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    defaultName: string;
    /** Stringify edilmiş Tiptap doc JSON */
    contentJson: string;
    contentPlain?: string;
};

export const SaveAsTemplateDialog: React.FC<SaveAsTemplateDialogProps> = ({
    open,
    onOpenChange,
    defaultName,
    contentJson,
    contentPlain,
}) => {
    const [name, setName] = useState('');
    const [category, setCategory] = useState<TextTemplateCategory>('CUSTOM');
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setName(defaultName.trim() || 'Yeni şablon');
            setCategory('CUSTOM');
            setDescription('');
        }
    }, [open, defaultName]);

    const handleSubmit = async () => {
        const n = name.trim();
        if (!n) {
            toast.error('Şablon adı gerekli');
            return;
        }
        setSaving(true);
        try {
            const res = await DataService.addTextTemplate({
                name: n,
                category,
                content_json: contentJson,
                content_plain: contentPlain ?? null,
                description: description.trim() || null,
            });
            if (res.ok) {
                toast.success('Şablon kütüphaneye eklendi', { description: n });
                onOpenChange(false);
            } else if (res.error === 'name_required') {
                toast.error('Şablon adı gerekli');
            } else if (res.error === 'ipc_unavailable') {
                toast.error('Kaydedilemedi', {
                    description: 'Electron / veritabanı bağlantısı yok. Uygulamayı masaüstü modunda açın.',
                });
            } else {
                toast.error('Kaydedilemedi', { description: 'Veritabanı hatası' });
            }
        } catch (e) {
            console.warn(e);
            toast.error('Kaydedilemedi');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md glass-panel border-white/10" variant="glass">
                <DialogHeader>
                    <DialogTitle>Şablon olarak kaydet</DialogTitle>
                    <DialogDescription>
                        Seçili veya tüm içeriği metin şablonları kütüphanesine kaydedin; komut paletinde ## ile
                        kullanılabilir.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 py-2">
                    <div className="grid gap-1.5">
                        <Label htmlFor="tpl-name">Ad</Label>
                        <Input
                            id="tpl-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Örn. İtiraz dilekçesi — giriş"
                            className="border-white/10"
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label>Kategori</Label>
                        <Select value={category} onValueChange={(v) => setCategory(v as TextTemplateCategory)}>
                            <SelectTrigger className="border-white/10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {CATEGORIES.map((c) => (
                                    <SelectItem key={c.value} value={c.value}>
                                        {c.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="tpl-desc">Açıklama (isteğe bağlı)</Label>
                        <Textarea
                            id="tpl-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            className="resize-none border-white/10 text-sm"
                            placeholder="Kısa not — kütüphanede aramada kullanılır"
                        />
                    </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
                        İptal
                    </Button>
                    <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
                        {saving ? 'Kaydediliyor…' : 'Kaydet'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
