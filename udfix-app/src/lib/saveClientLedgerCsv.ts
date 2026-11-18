import { DataService } from '../services/dataService';
import { buildClientLedgerReport } from '../../electron/shared/clientLedgerReport';

export async function saveClientLedgerCsv(
    partyId: string,
    partyName: string,
): Promise<'saved' | 'cancelled'> {
    const lines = await DataService.listMatterLedger({ partyId });
    const today = new Date();
    const generatedAt = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
    ].join('-');
    const report = buildClientLedgerReport({
        partyName,
        generatedAt,
        lines,
    });
    const filePath = await DataService.showSaveCsvDialog(report.suggestedFileName);
    if (!filePath) return 'cancelled';
    const ok = await DataService.writeTextFile(filePath, report.csvText);
    if (!ok) throw new Error('CSV yazılamadı');
    return 'saved';
}
