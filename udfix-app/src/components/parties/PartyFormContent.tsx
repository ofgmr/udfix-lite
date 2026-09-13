import React, { useState, useEffect, useCallback } from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Checkbox } from '../../components/ui/checkbox';
import { Separator } from '../../components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { QuickTagPopover, TagRowBadges } from '../../components/ui/QuickTagPopover';
import { ReadOnlyField } from '../../components/ui/ReadOnlyField';
import { toast } from 'sonner';
import {
    type Party,
    type PartyKind,
    type Matter,
    type NoteSummary,
    type EntityAttributeUpsertRow,
    DataService,
} from '../../services/dataService';
import { isPartyAddressTagKey, getPartyAddressTagLabel } from '../../data/uyap/partyAddressTagCatalog';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { cn } from '../../lib/utils';
import { EntityFormPopoutButton } from '../layout/EntityFormPopoutButton';
import { useClientReportUiStore } from '../../stores/useClientReportUiStore';

export interface PartyFormContentProps {
    party?: Party | null;
    onSuccess?: () => void;
    onCancel?: () => void;
    panelApi?: IDockviewPanelProps['api'];
}

const PARTY_KIND_LABELS: Record<string, string> = {
    KISI: 'Kişi',
    KURUM: 'Kurum',
};

function getPartyKindFromRow(party?: Party | null): PartyKind {
    if (party?.party_kind === 'KISI' || party?.party_kind === 'KURUM') return party.party_kind;
    return party?.type === 'CORPORATE' ? 'KURUM' : 'KISI';
}

function getPartyTypeFromKind(partyKind: PartyKind): Party['type'] {
    return partyKind === 'KURUM' ? 'CORPORATE' : 'INDIVIDUAL';
}

function matterLabel(m: Matter): string {
    return (m.title || m.internal_id || m.file_number || 'Dava').trim();
}

function noteTitle(n: NoteSummary): string {
    const t = (n.title || '').trim();
    return t || 'Başlıksız Not';
}

export const PartyFormContent: React.FC<PartyFormContentProps> = ({
    party,
    onSuccess,
    onCancel,
    panelApi,
}) => {
    const openMatterFormFloating = useLayoutStore((s) => s.openMatterFormFloating);
    const openNote = useLayoutStore((s) => s.openNote);
    const isExisting = Boolean(party?.id);
    const [isEditing, setIsEditing] = useState(!isExisting);
    const [loading, setLoading] = useState(false);

    const [relatedMatters, setRelatedMatters] = useState<Matter[]>([]);
    const [relatedNotes, setRelatedNotes] = useState<NoteSummary[]>([]);
    const [relatedLoading, setRelatedLoading] = useState(false);
    const [mattersOpen, setMattersOpen] = useState(false);
    const [notesOpen, setNotesOpen] = useState(false);
    const openClientReport = useClientReportUiStore((s) => s.openReport);

    // Core fields
    const [fullName, setFullName] = useState('');
    const [partyKind, setPartyKind] = useState<PartyKind>('KISI');
    const [idNumber, setIdNumber] = useState('');
    const [taxOffice, setTaxOffice] = useState('');
    const [isClient, setIsClient] = useState(true);
    
    // Contact - single inputs for primary
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    
    // Addresses as tag-based system
    const [addressRows, setAddressRows] = useState<EntityAttributeUpsertRow[]>([]);
    
    // Additional data
    const [attributeRows, setAttributeRows] = useState<EntityAttributeUpsertRow[]>([]);

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
            if (party?.id) {
                setFullName(party.full_name || '');
                setPartyKind(getPartyKindFromRow(party));
                setIdNumber(party.id_number || '');
                setTaxOffice(party.tax_office || '');
                setIsClient(party.is_client ?? true);
                setEmail(party.email || '');
                setPhone(party.phone || '');
                
                // Load attributes
                const attrs = await DataService.getEntityAttributes('PARTY', party.id);
                
                // Separate addresses from other attributes
                const addresses = attrs.filter((a) => isPartyAddressTagKey(a.tag_key));
                const others = attrs.filter((a) => !isPartyAddressTagKey(a.tag_key));
                
                setAddressRows(addresses.map((a, i) => ({
                    tag_key: a.tag_key,
                    tag_value: a.tag_value,
                    sort_order: a.sort_order ?? i,
                })));
                
                setAttributeRows(others.map((a, i) => ({
                    tag_key: a.tag_key,
                    tag_value: a.tag_value,
                    sort_order: a.sort_order ?? i,
                })));
            } else {
                // New party defaults
                setFullName('');
                setPartyKind('KISI');
                setIdNumber('');
                setTaxOffice('');
                setIsClient(true);
                setEmail('');
                setPhone('');
                setAddressRows([]);
                setAttributeRows([]);
            }
        };
        
        void loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate form when party id changes, not every field edit
    }, [party?.id]);

    useEffect(() => {
        if (!party?.id || isEditing) {
            setRelatedMatters([]);
            setRelatedNotes([]);
            setRelatedLoading(false);
            setMattersOpen(false);
            setNotesOpen(false);
            return;
        }

        setMattersOpen(false);
        setNotesOpen(false);
        let cancelled = false;
        setRelatedLoading(true);
        void Promise.all([
            DataService.getMatters({ party_id: party.id }).catch(() => [] as Matter[]),
            DataService.getPartyRelatedNotes(party.id, 50).catch(() => [] as NoteSummary[]),
        ])
            .then(([matters, notes]) => {
                if (cancelled) return;
                setRelatedMatters(Array.isArray(matters) ? matters : []);
                setRelatedNotes(Array.isArray(notes) ? notes : []);
            })
            .finally(() => {
                if (!cancelled) setRelatedLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [party?.id, isEditing]);

    const handleSubmit = useCallback(async () => {
        if (!fullName.trim()) {
            toast.error('Ad soyad / ünvan gerekli');
            return;
        }
        
        setLoading(true);
        try {
            const partyId = party?.id || crypto.randomUUID();
            
            // Merge all attributes (addresses + others)
            const allAttributes: EntityAttributeUpsertRow[] = [
                ...addressRows,
                ...attributeRows,
            ].map((row, i) => ({ ...row, sort_order: i }));
            
            // Build metadata from attributes
            const metadata: Record<string, string> = {};
            for (const row of allAttributes) {
                if (row.tag_key && row.tag_value) {
                    metadata[row.tag_key] = row.tag_value;
                }
            }
            
            const payload: Partial<Party> & { id: string } = {
                id: partyId,
                full_name: fullName.trim(),
                type: getPartyTypeFromKind(partyKind),
                party_kind: partyKind,
                id_number: idNumber.trim() || undefined,
                tax_office: taxOffice.trim() || undefined,
                is_client: isClient,
                email: email.trim() || undefined,
                phone: phone.trim() || undefined,
                metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : undefined,
            };
            
            // Save party
            if (party?.id) {
                await DataService.updateParty({ ...party, ...payload } as Party);
            } else {
                await DataService.addParty(payload);
            }
            
            // Save all attributes
            await DataService.upsertEntityAttributes({
                entity_type: 'PARTY',
                entity_id: partyId,
                rows: allAttributes,
            });
            
            toast.success(party ? 'Taraf güncellendi' : 'Taraf oluşturuldu');
            onSuccess?.();
            
            if (!party?.id) {
                onCancel?.(); // close panel if it was newly created
            } else {
                setIsEditing(false); // return to view mode
            }
        } catch (error) {
            console.error('Party save error:', error);
            toast.error('Kaydederken hata oluştu');
        } finally {
            setLoading(false);
        }
    }, [party, fullName, partyKind, idNumber, taxOffice, isClient, email, phone, addressRows, attributeRows, onSuccess, onCancel]);

    const getTagLabel = (key: string) => getPartyAddressTagLabel(key);
    const isPersonKind = partyKind === 'KISI';
    const nameFieldLabel = isPersonKind ? 'Ad Soyad' : 'Kurum Ünvanı';
    const namePlaceholder = isPersonKind ? 'Tam ad' : 'Ticari ünvan';
    const headerName = fullName.trim() || nameFieldLabel;
    const handleDelete = useCallback(() => {
        if (!party?.id) return;
        const partyId = party.id;
        toast('Kişi silinsin mi?', {
            description: fullName || party.full_name || 'Bu işlem geri alınamaz.',
            action: {
                label: 'Sil',
                onClick: () => {
                    void (async () => {
                        setLoading(true);
                        try {
                            await DataService.deleteParty(partyId);
                            toast.success('Kişi silindi');
                            onSuccess?.();
                            onCancel?.();
                        } catch (error) {
                            console.error('Party delete error:', error);
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
    }, [party, fullName, onSuccess, onCancel]);

    return (
        <div className="flex h-full min-h-0 flex-col bg-background overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 z-10 px-4 py-3 border-b bg-background/95 backdrop-blur flex items-center justify-between">
                    <h4 className="font-medium text-sm flex flex-1 items-center gap-2 min-w-0">
                        <MaterialIcon icon={isEditing ? (party ? "edit" : "person_add") : "person"} className="text-primary" size={18} />
                        {isEditing ? (
                            <Input
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder={namePlaceholder}
                                className="h-7 text-xs glass-input min-w-[220px]"
                                autoFocus={!isExisting}
                            />
                        ) : (
                            <span className="truncate">{headerName}</span>
                        )}
                    </h4>
                    <div className="flex shrink-0 items-center gap-2">
                        {!isEditing && (
                            <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}>
                                <MaterialIcon icon="edit" size={14} className="mr-1" />
                                Düzenle
                            </Button>
                        )}
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="is_client"
                                checked={isClient}
                                disabled={!isEditing}
                                onCheckedChange={(c) => setIsClient(c === true)}
                                className="h-4 w-4"
                            />
                            <Label htmlFor="is_client" className={`text-xs ${isEditing ? 'cursor-pointer' : 'cursor-default'}`}>
                                Müvekkil
                            </Label>
                        </div>
                        {isExisting && (
                            <div className="flex items-stretch gap-1">
                                <EntityFormPopoutButton panelApi={panelApi} disabled={loading} />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-[32px] w-6 rounded-sm bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive border border-transparent hover:border-destructive/30 transition-colors"
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
                    <div className="p-4 space-y-5">
                        <div className="grid grid-cols-1 gap-3">
                            <ReadOnlyField label="Taraf Tipi" value={PARTY_KIND_LABELS[partyKind]} icon="category" />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <ReadOnlyField label="TCKN / VKN" value={idNumber} icon="badge" />
                            <ReadOnlyField label="Vergi Dairesi" value={taxOffice} icon="account_balance" />
                        </div>

                        {(email || phone) && <Separator className="my-1 border-white/5" />}
                        
                        <div className="grid grid-cols-2 gap-3">
                            <ReadOnlyField label="E-posta" value={email} icon="email" />
                            <ReadOnlyField label="Telefon" value={phone} icon="call" />
                        </div>

                        {addressRows.length > 0 && <Separator className="my-1 border-white/5" />}
                        
                        {addressRows.length > 0 && (
                            <div className="space-y-2">
                                <Label className="text-[9px] text-muted-foreground uppercase tracking-widest flex items-center gap-1 opacity-70">
                                    <MaterialIcon icon="home" size={10} />
                                    Adresler
                                </Label>
                                <div className="space-y-1.5">
                                    {addressRows.map((a, i) => (
                                        <ReadOnlyField key={i} label={getTagLabel(a.tag_key || '')} value={a.tag_value} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {attributeRows.length > 0 && <Separator className="my-1 border-white/5" />}

                        {attributeRows.length > 0 && (
                            <div className="space-y-2">
                                <Label className="text-[9px] text-muted-foreground uppercase tracking-widest flex items-center gap-1 opacity-70">
                                    <MaterialIcon icon="info" size={10} />
                                    Ek Veriler
                                </Label>
                                <div className="space-y-1.5">
                                    {attributeRows.map((a, i) => (
                                        <ReadOnlyField key={i} label={a.tag_key || '—'} value={a.tag_value} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {(relatedLoading || relatedMatters.length > 0 || relatedNotes.length > 0) && (
                            <Separator className="my-1 border-white/5" />
                        )}

                        {relatedLoading ? (
                            <div className="text-[11px] text-muted-foreground italic animate-pulse">
                                İlişkili kayıtlar getiriliyor…
                            </div>
                        ) : (
                            <>
                                {relatedMatters.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex w-full items-center justify-between gap-2">
                                        <button
                                            type="button"
                                            className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md py-0.5 text-left hover:bg-white/5 transition-colors"
                                            onClick={() => setMattersOpen((open) => !open)}
                                            aria-expanded={mattersOpen}
                                        >
                                            <Label className="text-[9px] text-muted-foreground uppercase tracking-widest flex items-center gap-1 opacity-70 cursor-pointer">
                                                <MaterialIcon icon="gavel" size={10} />
                                                İlişkili dosyalar ({relatedMatters.length})
                                            </Label>
                                            <MaterialIcon
                                                icon="expand_more"
                                                size={18}
                                                className={cn(
                                                    'shrink-0 text-muted-foreground transition-transform',
                                                    mattersOpen && 'rotate-180'
                                                )}
                                            />
                                        </button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 shrink-0 px-2 text-[10px]"
                                            onClick={() => {
                                                if (party?.id) openClientReport(party.id, fullName || party.full_name);
                                            }}
                                        >
                                            <MaterialIcon icon="download" size={12} className="mr-1" />
                                            Rapor (CSV)
                                        </Button>
                                        </div>
                                        {mattersOpen && (
                                            <ul className="flex flex-col gap-1">
                                                {relatedMatters.map((m) => (
                                                    <li key={m.id}>
                                                        <button
                                                            type="button"
                                                            className="flex w-full items-center gap-2 rounded-md border border-white/5 bg-black/15 px-2 py-1.5 text-left text-[11px] hover:border-primary/25 hover:bg-primary/10"
                                                            onClick={() => openMatterFormFloating(m)}
                                                        >
                                                            <MaterialIcon icon="gavel" size={14} className="text-primary/70 shrink-0" />
                                                            <span className="truncate font-medium">{matterLabel(m)}</span>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}

                                {relatedNotes.length > 0 && (
                                    <div className="space-y-2">
                                        <button
                                            type="button"
                                            className="flex w-full items-center justify-between gap-2 rounded-md py-0.5 text-left hover:bg-white/5 transition-colors"
                                            onClick={() => setNotesOpen((open) => !open)}
                                            aria-expanded={notesOpen}
                                        >
                                            <Label className="text-[9px] text-muted-foreground uppercase tracking-widest flex items-center gap-1 opacity-70 cursor-pointer">
                                                <MaterialIcon icon="edit_note" size={10} />
                                                Son notlar ({relatedNotes.length})
                                            </Label>
                                            <MaterialIcon
                                                icon="expand_more"
                                                size={18}
                                                className={cn(
                                                    'shrink-0 text-muted-foreground transition-transform',
                                                    notesOpen && 'rotate-180'
                                                )}
                                            />
                                        </button>
                                        {notesOpen && (
                                            <ul className="flex flex-col gap-1">
                                                {relatedNotes.map((n) => (
                                                    <li key={n.id}>
                                                        <button
                                                            type="button"
                                                            className="flex w-full items-start gap-2 rounded-md border border-white/5 bg-black/15 px-2 py-1.5 text-left text-[11px] hover:border-primary/25 hover:bg-primary/10"
                                                            onClick={() => openNote(n.id, noteTitle(n))}
                                                        >
                                                            <MaterialIcon icon="edit_note" size={14} className="text-primary/70 shrink-0 mt-0.5" />
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block truncate font-medium">{noteTitle(n)}</span>
                                                                {n.content_preview?.trim() && (
                                                                    <span className="block truncate text-[10px] text-muted-foreground mt-0.5">
                                                                        {n.content_preview.trim()}
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ) : (
                <div className="p-3 space-y-4">
                    {/* Party Kind */}
                    <div className="space-y-1">
                        <Label className="text-[9px] text-muted-foreground uppercase tracking-widest opacity-80">Taraf Tipi</Label>
                        <ToggleGroup
                            type="single"
                            value={partyKind}
                            onValueChange={(v) => {
                                if (v === 'KISI' || v === 'KURUM') setPartyKind(v);
                            }}
                            className="grid grid-cols-2 gap-2"
                        >
                            <ToggleGroupItem value="KISI" className="h-7 text-xs glass-input data-[state=on]:border-primary/40">
                                Kişi
                            </ToggleGroupItem>
                            <ToggleGroupItem value="KURUM" className="h-7 text-xs glass-input data-[state=on]:border-primary/40">
                                Kurum
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </div>

                    {/* ID Info Row */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <Label className="text-[9px] text-muted-foreground uppercase tracking-widest opacity-80">
                                {isPersonKind ? 'TCKN' : 'VKN'}
                            </Label>
                            <Input
                                placeholder={isPersonKind ? '12345678901' : '1234567890'}
                                value={idNumber}
                                onChange={(e) => setIdNumber(e.target.value)}
                                className="h-7 text-xs glass-input"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[9px] text-muted-foreground uppercase tracking-widest opacity-80">
                                Vergi Dairesi{isPersonKind ? ' (opsiyonel)' : ''}
                            </Label>
                            <Input
                                placeholder="Beyoğlu V.D."
                                value={taxOffice}
                                onChange={(e) => setTaxOffice(e.target.value)}
                                className="h-7 text-xs glass-input"
                            />
                        </div>
                    </div>

                    <Separator className="my-1 border-white/5" />

                    {/* Contact */}
                    <div className="space-y-1.5">
                        <Label className="text-[9px] text-muted-foreground uppercase tracking-widest flex items-center gap-1 opacity-80">
                            <MaterialIcon icon="contact_mail" size={10} />
                            İletişim
                        </Label>
                        <div className="space-y-1.5">
                            <Input
                                placeholder="E-posta"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="h-7 text-xs glass-input"
                            />
                            <Input
                                placeholder="Telefon"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="h-7 text-xs glass-input"
                            />
                        </div>
                    </div>

                    <Separator className="my-1 border-white/5" />

                    {/* Addresses - Tag Based System */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label className="text-[9px] text-muted-foreground uppercase tracking-widest flex items-center gap-1 opacity-80">
                                <MaterialIcon icon="location_on" size={10} />
                                Adresler
                            </Label>
                            <QuickTagPopover
                                entityType="PARTY"
                                rows={addressRows}
                                onChange={setAddressRows}
                                placeholder="Adres ekle"
                                trigger={
                                    <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[9px] uppercase tracking-wider">
                                        <MaterialIcon icon="add" size={10} className="mr-0.5" />
                                        Ekle
                                    </Button>
                                }
                            />
                        </div>

                        {addressRows.length > 0 ? (
                            <div className="space-y-1">
                                {addressRows.map((row, idx) => (
                                    <div
                                        key={idx}
                                        className="group flex items-start gap-1.5 p-1.5 text-xs border border-white/10 rounded bg-white/5 opacity-80 hover:opacity-100 hover:bg-white/10 cursor-pointer transition-all duration-150"
                                        onClick={() => {
                                            navigator.clipboard.writeText(row.tag_value);
                                            toast.success('Adres kopyalandı');
                                        }}
                                    >
                                        <span className="font-medium text-muted-foreground shrink-0 pt-0.5">
                                            {getTagLabel(row.tag_key)}:
                                        </span>
                                        <span className="flex-1 line-clamp-2">{row.tag_value}</span>
                                        <MaterialIcon
                                            icon="close"
                                            size={12}
                                            className="opacity-0 group-hover:opacity-100 hover:text-destructive shrink-0 mt-0.5"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setAddressRows(prev => prev.filter((_, i) => i !== idx));
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-[10px] text-muted-foreground/60 italic text-center py-1">Henüz adres eklenmemiş</p>
                        )}
                    </div>

                    <Separator className="my-1 border-white/5" />

                    {/* Additional Data */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label className="text-[9px] text-muted-foreground uppercase tracking-widest flex items-center gap-1 opacity-80">
                                <MaterialIcon icon="label" size={10} />
                                Ek Veriler
                            </Label>
                            <QuickTagPopover
                                entityType="PARTY"
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
                        <TagRowBadges 
                            rows={attributeRows} 
                            maxDisplay={4}
                        />
                    </div>
                </div>
                )}

                {isEditing && (
                    <div className="sticky bottom-0 px-3 py-2 border-t bg-background/95 backdrop-blur flex justify-end gap-2 mt-auto">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-[10px] px-2"
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
                            disabled={loading || !fullName.trim()}
                            className="bg-primary text-primary-foreground shadow-lg shadow-primary/20 h-7 text-[10px] px-3"
                        >
                            {loading ? (
                                <MaterialIcon icon="hourglass_empty" size={12} className="mr-1 animate-spin" />
                            ) : (
                                <MaterialIcon icon={party ? 'save' : 'add'} size={12} className="mr-1" />
                            )}
                            {party ? 'Kaydet' : 'Oluştur'}
                        </Button>
                    </div>
                )}
        </div>
    );
};

export default PartyFormContent;
