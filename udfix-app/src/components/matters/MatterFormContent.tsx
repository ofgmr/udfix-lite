import React, { useState, useEffect, useCallback } from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Separator } from '../../components/ui/separator';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { QuickTagPopover, TagRowBadges } from '../../components/ui/QuickTagPopover';
import { ReadOnlyField } from '../../components/ui/ReadOnlyField';
import { toast } from 'sonner';
import {
    type Matter,
    type MatterMerci,
    type Party,
    type EntityAttributeUpsertRow,
    DataService,
    OFFICE_MATTER_PARTY_ROLES,
} from '../../services/dataService';
import {
    MATTER_MERCI_OPTIONS,
    MATTER_RECORD_TYPE_OPTIONS,
    inferRecordTypeFromLegacyCategory,
    isMatterRecordType,
    merciLabel,
    normalizeMatterMerci,
    recordTypeLabel,
} from '../../data/matterTaxonomy';
import { visibleMatterAttributeRows } from '../../utils/matterAttributeSearch';
import { MerciNameField } from './MerciNameField';
import { EntityFormPopoutButton } from '../layout/EntityFormPopoutButton';

export interface MatterFormContentProps {
    matter?: Matter | null;
    onSuccess?: () => void;
    onCancel?: () => void;
    panelApi?: IDockviewPanelProps['api'];
}

const STATUS_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
    OPEN: { color: 'bg-emerald-500', icon: 'circle', label: 'Açık' },
    CLOSED: { color: 'bg-gray-500', icon: 'check_circle', label: 'Kapalı' },
    ARCHIVED: { color: 'bg-amber-500', icon: 'archive', label: 'Arşiv' },
    APPEAL: { color: 'bg-blue-500', icon: 'gavel', label: 'İstinaf/Temyiz' },
};

const FILE_NO_KIND_LABELS: Record<'ESAS' | 'TALIMAT' | 'DEGISIK_IS' | 'TAKIP' | 'SORUSTURMA' | 'DIGER', string> = {
    ESAS: 'Esas',
    TALIMAT: 'Talimat',
    DEGISIK_IS: 'Değişik İş',
    TAKIP: 'Takip',
    SORUSTURMA: 'Soruşturma',
    DIGER: 'Diğer',
};

export const MatterFormContent: React.FC<MatterFormContentProps> = ({
    matter,
    onSuccess,
    onCancel,
    panelApi,
}) => {
    const isExisting = Boolean(matter?.id);
    const [isEditing, setIsEditing] = useState(!isExisting);
    const [loading, setLoading] = useState(false);
    const [parties, setParties] = useState<Party[]>([]);
    
    // Form state
    const [title, setTitle] = useState('');
    const [status, setStatus] = useState<Matter['status']>('OPEN');
    const [recordType, setRecordType] = useState<Matter['matter_type']>('LAW_CASE');
    const [merci, setMerci] = useState<MatterMerci | ''>('');
    const [merciName, setMerciName] = useState('');
    const [fileNoKind, setFileNoKind] = useState<'ESAS' | 'TALIMAT' | 'DEGISIK_IS' | 'TAKIP' | 'SORUSTURMA' | 'DIGER'>('ESAS');
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

    // Load data when opening
    useEffect(() => {
        const loadData = async () => {
            // Load parties
            const partiesList = await DataService.getParties().catch(() => []);
            setParties(Array.isArray(partiesList) ? partiesList : []);
            
            // If editing, load matter data
            if (matter?.id) {
                const fullMatter = await DataService.getMatter(matter.id);
                setTitle(matter.title || '');
                setStatus(matter.status || 'OPEN');
                const loadedMerci = normalizeMatterMerci(matter.matter_category);
                setMerci(loadedMerci);
                setRecordType(
                    isMatterRecordType(matter.matter_type)
                        ? matter.matter_type
                        : inferRecordTypeFromLegacyCategory(matter.matter_category, matter.matter_type),
                );
                setMerciName(matter.court_name?.trim() || '');
                const noValue = (matter.file_number || matter.esas_no || matter.dis_no || '').trim();
                setFileNo(noValue);
                if (matter.dis_no?.trim()) setFileNoKind('DEGISIK_IS');
                else if (matter.esas_no?.trim()) setFileNoKind('ESAS');
                else setFileNoKind('DIGER');
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
                setRecordType('LAW_CASE');
                setMerci('');
                setMerciName('');
                setFileNoKind('ESAS');
                setFileNo('');
                setInternalId('');
                setOpeningDate(new Date().toISOString().split('T')[0]);
                setLinkedParties([]);
                setAttributeRows([]);
            }
        };
        
        void loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate form when matter id changes, not every field edit
    }, [matter?.id]);

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
            const normalizedFileNo = fileNo.trim() || undefined;
            const normalizedEsasNo = fileNoKind === 'ESAS' ? normalizedFileNo : undefined;
            const normalizedDisNo = fileNoKind === 'DEGISIK_IS' ? normalizedFileNo : undefined;

            const payload: Partial<Matter> & { id: string } = {
                id: matterId,
                title: title.trim(),
                status,
                matter_type: recordType,
                matter_category: merci || undefined,
                court_name: merciName.trim() || undefined,
                court_id: null,
                esas_no: normalizedEsasNo,
                file_number: normalizedFileNo,
                dis_no: normalizedDisNo,
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
            onSuccess?.();
            
            if (!matter?.id) {
                onCancel?.(); // close panel if it was newly created
            } else {
                setIsEditing(false); // return to view mode
            }
        } catch (error) {
            console.error('Matter save error:', error);
            toast.error('Kaydederken hata oluştu');
        } finally {
            setLoading(false);
        }
    }, [matter, title, status, recordType, merci, merciName, fileNoKind, fileNo, internalId, openingDate, linkedParties, attributeRows, onSuccess, onCancel]);

    const handleDelete = useCallback(() => {
        if (!matter?.id) return;
        const matterId = matter.id;
        toast('Dosya silinsin mi?', {
            description: title || matter.title || 'Bu işlem geri alınamaz.',
            action: {
                label: 'Sil',
                onClick: () => {
                    void (async () => {
                        setLoading(true);
                        try {
                            await DataService.deleteMatter(matterId);
                            toast.success('Dosya silindi');
                            onSuccess?.();
                            onCancel?.();
                        } catch (error) {
                            console.error('Matter delete error:', error);
                            toast.error('Silme sırasında hata oluştu');
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
    }, [matter, title, onSuccess, onCancel]);

    const statusConfig = STATUS_CONFIG[status];
    const headerTitle = title.trim() || 'Dosya Başlığı';
    return (
        <div className="flex h-full min-h-0 flex-col bg-background overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 z-10 px-3 py-2 border-b bg-background/95 backdrop-blur flex items-center justify-between">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${statusConfig.color} shadow-sm shadow-${statusConfig.color}/50`} />
                        <h4 className="font-semibold text-xs flex items-center gap-1.5 tracking-wide text-primary/80 min-w-0">
                            <MaterialIcon icon={isEditing ? (matter ? "edit" : "post_add") : "folder"} className="text-primary" size={14} />
                            {isEditing ? (
                                <Input
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Dosya başlığı"
                                    className="h-7 text-xs glass-input min-w-[220px]"
                                    autoFocus={!isExisting}
                                />
                            ) : (
                                <span className="truncate">{headerTitle}</span>
                            )}
                        </h4>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {!isEditing && (
                            <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)} className="h-6 text-[10px] px-2">
                                <MaterialIcon icon="edit" size={12} className="mr-1" />
                                Düzenle
                            </Button>
                        )}
                        <Select value={status} onValueChange={(v) => setStatus(v as Matter['status'])} disabled={!isEditing}>
                            <SelectTrigger className="h-6 w-32 text-[10px] border-white/5 bg-white/5 focus:ring-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="glass">
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
                </div>

                {!isEditing ? (
                    <div className="p-3 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <ReadOnlyField
                                label="Kayıt Türü"
                                value={recordTypeLabel(recordType)}
                                icon="category"
                            />
                            <ReadOnlyField
                                label="Merci"
                                value={merciLabel(merci)}
                                icon="account_balance"
                            />
                        </div>
                        {merciName ? (
                            <ReadOnlyField label="Merci Adı" value={merciName} icon="location_city" />
                        ) : null}

                        <div className="grid grid-cols-3 gap-3">
                            <ReadOnlyField label="No Türü" value={FILE_NO_KIND_LABELS[fileNoKind]} icon="sell" />
                            <ReadOnlyField label="Dosya No" value={fileNo || '—'} icon="tag" />
                            <ReadOnlyField label="Ofis No" value={internalId || '—'} icon="tag" />
                        </div>

                        <Separator className="my-1 border-white/5" />
                        
                        {/* Parties Section */}
                        <div className="space-y-2">
                            <Label className="text-[9px] text-muted-foreground uppercase tracking-widest flex items-center gap-1 opacity-70">
                                <MaterialIcon icon="people" size={10} />
                                Taraflar
                            </Label>
                            
                            {linkedParties.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                    {linkedParties.map((link) => (
                                        <Badge
                                            key={link.party_id}
                                            variant="outline"
                                            className={`text-[10px] h-5 px-1.5 cursor-copy hover:opacity-100 transition-opacity border ${
                                                link.role === 'MÜVEKKİL'
                                                    ? 'bg-primary/15 text-primary border-primary/30'
                                                    : 'bg-white/5 text-foreground border-white/10'
                                            }`}
                                            onClick={() => {
                                                navigator.clipboard.writeText(link.party?.full_name || '');
                                                toast.success('Kopyalandı', { position: 'bottom-center' });
                                            }}
                                            title="Kopyalamak için tıklayın"
                                        >
                                            <span className="truncate max-w-[120px] font-medium text-foreground">
                                                {link.party?.full_name || 'Bilinmiyor'}
                                            </span>
                                            <span className="ml-1 opacity-50 text-[9px] font-normal tracking-wide">
                                                {OFFICE_MATTER_PARTY_ROLES.find(r => r.value === link.role)?.label || link.role}
                                            </span>
                                        </Badge>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground/60 italic">Henüz taraf eklenmemiş</p>
                            )}
                        </div>

                        {visibleMatterAttributeRows(attributeRows).length > 0 && <Separator className="my-1 border-white/5" />}

                        {visibleMatterAttributeRows(attributeRows).length > 0 && (
                            <div className="space-y-2">
                                <Label className="text-[9px] text-muted-foreground uppercase tracking-widest flex items-center gap-1 opacity-70">
                                    <MaterialIcon icon="label" size={10} />
                                    Ek Veriler
                                </Label>
                                <div className="space-y-1.5">
                                    {visibleMatterAttributeRows(attributeRows).map((a, i) => (
                                        <ReadOnlyField key={i} label={a.tag_key || '—'} value={a.tag_value} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                <div className="p-3 space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <Label className="text-[9px] text-muted-foreground uppercase tracking-widest opacity-80">
                                Kayıt Türü
                            </Label>
                            <Select
                                value={recordType}
                                onValueChange={(v) => setRecordType(v as Matter['matter_type'])}
                            >
                                <SelectTrigger className="h-7 text-xs glass-input py-0">
                                    <SelectValue placeholder="Seçin" />
                                </SelectTrigger>
                                <SelectContent className="glass">
                                    {MATTER_RECORD_TYPE_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[9px] text-muted-foreground uppercase tracking-widest opacity-80">
                                Merci
                            </Label>
                            <Select
                                value={merci || '__none__'}
                                onValueChange={(v) => {
                                    const next = v === '__none__' ? '' : (v as MatterMerci);
                                    setMerci(next);
                                    if (next !== merci) setMerciName('');
                                }}
                            >
                                <SelectTrigger className="h-7 text-xs glass-input py-0">
                                    <SelectValue placeholder="Seçin" />
                                </SelectTrigger>
                                <SelectContent className="glass">
                                    <SelectItem value="__none__" className="text-xs">
                                        —
                                    </SelectItem>
                                    {MATTER_MERCI_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <MerciNameField
                        merci={merci}
                        value={merciName}
                        onChange={setMerciName}
                        disabled={!merci}
                    />

                    {/* Numbers Row */}
                    <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                            <Label className="text-[9px] text-muted-foreground uppercase tracking-widest opacity-80">No Türü</Label>
                            <Select value={fileNoKind} onValueChange={(v) => setFileNoKind(v as typeof fileNoKind)}>
                                <SelectTrigger className="h-7 text-xs glass-input py-0">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="glass">
                                    {Object.entries(FILE_NO_KIND_LABELS).map(([value, label]) => (
                                        <SelectItem key={value} value={value} className="text-xs">
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[9px] text-muted-foreground uppercase tracking-widest opacity-80">Dosya No</Label>
                            <Input
                                placeholder="Esas / Talimat / Değişik İş / Takip / Soruşturma"
                                value={fileNo}
                                onChange={(e) => setFileNo(e.target.value)}
                                className="h-7 text-xs glass-input"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[9px] text-muted-foreground uppercase tracking-widest opacity-80">Ofis No</Label>
                            <Input
                                placeholder="NOM-001"
                                value={internalId}
                                onChange={(e) => setInternalId(e.target.value)}
                                className="h-7 text-xs glass-input"
                            />
                        </div>
                    </div>

                    <Separator className="my-1 border-white/5" />

                    {/* Parties Section */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label className="text-[9px] text-muted-foreground uppercase tracking-widest flex items-center gap-1 opacity-80">
                                <MaterialIcon icon="people" size={10} />
                                Taraflar
                            </Label>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-5 px-1.5 text-[9px] uppercase tracking-wider"
                                onClick={() => setShowPartyAdd(true)}
                            >
                                <MaterialIcon icon="add" size={10} className="mr-0.5" />
                                Ekle
                            </Button>
                        </div>
                        
                        {showPartyAdd && (
                            <div className="flex gap-1.5 animate-in fade-in slide-in-from-top-1">
                                <Select value={selectedPartyId} onValueChange={setSelectedPartyId}>
                                    <SelectTrigger className="h-7 text-[10px] flex-1 glass-input py-0">
                                        <SelectValue placeholder="Taraf seçin..." />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-48 glass">
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
                                    <SelectTrigger className="h-7 text-[10px] w-24 glass-input py-0">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="glass">
                                        {OFFICE_MATTER_PARTY_ROLES.map((r) => (
                                            <SelectItem key={r.value} value={r.value} className="text-xs">
                                                {r.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button size="sm" className="h-7 px-2 glass-input border-white/10" onClick={addPartyLink} disabled={!selectedPartyId}>
                                    <MaterialIcon icon="check" size={12} className="text-primary" />
                                </Button>
                            </div>
                        )}

                        {/* Linked Parties */}
                        {linkedParties.length > 0 ? (
                            <div className="flex flex-wrap gap-1 p-1.5 bg-white/5 border border-white/10 rounded min-h-[36px]">
                                {linkedParties.map((link) => (
                                    <Badge
                                        key={link.party_id}
                                        variant="outline"
                                        className={`text-[10px] h-5 px-1.5 cursor-pointer hover:opacity-100 opacity-80 transition-opacity group border ${
                                            link.role === 'MÜVEKKİL'
                                                ? 'bg-primary/15 text-primary border-primary/30'
                                                : 'bg-white/5 text-foreground border-white/10'
                                        }`}
                                    >
                                        <span className="truncate max-w-[80px]">
                                            {link.party?.full_name || 'Bilinmiyor'}
                                        </span>
                                        <span className="ml-1 opacity-50 text-[8px]">
                                            {OFFICE_MATTER_PARTY_ROLES.find(r => r.value === link.role)?.label || link.role}
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
                            <div className="bg-white/5 border border-white/10 rounded p-1.5 min-h-[36px]">
                                <p className="text-[10px] text-muted-foreground/60 italic text-center py-1">Henüz taraf eklenmemiş</p>
                            </div>
                        )}
                    </div>

                    <Separator className="my-1 border-white/5" />

                    {/* Quick Tag Data Section */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label className="text-[9px] text-muted-foreground uppercase tracking-widest flex items-center gap-1 opacity-80">
                                <MaterialIcon icon="label" size={10} />
                                Ek Veriler
                            </Label>
                            <QuickTagPopover
                                entityType="MATTER"
                                rows={attributeRows}
                                onChange={setAttributeRows}
                                placeholder="Veri ekle"
                                trigger={
                                    <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[9px] uppercase tracking-wider">
                                        <MaterialIcon icon="add" size={10} className="mr-0.5" />
                                        Ekle
                                    </Button>
                                }
                            />
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded p-1.5 min-h-[36px]">
                            {attributeRows.length === 0 ? (
                                <p className="text-[10px] text-muted-foreground/60 italic text-center py-1">Henüz ek veri eklenmemiş</p>
                            ) : (
                                <TagRowBadges 
                                    rows={attributeRows} 
                                    maxDisplay={4}
                                />
                            )}
                        </div>
                    </div>
                </div>
                )}

                {isEditing && (
                    <div className="sticky bottom-0 px-3 py-2 border-t bg-background/95 backdrop-blur flex justify-end gap-2 mt-auto">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 px-2 text-[10px]"
                            onClick={() => {
                                if (!isExisting) onCancel?.();
                                else setIsEditing(false);
                            }}
                            disabled={loading}
                        >
                            {isExisting ? 'Vazgeç' : 'İptal'}
                        </Button>
                        <Button 
                            size="sm" 
                            onClick={handleSubmit}
                            disabled={loading || !title.trim()}
                            className="h-7 px-3 text-[10px] bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                        >
                            {loading ? (
                                <MaterialIcon icon="hourglass_empty" size={14} className="mr-1 animate-spin" />
                            ) : (
                                <MaterialIcon icon={matter ? 'save' : 'post_add'} size={14} className="mr-1" />
                            )}
                            {matter ? 'Kaydet' : 'Oluştur'}
                        </Button>
                    </div>
                )}
        </div>
    );
};

export default MatterFormContent;
