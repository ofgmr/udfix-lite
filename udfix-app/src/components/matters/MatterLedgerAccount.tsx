import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import MaterialIcon from '../ui/MaterialIcon';
import { toast } from 'sonner';
import { DataService, type Matter, type Party } from '../../services/dataService';
import {
    LEDGER_KIND_LABEL,
    formatLedgerDate,
    formatLedgerTry,
    ledgerEntryWeightMinor,
    parseLedgerAmountToMinor,
    parseLedgerDate,
    summarizeLedger,
    todayLedgerIsoDate,
    courtMoneyExtras,
    ledgerLineTitle,
    type LedgerKind,
    type MatterLedgerRow,
} from '../../lib/matterLedger';
import { isCourtExpenseAdvance, isOfficeCourtAdvance, courtAdvanceRemainingMinor, isFileCollectionCredit, splitAdvanceMinor, applyPocketSettlement } from '../../../electron/shared/clientLedgerReport';
import { saveClientLedgerCsv } from '../../lib/saveClientLedgerCsv';
import { cn } from '../../lib/utils';

type LinkedParty = Party & { role?: string };

type MatterLedgerAccountProps = {
    refreshKey?: number;
    partyName?: string;
} & ({ mode: 'matter'; matterId: string } | { mode: 'party'; partyId: string });

type LedgerGroupKey = 'muvekkil_avans' | 'dosya_tahsilat' | 'odeme' | 'harc' | 'masraf' | 'reddiyat';

type LedgerFilterKey = 'all' | 'active' | 'muvekkil';

type NewEntryPreset =
    | 'muvekkil_avans'
    | 'dosya_tahsilat'
    | 'muvekkile_odeme'
    | 'buro_masraf'
    | 'buro_harc'
    | 'muvekkil_yatirdi';

const NEW_ENTRY_PRESETS: Array<{
    value: NewEntryPreset;
    side: 'alacak' | 'borc' | 'disi';
    title: string;
    subtitle: string;
    placeholder: string;
    badge: string;
    tone: string;
}> = [
    {
        value: 'muvekkil_avans',
        side: 'alacak',
        title: 'Müvekkilden Gelen Avans / Ödeme',
        subtitle: 'Müvekkil büroya para gönderdi · Alacak (+)',
        placeholder: 'Masraf avansı / cari ödeme (Havale / Elden)',
        badge: 'ALACAK +',
        tone: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    },
    {
        value: 'dosya_tahsilat',
        side: 'alacak',
        title: 'Dosyadan Gelen Tahsilat / İade',
        subtitle: 'İcra / mahkemeden büro hesabına yatan para · Alacak (+)',
        placeholder: 'İcra reddiyatı / bakiye avans iadesi',
        badge: 'ALACAK +',
        tone: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    },
    {
        value: 'muvekkile_odeme',
        side: 'borc',
        title: 'Müvekkile Yapılan Ödeme / Reddiyat',
        subtitle: 'Bürodan müvekkile gönderilen para · Borç / Mahsup (−)',
        placeholder: 'Tahsilat reddiyatı / avans iadesi (Banka / Elden)',
        badge: 'BORÇ −',
        tone: 'border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-200',
    },
    {
        value: 'buro_masraf',
        side: 'borc',
        title: 'Büro Ödedi · Dosya Masrafı',
        subtitle: 'Büronun cebinden dosya için çıkan gider / avans · Borç (−)',
        placeholder: 'Gider avansı / posta / bilirkişi / yol',
        badge: 'BORÇ −',
        tone: 'border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-200',
    },
    {
        value: 'buro_harc',
        side: 'borc',
        title: 'Büro Ödedi · Dosya Harcı',
        subtitle: 'Büronun cebinden dosya için çıkan harç · Borç (−)',
        placeholder: 'Peşin harç / başvurma harcı / istinaf harcı',
        badge: 'BORÇ −',
        tone: 'border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-200',
    },
    {
        value: 'muvekkil_yatirdi',
        side: 'disi',
        title: 'Müvekkil Doğrudan Yatırdı',
        subtitle: 'Müvekkil dosyaya kendi cebinden yatırdı · Bakiye dışı (0 ₺)',
        placeholder: 'Müvekkilin doğrudan ödediği harç / bilirkişi / teminat',
        badge: 'BAKİYE DIŞI 0',
        tone: 'border-primary/40 bg-primary/15 text-primary',
    },
];

type RowRuleChoice =
    | 'buro_borc'
    | 'muvekkile_odeme'
    | 'muvekkil_yatirdi'
    | 'buro_alacak'
    | 'disi';

const RULE_OPTIONS: Array<{ value: RowRuleChoice; label: string }> = [
    { value: 'buro_borc', label: 'Büro ödedi · Masraf/Harç (Borç −)' },
    { value: 'muvekkile_odeme', label: 'Müvekkile ödeme / reddiyat (Borç −)' },
    { value: 'buro_alacak', label: 'Alacak / Gelen avans-tahsilat (Alacak +)' },
    { value: 'muvekkil_yatirdi', label: 'Müvekkil yatırdı (Bakiye dışı 0)' },
    { value: 'disi', label: 'Bakiye dışı (Gider / Karşı / Kesinti 0)' },
];

function preferredPartyId(candidates: LinkedParty[]): string {
    const client = candidates.find((party) => party.role === 'MÜVEKKİL')
        ?? candidates.find((party) => Boolean(party.is_client));
    return client?.id || candidates[0]?.id || '';
}

function matterOptionLabel(matter: Pick<Matter, 'title' | 'court_name' | 'file_number'>): string {
    const court = (matter.court_name || '').trim();
    const file = (matter.file_number || '').trim();
    const head = [court, file].filter(Boolean).join(' · ');
    return head || (matter.title || '').trim() || 'Dosya';
}

function rowKindText(row: MatterLedgerRow): string {
    return ledgerLineTitle(row);
}

function uyapLineDetail(row: MatterLedgerRow, shownMinor: number, excluded: boolean): string {
    const extras = courtMoneyExtras(row.detail_json);
    const parts: string[] = [];
    if (row.receipt_no) parts.push(`Makbuz ${row.receipt_no}`);
    if (row.payer_name) parts.push(row.payer_name);
    if (!isCourtExpenseAdvance(row) && row.kind === 'avans' && row.amount_minor !== shownMinor) {
        parts.push(`yatırılan ${formatLedgerTry(row.amount_minor)}`);
    }
    if (isCourtExpenseAdvance(row) && row.remaining_minor != null && row.remaining_minor > 0) {
        parts.push(`dosyada kalan ${formatLedgerTry(row.remaining_minor)}`);
    }
    if (row.remaining_minor === 0) parts.push('kalan yok');
    if (extras.hesaplamaMinor != null && extras.hesaplamaMinor > 0) {
        parts.push(`hesaplama ${formatLedgerTry(extras.hesaplamaMinor)}`);
    }
    if (extras.detay) parts.push(extras.detay);
    if (extras.manualOverride) parts.push('elle düzeltildi');
    if (excluded && !isCourtExpenseAdvance(row) && extras.depositor !== 'muvekkil') parts.push('bakiye dışı');
    return parts.join(' · ');
}

function lineFigures(row: MatterLedgerRow): { excluded: boolean; shownMinor: number } {
    const weight = ledgerEntryWeightMinor(row);
    const excluded = row.balance_minor != null && weight === 0;
    return { excluded, shownMinor: excluded ? row.amount_minor : weight };
}

function groupForRow(row: MatterLedgerRow): LedgerGroupKey {
    const extras = courtMoneyExtras(row.detail_json);
    if (extras.depositor === 'karsi' || extras.depositor === 'onceki_vekil') return 'reddiyat';
    if (row.kind === 'avans') return isFileCollectionCredit(row) ? 'dosya_tahsilat' : 'muvekkil_avans';
    if (extras.flow === 'muvekkil_odeme') return 'odeme';
    if (!extras.manualOverride && (extras.flow === 'reddiyat' || extras.flow === 'tahsilat' || extras.flow === 'teminat' || row.uyap_page === 'reddiyat')) {
        return 'reddiyat';
    }
    if (extras.flow === 'reddiyat' || extras.flow === 'tahsilat' || extras.flow === 'teminat') {
        return 'reddiyat';
    }
    if (row.kind === 'harc') return 'harc';
    return 'masraf';
}

function currentRuleChoice(row: MatterLedgerRow): RowRuleChoice {
    const extras = courtMoneyExtras(row.detail_json);
    const weight = ledgerEntryWeightMinor(row);
    if (row.kind === 'avans' && weight > 0) return 'buro_alacak';
    if (extras.flow === 'muvekkil_odeme' && weight > 0) return 'muvekkile_odeme';
    if (extras.depositor === 'muvekkil') return 'muvekkil_yatirdi';
    if (weight > 0) return 'buro_borc';
    return 'disi';
}

function applyRuleChoiceToRow(
    row: MatterLedgerRow,
    choice: RowRuleChoice,
    baseKind: LedgerKind,
    amountMinor: number,
): { kind: LedgerKind; balance_minor: number; detail_json: string } {
    let detail: Record<string, unknown> = {};
    try {
        const parsed = JSON.parse(row.detail_json || '{}') as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            detail = { ...(parsed as Record<string, unknown>) };
        }
    } catch {
        detail = {};
    }
    detail.manualOverride = true;
    const chargeKind: LedgerKind = baseKind === 'harc' ? 'harc' : 'masraf';
    const nextChargeFlow = detail.flow === 'dosya_avans' && chargeKind === 'masraf' ? 'dosya_avans' : chargeKind;
    switch (choice) {
        case 'buro_borc':
            detail.flow = nextChargeFlow;
            detail.depositor = 'buro';
            delete detail.pocket;
            delete detail.reddiyatTo;
            return { kind: chargeKind, balance_minor: amountMinor, detail_json: JSON.stringify(detail) };
        case 'muvekkile_odeme':
            detail.flow = 'muvekkil_odeme';
            detail.depositor = 'buro';
            delete detail.pocket;
            delete detail.reddiyatTo;
            return { kind: 'masraf', balance_minor: amountMinor, detail_json: JSON.stringify(detail) };
        case 'muvekkil_yatirdi':
            detail.flow = nextChargeFlow;
            detail.depositor = 'muvekkil';
            delete detail.pocket;
            delete detail.reddiyatTo;
            return { kind: chargeKind, balance_minor: 0, detail_json: JSON.stringify(detail) };
        case 'buro_alacak':
            delete detail.depositor;
            if (row.uyap_page === 'reddiyat' || detail.flow === 'reddiyat') {
                detail.flow = 'reddiyat';
                detail.reddiyatTo = 'biz';
                detail.pocket = true;
            } else {
                delete detail.flow;
                delete detail.reddiyatTo;
                detail.pocket = true;
            }
            return { kind: 'avans', balance_minor: amountMinor, detail_json: JSON.stringify(detail) };
        case 'disi':
            if (row.uyap_page === 'reddiyat' || detail.flow === 'reddiyat') {
                detail.flow = 'reddiyat';
                if (detail.reddiyatTo === 'biz') detail.reddiyatTo = 'ucuncu';
                delete detail.depositor;
            } else if (detail.flow !== 'tahsilat' && detail.flow !== 'teminat') {
                detail.flow = nextChargeFlow;
                detail.depositor = 'karsi';
            }
            delete detail.pocket;
            return { kind: chargeKind, balance_minor: 0, detail_json: JSON.stringify(detail) };
        default: {
            const exhaustive: never = choice;
            return exhaustive;
        }
    }
}

function lineCaption(row: MatterLedgerRow): string {
    const parts = [row.court_name, row.file_number, row.counterparty_names]
        .map((part) => (part || '').trim())
        .filter(Boolean);
    if (parts.length > 0) return parts.join(' · ');
    if (!row.matter_id) return 'Dosyaya bağlı değil';
    return (row.matter_title || 'Dosya').trim();
}

function InlineRowEditor({
    row,
    mode,
    candidates,
    matters,
    onSaved,
    onClose,
    onRemove,
}: {
    row: MatterLedgerRow;
    mode: 'matter' | 'party';
    candidates: LinkedParty[];
    matters: Matter[];
    onSaved: () => Promise<void>;
    onClose: () => void;
    onRemove: (row: MatterLedgerRow) => void;
}) {
    const [kind, setKind] = useState<LedgerKind>(row.kind);
    const [rule, setRule] = useState<RowRuleChoice>(() => currentRuleChoice(row));
    const [description, setDescription] = useState(row.description);
    const [amountText, setAmountText] = useState((row.amount_minor / 100).toFixed(2).replace('.', ','));
    const [entryDate, setEntryDate] = useState(row.entry_date);
    const [partyId, setPartyId] = useState(row.party_id);
    const [matterId, setMatterId] = useState(row.matter_id || '');
    const [saving, setSaving] = useState(false);

    const save = async (nextRule = rule) => {
        const amount = parseLedgerAmountToMinor(amountText);
        if (amount == null) {
            toast.error('Tutarı 535,00 biçiminde yazın');
            return;
        }
        const date = parseLedgerDate(entryDate);
        if (!date) {
            toast.error('Tarih geçersiz');
            return;
        }
        const resolved = applyRuleChoiceToRow(row, nextRule, kind, amount);
        const lineMatterId = mode === 'matter' ? (row.matter_id || null) : (matterId || null);
        if ((resolved.kind === 'masraf' || resolved.kind === 'harc') && nextRule !== 'muvekkile_odeme' && !lineMatterId) {
            toast.error('Masraf ve harç bir dosyaya bağlı olmalı');
            return;
        }
        setSaving(true);
        try {
            await DataService.updateMatterLedgerEntry({
                id: row.id,
                matter_id: lineMatterId,
                party_id: partyId,
                kind: resolved.kind,
                description,
                amount_minor: amount,
                entry_date: date,
                balance_minor: resolved.balance_minor,
                detail_json: resolved.detail_json,
            });
            toast.success('Kayıt güncellendi');
            onClose();
            await onSaved();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Kayıt güncellenemedi');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mt-1 space-y-1.5 rounded-md border border-primary/30 bg-black/30 p-2">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-foreground">Kaydı düzenle</span>
                <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={onClose}
                >
                    Kapat
                </button>
            </div>
            <div className="grid grid-cols-2 gap-1">
                {RULE_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        className={cn(
                            'rounded border px-1.5 py-1 text-left text-[10px] leading-tight transition-colors',
                            rule === opt.value
                                ? 'border-primary/50 bg-primary/15 text-primary'
                                : 'border-white/10 bg-white/5 text-muted-foreground hover:text-foreground',
                        )}
                        onClick={() => {
                            setRule(opt.value);
                            if (opt.value === 'buro_alacak') setKind('avans');
                            else if (kind === 'avans') setKind(row.uyap_page === 'harc' ? 'harc' : 'masraf');
                        }}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
            {rule !== 'buro_alacak' && (
                <div className="grid grid-cols-2 gap-1">
                    {(['harc', 'masraf'] as const).map((option) => (
                        <button
                            key={option}
                            type="button"
                            className={cn(
                                'h-6 rounded border text-[10px]',
                                kind === option
                                    ? 'border-white/25 bg-white/10 text-foreground'
                                    : 'border-white/10 bg-transparent text-muted-foreground',
                            )}
                            onClick={() => setKind(option)}
                        >
                            {LEDGER_KIND_LABEL[option]}
                        </button>
                    ))}
                </div>
            )}
            {mode === 'matter' && candidates.length > 1 && (
                <Select value={partyId} onValueChange={setPartyId}>
                    <SelectTrigger className="h-7 text-xs glass-input py-0">
                        <SelectValue placeholder="Müvekkil" />
                    </SelectTrigger>
                    <SelectContent className="glass">
                        {candidates.map((party) => (
                            <SelectItem key={party.id} value={party.id} className="text-xs">
                                {party.full_name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
            {mode === 'party' && (
                <Select
                    value={matterId || '__none__'}
                    onValueChange={(value) => setMatterId(value === '__none__' ? '' : value)}
                >
                    <SelectTrigger className="h-7 text-xs glass-input py-0">
                        <SelectValue placeholder="Dosya" />
                    </SelectTrigger>
                    <SelectContent className="glass max-h-48">
                        <SelectItem value="__none__" className="text-xs">
                            Dosyaya bağlı değil
                        </SelectItem>
                        {matters.map((matter) => (
                            <SelectItem key={matter.id} value={matter.id} className="text-xs">
                                {matterOptionLabel(matter)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
            <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="h-7 text-xs glass-input"
            />
            <div className="grid grid-cols-2 gap-1.5">
                <Input
                    value={amountText}
                    onChange={(event) => setAmountText(event.target.value)}
                    inputMode="decimal"
                    className="h-7 text-xs glass-input"
                />
                <Input
                    type="date"
                    value={entryDate}
                    onChange={(event) => setEntryDate(event.target.value)}
                    className="h-7 text-xs glass-input"
                />
            </div>
            <div className="flex items-center justify-between gap-1 pt-0.5">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] text-destructive hover:text-destructive"
                    onClick={() => onRemove(row)}
                >
                    Sil
                </Button>
                <div className="flex items-center gap-1">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={onClose}
                    >
                        Vazgeç
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        className="h-6 px-2.5 text-[10px]"
                        disabled={saving}
                        onClick={() => void save()}
                    >
                        Kaydet
                    </Button>
                </div>
            </div>
        </div>
    );
}

function LedgerLine({
    row,
    mode,
    editingId,
    showPartyName,
    candidates,
    matters,
    onToggleEdit,
    onSaved,
    onRemove,
}: {
    row: MatterLedgerRow;
    mode: 'matter' | 'party';
    editingId: string | null;
    showPartyName: boolean;
    candidates: LinkedParty[];
    matters: Matter[];
    onToggleEdit: (row: MatterLedgerRow) => void;
    onSaved: () => Promise<void>;
    onRemove: (row: MatterLedgerRow) => void;
}) {
    const { excluded, shownMinor } = lineFigures(row);
    const extras = courtMoneyExtras(row.detail_json);
    const detail = uyapLineDetail(row, shownMinor, excluded);
    const isEditing = editingId === row.id;
    const isClientDeposit = extras.depositor === 'muvekkil';
    return (
        <div>
            <div
                className={cn(
                    'flex items-start gap-2 rounded-md border border-white/5 bg-black/15 px-2 py-1.5 transition-colors hover:border-white/15',
                    isEditing && 'border-primary/40 bg-primary/5',
                )}
            >
                <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onToggleEdit(row)}
                >
                    <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground">
                            {formatLedgerDate(row.entry_date)} · {rowKindText(row)}
                            {row.source === 'katir' ? ' · Katır' : ''}
                        </span>
                        <span
                            className={cn(
                                'shrink-0 text-[11px] font-medium',
                                excluded && 'text-muted-foreground',
                                !excluded && row.kind === 'avans' && 'text-emerald-700 dark:text-emerald-300',
                                !excluded && row.kind !== 'avans' && 'text-foreground',
                            )}
                        >
                            {excluded ? '' : row.kind === 'avans' ? '+' : '−'}
                            {formatLedgerTry(shownMinor)}
                        </span>
                    </span>
                    <span className="block truncate text-[11px]">{row.description}</span>
                    {isClientDeposit && (
                        <span className="inline-block text-[10px] text-primary">Müvekkil yatırdı</span>
                    )}
                    {detail ? (
                        <span className="block truncate text-[10px] text-muted-foreground">{detail}</span>
                    ) : null}
                    {mode === 'party' && (
                        <span className="block truncate text-[10px] text-muted-foreground">
                            {lineCaption(row)}
                        </span>
                    )}
                    {showPartyName && row.party_name && (
                        <span className="block truncate text-[10px] text-muted-foreground">
                            {row.party_name}
                        </span>
                    )}
                </button>
                <button
                    type="button"
                    className="mt-0.5 text-muted-foreground hover:text-foreground"
                    aria-label="Satırı düzenle"
                    onClick={() => onToggleEdit(row)}
                >
                    <MaterialIcon icon={isEditing ? 'expand_less' : 'tune'} size={14} />
                </button>
            </div>
            {isEditing && (
                <InlineRowEditor
                    row={row}
                    mode={mode}
                    candidates={candidates}
                    matters={matters}
                    onSaved={onSaved}
                    onClose={() => onToggleEdit(row)}
                    onRemove={onRemove}
                />
            )}
        </div>
    );
}

const GROUP_META: Array<{
    key: LedgerGroupKey;
    title: string;
    sign: '+' | '−' | '';
    tone: string;
}> = [
    { key: 'muvekkil_avans', title: 'Alacak · Müvekkil avansı', sign: '+', tone: 'text-emerald-700 dark:text-emerald-300' },
    { key: 'dosya_tahsilat', title: 'Alacak · Dosya tahsilatı', sign: '+', tone: 'text-emerald-700 dark:text-emerald-300' },
    { key: 'odeme', title: 'Borç · Müvekkile yapılan ödemeler', sign: '−', tone: 'text-amber-800 dark:text-amber-200' },
    { key: 'harc', title: 'Borç · Harç dökümü', sign: '−', tone: 'text-foreground' },
    { key: 'masraf', title: 'Borç · Masraf ve dosya avansı dökümü', sign: '−', tone: 'text-foreground' },
    { key: 'reddiyat', title: 'Bakiye dışı · Karşı taraf, reddiyat ve tahsilat', sign: '', tone: 'text-muted-foreground' },
];

function LedgerGroupDropdown({
    title,
    sign,
    tone,
    rows,
    mode,
    editingId,
    showPartyName,
    candidates,
    matters,
    onToggleEdit,
    onSaved,
    onRemove,
}: {
    title: string;
    sign: '+' | '−' | '';
    tone: string;
    rows: MatterLedgerRow[];
    mode: 'matter' | 'party';
    editingId: string | null;
    showPartyName: boolean;
    candidates: LinkedParty[];
    matters: Matter[];
    onToggleEdit: (row: MatterLedgerRow) => void;
    onSaved: () => Promise<void>;
    onRemove: (row: MatterLedgerRow) => void;
}) {
    const activeMinor = rows.reduce((sum, row) => sum + ledgerEntryWeightMinor(row), 0);
    const totalMinor = rows.reduce((sum, row) => sum + row.amount_minor, 0);
    const clientPaidCount = rows.filter((row) => courtMoneyExtras(row.detail_json).depositor === 'muvekkil').length;
    const shownTotal = sign === '' ? totalMinor : activeMinor;
    return (
        <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-left hover:bg-white/10">
                <MaterialIcon
                    icon="expand_more"
                    size={14}
                    className="shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
                />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium">{title}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                        {rows.length} kayıt
                        {clientPaidCount > 0 ? ` · ${clientPaidCount} müvekkil yatırdı` : ''}
                        {sign !== '' && totalMinor !== activeMinor ? ` · toplam ${formatLedgerTry(totalMinor)}` : ''}
                    </span>
                </span>
                <span className={cn('shrink-0 text-[11px] font-medium', tone)}>
                    {shownTotal > 0 ? sign : ''}
                    {formatLedgerTry(shownTotal)}
                </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 flex flex-col gap-1 pl-2 border-l border-white/10">
                {rows.map((row) => (
                    <LedgerLine
                        key={row.id}
                        row={row}
                        mode={mode}
                        editingId={editingId}
                        showPartyName={showPartyName}
                        candidates={candidates}
                        matters={matters}
                        onToggleEdit={onToggleEdit}
                        onSaved={onSaved}
                        onRemove={onRemove}
                    />
                ))}
            </CollapsibleContent>
        </Collapsible>
    );
}

export const MatterLedgerAccount: React.FC<MatterLedgerAccountProps> = (props) => {
    const matterId = props.mode === 'matter' ? props.matterId : '';
    const partyId = props.mode === 'party' ? props.partyId : '';
    const refreshKey = props.refreshKey ?? 0;

    const [rows, setRows] = useState<MatterLedgerRow[]>([]);
    const [candidates, setCandidates] = useState<LinkedParty[]>([]);
    const [matters, setMatters] = useState<Matter[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [filter, setFilter] = useState<LedgerFilterKey>('all');
    const [preset, setPreset] = useState<NewEntryPreset>(props.mode === 'party' ? 'muvekkil_avans' : 'buro_masraf');
    const [directSubKind, setDirectSubKind] = useState<'masraf' | 'harc'>('masraf');
    const [description, setDescription] = useState('');
    const [amountText, setAmountText] = useState('');
    const [entryDate, setEntryDate] = useState(todayLedgerIsoDate);
    const [selectedPartyId, setSelectedPartyId] = useState('');
    const [selectedMatterId, setSelectedMatterId] = useState('');
    const [exporting, setExporting] = useState(false);

    const settledRows = useMemo(() => applyPocketSettlement(rows), [rows]);
    const summary = useMemo(() => summarizeLedger(settledRows), [settledRows]);
    const advanceSplit = useMemo(() => splitAdvanceMinor(settledRows), [settledRows]);
    const courtAdvance = useMemo(() => {
        let depositedMinor = 0;
        let remainingMinor = 0;
        for (const row of rows) {
            if (!isOfficeCourtAdvance(row)) continue;
            depositedMinor += row.amount_minor;
            remainingMinor += courtAdvanceRemainingMinor(row);
        }
        return { depositedMinor, remainingMinor };
    }, [rows]);

    const filteredRows = useMemo(() => {
        return settledRows.filter((row) => {
            if (filter === 'active') return ledgerEntryWeightMinor(row) > 0;
            if (filter === 'muvekkil') return courtMoneyExtras(row.detail_json).depositor === 'muvekkil';
            return true;
        });
    }, [settledRows, filter]);

    const grouped = useMemo(() => {
        const map: Record<LedgerGroupKey, MatterLedgerRow[]> = {
            muvekkil_avans: [],
            dosya_tahsilat: [],
            odeme: [],
            harc: [],
            masraf: [],
            reddiyat: [],
        };
        for (const row of filteredRows) {
            map[groupForRow(row)].push(row);
        }
        return map;
    }, [filteredRows]);

    const clientPaidTotalCount = useMemo(
        () => rows.filter((row) => courtMoneyExtras(row.detail_json).depositor === 'muvekkil').length,
        [rows],
    );
    const showPartyPicker = props.mode === 'matter' && candidates.length > 1;

    const resetForm = useCallback((nextPreset?: NewEntryPreset) => {
        setPreset(nextPreset ?? (partyId ? 'muvekkil_avans' : 'buro_masraf'));
        setDirectSubKind('masraf');
        setDescription('');
        setAmountText('');
        setEntryDate(todayLedgerIsoDate());
        setSelectedMatterId('');
    }, [partyId]);

    const reload = useCallback(async () => {
        if (matterId) {
            const [nextRows, matter] = await Promise.all([
                DataService.listMatterLedger({ matterId }),
                DataService.getMatter(matterId),
            ]);
            const linked = Array.isArray(matter?.parties) ? matter.parties : [];
            setRows(nextRows);
            setCandidates(linked);
            setSelectedPartyId((current) => (
                linked.some((party) => party.id === current) ? current : preferredPartyId(linked)
            ));
            return;
        }
        if (!partyId) return;
        const [nextRows, nextMatters] = await Promise.all([
            DataService.listMatterLedger({ partyId }),
            DataService.getMatters({ party_id: partyId }).catch(() => [] as Matter[]),
        ]);
        setRows(nextRows);
        setMatters(Array.isArray(nextMatters) ? nextMatters : []);
    }, [matterId, partyId]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        void reload()
            .catch(() => {
                if (!cancelled) toast.error('Masraf hesabı yüklenemedi');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [reload, refreshKey]);

    const toggleEdit = (row: MatterLedgerRow) => {
        setEditingId((prev) => (prev === row.id ? null : row.id));
    };

    const saveLine = async () => {
        const amount = parseLedgerAmountToMinor(amountText);
        if (amount == null) {
            toast.error('Tutarı 535,00 biçiminde yazın');
            return;
        }
        const date = parseLedgerDate(entryDate);
        if (!date) {
            toast.error('Tarih geçersiz');
            return;
        }
        const linePartyId = props.mode === 'party' ? props.partyId : selectedPartyId;
        if (!linePartyId) {
            toast.error('Önce dosyaya müvekkil bağlayıp kaydedin');
            return;
        }
        const lineMatterId = props.mode === 'matter'
            ? props.matterId
            : (selectedMatterId || null);
        const requiresMatter = preset === 'buro_masraf' || preset === 'buro_harc' || preset === 'muvekkil_yatirdi';
        if (requiresMatter && !lineMatterId) {
            toast.error('Dosya masrafı ve harçları bir dosyaya bağlı olmalı');
            return;
        }
        const activePreset = NEW_ENTRY_PRESETS.find((item) => item.value === preset) ?? NEW_ENTRY_PRESETS[0];
        const finalDescription = description.trim() || activePreset.title;
        let entryKind: LedgerKind = 'masraf';
        let balanceMinor = amount;
        let detailJson: string | null = null;

        switch (preset) {
            case 'muvekkil_avans':
                entryKind = 'avans';
                balanceMinor = amount;
                detailJson = JSON.stringify({ manualOverride: true });
                break;
            case 'dosya_tahsilat':
                entryKind = 'avans';
                balanceMinor = amount;
                detailJson = JSON.stringify({ flow: 'reddiyat', reddiyatTo: 'biz', pocket: true, manualOverride: true });
                break;
            case 'muvekkile_odeme':
                entryKind = 'masraf';
                balanceMinor = amount;
                detailJson = JSON.stringify({ flow: 'muvekkil_odeme', depositor: 'buro', manualOverride: true });
                break;
            case 'buro_masraf':
                entryKind = 'masraf';
                balanceMinor = amount;
                detailJson = JSON.stringify({ flow: 'masraf', depositor: 'buro', manualOverride: true });
                break;
            case 'buro_harc':
                entryKind = 'harc';
                balanceMinor = amount;
                detailJson = JSON.stringify({ flow: 'harc', depositor: 'buro', manualOverride: true });
                break;
            case 'muvekkil_yatirdi':
                entryKind = directSubKind;
                balanceMinor = 0;
                detailJson = JSON.stringify({ flow: directSubKind, depositor: 'muvekkil', manualOverride: true });
                break;
            default: {
                const exhaustive: never = preset;
                return exhaustive;
            }
        }

        setSaving(true);
        try {
            await DataService.addMatterLedgerEntry({
                matter_id: lineMatterId,
                party_id: linePartyId,
                kind: entryKind,
                description: finalDescription,
                amount_minor: amount,
                entry_date: date,
                balance_minor: balanceMinor,
                detail_json: detailJson,
            });
            toast.success('Kayıt eklendi');
            resetForm(preset);
            setFormOpen(false);
            await reload();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Satır kaydedilemedi');
        } finally {
            setSaving(false);
        }
    };

    const removeLine = (row: MatterLedgerRow) => {
        toast('Bu satır silinsin mi?', {
            description: `${LEDGER_KIND_LABEL[row.kind]} · ${formatLedgerTry(row.amount_minor)}`,
            action: {
                label: 'Sil',
                onClick: () => {
                    void (async () => {
                        try {
                            await DataService.deleteMatterLedgerEntry(row.id);
                            if (editingId === row.id) setEditingId(null);
                            toast.success('Satır silindi');
                            await reload();
                        } catch (error) {
                            toast.error(error instanceof Error ? error.message : 'Satır silinemedi');
                        }
                    })();
                },
            },
            cancel: { label: 'Vazgeç', onClick: () => undefined },
        });
    };

    const balanceText = summary.position === 'even'
        ? formatLedgerTry(0)
        : formatLedgerTry(Math.abs(summary.balanceMinor));

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <Label className="text-[9px] text-muted-foreground uppercase tracking-widest flex items-center gap-1 opacity-80">
                    <MaterialIcon icon="account_balance_wallet" size={10} />
                    Hesap ve masraf yönetimi
                </Label>
                <div className="flex items-center gap-1">
                    {props.mode === 'party' && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 text-[9px] uppercase tracking-wider"
                            disabled={exporting}
                            onClick={() => {
                                setExporting(true);
                                void saveClientLedgerCsv(props.partyId, props.partyName || rows[0]?.party_name || 'Müvekkil')
                                    .then((result) => {
                                        if (result === 'saved') toast.success('Hesap CSV kaydedildi');
                                    })
                                    .catch(() => toast.error('Hesap CSV kaydedilemedi'))
                                    .finally(() => setExporting(false));
                            }}
                        >
                            <MaterialIcon icon="download" size={10} className="mr-0.5" />
                            Rapor CSV
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[9px] uppercase tracking-wider"
                        onClick={() => {
                            if (formOpen) {
                                setFormOpen(false);
                                return;
                            }
                            resetForm();
                            setFormOpen(true);
                        }}
                    >
                        <MaterialIcon icon={formOpen ? 'close' : 'add'} size={10} className="mr-0.5" />
                        {formOpen ? 'Kapat' : 'Yeni kayıt'}
                    </Button>
                </div>
            </div>

            <div
                className={cn(
                    'rounded-md border px-2 py-1.5',
                    summary.position === 'advance' && 'border-emerald-500/30 bg-emerald-500/10',
                    summary.position === 'debt' && 'border-amber-500/30 bg-amber-500/10',
                    summary.position === 'even' && 'border-white/10 bg-white/5',
                )}
            >
                {loading ? (
                    <div className="text-sm text-muted-foreground">…</div>
                ) : (
                    <>
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                                {summary.positionLabel}
                            </span>
                            <span
                                className={cn(
                                    'text-sm font-medium',
                                    summary.position === 'advance' && 'text-emerald-700 dark:text-emerald-300',
                                    summary.position === 'debt' && 'text-amber-800 dark:text-amber-200',
                                )}
                            >
                                {balanceText}
                            </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            Müvekkil avansı {formatLedgerTry(advanceSplit.clientAdvanceMinor)}
                            {' · '}
                            Dosya tahsilatı {formatLedgerTry(advanceSplit.fileCollectionMinor)}
                            {' · '}
                            Borç {formatLedgerTry(summary.chargeMinor)}
                        </p>
                        {courtAdvance.depositedMinor > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                                Dosya avansı {formatLedgerTry(courtAdvance.depositedMinor)} · dosyada kalan {formatLedgerTry(courtAdvance.remainingMinor)}
                            </p>
                        )}
                    </>
                )}
            </div>

            {rows.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                    {(
                        [
                            { key: 'all', label: `Tümü (${rows.length})` },
                            { key: 'active', label: 'Bakiyedekiler' },
                            { key: 'muvekkil', label: `Müvekkil yatırdı (${clientPaidTotalCount})` },
                        ] as const
                    ).map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            className={cn(
                                'rounded border px-1.5 py-0.5 text-[10px] transition-colors',
                                filter === item.key
                                    ? 'border-primary/40 bg-primary/15 text-primary'
                                    : 'border-white/10 bg-white/5 text-muted-foreground hover:text-foreground',
                            )}
                            onClick={() => setFilter(item.key)}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            )}

            {formOpen && (() => {
                const activePreset = NEW_ENTRY_PRESETS.find((item) => item.value === preset) ?? NEW_ENTRY_PRESETS[0];
                const requiresMatter = preset === 'buro_masraf' || preset === 'buro_harc' || preset === 'muvekkil_yatirdi';
                return (
                    <div className="space-y-2 rounded-md border border-white/10 bg-white/5 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Muhasebe İşlem Türü (Borç / Alacak)
                            </span>
                            <span className={cn('rounded border px-1.5 py-0.5 text-[9px] font-semibold', activePreset.tone)}>
                                {activePreset.badge}
                            </span>
                        </div>
                        <div className="grid grid-cols-1 gap-1">
                            {NEW_ENTRY_PRESETS.map((option) => {
                                const selected = preset === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={cn(
                                            'flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
                                            selected
                                                ? option.tone
                                                : 'border-white/10 bg-black/20 text-muted-foreground hover:border-white/20 hover:text-foreground',
                                        )}
                                        onClick={() => setPreset(option.value)}
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[11px] font-medium">{option.title}</span>
                                            <span className="block truncate text-[9px] opacity-80">{option.subtitle}</span>
                                        </span>
                                        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider">
                                            {option.badge}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        {preset === 'muvekkil_yatirdi' && (
                            <div className="grid grid-cols-2 gap-1">
                                {(['masraf', 'harc'] as const).map((sub) => (
                                    <button
                                        key={sub}
                                        type="button"
                                        className={cn(
                                            'h-6 rounded border text-[10px]',
                                            directSubKind === sub
                                                ? 'border-primary/40 bg-primary/15 text-primary'
                                                : 'border-white/10 bg-white/5 text-muted-foreground',
                                        )}
                                        onClick={() => setDirectSubKind(sub)}
                                    >
                                        {sub === 'harc' ? 'Harç (Müvekkil ödedi)' : 'Masraf / Avans (Müvekkil ödedi)'}
                                    </button>
                                ))}
                            </div>
                        )}
                        {showPartyPicker && selectedPartyId && (
                            <Select value={selectedPartyId} onValueChange={setSelectedPartyId}>
                                <SelectTrigger className="h-7 text-xs glass-input py-0">
                                    <SelectValue placeholder="Müvekkil" />
                                </SelectTrigger>
                                <SelectContent className="glass">
                                    {candidates.map((party) => (
                                        <SelectItem key={party.id} value={party.id} className="text-xs">
                                            {party.full_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        {props.mode === 'party' && (
                            <Select
                                value={selectedMatterId || '__none__'}
                                onValueChange={(value) => setSelectedMatterId(value === '__none__' ? '' : value)}
                            >
                                <SelectTrigger className="h-7 text-xs glass-input py-0">
                                    <SelectValue placeholder={requiresMatter ? 'Dosya seçin (zorunlu)' : 'Dosya (isteğe bağlı)'} />
                                </SelectTrigger>
                                <SelectContent className="glass max-h-48">
                                    <SelectItem value="__none__" className="text-xs">
                                        {requiresMatter ? '— Dosya seçin (zorunlu) —' : 'Genel Cari (Dosyaya bağlı değil)'}
                                    </SelectItem>
                                    {matters.map((matter) => (
                                        <SelectItem key={matter.id} value={matter.id} className="text-xs">
                                            {matterOptionLabel(matter)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        {props.mode === 'matter' && candidates.length === 0 && (
                            <p className="text-[10px] text-amber-700 dark:text-amber-200">
                                Kayıt için önce dosyaya müvekkil bağlayıp kaydedin.
                            </p>
                        )}
                        <Input
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder={activePreset.placeholder}
                            className="h-7 text-xs glass-input"
                        />
                        <div className="grid grid-cols-2 gap-1.5">
                            <Input
                                value={amountText}
                                onChange={(event) => setAmountText(event.target.value)}
                                placeholder="535,00 ₺"
                                inputMode="decimal"
                                className="h-7 text-xs glass-input"
                            />
                            <Input
                                type="date"
                                value={entryDate}
                                onChange={(event) => setEntryDate(event.target.value)}
                                className="h-7 text-xs glass-input"
                            />
                        </div>
                        <div className="flex justify-end gap-1">
                            <Button
                                type="button"
                                size="sm"
                                className="h-7 px-3 text-[10px]"
                                disabled={saving || (props.mode === 'matter' && candidates.length === 0)}
                                onClick={() => void saveLine()}
                            >
                                Kaydı Ekle
                            </Button>
                        </div>
                    </div>
                );
            })()}

            {filteredRows.length > 0 && (
                <ul className="flex flex-col gap-1">
                    {GROUP_META.map((meta) => {
                        const groupRows = grouped[meta.key];
                        if (groupRows.length === 0) return null;
                        return (
                            <li key={meta.key}>
                                <LedgerGroupDropdown
                                    title={meta.title}
                                    sign={meta.sign}
                                    tone={meta.tone}
                                    rows={groupRows}
                                    mode={props.mode}
                                    editingId={editingId}
                                    showPartyName={props.mode === 'matter' && candidates.length > 1}
                                    candidates={candidates}
                                    matters={matters}
                                    onToggleEdit={toggleEdit}
                                    onSaved={reload}
                                    onRemove={removeLine}
                                />
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default MatterLedgerAccount;
