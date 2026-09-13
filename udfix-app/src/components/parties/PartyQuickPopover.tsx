import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Checkbox } from '../../components/ui/checkbox';
import { Separator } from '../../components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { QuickTagPopover, TagRowBadges } from '../../components/ui/QuickTagPopover';
import { toast } from 'sonner';
import {
    type Party,
    type PartyKind,
    type EntityAttributeUpsertRow,
    DataService,
} from '../../services/dataService';
import { isPartyAddressTagKey, getPartyAddressTagLabel } from '../../data/uyap/partyAddressTagCatalog';
import { UyapAdresQuickPickStrip } from '../uyap/UyapAdresQuickPickStrip';

interface PartyQuickPopoverProps {
    party?: Party | null;
    children?: React.ReactNode;
    onSuccess?: () => void;
    onCancel?: () => void;
}

function getPartyKindFromRow(party?: Party | null): PartyKind {
    if (party?.party_kind === 'KISI' || party?.party_kind === 'KURUM') return party.party_kind;
    return party?.type === 'CORPORATE' ? 'KURUM' : 'KISI';
}

function getPartyTypeFromKind(partyKind: PartyKind): Party['type'] {
    return partyKind === 'KURUM' ? 'CORPORATE' : 'INDIVIDUAL';
}

export const PartyQuickPopover: React.FC<PartyQuickPopoverProps> = ({
    party,
    children,
    onSuccess,
    onCancel,
}) => {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

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

    // Load data when opening
    useEffect(() => {
        if (!open) return;
        
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
    }, [open, party]);

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
            setOpen(false);
            onSuccess?.();
        } catch (error) {
            console.error('Party save error:', error);
            toast.error('Kaydederken hata oluştu');
        } finally {
            setLoading(false);
        }
    }, [party, fullName, partyKind, idNumber, taxOffice, isClient, email, phone, addressRows, attributeRows, onSuccess]);

    const getTagLabel = (key: string) => getPartyAddressTagLabel(key);
    const isPersonKind = partyKind === 'KISI';
    const nameFieldLabel = isPersonKind ? 'Ad Soyad' : 'Kurum Ünvanı';
    const namePlaceholder = isPersonKind ? 'Tam ad' : 'Ticari ünvan';

    return (
        <Popover open={open} onOpenChange={setOpen} modal={true}>
            <PopoverTrigger asChild>
                {children || (
                    <Button variant="outline" size="sm">
                        <MaterialIcon icon={party ? 'edit' : 'person_add'} size={14} className="mr-1" />
                        {party ? 'Düzenle' : 'Yeni Taraf'}
                    </Button>
                )}
            </PopoverTrigger>
            <PopoverContent
                className="w-80 p-0 max-h-[80vh] overflow-y-auto"
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
                    <h4 className="font-medium text-sm">
                        {party ? 'Tarafı Düzenle' : 'Yeni Taraf'}
                    </h4>
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="is_client"
                            checked={isClient}
                            onCheckedChange={(c) => setIsClient(c === true)}
                            className="h-4 w-4"
                        />
                        <Label htmlFor="is_client" className="text-xs cursor-pointer">
                            Müvekkil
                        </Label>
                    </div>
                </div>

                <div className="p-4 space-y-4">
                    {/* Name - Primary Field */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">{nameFieldLabel}</Label>
                        <Input
                            placeholder={namePlaceholder}
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="h-9"
                            autoFocus
                        />
                    </div>

                    {/* Party Kind */}
                    <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Taraf Tipi</Label>
                        <ToggleGroup
                            type="single"
                            value={partyKind}
                            onValueChange={(v) => {
                                if (v === 'KISI' || v === 'KURUM') setPartyKind(v);
                            }}
                            className="grid grid-cols-2 gap-2"
                        >
                            <ToggleGroupItem value="KISI" className="h-8 text-xs data-[state=on]:border-primary/40">
                                Kişi
                            </ToggleGroupItem>
                            <ToggleGroupItem value="KURUM" className="h-8 text-xs data-[state=on]:border-primary/40">
                                Kurum
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </div>

                    {/* ID Info Row */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">
                                {isPersonKind ? 'TCKN' : 'VKN'}
                            </Label>
                            <Input
                                placeholder={isPersonKind ? '12345678901' : '1234567890'}
                                value={idNumber}
                                onChange={(e) => setIdNumber(e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">
                                Vergi Dairesi{isPersonKind ? ' (opsiyonel)' : ''}
                            </Label>
                            <Input
                                placeholder="Beyoğlu V.D."
                                value={taxOffice}
                                onChange={(e) => setTaxOffice(e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>

                    <Separator className="my-2" />

                    {/* Contact */}
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <MaterialIcon icon="contact_mail" size={12} />
                            İletişim
                        </Label>
                        <div className="space-y-2">
                            <Input
                                placeholder="E-posta"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="h-8 text-xs"
                            />
                            <Input
                                placeholder="Telefon"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>

                    <Separator className="my-2" />

                    {/* Addresses - Tag Based System */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <MaterialIcon icon="location_on" size={12} />
                                Adresler
                            </Label>
                            <QuickTagPopover
                                entityType="PARTY"
                                rows={addressRows}
                                onChange={setAddressRows}
                                placeholder="Adres ekle"
                                trigger={
                                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                                        <MaterialIcon icon="add" size={12} className="mr-1" />
                                        Ekle
                                    </Button>
                                }
                            />
                        </div>

                        <UyapAdresQuickPickStrip
                            rows={addressRows}
                            onChange={setAddressRows}
                            labelClassName="text-[10px] text-muted-foreground uppercase tracking-wide"
                            buttonClassName="h-7 text-[10px] px-2"
                        />
                        
                        {addressRows.length > 0 ? (
                            <div className="space-y-1">
                                {addressRows.map((row, idx) => (
                                    <div
                                        key={idx}
                                        className="group flex items-start gap-2 p-2 text-xs border rounded-md opacity-60 hover:opacity-100 hover:bg-muted/40 cursor-pointer transition-all duration-150"
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
                            <p className="text-xs text-muted-foreground/60 italic">Henüz adres eklenmemiş</p>
                        )}
                    </div>

                    <Separator className="my-2" />

                    {/* Additional Data */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <MaterialIcon icon="label" size={12} />
                                Ek Veriler
                            </Label>
                            <QuickTagPopover
                                entityType="PARTY"
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

                {/* Footer */}
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
                        disabled={loading || !fullName.trim()}
                        className="bg-primary text-primary-foreground"
                    >
                        {loading ? (
                            <MaterialIcon icon="hourglass_empty" size={14} className="mr-1 animate-spin" />
                        ) : (
                            <MaterialIcon icon={party ? 'save' : 'add'} size={14} className="mr-1" />
                        )}
                        {party ? 'Kaydet' : 'Oluştur'}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
};

export default PartyQuickPopover;
