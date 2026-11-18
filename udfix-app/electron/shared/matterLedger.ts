/**
 * Dosya masraf hesabı: masraf/harç müvekkile borç yazar, avans alacak yazar.
 * Bakiye = avans − (masraf + harç). Artı avans, eksi müvekkil borcu.
 * Renderer ve main aynı kuralları kullanır.
 */

export const LEDGER_KINDS = ['masraf', 'harc', 'avans'] as const;

export type LedgerKind = (typeof LEDGER_KINDS)[number];

export type LedgerPosition = 'advance' | 'debt' | 'even';

export type LedgerSource = 'manual' | 'katir' | 'import';

export const LEDGER_KIND_LABEL: Record<LedgerKind, string> = {
    masraf: 'Masraf',
    harc: 'Harç',
    avans: 'Avans',
};

export interface LedgerSummary {
    advanceMinor: number;
    chargeMinor: number;
    /** Avans − masraf/harç. Artı: avans. Eksi: müvekkil borcu. */
    balanceMinor: number;
    position: LedgerPosition;
    positionLabel: string;
}

export interface MatterLedgerRow {
    id: string;
    matter_id: string | null;
    party_id: string;
    kind: LedgerKind;
    description: string;
    amount_minor: number;
    entry_date: string;
    source: LedgerSource;
    created_at?: string;
    updated_at?: string;
    matter_title?: string | null;
    court_name?: string | null;
    file_number?: string | null;
    party_name?: string | null;
    counterparty_names?: string | null;
    uyap_page?: 'harc' | 'tahsilat' | 'reddiyat' | null;
    receipt_no?: string | null;
    payer_name?: string | null;
    court_unit?: string | null;
    remaining_minor?: number | null;
    /** Bakiyeye giren kuruş. Boşsa `amount_minor` geçerlidir. Sıfır, satır görünür ama toplama girmez. */
    balance_minor?: number | null;
    detail_json?: string | null;
}

export interface LedgerWrite {
    matter_id: string | null;
    party_id: string;
    kind: LedgerKind;
    description: string;
    amount_minor: number;
    entry_date: string;
    balance_minor: number | null;
    detail_json: string | null;
}

const SKIP_COUNTERPARTY_ROLES = new Set([
    'VEKİL',
    'VEKIL',
    'TANIK',
    'MÜVEKKİL',
    'MUVEKKIL',
    'CLIENT',
]);

export function isLedgerKind(value: string): value is LedgerKind {
    return (LEDGER_KINDS as readonly string[]).includes(value);
}

export function isLedgerSource(value: string): value is LedgerSource {
    return value === 'manual' || value === 'katir' || value === 'import';
}

export function ledgerKindSide(kind: LedgerKind): 'credit' | 'charge' {
    switch (kind) {
        case 'avans':
            return 'credit';
        case 'masraf':
        case 'harc':
            return 'charge';
        default: {
            const exhaustive: never = kind;
            throw new Error(`Unknown ledger kind: ${String(exhaustive)}`);
        }
    }
}

export function ledgerPosition(balanceMinor: number): { position: LedgerPosition; positionLabel: string } {
    if (balanceMinor > 0) return { position: 'advance', positionLabel: 'Alacak' };
    if (balanceMinor < 0) return { position: 'debt', positionLabel: 'Müvekkil borcu' };
    return { position: 'even', positionLabel: 'Kapalı' };
}

/** Katır satırında bakiye tutarı ayrı durur. Boşsa satırın kendi tutarı geçerlidir. */
export function ledgerEntryWeightMinor(row: { amount_minor: number; balance_minor?: number | null }): number {
    if (row.balance_minor == null) return row.amount_minor;
    if (!Number.isFinite(row.balance_minor) || row.balance_minor <= 0) return 0;
    return Math.trunc(row.balance_minor);
}

export function summarizeLedger(
    rows: Array<{ kind: LedgerKind; amount_minor: number; balance_minor?: number | null }>,
): LedgerSummary {
    let advanceMinor = 0;
    let chargeMinor = 0;
    for (const row of rows) {
        const weight = ledgerEntryWeightMinor(row);
        if (weight === 0) continue;
        const side = ledgerKindSide(row.kind);
        if (side === 'credit') advanceMinor += weight;
        else chargeMinor += weight;
    }
    const balanceMinor = advanceMinor - chargeMinor;
    return { advanceMinor, chargeMinor, balanceMinor, ...ledgerPosition(balanceMinor) };
}

/** Türkçe tutar metnini kuruşa çevirir. 535,0 → 53500. Sıfır ve negatif kabul edilmez. */
export function parseLedgerAmountToMinor(raw: string): number | null {
    let text = raw.trim().replace(/\s/g, '').replace(/₺/g, '').replace(/TL/gi, '');
    if (!text || text.startsWith('-')) return null;
    if (text.startsWith('+')) text = text.slice(1);

    let lira: string;
    let frac: string;
    if (text.includes(',')) {
        const parts = text.split(',');
        if (parts.length !== 2) return null;
        lira = parts[0].replace(/\./g, '');
        frac = parts[1];
    } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
        lira = text.replace(/\./g, '');
        frac = '';
    } else if (/^\d+\.\d{1,2}$/.test(text)) {
        const [whole, fraction] = text.split('.');
        lira = whole;
        frac = fraction;
    } else if (/^\d+$/.test(text)) {
        lira = text;
        frac = '';
    } else {
        return null;
    }

    if (!/^\d+$/.test(lira) || lira.length > 12) return null;
    if (frac && !/^\d{1,2}$/.test(frac)) return null;
    const minor = Number(lira) * 100 + Number((frac + '00').slice(0, 2));
    if (!Number.isSafeInteger(minor) || minor <= 0) return null;
    return minor;
}

export function formatLedgerTry(minor: number): string {
    const negative = minor < 0;
    const abs = Math.abs(Math.trunc(minor));
    const lira = String(Math.trunc(abs / 100));
    const kurus = String(abs % 100).padStart(2, '0');
    const grouped = lira.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${negative ? '-' : ''}${grouped},${kurus} ₺`;
}

function validIsoDate(year: number, month: number, day: number): string | null {
    if (year < 1950 || year > 2100) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        return null;
    }
    const y = String(year).padStart(4, '0');
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** 13.11.25, 13.11.2025 veya 2025-11-13. İki haneli yıl 00–69 → 2000, 70–99 → 1900. */
export function parseLedgerDate(raw: string): string | null {
    const text = raw.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (iso) return validIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    const tr = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(text);
    if (!tr) return null;
    let year = Number(tr[3]);
    if (tr[3].length === 2) year += year >= 70 ? 1900 : 2000;
    return validIsoDate(year, Number(tr[2]), Number(tr[1]));
}

export function formatLedgerDate(iso: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return iso;
    return `${match[3]}.${match[2]}.${match[1]}`;
}

export function todayLedgerIsoDate(now = new Date()): string {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function parseLedgerWrite(row: {
    matter_id?: unknown;
    party_id?: unknown;
    kind?: unknown;
    description?: unknown;
    amount_minor?: unknown;
    entry_date?: unknown;
    balance_minor?: unknown;
    detail_json?: unknown;
}): { ok: true; value: LedgerWrite } | { ok: false; error: string } {
    const kind = String(row.kind || '').trim();
    if (!isLedgerKind(kind)) return { ok: false, error: 'Tür masraf, harç veya avans olmalı' };

    const partyId = String(row.party_id || '').trim();
    if (!partyId) return { ok: false, error: 'Müvekkil seçin' };

    const matterRaw = String(row.matter_id || '').trim();
    const matterId = matterRaw || null;
    let isClientPayout = false;
    if (typeof row.detail_json === 'string' && row.detail_json.includes('"muvekkil_odeme"')) {
        isClientPayout = true;
    }
    if (ledgerKindSide(kind) === 'charge' && !matterId && !isClientPayout) {
        return { ok: false, error: 'Masraf ve harç bir dosyaya bağlı olmalı' };
    }

    const description = String(row.description || '').trim().replace(/\s+/g, ' ');
    if (!description) return { ok: false, error: 'Açıklama gerekli' };
    if (description.length > 400) return { ok: false, error: 'Açıklama çok uzun' };

    const amount = row.amount_minor;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || amount > 100_000_000_000) {
        return { ok: false, error: 'Tutar geçersiz' };
    }

    const entryDate = parseLedgerDate(String(row.entry_date || ''));
    if (!entryDate) return { ok: false, error: 'Tarih geçersiz' };

    let balanceMinor: number | null = null;
    if (typeof row.balance_minor === 'number' && Number.isInteger(row.balance_minor) && row.balance_minor >= 0 && row.balance_minor <= 100_000_000_000) {
        balanceMinor = row.balance_minor;
    }

    let detailJson: string | null = null;
    if (typeof row.detail_json === 'string' && row.detail_json.trim()) {
        detailJson = row.detail_json.trim().slice(0, 6000);
    }

    return {
        ok: true,
        value: {
            matter_id: matterId,
            party_id: partyId,
            kind,
            description,
            amount_minor: amount,
            entry_date: entryDate,
            balance_minor: balanceMinor,
            detail_json: detailJson,
        },
    };
}

export function counterpartyLabel(
    links: Array<{ party_id: string; role: string; full_name: string }>,
    entryPartyId: string,
): string {
    return links
        .filter((link) => link.party_id !== entryPartyId && !SKIP_COUNTERPARTY_ROLES.has(link.role))
        .map((link) => link.full_name.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'tr'))
        .join(', ');
}
