import React, { useState, useEffect } from 'react';
import { usePartiesStore } from '../../stores/usePartiesStore';
import { type Party, type PartyKind, type EntityAttributeUpsertRow, DataService } from '../../services/dataService';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetFooter,
} from '../../components/ui/sheet';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../components/ui/select';
import { Checkbox } from '../../components/ui/checkbox';
import { TagDataRowsEditor } from '../../components/ui/TagDataRowsEditor';
import { UyapAdresQuickPickStrip } from '../uyap/UyapAdresQuickPickStrip';

interface PartyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    party?: Party | null;
}

const emptyForm = (): Partial<Party> => ({
    type: 'INDIVIDUAL',
    party_kind: 'KISI',
    full_name: '',
    id_number: '',
    tax_office: '',
    email: '',
    phone: '',
    address: '',
    postal_address: '',
    secondary_address: '',
    property_address: '',
    power_of_attorney_journal: '',
    is_client: true,
});

function getPartyKindFromRow(party?: Party | null): PartyKind {
    if (party?.party_kind === 'KISI' || party?.party_kind === 'KURUM') return party.party_kind;
    return party?.type === 'CORPORATE' ? 'KURUM' : 'KISI';
}

function getPartyTypeFromKind(partyKind: PartyKind): Party['type'] {
    return partyKind === 'KURUM' ? 'CORPORATE' : 'INDIVIDUAL';
}

function formatAuditDate(ts?: string | null): string {
    if (!ts) return '—';
    try {
        const d = new Date(ts);
        return Number.isNaN(d.getTime()) ? ts : d.toLocaleString('tr-TR');
    } catch {
        return ts;
    }
}

function mergePartyMetadataJson(
    existingJson: string | undefined | null,
    rows: EntityAttributeUpsertRow[]
): string | null {
    const base: Record<string, unknown> = {};
    try {
        if (existingJson) Object.assign(base, JSON.parse(existingJson));
    } catch {
        if (existingJson?.trim()) base._legacy_note = existingJson;
    }
    const setOrDel = (key: string, v: string | undefined) => {
        const t = String(v ?? '').trim();
        if (t) base[key] = t;
        else delete base[key];
    };
    for (const row of rows) setOrDel(row.tag_key, row.tag_value);
    const keys = Object.keys(base);
    return keys.length ? JSON.stringify(base) : null;
}

function parseMetadataToRows(metadataJson?: string | null): EntityAttributeUpsertRow[] {
    if (!metadataJson) return [];
    try {
        const parsed = JSON.parse(metadataJson) as Record<string, unknown>;
        return Object.entries(parsed)
            .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
            .map(([key, value], idx) => ({ tag_key: key, tag_value: String(value), sort_order: idx }));
    } catch {
        return [];
    }
}

export const PartyDialog: React.FC<PartyDialogProps> = ({ open, onOpenChange, party }) => {
    const { addParty, updateParty } = usePartiesStore();
    const [formData, setFormData] = useState<Partial<Party>>(emptyForm);
    const [attributeRows, setAttributeRows] = useState<EntityAttributeUpsertRow[]>([]);
    const currentPartyKind = getPartyKindFromRow(formData as Party);
    const nameFieldLabel = currentPartyKind === 'KISI' ? 'Ad soyad' : 'Kurum ünvanı';

    useEffect(() => {
        if (party) {
            setFormData({
                ...emptyForm(),
                ...party,
                party_kind: getPartyKindFromRow(party),
            });
            setAttributeRows(parseMetadataToRows(party.metadata));
        } else {
            setFormData(emptyForm());
            setAttributeRows([]);
        }
    }, [party, open]);

    useEffect(() => {
        if (!open || !party?.id) return;
        let cancelled = false;
        void DataService.getEntityAttributes('PARTY', party.id).then((rows) => {
            if (cancelled || rows.length === 0) return;
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
    }, [open, party?.id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.full_name) return;

        const metadata = mergePartyMetadataJson(party?.metadata ?? formData.metadata, attributeRows);
        const normalizedPartyKind = getPartyKindFromRow(formData as Party);
        const normalizedType = getPartyTypeFromKind(normalizedPartyKind);

        const payload = {
            ...formData,
            type: normalizedType,
            party_kind: normalizedPartyKind,
            metadata,
        } as Partial<Party>;

        const partyId = party?.id ?? crypto.randomUUID();
        if (party) {
            await updateParty({ ...party, ...payload, id: partyId } as Party);
        } else {
            await addParty({
                ...payload,
                id: partyId,
            });
        }
        await DataService.upsertEntityAttributes({
            entity_type: 'PARTY',
            entity_id: partyId,
            rows: attributeRows,
        });
        onOpenChange(false);
    };

    return (
        <Sheet modal={false} open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                showOverlay={false}
                className="w-full sm:max-w-[520px] overflow-y-auto glass-panel border-l border-border"
            >
                <SheetHeader>
                    <SheetTitle className="text-xl font-bold flex items-center gap-2">
                        <MaterialIcon icon={party ? 'edit' : 'person_add'} className="text-primary" />
                        {party ? 'Tarafı Düzenle' : 'Yeni Taraf Ekle'}
                    </SheetTitle>
                </SheetHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="party_kind" className="text-sm font-medium">
                            Taraf tipi
                        </Label>
                        <Select
                            value={getPartyKindFromRow(formData as Party)}
                            onValueChange={(v) =>
                                setFormData({
                                    ...formData,
                                    party_kind: v as PartyKind,
                                    type: getPartyTypeFromKind(v as PartyKind),
                                })
                            }
                        >
                            <SelectTrigger id="party_kind" className="bg-background/50 border-border">
                                <SelectValue placeholder="Taraf tipi seçiniz" />
                            </SelectTrigger>
                            <SelectContent className="glass border-border">
                                <SelectItem value="KISI">Kişi</SelectItem>
                                <SelectItem value="KURUM">Kurum</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="is_client"
                            checked={formData.is_client}
                            onCheckedChange={(checked) =>
                                setFormData({ ...formData, is_client: checked === true })
                            }
                        />
                        <Label htmlFor="is_client" className="text-sm font-medium cursor-pointer">
                            Müvekkil
                        </Label>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="full_name" className="text-sm font-medium">
                            {nameFieldLabel}
                        </Label>
                        <Input
                            id="full_name"
                            value={formData.full_name}
                            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                            placeholder={currentPartyKind === 'KISI' ? 'Tam ad' : 'Ticari ünvan'}
                            className="bg-background/50 border-border"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="id_number" className="text-sm font-medium">
                                TCKN / VKN
                            </Label>
                            <Input
                                id="id_number"
                                value={formData.id_number ?? ''}
                                onChange={(e) => setFormData({ ...formData, id_number: e.target.value })}
                                placeholder="12345678901"
                                className="bg-background/50 border-border"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="tax_office" className="text-sm font-medium">
                                Vergi dairesi
                            </Label>
                            <Input
                                id="tax_office"
                                value={formData.tax_office ?? ''}
                                onChange={(e) => setFormData({ ...formData, tax_office: e.target.value })}
                                placeholder="Beyoğlu V.D."
                                className="bg-background/50 border-border"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="power_of_attorney_journal" className="text-sm font-medium">
                            Vekalet yevmiye no
                        </Label>
                        <Input
                            id="power_of_attorney_journal"
                            value={formData.power_of_attorney_journal ?? ''}
                            onChange={(e) =>
                                setFormData({ ...formData, power_of_attorney_journal: e.target.value })
                            }
                            placeholder="Örn. 12345"
                            className="bg-background/50 border-border"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-sm font-medium">
                                E-posta
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email ?? ''}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="ornek@mail.com"
                                className="bg-background/50 border-border"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone" className="text-sm font-medium">
                                Telefon
                            </Label>
                            <Input
                                id="phone"
                                value={formData.phone ?? ''}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                placeholder="05XX XXX XX XX"
                                className="bg-background/50 border-border"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="address" className="text-sm font-medium">
                            Adres
                        </Label>
                        <Input
                            id="address"
                            value={formData.address ?? ''}
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            placeholder="Açık adres"
                            className="bg-background/50 border-border"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="secondary_address" className="text-sm font-medium">
                            İkincil adres
                        </Label>
                        <Input
                            id="secondary_address"
                            value={formData.secondary_address ?? ''}
                            onChange={(e) => setFormData({ ...formData, secondary_address: e.target.value })}
                            placeholder="İş adresi, ikamet vb."
                            className="bg-background/50 border-border"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="property_address" className="text-sm font-medium">
                            Taşınmaz adresi
                        </Label>
                        <Input
                            id="property_address"
                            value={formData.property_address ?? ''}
                            onChange={(e) => setFormData({ ...formData, property_address: e.target.value })}
                            placeholder="Tapu / gayrimenkul adresi"
                            className="bg-background/50 border-border"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="postal_address" className="text-sm font-medium">
                            Posta adresi
                        </Label>
                        <Input
                            id="postal_address"
                            value={formData.postal_address ?? ''}
                            onChange={(e) => setFormData({ ...formData, postal_address: e.target.value })}
                            className="bg-background/50 border-border"
                        />
                    </div>

                    <UyapAdresQuickPickStrip
                        rows={attributeRows}
                        onChange={setAttributeRows}
                        label="UYAP adres türü (hızlı)"
                        labelClassName="text-sm font-medium"
                        buttonClassName="h-7 text-[10px] px-2"
                    />

                    <TagDataRowsEditor
                        entityType="PARTY"
                        rows={attributeRows}
                        onChange={setAttributeRows}
                        title="Taraf etiketli veri satirlari"
                    />

                    {party?.id ? (
                        <p className="text-[10px] text-muted-foreground border-t border-border/40 pt-3">
                            Oluşturulma: {formatAuditDate(party.created_at)} · Güncelleme:{' '}
                            {formatAuditDate(party.updated_at)}
                        </p>
                    ) : null}

                    <SheetFooter className="pt-4 flex-row gap-2 sm:justify-end">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                            İptal
                        </Button>
                        <Button type="submit" className="bg-primary text-primary-foreground">
                            {party ? 'Değişiklikleri kaydet' : 'Tarafı kaydet'}
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
};
