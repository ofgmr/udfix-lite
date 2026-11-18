/**
 * Run: npx tsx electron/uyapCourtMoneyApply.test.ts
 */
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { applyUyapCourtMoney } from './uyapCourtMoneyApply';
import { summarizeLedger, type LedgerKind } from './shared/matterLedger';

const CLIENT = 'AYSE DENIZ';
const LAWYER = 'KEREM YILDIZ';
const UNIT = 'Örnek 1. İcra Dairesi';

function openDb(): Database.Database {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE matters (
            id TEXT PRIMARY KEY,
            file_number TEXT,
            esas_no TEXT,
            court_name TEXT,
            metadata TEXT
        );
        -- Matches electron/database.ts parties.metadata. The apply query reads p.metadata.
        CREATE TABLE parties (
            id TEXT PRIMARY KEY,
            full_name TEXT NOT NULL,
            id_number TEXT,
            is_client INTEGER DEFAULT 0,
            metadata TEXT
        );
        CREATE TABLE matter_parties (
            matter_id TEXT,
            party_id TEXT,
            role TEXT,
            PRIMARY KEY (matter_id, party_id)
        );
        CREATE TABLE matter_ledger (
            id TEXT PRIMARY KEY,
            matter_id TEXT,
            party_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            description TEXT NOT NULL,
            amount_minor INTEGER NOT NULL,
            entry_date TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'manual',
            external_key TEXT,
            uyap_page TEXT,
            receipt_no TEXT,
            payer_name TEXT,
            court_unit TEXT,
            remaining_minor INTEGER,
            balance_minor INTEGER,
            detail_json TEXT,
            created_at TEXT,
            updated_at TEXT
        );
    `);
    return db;
}

const payload = {
    dosyaNo: '2024/1001',
    birimAdi: UNIT,
    harc: [
        { 'Dosya No': '2024/1001', 'Birim Adı': UNIT, 'Harç/Masraf Adı': 'Posta Masrafı', 'Tahsilat Tarihi': '09.10.2026', 'Kişi': `${CLIENT} adına ${LAWYER}`, 'Makbuz No': '52487', 'Miktar': 20 },
        { 'Dosya No': '2024/1001', 'Birim Adı': UNIT, 'Harç/Masraf Adı': 'Posta Masrafı', 'Tahsilat Tarihi': '11.08.2026', 'Kişi': `${CLIENT} adına ${LAWYER}`, 'Makbuz No': '40062', 'Miktar': 28.7 },
        { 'Dosya No': '2024/1001', 'Birim Adı': UNIT, 'Harç/Masraf Adı': 'Vekalet Suret Harcı', 'Tahsilat Tarihi': '06.08.2026', 'Kişi': 'Av. BARAN KOCAK', 'Makbuz No': '30312', 'Miktar': 104 },
        { 'Dosya No': '2024/1001', 'Birim Adı': UNIT, 'Harç/Masraf Adı': 'Posta Masrafı', 'Tahsilat Tarihi': '03.07.2026', 'Kişi': CLIENT, 'Makbuz No': '32580', 'Miktar': 287 },
        { 'Dosya No': '2024/1001', 'Birim Adı': UNIT, 'Harç/Masraf Adı': 'Posta Masrafı', 'Tahsilat Tarihi': '03.07.2026', 'Kişi': CLIENT, 'Makbuz No': '32548', 'Miktar': 28.7 },
        { 'Dosya No': '2024/1001', 'Birim Adı': UNIT, 'Harç/Masraf Adı': 'Posta Masrafı', 'Tahsilat Tarihi': '08.05.2026', 'Kişi': CLIENT, 'Makbuz No': '23365', 'Miktar': 15 },
        { 'Dosya No': '2024/1001', 'Birim Adı': UNIT, 'Harç/Masraf Adı': 'Peşin Harç', 'Tahsilat Tarihi': '22.04.2026', 'Kişi': `${CLIENT} Adına Avukat ${LAWYER} Yatırmıştır.`, 'Makbuz No': '16436', 'Miktar': 1708.41 },
        { 'Dosya No': '2024/1001', 'Birim Adı': UNIT, 'Harç/Masraf Adı': 'Vekalet Suret Harcı', 'Tahsilat Tarihi': '22.04.2026', 'Kişi': `${CLIENT} Adına Avukat ${LAWYER} Yatırmıştır.`, 'Makbuz No': '16436', 'Miktar': 104 },
        { 'Dosya No': '2024/1001', 'Birim Adı': UNIT, 'Harç/Masraf Adı': 'Başvurma Harcı', 'Tahsilat Tarihi': '22.04.2026', 'Kişi': `${CLIENT} Adına Avukat ${LAWYER} Yatırmıştır.`, 'Makbuz No': '16436', 'Miktar': 732 },
    ],
    tahsilat: [
        { 'Dosya No': '2024/1001', 'Birim Adı': UNIT, 'Tahsilat Türü': 'Masraf Avansı Tahsilatı', 'Tahsilat Tarihi': '08.10.2026', 'Ödeyen Kişi': CLIENT, 'Makbuz No': '71282', 'Tahsilat Tutarı': 500, 'Kalan Miktar': 500 },
        { 'Dosya No': '2024/1001', 'Birim Adı': UNIT, 'Tahsilat Türü': 'Masraf Avansı Tahsilatı', 'Tahsilat Tarihi': '22.09.2026', 'Ödeyen Kişi': `${CLIENT} adına ${LAWYER}`, 'Makbuz No': '66683', 'Tahsilat Tutarı': 28.7, 'Kalan Miktar': 28.7 },
        { 'Dosya No': '2024/1001', 'Birim Adı': UNIT, 'Tahsilat Türü': 'Masraf Avansı Tahsilatı', 'Tahsilat Tarihi': '30.07.2026', 'Ödeyen Kişi': `${CLIENT} adına ${LAWYER}`, 'Makbuz No': '52429', 'Tahsilat Tutarı': 20, 'Kalan Miktar': 20 },
        { 'Dosya No': '2024/1001', 'Birim Adı': UNIT, 'Tahsilat Türü': 'Masraf Avansı Tahsilatı', 'Tahsilat Tarihi': '24.06.2026', 'Ödeyen Kişi': `${CLIENT} adına ${LAWYER}`, 'Makbuz No': '43121', 'Tahsilat Tutarı': 287, 'Kalan Miktar': 207.6, 'Detay': 'tebligat' },
        { 'Dosya No': '2024/1001', 'Birim Adı': UNIT, 'Tahsilat Türü': 'Masraf Avansı Tahsilatı', 'Tahsilat Tarihi': '23.06.2026', 'Ödeyen Kişi': `${CLIENT} adına ${LAWYER}`, 'Makbuz No': '42530', 'Tahsilat Tutarı': 20, 'Kalan Miktar': 0 },
        { 'Dosya No': '2024/1001', 'Birim Adı': UNIT, 'Tahsilat Türü': 'Masraf Avansı Tahsilatı', 'Tahsilat Tarihi': '15.06.2026', 'Ödeyen Kişi': `${CLIENT} adına ${LAWYER}`, 'Makbuz No': '40216', 'Tahsilat Tutarı': 15, 'Kalan Miktar': 0 },
        { 'Dosya No': '2024/1001', 'Birim Adı': UNIT, 'Tahsilat Türü': 'Masraf Avansı Tahsilatı', 'Tahsilat Tarihi': '22.04.2026', 'Ödeyen Kişi': CLIENT, 'Makbuz No': '29034', 'Tahsilat Tutarı': 265, 'Kalan Miktar': 0 },
    ],
    toplamKalan: 756.3,
};

const db = openDb();
db.prepare(`INSERT INTO matters (id, file_number, court_name, metadata) VALUES ('m1', '2024/01001', ?, '{"uyap":{"dosyaId":"keep"}}')`).run(UNIT);
db.prepare(`INSERT INTO parties (id, full_name, id_number, is_client) VALUES ('p1', ?, '00000000000', 1)`).run(CLIENT);
db.prepare(`INSERT INTO matter_parties (matter_id, party_id, role) VALUES ('m1', 'p1', 'MÜVEKKİL')`).run();
db.prepare(
    `INSERT INTO matter_ledger (id, matter_id, party_id, kind, description, amount_minor, entry_date, source)
     VALUES ('manual', 'm1', 'p1', 'avans', 'Elden', 1000, '2026-01-01', 'manual')`,
).run();

const partyMeta = db.prepare(`SELECT metadata FROM parties WHERE id = 'p1'`).get() as { metadata: string | null };
assert.equal(partyMeta.metadata, null);

const first = applyUyapCourtMoney(db, payload, { seatLawyerName: LAWYER });
assert.equal(first.unmatched.length, 0);
assert.equal(first.inserted, 16);
assert.equal(first.files, 1);

const rows = db.prepare(
    `SELECT kind, amount_minor, balance_minor, party_id, payer_name, source FROM matter_ledger ORDER BY entry_date`,
).all() as Array<{ kind: LedgerKind; amount_minor: number; balance_minor: number | null; party_id: string; payer_name: string | null; source: string }>;
assert.equal(rows.length, 17);
assert.equal(rows.filter((row) => row.party_id === 'p1' && row.source === 'katir').length, 16);
const summary = summarizeLedger(rows.filter((row) => row.source === 'katir'));
assert.equal(summary.chargeMinor, 405951);
assert.equal(summary.advanceMinor, 0);
assert.equal(summary.balanceMinor, -405951);
assert.equal(summary.position, 'debt');
const stamped = JSON.parse((db.prepare(
    `SELECT detail_json FROM matter_ledger WHERE source = 'katir' AND description = 'Peşin Harç'`,
).get() as { detail_json: string }).detail_json) as { idNumber?: string; flow?: string };
assert.equal(stamped.idNumber, '00000000000');
assert.equal(stamped.flow, 'harc');
const clientNamedRow = db.prepare(
    `SELECT balance_minor, detail_json FROM matter_ledger WHERE receipt_no = '71282'`,
).get() as { balance_minor: number; detail_json: string };
assert.equal(clientNamedRow.balance_minor, 50000);
assert.equal(JSON.parse(clientNamedRow.detail_json).depositor, 'buro');
const officePaid = db.prepare(
    `SELECT balance_minor, kind, detail_json FROM matter_ledger WHERE receipt_no = '43121'`,
).get() as { balance_minor: number; kind: string; detail_json: string };
assert.equal(officePaid.kind, 'masraf');
assert.equal(officePaid.balance_minor, 28700);
assert.equal(JSON.parse(officePaid.detail_json).depositor, 'buro');

const third = db.prepare(`SELECT balance_minor, amount_minor FROM matter_ledger WHERE payer_name = ?`).get('Av. BARAN KOCAK') as { balance_minor: number; amount_minor: number };
assert.equal(third.amount_minor, 10400);
assert.equal(third.balance_minor, 0);

const again = applyUyapCourtMoney(db, payload, { seatLawyerName: LAWYER });
assert.equal(again.inserted, 0);
assert.equal(again.updated, 16);
assert.equal(again.removed, 0);
assert.deepEqual(db.prepare(`SELECT COUNT(*) AS n FROM matter_ledger`).get(), { n: 17 });

const withoutOnePostage = {
    ...payload,
    harc: payload.harc.filter((row) => row['Makbuz No'] !== '52487'),
};
const pruned = applyUyapCourtMoney(db, withoutOnePostage, { seatLawyerName: LAWYER });
assert.equal(pruned.removed, 1);
assert.deepEqual(db.prepare(`SELECT COUNT(*) AS n FROM matter_ledger WHERE receipt_no = '52487'`).get(), { n: 0 });
assert.deepEqual(db.prepare(`SELECT COUNT(*) AS n FROM matter_ledger WHERE source = 'manual'`).get(), { n: 1 });

const meta = JSON.parse((db.prepare(`SELECT metadata FROM matters WHERE id = 'm1'`).get() as { metadata: string }).metadata) as {
    uyap: { dosyaId?: string; courtMoney?: { totals?: { toplamKalan?: number } } };
};
assert.equal(meta.uyap.dosyaId, 'keep');
assert.equal(meta.uyap.courtMoney?.totals?.toplamKalan, 756.3);

const missing = applyUyapCourtMoney(db, { ...payload, dosyaNo: '1999/1' });
assert.equal(missing.unmatched[0]?.reason, 'Dosya bulunamadı');

db.prepare(`INSERT INTO matters (id, file_number, court_name) VALUES ('m2', '2024/1001', 'Ankara 1. İcra Dairesi')`).run();
const ambiguous = applyUyapCourtMoney(db, payload, { seatLawyerName: LAWYER });
assert.equal(ambiguous.unmatched.length, 0);
assert.equal(ambiguous.updated, 15);

db.prepare(
    `UPDATE matter_ledger SET kind = 'masraf', balance_minor = 0, detail_json = ? WHERE receipt_no = '43121'`,
).run(JSON.stringify({ page: 'tahsilat', flow: 'dosya_avans', depositor: 'muvekkil', manualOverride: true }));
const preserved = applyUyapCourtMoney(db, payload, { seatLawyerName: LAWYER });
assert.equal(preserved.updated, 16);
const keptOverride = db.prepare(
    `SELECT balance_minor, detail_json FROM matter_ledger WHERE receipt_no = '43121'`,
).get() as { balance_minor: number; detail_json: string };
assert.equal(keptOverride.balance_minor, 0);
assert.equal(JSON.parse(keptOverride.detail_json).depositor, 'muvekkil');
assert.equal(JSON.parse(keptOverride.detail_json).manualOverride, true);

db.close();
console.log('uyapCourtMoneyApply.test.ts ok');
