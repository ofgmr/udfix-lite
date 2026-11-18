/**
 * Run: npx tsx electron/shared/matterLedger.test.ts
 */
import assert from 'node:assert/strict';
import {
    counterpartyLabel,
    formatLedgerTry,
    ledgerKindSide,
    parseLedgerAmountToMinor,
    parseLedgerDate,
    parseLedgerWrite,
    summarizeLedger,
} from './matterLedger';

assert.equal(parseLedgerAmountToMinor('535,0'), 53500);
assert.equal(parseLedgerAmountToMinor('535,00'), 53500);
assert.equal(parseLedgerAmountToMinor('535,5'), 53550);
assert.equal(parseLedgerAmountToMinor('1.250,50'), 125050);
assert.equal(parseLedgerAmountToMinor('₺ 535,00'), 53500);
assert.equal(parseLedgerAmountToMinor('535.50'), 53550);
assert.equal(parseLedgerAmountToMinor('1.250'), 125000);
assert.equal(parseLedgerAmountToMinor('535'), 53500);
assert.equal(parseLedgerAmountToMinor('0'), null);
assert.equal(parseLedgerAmountToMinor('-10'), null);
assert.equal(parseLedgerAmountToMinor('abc'), null);
assert.equal(parseLedgerAmountToMinor('535,125'), null);

assert.equal(formatLedgerTry(53500), '535,00 ₺');
assert.equal(formatLedgerTry(125050), '1.250,50 ₺');
assert.equal(formatLedgerTry(-53500), '-535,00 ₺');

assert.equal(parseLedgerDate('13.11.25'), '2025-11-13');
assert.equal(parseLedgerDate('13.11.2025'), '2025-11-13');
assert.equal(parseLedgerDate('2025-11-13'), '2025-11-13');
assert.equal(parseLedgerDate('31.02.2025'), null);
assert.equal(parseLedgerDate('13.11.70'), '1970-11-13');

assert.equal(ledgerKindSide('avans'), 'credit');
assert.equal(ledgerKindSide('masraf'), 'charge');
assert.equal(ledgerKindSide('harc'), 'charge');

const withAdvance = summarizeLedger([
    { kind: 'avans', amount_minor: 100000 },
    { kind: 'masraf', amount_minor: 53500 },
]);
assert.equal(withAdvance.balanceMinor, 46500);
assert.equal(withAdvance.position, 'advance');
assert.equal(withAdvance.positionLabel, 'Alacak');

const debt = summarizeLedger([{ kind: 'harc', amount_minor: 53500 }]);
assert.equal(debt.position, 'debt');
assert.equal(debt.positionLabel, 'Müvekkil borcu');
assert.equal(debt.balanceMinor, -53500);

const even = summarizeLedger([
    { kind: 'avans', amount_minor: 53500 },
    { kind: 'masraf', amount_minor: 53500 },
]);
assert.equal(even.position, 'even');

const katirWeight = summarizeLedger([
    { kind: 'avans', amount_minor: 28700, balance_minor: 20760 },
    { kind: 'harc', amount_minor: 10400, balance_minor: 0 },
    { kind: 'masraf', amount_minor: 2000, balance_minor: 2000 },
]);
assert.equal(katirWeight.advanceMinor, 20760);
assert.equal(katirWeight.chargeMinor, 2000);
assert.equal(katirWeight.balanceMinor, 18760);

assert.equal(
    counterpartyLabel(
        [
            { party_id: 'c', role: 'MÜVEKKİL', full_name: 'MY TELEKOM' },
            { party_id: 'o', role: 'KARŞI_TARAF', full_name: 'SELIM AKIN' },
            { party_id: 'v', role: 'VEKİL', full_name: 'Avukat' },
        ],
        'c',
    ),
    'SELIM AKIN',
);

const charge = parseLedgerWrite({
    kind: 'masraf',
    party_id: 'p1',
    description: 'Delil Sunma / Tevkil',
    amount_minor: 53500,
    entry_date: '13.11.25',
});
assert.equal(charge.ok, false);

const advance = parseLedgerWrite({
    kind: 'avans',
    party_id: 'p1',
    matter_id: '',
    description: 'Elden avans',
    amount_minor: 100000,
    entry_date: '2025-11-01',
});
assert.equal(advance.ok, true);
if (advance.ok) {
    assert.equal(advance.value.matter_id, null);
    assert.equal(advance.value.entry_date, '2025-11-01');
}

const line = parseLedgerWrite({
    kind: 'masraf',
    party_id: 'p1',
    matter_id: 'm1',
    description: '  Delil   Sunma  ',
    amount_minor: 53500,
    entry_date: '13.11.25',
});
assert.equal(line.ok, true);
if (line.ok) {
    assert.equal(line.value.description, 'Delil Sunma');
    assert.equal(line.value.entry_date, '2025-11-13');
}

console.log('matterLedger.test.ts ok');
