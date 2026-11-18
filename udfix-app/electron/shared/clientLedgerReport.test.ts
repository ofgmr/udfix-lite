/**
 * Run: npx tsx electron/shared/clientLedgerReport.test.ts
 */
import assert from 'node:assert/strict';
import { applyPocketSettlement, buildClientLedgerReport, isCourtExpenseAdvance, isOfficeCourtAdvance, isFileCollectionCredit, splitAdvanceMinor } from './clientLedgerReport';

const report = buildClientLedgerReport({
    partyName: 'Örnek İnşaat Ltd. Şti.',
    generatedAt: '2026-10-30',
    lines: [
        {
            entry_date: '2025-11-18',
            kind: 'harc',
            description: 'Peşin/Nispi Harç',
            amount_minor: 101390,
            balance_minor: 101390,
            remaining_minor: 0,
            uyap_page: 'harc',
            receipt_no: '654547',
            payer_name: 'ÖRNEK İNŞAAT',
            source: 'katir',
            file_number: '2024/2002',
            court_name: 'Örnek Hukuk Mahkemesi',
            matter_id: 'm-tevzi',
            counterparty_names: 'Karşı Ltd.',
        },
        {
            entry_date: '2025-11-18',
            kind: 'avans',
            description: 'Gider Avansı',
            amount_minor: 250000,
            balance_minor: 0,
            remaining_minor: 0,
            uyap_page: 'tahsilat',
            receipt_no: '463231',
            source: 'katir',
            file_number: '2024/2002',
            court_name: 'Örnek Hukuk Mahkemesi',
            matter_id: 'm-tevzi',
        },
        {
            entry_date: '2026-10-08',
            kind: 'avans',
            description: 'Masraf Avansı Tahsilatı',
            amount_minor: 50000,
            balance_minor: 50000,
            remaining_minor: 50000,
            uyap_page: 'tahsilat',
            source: 'katir',
            file_number: '2024/1001',
            court_name: 'Örnek 8. İcra Dairesi',
            matter_id: 'm-icra',
        },
        {
            entry_date: '2026-04-22',
            kind: 'harc',
            description: 'Vekalet Suret Harcı',
            amount_minor: 10400,
            balance_minor: 0,
            uyap_page: 'harc',
            payer_name: 'Av. BARAN KOCAK',
            source: 'katir',
            file_number: '2024/1001',
            matter_id: 'm-icra',
        },
        {
            entry_date: '2026-01-01',
            kind: 'avans',
            description: 'Elden avans',
            amount_minor: 10000,
            source: 'manual',
            file_number: '2024/1001',
            matter_id: 'm-icra',
        },
    ],
});

assert.equal(isCourtExpenseAdvance(report.lines.find((line) => line.description === 'Gider Avansı')!), true);
assert.equal(isCourtExpenseAdvance({ kind: 'avans', description: 'Elden avans' }), false);
assert.equal(isOfficeCourtAdvance({
    kind: 'masraf',
    description: 'Masraf Avansı Tahsilatı',
    uyap_page: 'tahsilat',
    detail_json: JSON.stringify({ flow: 'dosya_avans', depositor: 'karsi' }),
}), false);
assert.equal(isOfficeCourtAdvance({
    kind: 'masraf',
    description: 'Masraf Avansı Tahsilatı',
    uyap_page: 'tahsilat',
    detail_json: JSON.stringify({ flow: 'dosya_avans', depositor: 'buro' }),
}), true);
assert.equal(isFileCollectionCredit({ kind: 'avans', description: 'Avans' }), false);
assert.equal(isFileCollectionCredit({ kind: 'avans', description: 'Avans İadesi' }), false);
assert.equal(isFileCollectionCredit({
    kind: 'avans',
    description: 'Borç Reddiyatı',
    uyap_page: 'reddiyat',
    detail_json: JSON.stringify({ pocket: true, reddiyatTo: 'biz' }),
}), true);
assert.deepEqual(splitAdvanceMinor([
    { kind: 'avans', description: 'Avans', amount_minor: 788400, balance_minor: 788400 },
    { kind: 'masraf', description: 'Avans İadesi', amount_minor: 1520510, balance_minor: 1520510, detail_json: '{"flow":"muvekkil_odeme"}' },
    { kind: 'avans', description: 'Borç Reddiyatı', amount_minor: 100000, balance_minor: 100000, uyap_page: 'reddiyat', detail_json: '{"pocket":true}' },
]), { clientAdvanceMinor: 788400, fileCollectionMinor: 100000 });

const settled = applyPocketSettlement([
    {
        kind: 'avans' as const,
        description: 'Borç Reddiyatı',
        amount_minor: 7666300,
        balance_minor: 7666300,
        entry_date: '2026-03-13',
        file_number: '2024/1002',
        uyap_page: 'reddiyat' as const,
        detail_json: JSON.stringify({ pocket: true, flow: 'reddiyat', reddiyatTo: 'biz' }),
    },
    {
        kind: 'masraf' as const,
        description: 'Örnek ödeme',
        amount_minor: 6815340,
        balance_minor: 6815340,
        entry_date: '2026-03-13',
        file_number: '2024/1002',
        detail_json: JSON.stringify({ flow: 'muvekkil_odeme' }),
    },
    {
        kind: 'avans' as const,
        description: 'Borç Reddiyatı',
        amount_minor: 7666300,
        balance_minor: 7666300,
        entry_date: '2026-04-14',
        file_number: '2024/1002',
        uyap_page: 'reddiyat' as const,
        detail_json: JSON.stringify({ pocket: true, flow: 'reddiyat', reddiyatTo: 'biz' }),
    },
]);
assert.equal(settled[0].balance_minor, 6815340);
assert.equal(settled[2].balance_minor, 7666300);
assert.equal(report.courtAdvanceDepositedMinor, 300000);
assert.equal(report.courtAdvanceRemainingMinor, 50000);
assert.equal(report.summary.chargeMinor, 101390);
assert.equal(report.summary.advanceMinor, 10000);
assert.equal(report.summary.balanceMinor, 10000 - 101390);
assert.equal(report.summary.position, 'debt');
assert.equal(report.files.length, 2);
const tevzi = report.files.find((file) => file.fileNumber === '2024/2002');
assert.equal(tevzi?.courtAdvanceRemainingMinor, 0);
assert.equal(tevzi?.courtAdvanceDepositedMinor, 250000);
assert.equal(tevzi?.harcMinor, 101390);
const icra = report.files.find((file) => file.fileNumber === '2024/1001');
assert.equal(icra?.courtAdvanceRemainingMinor, 50000);
assert.equal(icra?.avansMinor, 10000);
assert.ok(report.csvText.startsWith('\uFEFFHareketler'));
assert.ok(report.csvText.includes('Peşin/Nispi Harç'));
assert.ok(report.csvText.includes('Gider Avansı'));
assert.ok(report.csvText.includes('Dosyada kalan avans'));
assert.ok(report.csvText.includes('Müvekkil avansı'));
assert.ok(report.csvText.includes('Dosya tahsilatı'));
assert.ok(report.csvText.includes('Dosya avansı'));
assert.ok(report.csvText.includes('Müvekkil borcu'));
assert.ok(report.csvText.includes('1.013,90'));
assert.ok(report.csvText.includes('500,00'));
assert.equal(report.suggestedFileName, 'UDFIX_Örnek_İnşaat_Ltd._Şti._hesap_2026-10-30.csv');
assert.ok(report.lines[0].entry_date <= report.lines[report.lines.length - 1].entry_date);

console.log('clientLedgerReport.test.ts ok');
