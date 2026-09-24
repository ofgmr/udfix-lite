import React, { useState, useEffect } from 'react';
import { useMattersStore } from '../../stores/useMattersStore';
import { usePartiesStore } from '../../stores/usePartiesStore';
import {
    type Matter,
    type MatterCategory,
    type MatterDecision,
    type Court,
    type Party,
    type EntityAttributeUpsertRow,
    DataService,
} from '../../services/dataService';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '../../components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { TagDataRowsEditor } from '../../components/ui/TagDataRowsEditor';
import { visibleMatterAttributeRows } from '../../utils/matterAttributeSearch';

interface MatterDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    matter?: Matter | null;
}

type DecisionDraft = {
    id: string;
    decision_no: string;
    decision_date: string;
    court_name: string;
    notes: string;
};

type MatterPartyLink = { party_id: string; role: string; process_role?: string | null };

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

const MATTER_PARTY_ROLES: { value: string; label: string }[] = [
    { value: 'DAVACI', label: 'Davacı' },
    { value: 'DAVALI', label: 'Davalı' },
    { value: 'MÜŞTEKİ', label: 'Müşteki' },
    { value: 'SANIK', label: 'Sanık' },
    { value: 'MÜVEKKİL', label: 'Müvekkil' },
    { value: 'KARŞI_TARAF', label: 'Karşı taraf' },
    { value: 'BORÇLU', label: 'Borçlu' },
    { value: 'ÜÇÜNCÜ_ŞAHIS', label: 'Üçüncü şahıs' },
    { value: 'TANIK', label: 'Tanık' },
    { value: 'VEKİL', label: 'Vekil' },
    { value: 'DİĞER', label: 'Diğer' },
];

function toDraft(d: MatterDecision): DecisionDraft {
    return {
        id: d.id,
        decision_no: d.decision_no ?? '',
        decision_date: d.decision_date ?? '',
        court_name: d.court_name ?? '',
        notes: d.notes ?? '',
    };
}

const emptyMatterForm = (): Partial<Matter> => ({
    matter_type: 'LAW_CASE',
    matter_category: undefined,
    internal_id: '',
    title: '',
    court_name: '',
    court_id: undefined,
    file_number: '',
    esas_no: '',
    dis_no: '',
    decision_number: '',
    status: 'OPEN',
    opening_date: new Date().toISOString().split('T')[0],
    closing_date: undefined,
    metadata: undefined,
});

function formatAuditDate(ts?: string | null): string {
    if (!ts) return '—';
    try {
        const d = new Date(ts);
        return Number.isNaN(d.getTime()) ? ts : d.toLocaleString('tr-TR');
    } catch {
        return ts;
    }
}

function parseMetadataToAttributeRows(metadataJson?: string | null): EntityAttributeUpsertRow[] {
    if (!metadataJson) return [];
    try {
        const parsed = JSON.parse(metadataJson) as Record<string, unknown>;
        return Object.entries(parsed)
            .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
            .map(([key, value], idx) => ({
                tag_key: key,
                tag_value: String(value),
                sort_order: idx,
            }));
    } catch {
        return [];
    }
}

function mergeAttributeRowsToMetadataJson(
    existingMetadataJson: string | null | undefined,
    rows: EntityAttributeUpsertRow[]
): string | null {
    const base: Record<string, unknown> = {};
    try {
        if (existingMetadataJson) Object.assign(base, JSON.parse(existingMetadataJson));
    } catch {
        // keep legacy raw metadata out of structured object if parse fails
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
}

function deriveMatterTypeFromCategory(category: MatterCategory | string | null | undefined): Matter['matter_type'] {
    if (category === 'ENFORCEMENT_PROCEEDING') return 'ENFORCEMENT';
    if (category === 'MEDIATION' || category === 'SETTLEMENT') return 'MEDIATION';
    return 'LAW_CASE';
}

async function syncMatterPartyLinks(
    matterId: string,
    nextRows: MatterPartyLink[],
    prevParties: Array<Party & { role: string }> | undefined
) {
    const prev = prevParties ?? [];
    const nextIds = new Set(nextRows.map((r) => r.party_id));
    for (const p of prev) {
        if (!nextIds.has(p.id)) {
            await DataService.unlinkPartyFromMatter({ matterId, partyId: p.id });
        }
    }
    for (const row of nextRows) {
        await DataService.linkPartyToMatter({
            matterId,
            partyId: row.party_id,
            role: row.role,
        });
    }
}

export const MatterDialog: React.FC<MatterDialogProps> = ({ open, onOpenChange, matter }) => {
    const { addMatter, updateMatter, fetchMatters } = useMattersStore();
    const { parties, fetchParties } = usePartiesStore();
    const [formData, setFormData] = useState<Partial<Matter>>(emptyMatterForm);
    const [decisionRows, setDecisionRows] = useState<DecisionDraft[]>([]);
    const [courts, setCourts] = useState<Court[]>([]);
    const [metadataText, setMetadataText] = useState('');
    const [attributeRows, setAttributeRows] = useState<EntityAttributeUpsertRow[]>([]);
    const [linkRows, setLinkRows] = useState<MatterPartyLink[]>([]);
    const [pickPartyId, setPickPartyId] = useState('');
    const [pickRole, setPickRole] = useState('MÜVEKKİL');
    const [courtDraftName, setCourtDraftName] = useState('');
    const [courtDraftCity, setCourtDraftCity] = useState('');
    const [courtDraftType, setCourtDraftType] = useState('');
    const [courtDraftDetails, setCourtDraftDetails] = useState('');

    useEffect(() => {
        if (matter) {
            const nextForm: Partial<Matter> = {
                ...emptyMatterForm(),
                ...matter,
                esas_no: matter.esas_no ?? matter.file_number ?? '',
                matter_type: deriveMatterTypeFromCategory(matter.matter_category),
            };
            setFormData(nextForm);
            setMetadataText(matter.metadata ?? '');
            setAttributeRows(parseMetadataToAttributeRows(matter.metadata));
        } else {
            setFormData(emptyMatterForm());
            setMetadataText('');
            setAttributeRows([]);
        }
        setDecisionRows([]);
    }, [matter, open]);

    useEffect(() => {
        if (!open || !matter?.id) {
            setLinkRows([]);
            return;
        }
        let cancelled = false;
        void DataService.getMatter(matter.id).then((m) => {
            if (cancelled || !m?.parties) return;
            const rows = (m.parties as Array<Party & { role: string; process_role?: string | null }>).map((p) => ({
                party_id: p.id,
                role: p.role || 'MÜVEKKİL',
                process_role: p.process_role || null,
            }));
            setLinkRows(rows);
        });
        return () => {
            cancelled = true;
        };
    }, [open, matter?.id]);

    useEffect(() => {
        if (!open || !matter?.id) return;
        let cancelled = false;
        void DataService.getMatterDecisions(matter.id).then((list) => {
            if (!cancelled) setDecisionRows(list.map(toDraft));
        });
        return () => {
            cancelled = true;
        };
    }, [open, matter?.id]);

    useEffect(() => {
        if (!open || !matter?.id) return;
        let cancelled = false;
        void DataService.getEntityAttributes('MATTER', matter.id).then((rows) => {
            if (cancelled) return;
            if (rows.length > 0) {
                setAttributeRows(
                    visibleMatterAttributeRows(
                        rows.map((row, idx) => ({
                            tag_key: row.tag_key,
                            tag_value: row.tag_value,
                            sort_order: row.sort_order ?? idx,
                        })),
                    ),
                );
            }
        });
        return () => {
            cancelled = true;
        };
    }, [open, matter?.id]);

    useEffect(() => {
        if (!open) return;
        void (async () => {
            try {
                const list = await DataService.listCourts();
                setCourts(Array.isArray(list) ? list : []);
            } catch (e) {
                console.warn('[MatterDialog] listCourts failed', e);
                setCourts([]);
            }
        })();
        void fetchParties().catch(() => {});
    }, [open, fetchParties]);

    const addDecisionRow = () => {
        setDecisionRows((r) => [
            ...r,
            {
                id: crypto.randomUUID(),
                decision_no: '',
                decision_date: '',
                court_name: '',
                notes: '',
            },
        ]);
    };

    const updateDecision = (id: string, patch: Partial<DecisionDraft>) => {
        setDecisionRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    };

    const removeDecision = (id: string) => {
        setDecisionRows((rows) => rows.filter((r) => r.id !== id));
    };

    const syncDecisions = async (matterId: string, rows: DecisionDraft[]) => {
        const prev = await DataService.getMatterDecisions(matterId);
        const prevIds = new Set(prev.map((p) => p.id));
        const nextIds = new Set(rows.map((r) => r.id));
        for (const p of prev) {
            if (!nextIds.has(p.id)) await DataService.deleteMatterDecision(p.id);
        }
        for (const r of rows) {
            const has =
                r.decision_no.trim() ||
                r.decision_date.trim() ||
                r.court_name.trim() ||
                r.notes.trim();
            if (!has) continue;
            if (prevIds.has(r.id)) {
                await DataService.updateMatterDecision({
                    id: r.id,
                    decision_no: r.decision_no || null,
                    decision_date: r.decision_date || null,
                    court_name: r.court_name || null,
                    notes: r.notes || null,
                });
            } else {
                await DataService.addMatterDecision({
                    matter_id: matterId,
                    id: r.id,
                    decision_no: r.decision_no || null,
                    decision_date: r.decision_date || null,
                    court_name: r.court_name || null,
                    notes: r.notes || null,
                });
            }
        }
    };

    const handleAddCourt = async () => {
        const name = courtDraftName.trim();
        if (!name) return;
        const id = crypto.randomUUID();
        try {
            await DataService.addCourt({
                id,
                name,
                city: courtDraftCity.trim() || undefined,
                type: courtDraftType.trim() || undefined,
                details: courtDraftDetails.trim() || undefined,
            });
            let list: Court[] = [];
            try {
                list = await DataService.listCourts();
            } catch {
                list = [];
            }
            setCourts(Array.isArray(list) ? list : []);
            const created = list.find((c) => c.id === id);
            if (created) {
                setFormData((fd) => ({
                    ...fd,
                    court_id: created.id,
                    court_name: created.name,
                }));
            }
        } catch (e) {
            console.warn('[MatterDialog] addCourt failed', e);
        }
        setCourtDraftName('');
        setCourtDraftCity('');
        setCourtDraftType('');
        setCourtDraftDetails('');
    };

    const addPartyLink = () => {
        if (!pickPartyId) return;
        if (linkRows.some((r) => r.party_id === pickPartyId)) return;
        setLinkRows((rows) => [...rows, { party_id: pickPartyId, role: pickRole }]);
        setPickPartyId('');
    };

    const updateLinkRole = (partyId: string, role: string) => {
        setLinkRows((rows) =>
            rows.map((r) => (r.party_id === partyId ? { ...r, role } : r))
        );
    };

    const removeLink = (partyId: string) => {
        setLinkRows((rows) => rows.filter((r) => r.party_id !== partyId));
    };

    const partyLabel = (id: string) =>
        parties.find((p) => p.id === id)?.full_name ?? id.slice(0, 8);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.title?.trim()) return;

        const matterId = matter?.id ?? crypto.randomUUID();
        const esas = (formData.esas_no ?? '').trim() || (formData.file_number ?? '').trim();
        const metaTrim = metadataText.trim();
        const mergedMetadata = mergeAttributeRowsToMetadataJson(metaTrim ? metaTrim : null, attributeRows);
        const payload: Partial<Matter> & { id: string } = {
            ...formData,
            id: matterId,
            matter_type: deriveMatterTypeFromCategory(formData.matter_category),
            esas_no: esas || undefined,
            file_number: (formData.file_number ?? '').trim() || esas || undefined,
            dis_no: (formData.dis_no ?? '').trim() || undefined,
            metadata: mergedMetadata,
            court_id: formData.court_id?.trim() ? formData.court_id : null,
        };

        const prevMatter = matter?.id ? await DataService.getMatter(matter.id) : null;

        if (matter) {
            await updateMatter({ ...(matter as Matter), ...payload } as Matter);
        } else {
            await addMatter(payload);
        }

        await syncMatterPartyLinks(
            matterId,
            linkRows,
            prevMatter?.parties as Array<Party & { role: string }> | undefined
        );
        await syncDecisions(matterId, decisionRows);
        await DataService.upsertEntityAttributes({
            entity_type: 'MATTER',
            entity_id: matterId,
            rows: attributeRows,
        });
        await fetchMatters();
        onOpenChange(false);
    };

    const courtSelectValue = formData.court_id?.trim() ? formData.court_id : '__none__';

    return (
        <Sheet modal={false} open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                showOverlay={false}
                className="w-full sm:max-w-[560px] overflow-y-auto glass-panel border-l border-border"
            >
                <SheetHeader>
                    <SheetTitle className="text-xl font-bold flex items-center gap-2">
                        <MaterialIcon icon={matter ? 'edit_note' : 'assignment_add'} className="text-primary" />
                        {matter ? 'Dosyayı düzenle' : 'Yeni dosya'}
                    </SheetTitle>
                </SheetHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="matter_category" className="text-sm font-medium">
                            Alan
                        </Label>
                        <Select
                            value={(formData.matter_category as string) || '__none__'}
                            onValueChange={(v) =>
                                setFormData({
                                    ...formData,
                                    matter_category:
                                        v === '__none__' ? undefined : (v as MatterCategory),
                                })
                            }
                        >
                            <SelectTrigger id="matter_category" className="bg-background/50 border-border">
                                <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent className="glass border-border">
                                <SelectItem value="__none__">—</SelectItem>
                                {MATTER_CATEGORY_OPTIONS.map((key) => (
                                    <SelectItem key={key} value={key}>
                                        {CATEGORY_LABELS[key]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="status" className="text-sm font-medium">
                                Durum
                            </Label>
                            <Select
                                value={formData.status}
                                onValueChange={(v: Matter['status']) =>
                                    setFormData({ ...formData, status: v })
                                }
                            >
                                <SelectTrigger className="bg-background/50 border-border">
                                    <SelectValue placeholder="Durum seçiniz" />
                                </SelectTrigger>
                                <SelectContent className="glass border-border">
                                    <SelectItem value="OPEN">Açık</SelectItem>
                                    <SelectItem value="CLOSED">Kapalı</SelectItem>
                                    <SelectItem value="ARCHIVED">Arşiv</SelectItem>
                                    <SelectItem value="APPEAL">İstinaf/Temyiz</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="opening_date" className="text-sm font-medium">
                                Açılış tarihi
                            </Label>
                            <Input
                                id="opening_date"
                                type="date"
                                value={formData.opening_date ?? ''}
                                onChange={(e) => setFormData({ ...formData, opening_date: e.target.value })}
                                className="bg-background/50 border-border"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="closing_date" className="text-sm font-medium">
                                Kapanış tarihi
                            </Label>
                            <Input
                                id="closing_date"
                                type="date"
                                value={formData.closing_date ?? ''}
                                onChange={(e) =>
                                    setFormData({ ...formData, closing_date: e.target.value || undefined })
                                }
                                className="bg-background/50 border-border"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="internal_id" className="text-sm font-medium">
                                Özel kod / ofis no
                            </Label>
                            <Input
                                id="internal_id"
                                value={formData.internal_id ?? ''}
                                onChange={(e) => setFormData({ ...formData, internal_id: e.target.value })}
                                placeholder="2024-NOM-001"
                                className="bg-background/50 border-border"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 col-span-2 sm:col-span-1">
                            <Label className="text-sm font-medium">Kayıtlı mahkeme</Label>
                            <Select
                                value={courtSelectValue}
                                onValueChange={(v) => {
                                    if (v === '__none__') {
                                        setFormData((fd) => ({ ...fd, court_id: undefined }));
                                        return;
                                    }
                                    const c = courts.find((x) => x.id === v);
                                    setFormData((fd) => ({
                                        ...fd,
                                        court_id: v,
                                        court_name: c?.name ?? fd.court_name,
                                    }));
                                }}
                            >
                                <SelectTrigger className="bg-background/50 border-border">
                                    <SelectValue placeholder="Mahkeme seçin" />
                                </SelectTrigger>
                                <SelectContent className="glass border-border max-h-56">
                                    <SelectItem value="__none__">—</SelectItem>
                                    {courts.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.name}
                                            {c.city ? ` (${c.city})` : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2 col-span-2 sm:col-span-1">
                            <Label htmlFor="decision_number" className="text-sm font-medium">
                                Özet karar no (tek satır)
                            </Label>
                            <Input
                                id="decision_number"
                                value={formData.decision_number ?? ''}
                                onChange={(e) =>
                                    setFormData({ ...formData, decision_number: e.target.value })
                                }
                                placeholder="Son karar referansı"
                                className="bg-background/50 border-border"
                            />
                        </div>
                    </div>

                    <div className="rounded-lg border border-border/50 p-3 space-y-2 bg-muted/15">
                        <span className="text-xs font-medium text-muted-foreground">Hızlı mahkeme ekle</span>
                        <Input
                            value={courtDraftName}
                            onChange={(e) => setCourtDraftName(e.target.value)}
                            placeholder="Mahkeme adı"
                            className="bg-background/50 border-border text-sm w-full"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Input
                                value={courtDraftCity}
                                onChange={(e) => setCourtDraftCity(e.target.value)}
                                placeholder="Şehir"
                                className="bg-background/50 border-border text-sm"
                            />
                            <Input
                                value={courtDraftType}
                                onChange={(e) => setCourtDraftType(e.target.value)}
                                placeholder="Tür (örn. Asliye, İcra)"
                                className="bg-background/50 border-border text-sm"
                            />
                        </div>
                        <Input
                            value={courtDraftDetails}
                            onChange={(e) => setCourtDraftDetails(e.target.value)}
                            placeholder="Ek not / adres satırı (details)"
                            className="bg-background/50 border-border text-sm"
                        />
                        <Button type="button" variant="secondary" size="sm" onClick={() => void handleAddCourt()}>
                            Ekle
                        </Button>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="title" className="text-sm font-medium">
                            Dosya başlığı / konu
                        </Label>
                        <Input
                            id="title"
                            value={formData.title ?? ''}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="Alacak davası, sözleşme hazırlığı vb."
                            className="bg-background/50 border-border"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="court_name" className="text-sm font-medium">
                            Mahkeme / kurum (serbest metin)
                        </Label>
                        <Input
                            id="court_name"
                            value={formData.court_name ?? ''}
                            onChange={(e) => setFormData({ ...formData, court_name: e.target.value })}
                            placeholder="Liste dışı kurum veya ek not"
                            className="bg-background/50 border-border"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="esas_no" className="text-sm font-medium">
                                Esas no
                            </Label>
                            <Input
                                id="esas_no"
                                value={formData.esas_no ?? ''}
                                onChange={(e) => setFormData({ ...formData, esas_no: e.target.value })}
                                placeholder="2024/123 E."
                                className="bg-background/50 border-border"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="dis_no" className="text-sm font-medium">
                                Dosya no
                            </Label>
                            <Input
                                id="dis_no"
                                value={formData.dis_no ?? ''}
                                onChange={(e) => setFormData({ ...formData, dis_no: e.target.value })}
                                placeholder="Esas / Talimat / Değişik İş / Takip / Soruşturma"
                                className="bg-background/50 border-border"
                            />
                        </div>
                    </div>

                    <TagDataRowsEditor
                        entityType="MATTER"
                        rows={attributeRows}
                        onChange={setAttributeRows}
                        title="Dosya etiketli veri satirlari"
                    />

                    <div className="space-y-2">
                        <Label htmlFor="matter_metadata" className="text-xs font-medium text-muted-foreground">
                            Gelismis metadata JSON (opsiyonel)
                        </Label>
                        <Textarea
                            id="matter_metadata"
                            value={metadataText}
                            onChange={(e) => setMetadataText(e.target.value)}
                            placeholder='{"ozel_not":"..."}'
                            rows={3}
                            className="bg-background/40 border-border font-mono text-[11px]"
                        />
                    </div>

                    <div className="rounded-lg border border-border/60 p-3 space-y-3 bg-muted/20">
                        <span className="text-sm font-medium">Dosya tarafları</span>
                        <div className="flex flex-col gap-2">
                            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                                <div className="flex-1 space-y-1">
                                    <Label className="text-xs text-muted-foreground">Taraf</Label>
                                    <Select value={pickPartyId || '__none__'} onValueChange={(v) => setPickPartyId(v === '__none__' ? '' : v)}>
                                        <SelectTrigger className="bg-background/50 border-border h-9 text-sm">
                                            <SelectValue placeholder="Seçin" />
                                        </SelectTrigger>
                                        <SelectContent className="glass border-border max-h-48">
                                            <SelectItem value="__none__">—</SelectItem>
                                            {parties.map((p) => (
                                                <SelectItem key={p.id} value={p.id}>
                                                    {p.full_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="w-full sm:w-40 space-y-1">
                                    <Label className="text-xs text-muted-foreground">Rol</Label>
                                    <Select value={pickRole} onValueChange={setPickRole}>
                                        <SelectTrigger className="bg-background/50 border-border h-9 text-sm">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="glass border-border">
                                            {MATTER_PARTY_ROLES.map((r) => (
                                                <SelectItem key={r.value} value={r.value}>
                                                    {r.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button type="button" variant="outline" size="sm" className="h-9" onClick={addPartyLink}>
                                    Bağla
                                </Button>
                            </div>
                            {linkRows.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Bağlı taraf yok.</p>
                            ) : (
                                <ul className="space-y-2 max-h-40 overflow-y-auto">
                                    {linkRows.map((row) => (
                                        <li
                                            key={row.party_id}
                                            className="flex flex-wrap items-center gap-2 border border-border/40 rounded-md p-2"
                                        >
                                            <span className="text-sm flex-1 min-w-0 truncate">
                                                {partyLabel(row.party_id)}
                                                {row.process_role ? (
                                                    <span className="ml-1.5 font-medium text-foreground/80">
                                                        {row.process_role}
                                                    </span>
                                                ) : null}
                                            </span>
                                            <Select
                                                value={row.role}
                                                onValueChange={(v) => updateLinkRole(row.party_id, v)}
                                            >
                                                <SelectTrigger className="h-8 w-[140px] text-xs bg-background/50">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="glass border-border">
                                                    {MATTER_PARTY_ROLES.map((r) => (
                                                        <SelectItem key={r.value} value={r.value}>
                                                            {r.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 shrink-0"
                                                onClick={() => removeLink(row.party_id)}
                                                title="Kaldır"
                                                aria-label="Kaldır"
                                            >
                                                <MaterialIcon icon="close" size={16} />
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    <div className="rounded-lg border border-border/60 p-3 space-y-3 bg-muted/20">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Karar kayıtları</span>
                            <Button type="button" variant="outline" size="sm" onClick={addDecisionRow}>
                                <MaterialIcon icon="add" size={16} className="mr-1" />
                                Karar ekle
                            </Button>
                        </div>
                        {decisionRows.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Henüz çoklu karar yok.</p>
                        ) : (
                            <div className="space-y-3 max-h-56 overflow-y-auto">
                                {decisionRows.map((row) => (
                                    <div
                                        key={row.id}
                                        className="grid gap-2 border border-border/40 rounded-md p-2 relative"
                                    >
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="absolute top-1 right-1 h-7 w-7"
                                            onClick={() => removeDecision(row.id)}
                                            title="Satırı sil"
                                            aria-label="Satırı sil"
                                        >
                                            <MaterialIcon icon="close" size={16} />
                                        </Button>
                                        <Input
                                            placeholder="Karar no"
                                            value={row.decision_no}
                                            onChange={(e) =>
                                                updateDecision(row.id, { decision_no: e.target.value })
                                            }
                                            className="bg-background/50 border-border text-sm pr-10"
                                        />
                                        <Input
                                            type="date"
                                            placeholder="Tarih"
                                            value={row.decision_date}
                                            onChange={(e) =>
                                                updateDecision(row.id, { decision_date: e.target.value })
                                            }
                                            className="bg-background/50 border-border text-sm"
                                        />
                                        <Input
                                            placeholder="Mahkeme"
                                            value={row.court_name}
                                            onChange={(e) =>
                                                updateDecision(row.id, { court_name: e.target.value })
                                            }
                                            className="bg-background/50 border-border text-sm"
                                        />
                                        <Input
                                            placeholder="Not"
                                            value={row.notes}
                                            onChange={(e) =>
                                                updateDecision(row.id, { notes: e.target.value })
                                            }
                                            className="bg-background/50 border-border text-sm"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {matter?.id ? (
                        <p className="text-[10px] text-muted-foreground border-t border-border/40 pt-3">
                            Oluşturulma: {formatAuditDate(matter.created_at)} · Güncelleme:{' '}
                            {formatAuditDate(matter.updated_at)}
                        </p>
                    ) : null}

                    <SheetFooter className="pt-4 flex-row gap-2 sm:justify-end">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                            İptal
                        </Button>
                        <Button type="submit" className="bg-primary text-primary-foreground">
                            {matter ? 'Kaydet' : 'Dosyayı oluştur'}
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
};
