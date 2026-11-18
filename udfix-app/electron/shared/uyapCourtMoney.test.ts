/**
 * Run: npx tsx electron/shared/uyapCourtMoney.test.ts
 */
import assert from 'node:assert/strict';
import {
    courtFileKey,
    advanceDepositor,
    courtMoneyBalanceMinor,
    parseUyapCourtMoney,
    payerIsOurs,
    payerMatchesPartyName,
    ledgerEffect,
    reddiyatDestination,
} from './uyapCourtMoney';

const CLIENT = 'AYSE DENIZ';
const LAWYER = 'KEREM YILDIZ';
const UNIT = 'Örnek 1. İcra Dairesi';

const harcRows = [
    ['Dosya No', 'Birim Adı', 'Harç/Masraf Adı', 'Tahsilat Tarihi', 'Kişi', 'Makbuz No', 'Miktar', 'Kalan Miktar'],
    ['2024/1001', UNIT, 'Posta Masrafı', '09.10.2026', `${CLIENT} adına ${LAWYER}`, '52487', 20, ''],
    ['2024/1001', UNIT, 'Posta Masrafı', '11.08.2026', `${CLIENT} adına ${LAWYER}`, '40062', 28.7, ''],
    ['2024/1001', UNIT, 'Vekalet Suret Harcı', '06.08.2026', 'Av. BARAN KOCAK', '30312', 104, ''],
    ['2024/1001', UNIT, 'Posta Masrafı', '03.07.2026', CLIENT, '32580', 287, ''],
    ['2024/1001', UNIT, 'Posta Masrafı', '03.07.2026', CLIENT, '32548', 28.7, ''],
    ['2024/1001', UNIT, 'Posta Masrafı', '08.05.2026', CLIENT, '23365', 15, ''],
    ['2024/1001', UNIT, 'Peşin Harç', '22.04.2026', `${CLIENT} Adına Avukat ${LAWYER} Yatırmıştır.`, '16436', 1708.41, ''],
    ['2024/1001', UNIT, 'Vekalet Suret Harcı', '22.04.2026', `${CLIENT} Adına Avukat ${LAWYER} Yatırmıştır.`, '16436', 104, ''],
    ['2024/1001', UNIT, 'Başvurma Harcı', '22.04.2026', `${CLIENT} Adına Avukat ${LAWYER} Yatırmıştır.`, '16436', 732, ''],
];

const tahsilatRows = [
    ['Dosya No', 'Birim Adı', 'Tahsilat Türü', 'Tahsilat Tarihi', 'Ödeyen Kişi', 'Makbuz No', 'Tahsilat Tutarı', 'Kalan Miktar', 'Detay', 'Hesaplama Yapılan Tutar'],
    ['2024/1001', UNIT, 'Masraf Avansı Tahsilatı', '08.10.2026', CLIENT, '71282', 500, 500, '', ''],
    ['2024/1001', UNIT, 'Masraf Avansı Tahsilatı', '22.09.2026', `${CLIENT} adına ${LAWYER}`, '66683', 28.7, 28.7, '', ''],
    ['2024/1001', UNIT, 'Masraf Avansı Tahsilatı', '30.07.2026', `${CLIENT} adına ${LAWYER}`, '52429', 20, 20, '', ''],
    ['2024/1001', UNIT, 'Masraf Avansı Tahsilatı', '24.06.2026', `${CLIENT} adına ${LAWYER}`, '43121', 287, 207.6, 'posta', ''],
    ['2024/1001', UNIT, 'Masraf Avansı Tahsilatı', '23.06.2026', `${CLIENT} adına ${LAWYER}`, '42530', 20, 0, '', ''],
    ['2024/1001', UNIT, 'Masraf Avansı Tahsilatı', '15.06.2026', `${CLIENT} adına ${LAWYER}`, '40216', 15, 0, '', ''],
    ['2024/1001', UNIT, 'Masraf Avansı Tahsilatı', '22.04.2026', CLIENT, '29034', 265, 0, '', ''],
];

assert.equal(courtFileKey('2024/01001'), '2024/1001');
assert.equal(courtFileKey('Esas 2024/1001'), '2024/1001');
assert.equal(payerMatchesPartyName(`${CLIENT} adına ${LAWYER}`, CLIENT), true);
assert.equal(payerMatchesPartyName('Av. BARAN KOCAK', CLIENT), false);
assert.equal(payerMatchesPartyName(`${CLIENT} Adına Avukat ${LAWYER} Yatırmıştır.`, LAWYER), true);
assert.equal(payerIsOurs('Av. BARAN KOCAK', [CLIENT, LAWYER]), false);
assert.equal(payerIsOurs('', [CLIENT]), true);

const parsed = parseUyapCourtMoney({ harc: harcRows, tahsilat: tahsilatRows, dosyaNo: '2024/1001' });
assert.equal(parsed.skipped, 0);
assert.equal(parsed.files.length, 1);
const file = parsed.files[0];
assert.equal(file.fileKey, '2024/1001');
assert.equal(file.harc?.lines.length, 9);
assert.equal(file.tahsilat?.lines.length, 7);

const posta = file.harc?.lines.find((line) => line.receiptNo === '52487');
assert.equal(posta?.kind, 'masraf');
assert.equal(posta?.amountMinor, 2000);
assert.equal(posta?.entryDate, '2026-10-09');
assert.ok(posta?.externalKey.includes('uyap:harc:2024/1001:52487:'));

const pesin = file.harc?.lines.find((line) => line.label === 'Peşin Harç');
assert.equal(pesin?.kind, 'harc');
assert.equal(pesin?.amountMinor, 170841);
const sameReceipt = file.harc?.lines.filter((line) => line.receiptNo === '16436') ?? [];
assert.equal(sameReceipt.length, 3);
assert.equal(new Set(sameReceipt.map((line) => line.externalKey)).size, 3);

const third = file.harc?.lines.find((line) => line.payerName === 'Av. BARAN KOCAK');
assert.equal(third?.kind, 'harc');
assert.equal(
    courtMoneyBalanceMinor(third!, { payerOurs: false, harcPageProvided: true }),
    0,
);
assert.equal(
    courtMoneyBalanceMinor(pesin!, { payerOurs: true, harcPageProvided: true }),
    170841,
);

const partialAvans = file.tahsilat?.lines.find((line) => line.receiptNo === '43121');
assert.equal(partialAvans?.kind, 'masraf');
assert.equal(partialAvans?.flow, 'dosya_avans');
assert.equal(partialAvans?.amountMinor, 28700);
assert.equal(partialAvans?.remainingMinor, 20760);
assert.equal(
    courtMoneyBalanceMinor(partialAvans!, { payerOurs: true, harcPageProvided: true, depositor: 'buro' }),
    28700,
);
assert.equal(
    courtMoneyBalanceMinor(partialAvans!, { payerOurs: true, harcPageProvided: true, depositor: 'muvekkil' }),
    0,
);
const spent = file.tahsilat?.lines.find((line) => line.receiptNo === '42530');
assert.equal(spent?.remainingMinor, 0);
assert.equal(
    courtMoneyBalanceMinor(spent!, { payerOurs: true, harcPageProvided: true, depositor: 'buro' }),
    2000,
);
const detail = JSON.parse(partialAvans?.detailJson || '{}') as { detay?: string; page?: string };
assert.equal(detail.detay, 'posta');
assert.equal(detail.page, 'tahsilat');

const portal = parseUyapCourtMoney({
    dosyaId: 'abc',
    harcList: [{
        tahsilatTuru: 'Posta Masrafı',
        dosyaNo: '2024/1001',
        birimAdi: UNIT,
        odeyenKisi: CLIENT,
        makbuzNo: 52487,
        miktar: 20,
        kalanMiktar: null,
        tahsilatTarihi: '2026-10-09T21:00:00.000Z',
        dosyaTurAciklama: 'İcra Dosyası',
    }],
    tahsilatList: [],
    reddiyatList: [{
        reddiyatNedeni: 'Alacaklıya ödeme',
        reddiyatTarihi: '01.10.2026',
        odeyenKisi: CLIENT,
        makbuzNo: '1',
        odenecekMiktar: 10,
        gelirVergisi: 1.5,
        dosyaNo: '2024/1001',
    }],
    toplamTahsilat: 1135.7,
});
assert.equal(portal.files[0].harc?.lines[0].kind, 'masraf');
assert.equal(portal.files[0].harc?.lines[0].entryDate, '2026-10-09');
assert.equal(portal.files[0].tahsilat?.lines.length, 0);
assert.equal(portal.files[0].tahsilat?.prune, true);
assert.equal(portal.files[0].reddiyat?.lines[0].kind, 'masraf');
assert.equal(portal.files[0].reddiyat?.lines[0].amountMinor, 1000);
assert.equal(portal.files[0].totals?.toplamTahsilat, 1135.7);
const reddiyatDetail = JSON.parse(portal.files[0].reddiyat?.lines[0].detailJson || '{}') as { gelirVergisi?: number };
assert.equal(reddiyatDetail.gelirVergisi, 150);

const exploded = parseUyapCourtMoney({
    harc: [{
        dosyaNo: '2024/1001',
        hmTahsilatTarih: '22.04.2026',
        aciklama: CLIENT,
        kayitID: 77,
        tahsilatSatirDVOList: [
            { harcMasrafAdi: 'Peşin Harç', yatirilanMiktar: 10, harcmiMasrafmi: 'H', adet: 1 },
            { harcMasrafAdi: 'Posta Masrafı', yatirilanMiktar: 5, harcmiMasrafmi: 'M', adet: 2 },
        ],
    }],
});
assert.equal(exploded.files[0].harc?.lines.length, 2);
assert.equal(exploded.files[0].harc?.lines[0].kind, 'harc');
assert.equal(exploded.files[0].harc?.lines[1].kind, 'masraf');
assert.equal(exploded.files[0].harc?.lines[0].payerName, CLIENT);
assert.ok(exploded.files[0].harc?.lines[0].externalKey.includes(':id:77:'));

const COMPANY = 'ÖRNEK İNŞAAT TAAHHÜT LOJİSTİK TURİZM TEKSTİL TEMİZLİK GIDA PAZARLAMA SANAYİ VE TİCARET LİMİTED ŞİRKETİ';
const hukuk = parseUyapCourtMoney({
    harc: [
        ['Dosya No', 'Birim Adı', 'Harç/Masraf Adı', 'Tahsilat Tarihi', 'Kişi', 'Makbuz No', 'Miktar', 'Kalan Miktar'],
        ['2024/2002', 'Örnek Hukuk Mahkemesi Tevzi Bürosu', 'Vekalet Suret Harcı', '18.11.2025', COMPANY, '654547', '87.5', '0'],
        ['2024/2002', 'Örnek Hukuk Mahkemesi Tevzi Bürosu', 'Başvurma Harcı (Tespiti Delail, İhtiyati Haciz ve İhtiyati Tedbir)', '18.11.2025', COMPANY, '654547', '615.4', '0'],
        ['2024/2002', 'Örnek Hukuk Mahkemesi Tevzi Bürosu', 'Peşin\\Nispi Harç(Tespiti Delail, İhtiyati Haciz, İhtiyati Tedbir)', '18.11.2025', COMPANY, '654547', '1013.9', '0'],
    ],
    tahsilat: [
        ['Dosya No', 'Birim Adı', 'Tahsilat Türü', 'Tahsilat Tarihi', 'Ödeyen Kişi', 'Makbuz No', 'Tahsilat Tutarı', 'Kalan Miktar', 'Detay', 'Hesaplama Yapılan Tutar'],
        ['2024/2002', 'Örnek Hukuk Mahkemesi Tevzi Bürosu', 'Gider Avansı', '18.11.2025', COMPANY, '463231', '2500', '0', '', '0'],
    ],
});
assert.equal(hukuk.skipped, 0);
assert.equal(hukuk.files[0].fileKey, '2024/2002');
assert.equal(hukuk.files[0].harc?.lines.length, 3);
const nispi = hukuk.files[0].harc?.lines.find((line) => line.amountMinor === 101390);
assert.equal(nispi?.label.startsWith('Peşin/Nispi Harç'), true);
assert.equal(nispi?.kind, 'harc');
assert.equal(nispi?.remainingMinor, 0);
assert.equal(courtMoneyBalanceMinor(nispi!, { payerOurs: true, harcPageProvided: true }), 101390);
const gider = hukuk.files[0].tahsilat?.lines[0];
assert.equal(gider?.kind, 'masraf');
assert.equal(gider?.flow, 'dosya_avans');
assert.equal(gider?.label, 'Gider Avansı');
assert.equal(courtMoneyBalanceMinor(gider!, { payerOurs: true, harcPageProvided: true, depositor: 'buro' }), 250000);
assert.equal(courtMoneyBalanceMinor(gider!, { payerOurs: true, harcPageProvided: true, depositor: 'muvekkil' }), 0);
assert.equal(new Set(hukuk.files[0].harc?.lines.map((line) => line.externalKey)).size, 3);
assert.equal(payerMatchesPartyName(COMPANY, 'Örnek İnşaat Ltd. Şti.'), true);
assert.equal(payerIsOurs(COMPANY, ['Örnek İnşaat Ltd. Şti.']), true);
assert.equal(payerMatchesPartyName('Av. BARAN KOCAK', 'Örnek İnşaat Ltd. Şti.'), false);

const portalEnglish = parseUyapCourtMoney({
    harcList: [
        {
            birimAdi: 'Örnek Hukuk Mahkemesi',
            dosyaNo: '2024/1003',
            kayitId: 1001,
            makbuzNo: '61138',
            odeyenKisi: 'Av. KEREM YILDIZ',
            tahsilatTarihi: 'Aug 20, 2026 11:12:08 PM',
            tahsilatTuru: 'Peşin Harç',
            yatirilanMiktar: 732,
        },
        {
            birimAdi: 'Örnek Hukuk Mahkemesi',
            dosyaNo: '2024/1003',
            kayitId: 1002,
            makbuzNo: '61138',
            odeyenKisi: 'Av. KEREM YILDIZ',
            tahsilatTarihi: 'Aug 20, 2026 11:12:08 PM',
            tahsilatTuru: 'Vekalet Suret Harcı',
            yatirilanMiktar: 104,
        },
    ],
    tahsilatList: [{
        birimAdi: 'Örnek Hukuk Mahkemesi',
        dosyaNo: '2024/1003',
        kayitId: 1003,
        makbuzNo: '51936',
        odeyenKisi: 'Av. KEREM YILDIZ',
        tahsilatTarihi: 'Aug 20, 2026 11:12:07 PM',
        tahsilatTuru: 'Gider Avansı',
        yatirilanMiktar: 1855,
    }],
    reddiyatList: [],
});
assert.equal(portalEnglish.skipped, 0);
assert.equal(portalEnglish.files[0].fileKey, '2024/1003');
assert.equal(portalEnglish.files[0].harc?.lines.length, 2);
assert.equal(portalEnglish.files[0].harc?.lines[0].kind, 'harc');
assert.equal(portalEnglish.files[0].harc?.lines[0].entryDate, '2026-08-20');
assert.equal(portalEnglish.files[0].harc?.lines[0].amountMinor, 73200);
assert.equal(portalEnglish.files[0].tahsilat?.lines[0].kind, 'masraf');
assert.equal(portalEnglish.files[0].tahsilat?.lines[0].flow, 'dosya_avans');
assert.equal(portalEnglish.files[0].tahsilat?.lines[0].amountMinor, 185500);
assert.equal(portalEnglish.files[0].reddiyat?.prune, true);

const harcOnly = parseUyapCourtMoney({
    dosyaNo: '2024/1003',
    harcList: [{
        tahsilatTuru: 'Başvurma Harcı',
        dosyaNo: '2024/1003',
        birimAdi: 'Örnek Hukuk Mahkemesi',
        odeyenKisi: 'Av. KEREM YILDIZ',
        makbuzNo: '61138',
        yatirilanMiktar: 732,
        tahsilatTarihi: 'Aug 20, 2026 11:12:08 PM',
    }],
});
assert.equal(harcOnly.files[0].harc?.lines.length, 1);
assert.equal(harcOnly.files[0].harc?.lines[0].kind, 'harc');
assert.equal(harcOnly.files[0].tahsilat, null);
assert.equal(harcOnly.files[0].reddiyat, null);

const classified = parseUyapCourtMoney({
    dosyaNo: '2024/3003',
    harcList: [
        {
            tahsilatTuru: 'Vekalet Suret Harcı',
            dosyaNo: '2024/3003',
            odeyenKisi: 'Av. KEREM YILDIZ',
            makbuzNo: '1',
            miktar: 104,
            tahsilatTarihi: '04.11.2025',
        },
        {
            tahsilatTuru: 'Vekalet Pulu',
            dosyaNo: '2024/3003',
            odeyenKisi: 'Av. KEREM YILDIZ',
            makbuzNo: '2',
            miktar: 164,
            tahsilatTarihi: '04.11.2025',
            harcmiMasrafmi: 'D',
        },
        {
            tahsilatTuru: 'Cezaevi (Nispi)',
            dosyaNo: '2024/3003',
            odeyenKisi: 'Av. KEREM YILDIZ',
            makbuzNo: '3',
            miktar: 50,
            tahsilatTarihi: '04.11.2025',
        },
    ],
    tahsilatList: [
        {
            tahsilatTuru: 'Borç Tahsilatı',
            dosyaNo: '2024/3003',
            odeyenKisi: 'BORÇLU',
            makbuzNo: '4',
            tahsilatTutari: 1000,
            tahsilatTarihi: '04.11.2025',
        },
        {
            tahsilatTuru: 'Diğer Teminat Bedeli Tahsilatı',
            dosyaNo: '2024/3003',
            odeyenKisi: 'BORÇLU',
            makbuzNo: '5',
            tahsilatTutari: 200,
            tahsilatTarihi: '04.11.2025',
        },
    ],
    reddiyatList: [
        {
            reddiyatNedeni: 'Posta Ücreti Reddiyatı',
            reddiyatTarihi: '04.11.2025',
            odeyenKisi: 'PTT',
            makbuzNo: '6',
            odenecekMiktar: 15,
            dosyaNo: '2024/3003',
        },
        {
            reddiyatNedeni: 'Borç Reddiyatı',
            reddiyatTarihi: '04.11.2025',
            odeyenKisi: 'KEREM YILDIZ',
            makbuzNo: '7',
            odenecekMiktar: 400,
            dosyaNo: '2024/3003',
        },
        {
            reddiyatNedeni: 'Avans İade',
            reddiyatTarihi: '04.11.2025',
            odeyenKisi: 'CANER',
            makbuzNo: '8',
            odenecekMiktar: 10,
            dosyaNo: '2024/3003',
        },
    ],
});
const suret = classified.files[0].harc?.lines.find((line) => line.label === 'Vekalet Suret Harcı');
const pul = classified.files[0].harc?.lines.find((line) => line.label === 'Vekalet Pulu');
const cezaevi = classified.files[0].harc?.lines.find((line) => line.label.startsWith('Cezaevi'));
assert.equal(suret?.flow, 'harc');
assert.equal(suret?.kind, 'harc');
assert.equal(courtMoneyBalanceMinor(suret!, { payerOurs: true, harcPageProvided: true }), 10400);
assert.equal(pul?.flow, 'masraf');
assert.equal(pul?.kind, 'masraf');
assert.equal(cezaevi?.flow, 'harc');
assert.equal(classified.files[0].tahsilat?.lines[0].flow, 'tahsilat');
assert.equal(courtMoneyBalanceMinor(classified.files[0].tahsilat!.lines[0], { payerOurs: true, harcPageProvided: true }), 0);
assert.equal(classified.files[0].tahsilat?.lines[1].flow, 'teminat');
assert.equal(classified.files[0].reddiyat?.lines[0].flow, 'reddiyat');
const CLIENTS = ['AYSE DENIZ'];
const LAWYERS = ['KEREM YILDIZ'];
assert.equal(reddiyatDestination('Posta Ücreti Reddiyatı', 'PTT', CLIENTS, LAWYERS), 'gider');
assert.equal(reddiyatDestination('Borç Reddiyatı', 'KEREM YILDIZ', CLIENTS, LAWYERS), 'biz');
assert.equal(reddiyatDestination('Borç Reddiyatı', 'AYSE DENIZ', CLIENTS, LAWYERS), 'muvekkil');
assert.equal(reddiyatDestination('Borç Reddiyatı', 'SELIM AKIN', CLIENTS, LAWYERS), 'ucuncu');
assert.equal(reddiyatDestination('Avans İade', 'CANER', CLIENTS, LAWYERS), 'iade');
const pocket = classified.files[0].reddiyat?.lines.find((line) => line.payerName === 'KEREM YILDIZ');
const pocketEffect = ledgerEffect(pocket!, { clientNames: CLIENTS, lawyerNames: LAWYERS, harcPageProvided: true });
assert.equal(pocketEffect.kind, 'avans');
assert.equal(pocketEffect.balanceMinor, pocket!.amountMinor);
assert.equal(pocketEffect.pocket, true);
const clientRefund = ledgerEffect(
    classified.files[0].reddiyat!.lines.find((line) => line.label === 'Avans İade')!,
    { clientNames: CLIENTS, lawyerNames: LAWYERS, harcPageProvided: true },
);
assert.equal(clientRefund.balanceMinor, 0);
assert.equal(clientRefund.reddiyatTo, 'iade');
const cezaeviEffect = ledgerEffect(cezaevi!, { clientNames: [CLIENT], lawyerNames: [LAWYER], harcPageProvided: true });
assert.equal(cezaeviEffect.balanceMinor, 0);
const clientPosta = file.harc?.lines.find((line) => line.receiptNo === '32580');
const direct = ledgerEffect(clientPosta!, { clientNames: [CLIENT], lawyerNames: [LAWYER], harcPageProvided: true });
assert.equal(direct.depositor, 'buro');
assert.equal(direct.balanceMinor, 28700);
assert.equal(advanceDepositor('AYSE DENIZ', ['AYSE DENIZ'], ['KEREM YILDIZ']), 'buro');
assert.equal(advanceDepositor('AYSE DENIZ adına KEREM YILDIZ', ['AYSE DENIZ'], ['KEREM YILDIZ']), 'buro');
assert.equal(advanceDepositor('Av. KEREM YILDIZ', ['AYSE DENIZ'], ['KEREM YILDIZ']), 'buro');
assert.equal(advanceDepositor('Av. BARAN KOCAK', ['AYSE DENIZ'], ['KEREM YILDIZ']), 'onceki_vekil');
assert.equal(advanceDepositor('Davalı - DENEME MAKİNA İNŞAAT SANAYİ VE TİCARET ANONİM ŞİRKETİ Vekili BARAN KOCAK', ['DENEME MAKİNA İNŞAAT SANAYİ VE TİCARET ANONİM ŞİRKETİ'], ['KEREM YILDIZ']), 'onceki_vekil');
assert.equal(advanceDepositor('DENEME MAKİNA İNŞAAT SANAYİ VE TİCARET ANONİM ŞİRKETİ', ['DENEME MAKİNA İNŞAAT SANAYİ VE TİCARET ANONİM ŞİRKETİ'], ['KEREM YILDIZ'], { entryDate: '2024-01-15', representedFrom: '2024-07-01' }), 'onceki_vekil');
assert.equal(advanceDepositor('DENEME MAKİNA İNŞAAT SANAYİ VE TİCARET ANONİM ŞİRKETİ', ['DENEME MAKİNA İNŞAAT SANAYİ VE TİCARET ANONİM ŞİRKETİ'], ['KEREM YILDIZ'], { entryDate: '2024-08-01', representedFrom: '2024-07-01' }), 'buro');
assert.equal(advanceDepositor('Av. KEREM YILDIZ', ['DENEME MAKİNA İNŞAAT SANAYİ VE TİCARET ANONİM ŞİRKETİ'], ['KEREM YILDIZ'], { entryDate: '2024-06-16', representedFrom: '2024-07-01' }), 'buro');
assert.equal(courtMoneyBalanceMinor(classified.files[0].reddiyat!.lines[1], { payerOurs: true, harcPageProvided: true }), 0);

console.log('uyapCourtMoney.test.ts ok');
