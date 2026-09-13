import type { Matter } from '../services/dataService';

/** Kayıt türü — `matters.matter_type` */
export type MatterRecordType = Matter['matter_type'];

export const MATTER_RECORD_TYPE_OPTIONS: readonly {
    value: MatterRecordType;
    label: string;
}[] = [
    { value: 'LAW_CASE', label: 'Dava' },
    { value: 'ENFORCEMENT', label: 'İcra' },
    { value: 'ADVISORY', label: 'Danışmanlık' },
    { value: 'MEDIATION', label: 'Arabuluculuk/Uzlaşma' },
    { value: 'PROSECUTION', label: 'Soruşturma' },
    { value: 'ARBITRATION', label: 'Tahkim' },
] as const;

export const MATTER_RECORD_TYPE_LABELS: Record<MatterRecordType, string> = Object.fromEntries(
    MATTER_RECORD_TYPE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<MatterRecordType, string>;

/** Merci — `matters.matter_category` (legacy column name). */
export type MatterMerci =
    | 'COURT'
    | 'ENFORCEMENT_OFFICE'
    | 'CBS'
    | 'ADMINISTRATIVE_BODY'
    | 'OTHER';

export const MATTER_MERCI_OPTIONS: readonly { value: MatterMerci; label: string }[] = [
    { value: 'COURT', label: 'Mahkeme' },
    { value: 'ENFORCEMENT_OFFICE', label: 'İcra Müdürlüğü' },
    { value: 'CBS', label: 'CBS' },
    { value: 'ADMINISTRATIVE_BODY', label: 'İdari Kurum' },
    { value: 'OTHER', label: 'Diğer' },
] as const;

export const MATTER_MERCI_LABELS: Record<MatterMerci, string> = Object.fromEntries(
    MATTER_MERCI_OPTIONS.map((o) => [o.value, o.label]),
) as Record<MatterMerci, string>;

/** Merci values that use free-text / autocomplete instead of yargı birimi dropdown. */
export const MERCI_FREE_TEXT_VALUES: ReadonlySet<MatterMerci> = new Set([
    'ENFORCEMENT_OFFICE',
    'CBS',
    'ADMINISTRATIVE_BODY',
    'OTHER',
]);

export function isMatterMerci(value: unknown): value is MatterMerci {
    return typeof value === 'string' && value in MATTER_MERCI_LABELS;
}

export function isMatterRecordType(value: unknown): value is MatterRecordType {
    return typeof value === 'string' && value in MATTER_RECORD_TYPE_LABELS;
}

/** Map legacy Dosya Alanı values → Merci. */
export const LEGACY_CATEGORY_TO_MERCI: Record<string, MatterMerci> = {
    CIVIL: 'COURT',
    CRIMINAL: 'COURT',
    ADMINISTRATIVE: 'COURT',
    CONSTITUTIONAL: 'COURT',
    ENFORCEMENT_PROCEEDING: 'ENFORCEMENT_OFFICE',
    PROSECUTION: 'CBS',
    MEDIATION: 'OTHER',
    SETTLEMENT: 'OTHER',
    ADVISORY_WORK: 'OTHER',
    OTHER: 'OTHER',
};

/** Infer record type from legacy category when `matter_type` was derived incorrectly. */
export function inferRecordTypeFromLegacyCategory(
    legacyCategory: string | null | undefined,
    currentType: MatterRecordType | string | null | undefined,
): MatterRecordType {
    const cat = String(legacyCategory ?? '').trim();
    if (cat === 'PROSECUTION') return 'PROSECUTION';
    if (cat === 'ENFORCEMENT_PROCEEDING') return 'ENFORCEMENT';
    if (cat === 'ADVISORY_WORK') return 'ADVISORY';
    if (cat === 'MEDIATION' || cat === 'SETTLEMENT') return 'MEDIATION';
    if (isMatterRecordType(currentType)) return currentType;
    return 'LAW_CASE';
}

export function normalizeMatterMerci(raw: unknown): MatterMerci | '' {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    if (isMatterMerci(s)) return s;
    return LEGACY_CATEGORY_TO_MERCI[s] ?? '';
}

export function merciLabel(raw: unknown): string {
    const normalized = normalizeMatterMerci(raw);
    return normalized ? MATTER_MERCI_LABELS[normalized] : '—';
}

export function recordTypeLabel(raw: unknown): string {
    if (isMatterRecordType(raw)) return MATTER_RECORD_TYPE_LABELS[raw];
    return '—';
}
