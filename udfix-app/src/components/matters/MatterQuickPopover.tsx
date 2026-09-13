import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Separator } from '../../components/ui/separator';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { QuickTagPopover, TagRowBadges } from '../../components/ui/QuickTagPopover';
import { toast } from 'sonner';
import {
    type Matter,
    type MatterCategory,
    type Court,
    type Party,
    type EntityAttributeUpsertRow,
    DataService,
    OFFICE_MATTER_PARTY_ROLES,
} from '../../services/dataService';
import { visibleMatterAttributeRows } from '../../utils/matterAttributeSearch';

interface MatterQuickPopoverProps {
    matter?: Matter | null;
    children?: React.ReactNode;
    onSuccess?: () => void;
    onCancel?: () => void;
}

const MATTER_PARTY_ROLES = OFFICE_MATTER_PARTY_ROLES;

const STATUS_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
    OPEN: { color: 'bg-emerald-500', icon: 'circle', label: 'Açık' },
    CLOSED: { color: 'bg-gray-500', icon: 'check_circle', label: 'Kapalı' },
    ARCHIVED: { color: 'bg-amber-500', icon: 'archive', label: 'Arşiv' },
    APPEAL: { color: 'bg-blue-500', icon: 'gavel', label: 'İstinaf/Temyiz' },
};

const CATEGORY_LABELS: Record<string, string> = {
    CIVIL: 'Hukuk',
    CRIMINAL: 'Ceza',
    ADMINISTRATIVE: 'İdari',
    PROSECUTION: 'Soruşturma',
    ENFORCEMENT_PROCEEDING: 'İcra',
    MEDIATION: 'Arabuluculuk',
    SETTLEMENT: 'Uzlaşma',
    OTHER: 'Diğer',
};

const MATTER_CATEGORY_OPTIONS: readonly MatterCategory[] = [
    'CIVIL',
    'CRIMINAL',
    'ADMINISTRATIVE',
    'PROSECUTION',
    'ENFORCEMENT_PROCEEDING',
    'MEDIATION',
    'SETTLEMENT',
    'OTHER',
];

function deriveMatterTypeFromCategory(category: MatterCategory | '' | null | undefined): Matter['matter_type'] {
    if (category === 'ENFORCEMENT_PROCEEDING') return 'ENFORCEMENT';
    if (category === 'MEDIATION' || category === 'SETTLEMENT') return 'MEDIATION';
    return 'LAW_CASE';
}

export const MatterQuickPopover: React.FC<MatterQuickPopoverProps> = ({
    matter,
    children,
    onSuccess,
    onCancel,
}) => {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [courts, setCourts] = useState<Court[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    
    // Form state
    const [title, setTitle] = useState('');
    const [status, setStatus] = useState<Matter['status']>('OPEN');
    const [category, setCategory] = useState<MatterCategory | ''>('');
    const [courtId, setCourtId] = useState('');
    const [esasNo, setEsasNo] = useState('');
    const [fileNo, setFileNo] = useState('');
    const [internalId, setInternalId] = useState('');
    const [openingDate, setOpeningDate] = useState('');
    const [attributeRows, setAttributeRows] = useState<EntityAttributeUpsertRow[]>([]);
    
    // Party linking
    const [linkedParties, setLinkedParties] = useState<
        Array<{ party_id: string; role: string; party?: Party }>
    >([]);
    const [selectedPartyId, setSelectedPartyId] = useState('');
    const [selectedRole, setSelectedRole] = useState('MÜVEKKİL');
    const [showPartyAdd, setShowPartyAdd] = useState(false);

    // Load data when opening
    useEffect(() => {
        if (!open) return;
        
        const loadData = async () => {
            // Load courts and parties
            const [courtsList, partiesList] = await Promise.all([
                DataService.listCourts().catch(() => []),
                DataService.getParties().catch(() => []),
            ]);
            setCourts(Array.isArray(courtsList) ? courtsList : []);
            setParties(Array.isArray(partiesList) ? partiesList : []);
            
            // If editing, load matter data
            if (matter?.id) {
                const fullMatter = await DataService.getMatter(matter.id);
                setTitle(matter.title || '');
                setStatus(matter.status || 'OPEN');
                setCategory((matter.matter_category as MatterCategory) || '');
                setCourtId(matter.court_id || '');
                setEsasNo(matter.esas_no || '');
                setFileNo(matter.file_number || '');
                setInternalId(matter.internal_id || '');
                setOpeningDate(matter.opening_date || '');
                
                // Load linked parties
                if (fullMatter?.parties) {
                    setLinkedParties(fullMatter.parties.map((p: Party & { role: string }) => ({
                        party_id: p.id,
                        role: p.role,
                        party: p,
                    })));
                }
                
                // Load attributes
                const attrs = await DataService.getEntityAttributes('MATTER', matter.id);
                setAttributeRows(visibleMatterAttributeRows(attrs.map((a, i) => ({
                    tag_key: a.tag_key,
                    tag_value: a.tag_value,
                    sort_order: a.sort_order ?? i,
                }))));
            } else {
                // New matter defaults
                setTitle('');
                setStatus('OPEN');
                setCategory('');
                setCourtId('');
                setEsasNo('');
                setFileNo('');
                setInternalId('');
                setOpeningDate(new Date().toISOString().split('T')[0]);
                setLinkedParties([]);
                setAttributeRows([]);
            }
        };
        
        void loadData();
    }, [open, matter]);

    const addPartyLink = useCallback(() => {
        if (!selectedPartyId) return;
        if (linkedParties.some(lp => lp.party_id === selectedPartyId)) {
            toast.error('Bu taraf zaten ekli');
            return;
        }
        const party = parties.find(p => p.id === selectedPartyId);
        setLinkedParties(prev => [...prev, {
            party_id: selectedPartyId,
            role: selectedRole,
            party,
        }]);
        setSelectedPartyId('');
        setShowPartyAdd(false);
    }, [selectedPartyId, selectedRole, linkedParties, parties]);

    const removePartyLink = useCallback((partyId: string) => {
        setLinkedParties(prev => prev.filter(lp => lp.party_id !== partyId));
    }, []);

    const handleSubmit = useCallback(async () => {
        if (!title.trim()) {
            toast.error('Dosya başlığı gerekli');
            return;
        }
        
        setLoading(true);
        try {
            const matterId = matter?.id || crypto.randomUUID();
            const payload: Partial<Matter> & { id: string } = {
                id: matterId,
                title: title.trim(),
                status,
                matter_type: deriveMatterTypeFromCategory(category),
                matter_category: category || undefined,
                court_id: courtId || undefined,
                esas_no: esasNo.trim() || undefined,
                file_number: fileNo.trim() || esasNo.trim() || undefined,
                internal_id: internalId.trim() || undefined,
                opening_date: openingDate || undefined,
                metadata: matter?.metadata ?? undefined,
            };
            
            // Save matter
            if (matter?.id) {
                await DataService.updateMatter({ ...matter, ...payload } as Matter);
            } else {
                await DataService.addMatter(payload);
            }
            
            // Sync party links
            const prevParties = matter?.parties as Array<Party & { role: string }> | undefined;
            const prevIds = new Set((prevParties || []).map(p => p.id));
            const nextIds = new Set(linkedParties.map(lp => lp.party_id));
            
            // Remove unlinked
            for (const prevId of prevIds) {
                if (!nextIds.has(prevId)) {
                    await DataService.unlinkPartyFromMatter({ matterId, partyId: prevId });
                }
            }
            // Add new links
            for (const link of linkedParties) {
                if (!prevIds.has(link.party_id)) {
                    await DataService.linkPartyToMatter({
                        matterId,
                        partyId: link.party_id,
                        role: link.role,
                    });
                }
            }
            
            // Save attributes
            await DataService.upsertEntityAttributes({
                entity_type: 'MATTER',
                entity_id: matterId,
                rows: attributeRows,
            });
            
            toast.success(matter ? 'Dosya güncellendi' : 'Dosya oluşturuldu');
            setOpen(false);
            onSuccess?.();
        } catch (error) {
            console.error('Matter save error:', error);
            toast.error('Kaydederken hata oluştu');
        } finally {
            setLoading(false);
        }
    }, [matter, title, status, category, courtId, esasNo, fileNo, internalId, openingDate, linkedParties, attributeRows, onSuccess]);

    const statusConfig = STATUS_CONFIG[status];
    return (
        <Popover open={open} onOpenChange={setOpen} modal={true}>
            <PopoverTrigger asChild>
                {children || (
                    <Button variant="outline" size="sm">
                        <MaterialIcon icon={matter ? 'edit' : 'add'} size={14} className="mr-1" />
                        {matter ? 'Düzenle' : 'Yeni Dosya'}
                    </Button>
                )}
            </PopoverTrigger>
            <PopoverContent
                className="w-96 p-0 max-h-[80vh] overflow-y-auto"
                align="end"
                side="left"
                sideOffset={8}
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
                <div className="sticky top-0 z-10 px-4 py-3 border-b bg-background/95 backdrop-blur flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${statusConfig.color}`} />
                        <h4 className="font-medium text-sm">
                            {matter ? 'Dosyayı Düzenle' : 'Yeni Dosya'}
                        </h4>
                    </div>
                    <Select value={status} onValueChange={(v) => setStatus(v as Matter['status'])}>
                        <SelectTrigger className="h-7 w-28 text-xs border-0 bg-transparent focus:ring-0">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                                <SelectItem key={key} value={key} className="text-xs">
                                    <span className="flex items-center gap-2">
                                        <span className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
                                        {config.label}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="p-4 space-y-4">
                    {/* Title - Primary Field */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Dosya Başlığı</Label>
                        <Input
                            placeholder="örn: Alacak Davası..."
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="h-9"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            Alan
                        </Label>
                        <Select
                            value={category || '__none__'}
                            onValueChange={(v) =>
                                setCategory(v === '__none__' ? '' : (v as MatterCategory))
                            }
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Seçin" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__" className="text-xs">
                                    —
                                </SelectItem>
                                {MATTER_CATEGORY_OPTIONS.map((key) => (
                                    <SelectItem key={key} value={key} className="text-xs">
                                        {CATEGORY_LABELS[key]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Numbers Row */}
                    <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Esas No</Label>
                            <Input
                                placeholder="2024/123"
                                value={esasNo}
                                onChange={(e) => setEsasNo(e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Dosya No</Label>
                            <Input
                                placeholder="Esas / Talimat / Değişik İş / Takip / Soruşturma"
                                value={fileNo}
                                onChange={(e) => setFileNo(e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Ofis No</Label>
                            <Input
                                placeholder="NOM-001"
                                value={internalId}
                                onChange={(e) => setInternalId(e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>

                    {/* Court Selection */}
                    <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Mahkeme / Kurum</Label>
                        <Select value={courtId || '__none__'} onValueChange={(v) => setCourtId(v === '__none__' ? '' : v)}>
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Mahkeme seçin..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-48">
                                <SelectItem value="__none__" className="text-xs">—</SelectItem>
                                {courts.map((c) => (
                                    <SelectItem key={c.id} value={c.id} className="text-xs">
                                        {c.name}{c.city ? ` (${c.city})` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Separator className="my-2" />

                    {/* Parties Section */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <MaterialIcon icon="people" size={12} />
                                Taraflar
                            </Label>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 px-2 text-xs"
                                onClick={() => setShowPartyAdd(true)}
                            >
                                <MaterialIcon icon="add" size={12} className="mr-1" />
                                Ekle
                            </Button>
                        </div>
                        
                        {showPartyAdd && (
                            <div className="flex gap-2 animate-in fade-in slide-in-from-top-1">
                                <Select value={selectedPartyId} onValueChange={setSelectedPartyId}>
                                    <SelectTrigger className="h-8 text-xs flex-1">
                                        <SelectValue placeholder="Taraf seçin..." />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-48">
                                        {parties
                                            .filter(p => !linkedParties.some(lp => lp.party_id === p.id))
                                            .map((p) => (
                                                <SelectItem key={p.id} value={p.id} className="text-xs">
                                                    {p.full_name}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                                <Select value={selectedRole} onValueChange={setSelectedRole}>
                                    <SelectTrigger className="h-8 text-xs w-28">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {MATTER_PARTY_ROLES.map((r) => (
                                            <SelectItem key={r.value} value={r.value} className="text-xs">
                                                {r.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button size="sm" className="h-8 px-2" onClick={addPartyLink} disabled={!selectedPartyId}>
                                    <MaterialIcon icon="check" size={12} />
                                </Button>
                            </div>
                        )}

                        {/* Linked Parties - 60% opacity style */}
                        {linkedParties.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {linkedParties.map((link) => (
                                    <Badge
                                        key={link.party_id}
                                        variant={link.role === 'MÜVEKKİL' ? 'default' : 'secondary'}
                                        className="text-[10px] h-5 px-1.5 cursor-pointer hover:opacity-100 opacity-60 transition-opacity group"
                                    >
                                        <span className="truncate max-w-[80px]">
                                            {link.party?.full_name || 'Bilinmiyor'}
                                        </span>
                                        <span className="ml-1 opacity-50 text-[9px]">
                                            {MATTER_PARTY_ROLES.find(r => r.value === link.role)?.label || link.role}
                                        </span>
                                        <MaterialIcon
                                            icon="close"
                                            size={10}
                                            className="ml-1 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removePartyLink(link.party_id);
                                            }}
                                        />
                                    </Badge>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground/60 italic">Henüz taraf eklenmemiş</p>
                        )}
                    </div>

                    <Separator className="my-2" />

                    {/* Quick Tag Data Section */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <MaterialIcon icon="label" size={12} />
                                Ek Veriler
                            </Label>
                            <QuickTagPopover
                                entityType="MATTER"
                                rows={attributeRows}
                                onChange={setAttributeRows}
                                placeholder="Veri ekle"
                                trigger={
                                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                                        <MaterialIcon icon="add" size={12} className="mr-1" />
                                        Ekle
                                    </Button>
                                }
                            />
                        </div>
                        <TagRowBadges 
                            rows={attributeRows} 
                            maxDisplay={4}
                        />
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="sticky bottom-0 px-4 py-3 border-t bg-background/95 backdrop-blur flex justify-end gap-2">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                            setOpen(false);
                            onCancel?.();
                        }}
                        disabled={loading}
                    >
                        İptal
                    </Button>
                    <Button 
                        size="sm" 
                        onClick={handleSubmit}
                        disabled={loading || !title.trim()}
                        className="bg-primary text-primary-foreground"
                    >
                        {loading ? (
                            <MaterialIcon icon="hourglass_empty" size={14} className="mr-1 animate-spin" />
                        ) : (
                            <MaterialIcon icon={matter ? 'save' : 'add'} size={14} className="mr-1" />
                        )}
                        {matter ? 'Kaydet' : 'Oluştur'}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
};

export default MatterQuickPopover;
