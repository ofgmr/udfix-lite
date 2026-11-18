/**
 * Müvekkil masraf hesabı CSV: hangi dosyaya ne zaman ne yatırıldığı,
 * bakiyeye giren tutar, masraf avansının kalanı ve borç/alacak toplamı.
 */

import { courtMoneyExtras, foldTrCourt, ledgerLineTitle } from './uyapCourtMoney';
import {
    formatLedgerDate,
    formatLedgerTry,
    ledgerEntryWeightMinor,
    summarizeLedger,
    type LedgerKind,
    type LedgerSummary,
} from './matterLedger';

export type ClientLedgerReportLine = {
    entry_date: string;
    kind: LedgerKind;
    description: string;
    amount_minor: number;
    balance_minor?: number | null;
    remaining_minor?: number | null;
    uyap_page?: 'harc' | 'tahsilat' | 'reddiyat' | null;
    receipt_no?: string | null;
    payer_name?: string | null;
    source?: string | null;
    detail_json?: string | null;
    court_name?: string | null;
    court_unit?: string | null;
    file_number?: string | null;
    matter_title?: string | null;
    matter_id?: string | null;
    counterparty_names?: string | null;
};

export type ClientLedgerFileTotal = {
    fileNumber: string;
    courtName: string;
    counterparty: string;
    harcMinor: number;
    masrafMinor: number;
    avansMinor: number;
    fileCollectionMinor: number;
    courtAdvanceDepositedMinor: number;
    courtAdvanceRemainingMinor: number;
    balanceMinor: number;
};

export type ClientLedgerReport = {
    partyName: string;
    generatedAt: string;
    suggestedFileName: string;
    lines: ClientLedgerReportLine[];
    files: ClientLedgerFileTotal[];
    summary: LedgerSummary;
    harcDepositedMinor: number;
    masrafDepositedMinor: number;
    avansDepositedMinor: number;
    courtAdvanceDepositedMinor: number;
    courtAdvanceRemainingMinor: number;
    csvText: string;
};

const SOURCE_LABEL: Record<string, string> = {
    katir: 'Katır',
    manual: 'Elle',
    import: 'İçe aktarıldı',
};

export function isCourtExpenseAdvance(line: Pick<ClientLedgerReportLine, 'kind' | 'description' | 'uyap_page' | 'detail_json'>): boolean {
    if (courtMoneyExtras(line.detail_json).flow === 'dosya_avans') return true;
    if (line.kind !== 'avans') return false;
    const folded = foldTrCourt(line.description);
    if (!folded.includes('avans')) return false;
    if (line.uyap_page === 'tahsilat') return true;
    return folded.includes('masraf') || folded.includes('gider');
}

/** Büronun dosyaya yatırdığı avans. Karşı tarafın ve müvekkilin yatırdığı avans bu toplama girmez. */
export function isOfficeCourtAdvance(line: Pick<ClientLedgerReportLine, 'kind' | 'description' | 'uyap_page' | 'detail_json'>): boolean {
    if (!isCourtExpenseAdvance(line)) return false;
    const depositor = courtMoneyExtras(line.detail_json).depositor;
    return depositor !== 'karsi' && depositor !== 'muvekkil' && depositor !== 'onceki_vekil';
}

/** Dosyadan büro cebine giren alacak: reddiyat, tahsilat. Müvekkile avans iadesi ödeme sayılır. */
export function isFileCollectionCredit(line: Pick<ClientLedgerReportLine, 'kind' | 'description' | 'uyap_page' | 'detail_json'>): boolean {
    if (line.kind !== 'avans') return false;
    const extras = courtMoneyExtras(line.detail_json);
    if (extras.pocket || extras.reddiyatTo === 'biz' || extras.flow === 'reddiyat') return true;
    if (line.uyap_page === 'reddiyat') return true;
    const folded = foldTrCourt(line.description);
    if (folded.includes('avans iadesi')) return false;
    if (folded.includes('reddiyat')) return true;
    return folded.includes('tahsilat') && !folded.includes('avans');
}

const POCKET_PAYOUT_MATCH_DAYS = 10;

function ledgerDateValue(iso: string | undefined): number {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!match) return Number.NaN;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function daysBetween(a: string | undefined, b: string | undefined): number | null {
    const left = ledgerDateValue(a);
    const right = ledgerDateValue(b);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    return Math.abs(left - right) / 86_400_000;
}

function isPocketReddiyat(row: Pick<ClientLedgerReportLine, 'kind' | 'description' | 'uyap_page' | 'detail_json'>): boolean {
    if (row.kind !== 'avans') return false;
    const extras = courtMoneyExtras(row.detail_json);
    return extras.pocket === true && (extras.flow === 'reddiyat' || row.uyap_page === 'reddiyat');
}

function isClientPayout(row: Pick<ClientLedgerReportLine, 'detail_json'>): boolean {
    return courtMoneyExtras(row.detail_json).flow === 'muvekkil_odeme';
}

/**
 * Katır borç reddiyatı brüt gelir. Aynı dosyada yakındaki müvekkile ödeme
 * müvekkil payıdır; kalan (kesinti / karşı vekalet / virman) bakiyeye girmez.
 */
export function applyPocketSettlement<T extends Pick<ClientLedgerReportLine, 'kind' | 'description' | 'uyap_page' | 'detail_json' | 'amount_minor' | 'balance_minor'> & Partial<Pick<ClientLedgerReportLine, 'entry_date' | 'file_number'>>>(
    rows: T[],
): T[] {
    const office = rows.map((row) => asOfficeLedgerLine(row));
    const pockets = office
        .map((row, index) => ({ row, index, weight: ledgerEntryWeightMinor(row) }))
        .filter((item) => isPocketReddiyat(item.row) && item.weight > 0);
    const payouts = office
        .map((row, index) => ({ row, index, weight: ledgerEntryWeightMinor(row), used: false }))
        .filter((item) => isClientPayout(item.row) && item.weight > 0);

    type Pair = { pocketIndex: number; payoutIndex: number; score: number };
    const pairs: Pair[] = [];
    for (const pocket of pockets) {
        for (const payout of payouts) {
            const pocketFile = (pocket.row.file_number || '').trim();
            const payoutFile = (payout.row.file_number || '').trim();
            if (pocketFile && payoutFile && pocketFile !== payoutFile) continue;
            const days = daysBetween(pocket.row.entry_date, payout.row.entry_date);
            if (days == null || days > POCKET_PAYOUT_MATCH_DAYS) continue;
            pairs.push({
                pocketIndex: pocket.index,
                payoutIndex: payout.index,
                score: days + (pocketFile && payoutFile ? 0 : 5),
            });
        }
    }
    pairs.sort((a, b) => a.score - b.score || a.pocketIndex - b.pocketIndex);

    const pocketShare = new Map<number, number>();
    const payoutUsed = new Set<number>();
    const pocketUsed = new Set<number>();
    for (const pair of pairs) {
        if (pocketUsed.has(pair.pocketIndex) || payoutUsed.has(pair.payoutIndex)) continue;
        const pocket = pockets.find((item) => item.index === pair.pocketIndex);
        const payout = payouts.find((item) => item.index === pair.payoutIndex);
        if (!pocket || !payout) continue;
        pocketShare.set(pair.pocketIndex, Math.min(pocket.weight, payout.weight));
        pocketUsed.add(pair.pocketIndex);
        payoutUsed.add(pair.payoutIndex);
    }

    return office.map((row, index) => {
        const share = pocketShare.get(index);
        if (share == null) return row;
        if (share === ledgerEntryWeightMinor(row)) return row;
        return { ...row, balance_minor: share };
    });
}

export function splitAdvanceMinor(rows: Array<Pick<ClientLedgerReportLine, 'kind' | 'description' | 'uyap_page' | 'detail_json' | 'amount_minor' | 'balance_minor'> & Partial<Pick<ClientLedgerReportLine, 'entry_date' | 'file_number'>>>): {
    clientAdvanceMinor: number;
    fileCollectionMinor: number;
} {
    let clientAdvanceMinor = 0;
    let fileCollectionMinor = 0;
    for (const row of applyPocketSettlement(rows)) {
        if (row.kind !== 'avans') continue;
        const weight = ledgerEntryWeightMinor(row);
        if (weight <= 0) continue;
        if (isFileCollectionCredit(row)) fileCollectionMinor += weight;
        else clientAdvanceMinor += weight;
    }
    return { clientAdvanceMinor, fileCollectionMinor };
}

export function courtAdvanceRemainingMinor(line: ClientLedgerReportLine): number {
    if (!isCourtExpenseAdvance(line)) return 0;
    if (line.remaining_minor == null) return 0;
    if (!Number.isFinite(line.remaining_minor) || line.remaining_minor <= 0) return 0;
    return Math.trunc(line.remaining_minor);
}

/** Müvekkilin dosyaya yatırdığı avans, büro avans hesabına girmez. Büronun yatırdığı dosya avansı masraf borcudur. */
export function asOfficeLedgerLine<T extends Pick<ClientLedgerReportLine, 'kind' | 'description' | 'uyap_page' | 'detail_json' | 'balance_minor'>>(line: T): T {
    const depositor = courtMoneyExtras(line.detail_json).depositor;
    if (depositor === 'muvekkil' || depositor === 'karsi' || depositor === 'onceki_vekil') return { ...line, balance_minor: 0 };
    if (isCourtExpenseAdvance(line) && line.kind === 'avans') return { ...line, balance_minor: 0 };
    return line;
}

export function buildClientLedgerReport(input: {
    partyName: string;
    generatedAt: string;
    lines: ClientLedgerReportLine[];
}): ClientLedgerReport {
    const lines = applyPocketSettlement([...input.lines].sort(compareLines));
    const summary = summarizeLedger(lines);
    let harcDepositedMinor = 0;
    let masrafDepositedMinor = 0;
    let courtAdvanceDepositedMinor = 0;
    let courtAdvanceLeftMinor = 0;
    const advanceSplit = splitAdvanceMinor(lines);
    for (const line of lines) {
        const weight = ledgerEntryWeightMinor(line);
        switch (line.kind) {
            case 'harc':
                harcDepositedMinor += weight;
                break;
            case 'masraf':
                if (line.uyap_page !== 'reddiyat') masrafDepositedMinor += weight;
                break;
            case 'avans':
                break;
            default: {
                const exhaustive: never = line.kind;
                throw new Error(`Unknown ledger kind: ${String(exhaustive)}`);
            }
        }
        if (isOfficeCourtAdvance(line)) {
            courtAdvanceDepositedMinor += line.amount_minor;
            courtAdvanceLeftMinor += courtAdvanceRemainingMinor(line);
        }
    }
    const files = fileTotals(lines);
    const report: ClientLedgerReport = {
        partyName: input.partyName.trim() || 'Müvekkil',
        generatedAt: input.generatedAt,
        suggestedFileName: suggestedLedgerFileName(input.partyName, input.generatedAt),
        lines,
        files,
        summary,
        harcDepositedMinor,
        masrafDepositedMinor,
        avansDepositedMinor: advanceSplit.clientAdvanceMinor,
        courtAdvanceDepositedMinor,
        courtAdvanceRemainingMinor: courtAdvanceLeftMinor,
        csvText: '',
    };
    report.csvText = serializeClientLedgerCsv(report);
    return report;
}

export function suggestedLedgerFileName(partyName: string, generatedAt: string): string {
    const slug =
        String(partyName || 'Muvekkil')
            .trim()
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .slice(0, 80) || 'Muvekkil';
    const day = String(generatedAt || '').slice(0, 10) || 'tarih';
    return `UDFIX_${slug}_hesap_${day}.csv`;
}

function compareLines(a: ClientLedgerReportLine, b: ClientLedgerReportLine): number {
    const date = a.entry_date.localeCompare(b.entry_date);
    if (date !== 0) return date;
    const file = fileLabel(a).localeCompare(fileLabel(b), 'tr');
    if (file !== 0) return file;
    return a.description.localeCompare(b.description, 'tr');
}

function fileLabel(line: ClientLedgerReportLine): string {
    return (line.file_number || line.matter_title || 'Dosyasız').trim();
}

function courtLabel(line: ClientLedgerReportLine): string {
    return (line.court_name || line.court_unit || '').trim();
}

function kindLabel(line: ClientLedgerReportLine): string {
    if (!courtMoneyExtras(line.detail_json).flow && isCourtExpenseAdvance(line)) return 'Dosya avansı';
    return ledgerLineTitle({ kind: line.kind, uyap_page: line.uyap_page, detail_json: line.detail_json });
}

function placeLabel(line: ClientLedgerReportLine): string {
    const flow = courtMoneyExtras(line.detail_json).flow;
    if (flow === 'dosya_avans' || flow === 'tahsilat' || flow === 'teminat' || flow === 'reddiyat' || isCourtExpenseAdvance(line)) {
        return 'Dosya';
    }
    if (line.kind === 'avans') return 'Büro';
    return '';
}

function sourceLabel(source?: string | null): string {
    if (!source) return '';
    return SOURCE_LABEL[source] || source;
}

function moneyCell(minor: number): string {
    return formatLedgerTry(minor).replace(' ₺', '');
}

function csvCell(value: string): string {
    const text = String(value ?? '');
    if (/[;"\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

function csvRow(cells: string[]): string {
    return cells.map(csvCell).join(';');
}

function fileKey(line: ClientLedgerReportLine): string {
    return line.matter_id || `${fileLabel(line)}|${courtLabel(line)}`;
}

function fileTotals(lines: ClientLedgerReportLine[]): ClientLedgerFileTotal[] {
    const groups = new Map<string, ClientLedgerReportLine[]>();
    for (const line of lines) {
        const key = fileKey(line);
        const list = groups.get(key) ?? [];
        list.push(line);
        groups.set(key, list);
    }
    const totals: ClientLedgerFileTotal[] = [];
    for (const group of groups.values()) {
        const head = group[0];
        let harcMinor = 0;
        let masrafMinor = 0;
        let avansMinor = 0;
        let fileCollectionMinor = 0;
        let courtAdvanceDepositedMinor = 0;
        let courtAdvanceRemaining = 0;
        for (const line of group) {
            const weight = ledgerEntryWeightMinor(asOfficeLedgerLine(line));
            switch (line.kind) {
                case 'harc':
                    harcMinor += weight;
                    break;
                case 'masraf':
                    if (line.uyap_page !== 'reddiyat') masrafMinor += weight;
                    break;
                case 'avans':
                    if (isFileCollectionCredit(line)) fileCollectionMinor += weight;
                    else avansMinor += weight;
                    break;
                default: {
                    const exhaustive: never = line.kind;
                    throw new Error(`Unknown ledger kind: ${String(exhaustive)}`);
                }
            }
            if (isOfficeCourtAdvance(line)) {
                courtAdvanceDepositedMinor += line.amount_minor;
                courtAdvanceRemaining += courtAdvanceRemainingMinor(line);
            }
        }
        totals.push({
            fileNumber: fileLabel(head),
            courtName: courtLabel(head),
            counterparty: (head.counterparty_names || '').trim(),
            harcMinor,
            masrafMinor,
            avansMinor,
            fileCollectionMinor,
            courtAdvanceDepositedMinor,
            courtAdvanceRemainingMinor: courtAdvanceRemaining,
            balanceMinor: summarizeLedger(group.map(asOfficeLedgerLine)).balanceMinor,
        });
    }
    totals.sort((a, b) => a.fileNumber.localeCompare(b.fileNumber, 'tr') || a.courtName.localeCompare(b.courtName, 'tr'));
    return totals;
}

function serializeClientLedgerCsv(report: ClientLedgerReport): string {
    const lines = [
        csvRow(['Hareketler']),
        csvRow([
            'Tarih',
            'Dosya no',
            'Mahkeme',
            'Karşı taraf',
            'Tür',
            'Yer',
            'Açıklama',
            'Yatırılan',
            'Bakiyeye yazılan',
            'Kalan',
            'Makbuz',
            'Ödeyen',
            'Kaynak',
            'Bakiyede',
        ]),
        ...report.lines.map((line) => {
            const weight = ledgerEntryWeightMinor(asOfficeLedgerLine(line));
            const remaining = line.remaining_minor == null ? '' : moneyCell(line.remaining_minor);
            return csvRow([
                formatLedgerDate(line.entry_date),
                fileLabel(line),
                courtLabel(line),
                (line.counterparty_names || '').trim(),
                kindLabel(line),
                placeLabel(line),
                line.description,
                moneyCell(line.amount_minor),
                moneyCell(weight),
                remaining,
                line.receipt_no || '',
                line.payer_name || '',
                sourceLabel(line.source),
                weight > 0 ? 'Evet' : 'Hayır',
            ]);
        }),
        '',
        csvRow(['Dosya özeti']),
        csvRow([
            'Dosya no',
            'Mahkeme',
            'Karşı taraf',
            'Harç',
            'Masraf',
            'Müvekkil avansı',
            'Dosya tahsilatı',
            'Dosyaya yatırılan avans',
            'Dosyada kalan avans',
            'Dosya bakiyesi',
        ]),
        ...report.files.map((file) => csvRow([
            file.fileNumber,
            file.courtName,
            file.counterparty,
            moneyCell(file.harcMinor),
            moneyCell(file.masrafMinor),
            moneyCell(file.avansMinor),
            moneyCell(file.fileCollectionMinor),
            moneyCell(file.courtAdvanceDepositedMinor),
            moneyCell(file.courtAdvanceRemainingMinor),
            moneyCell(file.balanceMinor),
        ])),
        '',
        csvRow(['Genel toplam']),
        csvRow(['Kalem', 'Tutar']),
        csvRow(['Bakiyeye giren harç', moneyCell(report.harcDepositedMinor)]),
        csvRow(['Bakiyeye giren masraf ve ödeme', moneyCell(report.masrafDepositedMinor)]),
        csvRow(['Müvekkil avansı', moneyCell(report.avansDepositedMinor)]),
        csvRow(['Dosya tahsilatı', moneyCell(splitAdvanceMinor(report.lines).fileCollectionMinor)]),
        csvRow(['Bakiyeye giren borç', moneyCell(report.summary.chargeMinor)]),
        csvRow(['Net', moneyCell(report.summary.balanceMinor)]),
        csvRow(['Durum', report.summary.positionLabel]),
        csvRow(['Dosyaya yatırılan avans', moneyCell(report.courtAdvanceDepositedMinor)]),
        csvRow(['Dosyada kalan avans', moneyCell(report.courtAdvanceRemainingMinor)]),
    ];
    return `\uFEFF${lines.join('\r\n')}`;
}
