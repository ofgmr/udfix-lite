import type { DosyaTurBucket } from './openingMonths';
import { toTurkishTitleCase } from './turkishTitleCase';

export const CLIENT_REPORT_CSV_HEADERS = [
    'Karşı taraf',
    'Dosya no',
    'Mahkeme',
    'Tür',
    'Kayıt',
    'Dosya türü',
    'Açılış',
    'Kapanış',
    'Durum',
    'UYAP durum',
    'Sıfat',
    'Son evrak',
    'Son evrak tarihi',
    'Son işlemler',
] as const;

export const DEFAULT_LAST_EVRAK_LIMIT = 5;
export const MIN_LAST_EVRAK_LIMIT = 1;
export const MAX_LAST_EVRAK_LIMIT = 20;

const OFFICE_ROLE_LABELS: Record<string, string> = {
    DAVACI: 'Davacı',
    DAVALI: 'Davalı',
    MUSTEKI: 'Müşteki',
    SANIK: 'Sanık',
    MUVEKKIL: 'Müvekkil',
    CLIENT: 'Müvekkil',
    KARSITARAF: 'Karşı taraf',
    COUNTERPARTY: 'Karşı taraf',
    BORCLU: 'Borçlu',
    ALACAKLI: 'Alacaklı',
    UCUNCUSAHIS: 'Üçüncü şahıs',
    UCUNCUKISI: 'Üçüncü kişi',
    TANIK: 'Tanık',
    VEKIL: 'Vekil',
    DIGER: 'Diğer',
    TALEPEDEN: 'Talep eden',
    BASVURAN: 'Başvuran',
};

const PROCESS_SIFAT_KEYS = new Set([
    'DAVACI',
    'DAVALI',
    'MUSTEKI',
    'SANIK',
    'KARSITARAF',
    'COUNTERPARTY',
    'BORCLU',
    'ALACAKLI',
    'UCUNCUSAHIS',
    'UCUNCUKISI',
    'TANIK',
    'TALEPEDEN',
    'BASVURAN',
]);

const OFFICE_ONLY_ROLE_KEYS = new Set(['MUVEKKIL', 'CLIENT', 'VEKIL', 'DIGER']);

const UYAP_PROCESS_BY_CODE: Record<number, string> = {
    1: 'Davacı',
    2: 'Davalı',
    3: 'Sanık',
    7: 'Müşteki',
    21: 'Alacaklı',
    22: 'Borçlu',
};

const RECORD_TYPE_LABELS: Record<string, string> = {
    LAW_CASE: 'Dava',
    ENFORCEMENT: 'İcra',
    ADVISORY: 'Danışmanlık',
    MEDIATION: 'Arabuluculuk/Uzlaşma',
    PROSECUTION: 'Soruşturma',
    ARBITRATION: 'Tahkim',
};

const STATUS_LABELS: Record<string, string> = {
    OPEN: 'Açık',
    CLOSED: 'Kapalı',
    APPEAL: 'İstinaf/Temyiz',
    ARCHIVED: 'Arşiv',
};

const BUCKET_LABELS: Record<DosyaTurBucket, string> = {
    icra: 'İcra',
    hukuk: 'Hukuk',
    ceza: 'Ceza',
    idare: 'İdari',
    other: 'Diğer',
};

export type ClientReportSummary = {
    matterCount: number;
    davaOpen: number;
    davaTotal: number;
    icraOpen: number;
    icraTotal: number;
    appealCount: number;
    openCount: number;
    closedCount: number;
};

export type ClientReportRow = {
    matterId: string;
    karsiTaraf: string;
    fileNumber: string;
    courtName: string;
    tur: string;
    kayit: string;
    dosyaTuru: string;
    openingDate: string;
    closingDate: string;
    status: string;
    uyapDurum: string;
    sifat: string;
    lastEvrakTur: string;
    lastEvrakDate: string;
    lastOperations: string;
};

export type ClientReport = {
    partyId: string;
    partyName: string;
    generatedAt: string;
    suggestedFileName: string;
    summary: ClientReportSummary;
    rows: ClientReportRow[];
    csvText: string;
};

export type ClientReportMatterInput = {
    id: string;
    fileNumber?: string | null;
    courtName?: string | null;
    matterType?: string | null;
    status?: string | null;
    openingDate?: string | null;
    closingDate?: string | null;
    turBucket: DosyaTurBucket;
    dosyaTuru?: string | null;
    uyapDurum?: string | null;
    sifat: string;
    karsiTaraf?: string | null;
    lastEvrakTur?: string | null;
    lastEvrakDate?: string | null;
    lastOperations?: string | null;
};

export type ClientReportEvrakItem = {
    tur: string;
    date: string;
};

function foldRoleKey(value: string): string {
    return String(value || '')
        .trim()
        .toLocaleUpperCase('tr-TR')
        .replace(/İ/g, 'I')
        .replace(/Ş/g, 'S')
        .replace(/Ğ/g, 'G')
        .replace(/Ü/g, 'U')
        .replace(/Ö/g, 'O')
        .replace(/Ç/g, 'C')
        .replace(/[^A-Z0-9]/g, '');
}

export function clampLastEvrakLimit(raw?: number): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_LAST_EVRAK_LIMIT;
    return Math.max(MIN_LAST_EVRAK_LIMIT, Math.min(MAX_LAST_EVRAK_LIMIT, Math.floor(n)));
}

export function localIsoDate(date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function toIsoDate(raw: unknown): string {
    const text = String(raw ?? '').trim();
    if (!text) return '';
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const tr = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (tr) {
        return `${tr[3]}-${String(Number(tr[2])).padStart(2, '0')}-${String(Number(tr[1])).padStart(2, '0')}`;
    }
    return '';
}

export function coalesceOpeningDate(row: {
    openingDate?: string | null;
    dosyaAcilisTarihi?: unknown;
    attrOpening?: string | null;
}): string {
    return (
        toIsoDate(row.openingDate) ||
        toIsoDate(row.dosyaAcilisTarihi) ||
        toIsoDate(row.attrOpening)
    );
}

export function formatStatusLabel(status?: string | null): string {
    const key = String(status || '').trim().toUpperCase();
    return STATUS_LABELS[key] || (key ? toTurkishTitleCase(key) : '');
}

export function formatRecordTypeLabel(matterType?: string | null): string {
    const key = String(matterType || '').trim().toUpperCase();
    return RECORD_TYPE_LABELS[key] || '';
}

export function formatBucketLabel(bucket: DosyaTurBucket): string {
    return BUCKET_LABELS[bucket];
}

export function formatOfficeRoleLabel(role?: string | null): string {
    const raw = String(role ?? '').trim();
    if (!raw) return '';
    const key = foldRoleKey(raw);
    if (OFFICE_ROLE_LABELS[key]) return OFFICE_ROLE_LABELS[key];
    return toTurkishTitleCase(raw.replace(/_/g, ' '));
}

export function formatProcessRoleLabel(role: unknown): string {
    if (role == null || role === '') return '';
    if (typeof role === 'number' && Number.isFinite(role)) {
        return UYAP_PROCESS_BY_CODE[role] || '';
    }
    const raw = String(role).trim();
    if (!raw) return '';
    const asNumber = Number(raw);
    if (/^\d+$/.test(raw) && Number.isFinite(asNumber) && UYAP_PROCESS_BY_CODE[asNumber]) {
        return UYAP_PROCESS_BY_CODE[asNumber];
    }
    const key = foldRoleKey(raw);
    if (OFFICE_ROLE_LABELS[key]) return OFFICE_ROLE_LABELS[key];
    return toTurkishTitleCase(raw.replace(/_/g, ' '));
}

export function isProcessSifatRole(role?: string | null): boolean {
    const key = foldRoleKey(String(role ?? ''));
    if (!key) return false;
    if (OFFICE_ONLY_ROLE_KEYS.has(key)) return false;
    return PROCESS_SIFAT_KEYS.has(key);
}

export function resolveClientSifat(officeRole?: string | null, processRole?: unknown): string {
    if (isProcessSifatRole(officeRole)) return formatOfficeRoleLabel(officeRole);
    const processLabel = formatProcessRoleLabel(processRole);
    if (processLabel) return processLabel;
    return formatOfficeRoleLabel(officeRole);
}

export function lookupPartyProcessRole(
    partyProcessRoles: unknown,
    partyIds: string[],
): unknown {
    if (partyProcessRoles == null) return undefined;
    let map: Record<string, unknown> = {};
    if (typeof partyProcessRoles === 'string') {
        const text = partyProcessRoles.trim();
        if (!text) return undefined;
        try {
            const parsed = JSON.parse(text) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                map = parsed as Record<string, unknown>;
            }
        } catch {
            return undefined;
        }
    } else if (typeof partyProcessRoles === 'object' && !Array.isArray(partyProcessRoles)) {
        map = partyProcessRoles as Record<string, unknown>;
    } else {
        return undefined;
    }
    for (const id of partyIds) {
        if (!id) continue;
        if (map[id] != null && String(map[id]).trim() !== '') return map[id];
    }
    return undefined;
}

export type ReportPartyLink = {
    partyId: string;
    fullName?: string | null;
    role?: string | null;
};

function displayPartyName(raw?: string | null): string {
    return toTurkishTitleCase(raw)
        .replace(/\bA\.ş\./g, 'A.Ş.')
        .replace(/\bLtd\.?\s*şti\.?/gi, 'Ltd. Şti.');
}

function isSkippedCounterpartRole(role?: string | null): boolean {
    const key = foldRoleKey(String(role ?? ''));
    return key === 'VEKIL' || key === 'TANIK';
}

function isOfficeMuvekkilRoleKey(role?: string | null): boolean {
    const key = foldRoleKey(String(role ?? ''));
    return key === 'MUVEKKIL' || key === 'CLIENT';
}

function isOfficeKarsiRoleKey(role?: string | null): boolean {
    const key = foldRoleKey(String(role ?? ''));
    return key === 'KARSITARAF' || key === 'COUNTERPARTY';
}

/**
 * Other litigants on the file for the CSV “Karşı taraf” column.
 * Excludes the report subject, co-clients (MÜVEKKİL), vekil, and tanık.
 * Çekişmesiz files (no remaining parties) stay empty.
 */
export function formatReportKarsiTaraf(
    parties: ReportPartyLink[] | null | undefined,
    subjectPartyIds: string[],
): string {
    if (!parties?.length) return '';
    const subject = new Set(subjectPartyIds.filter(Boolean));
    const counters: string[] = [];
    const others: string[] = [];
    const seen = new Set<string>();

    for (const party of parties) {
        if (subject.has(party.partyId)) continue;
        if (isSkippedCounterpartRole(party.role)) continue;
        const name = displayPartyName(party.fullName);
        if (!name) continue;
        const key = name.toLocaleLowerCase('tr-TR');
        if (seen.has(key)) continue;
        seen.add(key);
        if (isOfficeKarsiRoleKey(party.role)) {
            counters.push(name);
            continue;
        }
        if (isOfficeMuvekkilRoleKey(party.role)) continue;
        others.push(name);
    }

    return [...counters, ...others].join(', ');
}

export function formatLastOperations(items: ClientReportEvrakItem[]): string {
    return items
        .filter((item) => item.tur || item.date)
        .map((item) => {
            const tur = item.tur.trim() || 'Evrak';
            const date = formatDisplayDate(item.date);
            return date ? `${tur} (${date})` : tur;
        })
        .join('; ');
}

export function formatDisplayDate(iso: string): string {
    const match = String(iso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return String(iso || '').trim();
    return `${match[3]}.${match[2]}.${match[1]}`;
}

export function suggestedClientReportFileName(partyName: string, generatedAt: string): string {
    const slug =
        String(partyName || 'Müvekkil')
            .trim()
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .slice(0, 80) || 'Muvekkil';
    return `UDFIX_${slug}_rapor_${generatedAt}.csv`;
}

function csvCell(value: string): string {
    const text = String(value ?? '');
    if (/[;"\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

export function serializeClientReportCsv(report: Pick<ClientReport, 'rows'>): string {
    const lines = [
        CLIENT_REPORT_CSV_HEADERS.join(';'),
        ...report.rows.map((row) =>
            [
                row.karsiTaraf,
                row.fileNumber,
                row.courtName,
                row.tur,
                row.kayit,
                row.dosyaTuru,
                row.openingDate,
                row.closingDate,
                row.status,
                row.uyapDurum,
                row.sifat,
                row.lastEvrakTur,
                row.lastEvrakDate,
                row.lastOperations,
            ]
                .map(csvCell)
                .join(';'),
        ),
    ];
    return `\uFEFF${lines.join('\r\n')}`;
}

function emptySummary(): ClientReportSummary {
    return {
        matterCount: 0,
        davaOpen: 0,
        davaTotal: 0,
        icraOpen: 0,
        icraTotal: 0,
        appealCount: 0,
        openCount: 0,
        closedCount: 0,
    };
}

function isOpenLike(status?: string | null): boolean {
    const value = String(status || '').trim().toUpperCase();
    return value === 'OPEN' || value === 'APPEAL';
}

function isClosedLike(status?: string | null): boolean {
    const value = String(status || '').trim().toUpperCase();
    return value === 'CLOSED' || value === 'ARCHIVED';
}

export function summarizeClientReportMatters(
    rows: Array<{ turBucket: DosyaTurBucket; status?: string | null }>,
): ClientReportSummary {
    const summary = emptySummary();
    summary.matterCount = rows.length;
    for (const row of rows) {
        if (String(row.status || '').trim().toUpperCase() === 'APPEAL') summary.appealCount += 1;
        if (isOpenLike(row.status)) summary.openCount += 1;
        if (isClosedLike(row.status)) summary.closedCount += 1;
        if (row.turBucket === 'icra') {
            summary.icraTotal += 1;
            if (isOpenLike(row.status)) summary.icraOpen += 1;
            continue;
        }
        if (row.turBucket === 'hukuk' || row.turBucket === 'ceza' || row.turBucket === 'idare') {
            summary.davaTotal += 1;
            if (isOpenLike(row.status)) summary.davaOpen += 1;
        }
    }
    return summary;
}

export function assembleClientReport(input: {
    partyId: string;
    partyName: string;
    generatedAt: string;
    matters: ClientReportMatterInput[];
}): ClientReport {
    const reportDate = input.generatedAt;
    const rows: ClientReportRow[] = input.matters.map((matter) => ({
        matterId: matter.id,
        karsiTaraf: String(matter.karsiTaraf || '').trim(),
        fileNumber: String(matter.fileNumber || '').trim(),
        courtName: String(matter.courtName || '').trim(),
        tur: formatBucketLabel(matter.turBucket),
        kayit: formatRecordTypeLabel(matter.matterType),
        dosyaTuru: String(matter.dosyaTuru || '').trim(),
        openingDate: String(matter.openingDate || '').trim(),
        closingDate: toIsoDate(matter.closingDate),
        status: formatStatusLabel(matter.status),
        uyapDurum: String(matter.uyapDurum || '').trim(),
        sifat: matter.sifat,
        lastEvrakTur: String(matter.lastEvrakTur || '').trim(),
        lastEvrakDate: String(matter.lastEvrakDate || '').trim(),
        lastOperations: String(matter.lastOperations || '').trim(),
    }));
    const summary = summarizeClientReportMatters(input.matters);
    const report: ClientReport = {
        partyId: input.partyId,
        partyName: input.partyName,
        generatedAt: reportDate,
        suggestedFileName: suggestedClientReportFileName(input.partyName, reportDate),
        summary,
        rows,
        csvText: '',
    };
    report.csvText = serializeClientReportCsv(report);
    return report;
}
