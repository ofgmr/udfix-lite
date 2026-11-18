/**
 * UYAP Avukat Portal harç / masraf / tahsilat satırları.
 *
 * Harç Bilgileri ve Tahsilat Bilgileri dışa aktarımları
 * `dosya_tahsilat_reddiyat_bilgileri_brd.ajx` yanıtındaki `harcList` ve
 * `tahsilatList` tablolarıdır. İcra harç satırında ad alanı `tahsilatTuru`,
 * tutar `miktar`; tahsilat satırında tutar `tahsilatTutari`dir.
 * `harcmiMasrafmi`: "H" harç, bunun dışındaki dolu kod masraf.
 *
 * Büro bakiyesi: bizim yatırdığımız harç ve masraf müvekkil borcudur.
 * Vekalet suret harcı harçtır. Vekalet pulu masraftır.
 * Dosyaya yatırılan gider/masraf avansı, borç tahsilatı ve teminat büro bakiyesine girmez.
 * Müvekkilin büroya ödediği avans elle yazılır.
 * Reddiyat dosyadan çıkan paradır (bize, üçüncü kişiye, gidere veya iadeye). Borç yazılmaz.
 * Karşı vekilin yatırdığı satır müvekkil borcuna yazılmaz.
 * Başka bir vekilin (devralınan dosyada önceki avukat) yatırdığı satır da büronun cebinden çıkmış sayılmaz.
 */

import { parseLedgerAmountToMinor, parseLedgerDate, type LedgerKind } from './matterLedger';

export const UYAP_COURT_MONEY_ENDPOINTS = {
    /** Harç Bilgileri (`harcList`), Tahsilat Bilgileri (`tahsilatList`), reddiyat. */
    tahsilatReddiyat: 'dosya_tahsilat_reddiyat_bilgileri_brd.ajx',
    /** Ödeme ekranındaki harç/masraf tür kataloğu. Geçmiş satır listesi değildir. */
    harcMasrafListesi: 'harc_masraf_listesi_sorgula_brd.ajx',
    dosyaHarcMasrafHesabi: 'dosya_harc_masraf_hesabi.ajx',
    /** Yatırılacak ödeme ve `tahsilatSatirDVOList` dökümü. */
    dosyaOdemeBilgileri: 'dosya_odeme_bilgileri.ajx',
} as const;

export const UYAP_HARC_MASRAF_MARK = {
    harc: 'H',
} as const;

export const UYAP_COURT_MONEY_PAGES = ['harc', 'tahsilat', 'reddiyat'] as const;

export type UyapCourtMoneyPage = (typeof UYAP_COURT_MONEY_PAGES)[number];

/** Büro hesabındaki yeri. `avans` kind’ı elle girilen büro avansıdır; dosya avansı ayrıdır. */
export type CourtMoneyFlow = 'harc' | 'masraf' | 'dosya_avans' | 'tahsilat' | 'teminat' | 'reddiyat' | 'muvekkil_odeme';

/** Reddiyatın kime gittiği. `biz` avukatın cebine giren paradır. */
export type ReddiyatTo = 'biz' | 'muvekkil' | 'ucuncu' | 'gider' | 'iade';

export type UyapCourtMoneyLine = {
    page: UyapCourtMoneyPage;
    fileKey: string;
    dosyaNo: string;
    dosyaId: string;
    birimAdi: string;
    kind: LedgerKind;
    flow: CourtMoneyFlow;
    label: string;
    amountMinor: number;
    remainingMinor: number | null;
    entryDate: string;
    payerName: string;
    receiptNo: string;
    externalKey: string;
    detailJson: string;
};

export type UyapCourtMoneyPageLines = {
    lines: UyapCourtMoneyLine[];
    /** Boş portal listesi eski Katır satırlarını siler. Okunamayan dolu liste silmez. */
    prune: boolean;
};

export type UyapCourtMoneyTotals = Record<string, string | number | boolean | null>;

export type UyapCourtMoneyFile = {
    fileKey: string;
    dosyaNo: string;
    dosyaId: string;
    birimAdi: string;
    harc: UyapCourtMoneyPageLines | null;
    tahsilat: UyapCourtMoneyPageLines | null;
    reddiyat: UyapCourtMoneyPageLines | null;
    totals: UyapCourtMoneyTotals | null;
};

export type ParseUyapCourtMoneyResult = {
    files: UyapCourtMoneyFile[];
    skipped: number;
};

const PAYER_NOISE = new Set([
    'adina',
    'av',
    'avukat',
    'yatirmistir',
    'yatirdi',
    'yatiran',
    'tarafindan',
    'sayin',
]);

const TOTAL_KEYS = [
    'toplamKalan',
    'toplamTahsilHarci',
    'toplamTahsilat',
    'toplamTeminat',
    'toplamreddiyat',
    'haricen',
] as const;

const HEADER_ALIASES: Record<string, string> = {
    'dosya no': 'dosyaNo',
    'birim adi': 'birimAdi',
    'harc masraf adi': 'harcMasrafAdi',
    'tahsilat tarihi': 'tahsilatTarihi',
    'kisi': 'odeyenKisi',
    'odeyen kisi': 'odeyenKisi',
    'odenecek kisi': 'odeyenKisi',
    'ilgili kisi': 'odeyenKisi',
    'makbuz no': 'makbuzNo',
    'miktar': 'miktar',
    'kalan miktar': 'kalanMiktar',
    'tahsilat turu': 'tahsilatTuru',
    'tahsilat tutari': 'tahsilatTutari',
    'detay': 'detay',
    'hesaplama yapilan tutar': 'hesaplamaYapilanTutar',
    'hesaplama yapilabilir miktar': 'hesaplamaYapilanTutar',
    'reddiyat tarihi': 'reddiyatTarihi',
    'reddiyat nedeni': 'reddiyatNedeni',
    'odenecek miktar': 'odenecekMiktar',
    'durum': 'durumAciklama',
    'tip': 'tahsilatTuru',
};

export function foldTrCourt(value: string): string {
    return value
        .replace(/İ/g, 'i')
        .replace(/I/g, 'ı')
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c');
}

export function courtFileKey(raw: string): string {
    const match = /(\d{4})\s*[/\-.]\s*0*(\d{1,10})\b/.exec(raw.trim());
    if (!match) return '';
    return `${match[1]}/${String(Number(match[2]))}`;
}

export function asUyapCourtMoneyPage(value: unknown): UyapCourtMoneyPage | null {
    if (value === 'harc' || value === 'tahsilat' || value === 'reddiyat') return value;
    return null;
}

const LEGAL_SUFFIX = new Set([
    'ltd',
    'sti',
    'ltdsti',
    'limited',
    'sirketi',
    'sirket',
    'anonim',
    'as',
    've',
]);

export function payerMatchesPartyName(payer: string, fullName: string): boolean {
    const nameTokens = coreTokens(fullName);
    const payerTokens = coreTokens(payer);
    if (nameTokens.length === 0 || payerTokens.length === 0) return false;
    if (nameTokens.length === 1 && nameTokens[0].length < 4) return false;
    const payerSet = new Set(payerTokens);
    const nameSet = new Set(nameTokens);
    if (nameTokens.every((token) => payerSet.has(token))) return true;
    return payerTokens.length >= 2 && payerTokens.every((token) => nameSet.has(token));
}

export type AdvanceDepositor = 'buro' | 'muvekkil' | 'karsi' | 'onceki_vekil';

export function partyRepresentedFrom(metadata: string | null | undefined): string | null {
    if (!metadata) return null;
    try {
        const parsed = JSON.parse(metadata) as { representedFrom?: unknown };
        const value = parsed.representedFrom;
        return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
    } catch {
        return null;
    }
}

function beforeRepresentation(entryDate: string | null | undefined, representedFrom: string | null | undefined): boolean {
    if (!entryDate || !representedFrom) return false;
    return entryDate.slice(0, 10) < representedFrom;
}

function payerNamesOurLawyer(payer: string, lawyerNames: string[]): boolean {
    return lawyerNames.some((name) => payerMatchesPartyName(payer, name));
}

/** Ödeyen satırında büronun avukatı olmayan bir vekil adı var. */
export function payerNamesOtherCounsel(payer: string, lawyerNames: Array<string | null | undefined>): boolean {
    const text = payer.trim();
    if (!text) return false;
    const lawyers = lawyerNames.filter((name): name is string => Boolean(name && name.trim()));
    if (payerNamesOurLawyer(text, lawyers)) return false;
    const folded = foldTrCourt(text);
    return folded.includes('vekil') || folded.includes('avukat') || /(^| )av[.\s]/.test(folded);
}

/**
 * Dosyaya yatırılan harç, masraf ve avansın kimden çıktığı.
 * UYAP'ta müvekkil adına büro tarafından yatırılan işlemlerde de müvekkil adı yazdığı için,
 * yalnız müvekkil adı geçen satır varsayılan olarak 'buro' kabul edilir.
 * Başka bir vekilin adı geçiyorsa para büronun cebinden çıkmamıştır.
 * Temsil başlangıcından önceki, büro avukatının adını taşımayan satır da önceki vekildendir.
 * 'muvekkil' yalnızca kullanıcı arayüzden işaretlediğinde atanır.
 */
export function advanceDepositor(
    payer: string,
    clientNames: Array<string | null | undefined>,
    lawyerNames: Array<string | null | undefined>,
    when?: { entryDate?: string | null; representedFrom?: string | null },
): AdvanceDepositor {
    const text = payer.trim();
    const lawyers = lawyerNames.filter((name): name is string => Boolean(name && name.trim()));
    const clients = clientNames.filter((name): name is string => Boolean(name && name.trim()));
    const prior = beforeRepresentation(when?.entryDate, when?.representedFrom);
    if (!text) return prior ? 'onceki_vekil' : 'buro';
    if (payerNamesOurLawyer(text, lawyers)) return 'buro';
    if (payerNamesOtherCounsel(text, lawyers)) return 'onceki_vekil';
    if (payerIsOurs(text, clients)) return prior ? 'onceki_vekil' : 'buro';
    return 'karsi';
}

/** Boş ödeyen, müvekkil veya büro avukatı bizim taraftır. */
export function payerIsOurs(payer: string, names: Array<string | null | undefined>): boolean {
    const text = payer.trim();
    if (!text) return true;
    return names.some((name) => Boolean(name && payerMatchesPartyName(text, name)));
}

export function courtMoneyBalanceMinor(
    line: Pick<UyapCourtMoneyLine, 'page' | 'flow' | 'amountMinor'>,
    options: { payerOurs: boolean; harcPageProvided: boolean; depositor?: AdvanceDepositor | null },
): number {
    switch (line.flow) {
        case 'harc':
        case 'masraf':
            if (options.depositor === 'onceki_vekil') return 0;
            if (!options.payerOurs) return 0;
            if (line.page === 'tahsilat' && options.harcPageProvided) return 0;
            return line.amountMinor;
        case 'dosya_avans':
            if (options.depositor === 'muvekkil' || options.depositor === 'karsi' || options.depositor === 'onceki_vekil' || !options.payerOurs) return 0;
            return line.amountMinor;
        case 'tahsilat':
        case 'teminat':
        case 'reddiyat':
        case 'muvekkil_odeme':
            return 0;
        default: {
            const exhaustive: never = line.flow;
            throw new Error(`Unknown court money flow: ${String(exhaustive)}`);
        }
    }
}

export function reddiyatDestination(
    label: string,
    payee: string,
    clientNames: Array<string | null | undefined>,
    lawyerNames: Array<string | null | undefined> = [],
): ReddiyatTo {
    const folded = foldTrCourt(label);
    if (folded.includes('iade')) return 'iade';
    if (
        folded.includes('posta')
        || folded.includes('kep')
        || folded.includes('masraf')
        || folded.includes('bilirki')
        || folded.includes('tasit')
        || folded.includes('tanik')
        || folded.includes('taksi')
        || folded.includes('yolluk')
        || folded.includes('baska birim')
    ) {
        return 'gider';
    }
    const lawyers = lawyerNames.filter((name): name is string => Boolean(name && name.trim()));
    const clients = clientNames.filter((name): name is string => Boolean(name && name.trim()));
    if (payee.trim() && lawyers.some((name) => payerMatchesPartyName(payee, name))) return 'biz';
    if (payee.trim() && clients.some((name) => payerMatchesPartyName(payee, name))) return 'muvekkil';
    return 'ucuncu';
}

export type LedgerEffect = {
    kind: LedgerKind;
    balanceMinor: number;
    depositor: AdvanceDepositor | null;
    reddiyatTo: ReddiyatTo | null;
    /** Avukata çıkan reddiyat: para büronun cebine girdi. */
    pocket: boolean;
};

/**
 * Büro bakiyesi: büronun icra dairesine yatırdığı harç ve masraf müvekkil borcudur.
 * Müvekkilin doğrudan yatırdığı satır bakiyeye girmez.
 * Borç reddiyatı veya iade avukata çıktıysa müvekkilin parası büronun cebindedir; avans alacağına yazılır.
 * Müvekkile veya üçüncü kişiye çıkan reddiyat ve dosyanın gider reddiyatı bu bakiyeye girmez.
 */
export function ledgerEffect(
    line: Pick<UyapCourtMoneyLine, 'page' | 'flow' | 'kind' | 'label' | 'amountMinor' | 'payerName' | 'entryDate'>,
    context: {
        clientNames: Array<string | null | undefined>;
        lawyerNames: Array<string | null | undefined>;
        harcPageProvided: boolean;
        representedFrom?: string | null;
    },
): LedgerEffect {
    const payment = line.flow === 'harc' || line.flow === 'masraf' || line.flow === 'dosya_avans';
    const depositor = payment
        ? advanceDepositor(line.payerName, context.clientNames, context.lawyerNames, {
            entryDate: line.entryDate,
            representedFrom: context.representedFrom,
        })
        : null;
    if (line.flow === 'reddiyat') {
        const reddiyatTo = reddiyatDestination(line.label, line.payerName, context.clientNames, context.lawyerNames);
        const lawyers = context.lawyerNames.filter((name): name is string => Boolean(name && name.trim()));
        const pocket = Boolean(line.payerName.trim()) && lawyers.some((name) => payerMatchesPartyName(line.payerName, name));
        const vekalet = foldTrCourt(line.label).includes('vekalet ucret');
        const credit = pocket && !vekalet && (reddiyatTo === 'biz' || reddiyatTo === 'iade');
        return {
            kind: credit ? 'avans' : line.kind,
            balanceMinor: credit ? line.amountMinor : 0,
            depositor: null,
            reddiyatTo,
            pocket: credit,
        };
    }
    let balanceMinor = 0;
    if (line.flow === 'harc' || line.flow === 'masraf' || line.flow === 'dosya_avans') {
        const duplicateTahsilat = line.page === 'tahsilat' && line.flow !== 'dosya_avans' && context.harcPageProvided;
        const cutFromCollection = isCollectionCutFee(line.label);
        if (!duplicateTahsilat && !cutFromCollection && depositor === 'buro') {
            balanceMinor = line.amountMinor;
        }
    }
    return { kind: line.kind, balanceMinor, depositor, reddiyatTo: null, pocket: false };
}

export function parseUyapCourtMoney(input: unknown): ParseUyapCourtMoneyResult {
    const bundles = coerceBundles(input);
    let skipped = 0;
    const files: UyapCourtMoneyFile[] = [];
    for (const bundle of bundles) {
        const parsed = parseBundle(bundle);
        skipped += parsed.skipped;
        if (parsed.file) files.push(parsed.file);
    }
    return { files, skipped };
}

export function courtMoneyExtras(detailJson: string | null | undefined): {
    detay: string;
    hesaplamaMinor: number | null;
    flow: CourtMoneyFlow | null;
    reddiyatTo: ReddiyatTo | null;
    depositor: AdvanceDepositor | null;
    pocket: boolean;
    manualOverride: boolean;
    idNumber: string;
} {
    const empty = {
        detay: '',
        hesaplamaMinor: null,
        flow: null,
        reddiyatTo: null,
        depositor: null,
        pocket: false,
        manualOverride: false,
        idNumber: '',
    };
    if (!detailJson) return empty;
    try {
        const parsed = JSON.parse(detailJson) as {
            detay?: unknown;
            hesaplamaMinor?: unknown;
            flow?: unknown;
            reddiyatTo?: unknown;
            depositor?: unknown;
            pocket?: unknown;
            manualOverride?: unknown;
            idNumber?: unknown;
        };
        const detay = typeof parsed.detay === 'string' ? parsed.detay.trim() : '';
        const hesaplamaMinor =
            typeof parsed.hesaplamaMinor === 'number' && Number.isFinite(parsed.hesaplamaMinor)
                ? Math.trunc(parsed.hesaplamaMinor)
                : null;
        return {
            detay,
            hesaplamaMinor,
            flow: asCourtMoneyFlow(parsed.flow),
            reddiyatTo: asReddiyatTo(parsed.reddiyatTo),
            depositor: asAdvanceDepositor(parsed.depositor),
            pocket: parsed.pocket === true,
            manualOverride: parsed.manualOverride === true,
            idNumber: typeof parsed.idNumber === 'string' ? parsed.idNumber.trim() : '',
        };
    } catch {
        return empty;
    }
}

export function ledgerLineTitle(row: {
    kind: LedgerKind;
    uyap_page?: UyapCourtMoneyPage | null;
    detail_json?: string | null;
}): string {
    const extras = courtMoneyExtras(row.detail_json);
    if (row.kind === 'avans') {
        if (extras.flow === 'reddiyat' || row.uyap_page === 'reddiyat') {
            return reddiyatTitle({ reddiyatTo: extras.reddiyatTo ?? 'biz', pocket: true });
        }
        return extras.pocket ? 'Alacak' : 'Avans';
    }
    const flow = extras.flow ?? (row.uyap_page === 'reddiyat' ? 'reddiyat' : null);
    switch (flow) {
        case 'reddiyat':
            return reddiyatTitle(extras);
        case 'muvekkil_odeme':
            return 'Müvekkile ödeme';
        case 'dosya_avans':
        case 'harc':
        case 'masraf': {
            const head = row.kind === 'harc' ? 'Harç' : 'Masraf';
            if (extras.depositor === 'muvekkil') return `${head} · müvekkil yatırdı`;
            if (extras.depositor === 'onceki_vekil') return `${head} · önceki vekil`;
            if (extras.depositor === 'karsi') return `${head} · bakiye dışı`;
            return head;
        }
        case 'tahsilat':
            return 'Dosya tahsilatı';
        case 'teminat':
            return 'Teminat';
        case null: {
            const head = row.kind === 'harc' ? 'Harç' : 'Masraf';
            if (extras.depositor === 'muvekkil') return `${head} · müvekkil yatırdı`;
            if (extras.depositor === 'onceki_vekil') return `${head} · önceki vekil`;
            if (extras.depositor === 'karsi') return `${head} · bakiye dışı`;
            return head;
        }
        default: {
            const exhaustive: never = flow;
            return String(exhaustive);
        }
    }
}

function asCourtMoneyFlow(value: unknown): CourtMoneyFlow | null {
    switch (value) {
        case 'harc':
        case 'masraf':
        case 'dosya_avans':
        case 'tahsilat':
        case 'teminat':
        case 'reddiyat':
        case 'muvekkil_odeme':
            return value;
        default:
            return null;
    }
}

function asAdvanceDepositor(value: unknown): AdvanceDepositor | null {
    switch (value) {
        case 'buro':
        case 'muvekkil':
        case 'karsi':
        case 'onceki_vekil':
            return value;
        default:
            return null;
    }
}

function reddiyatTitle(extras: { reddiyatTo: ReddiyatTo | null; pocket: boolean }): string {
    if (extras.pocket && extras.reddiyatTo === 'iade') return 'Alacak · iade';
    if (extras.pocket || extras.reddiyatTo === 'biz') return 'Alacak';
    if (extras.reddiyatTo === 'muvekkil') return 'Reddiyat · müvekkile';
    if (extras.reddiyatTo === 'iade') return 'Reddiyat · iade';
    if (extras.reddiyatTo === 'gider') return 'Reddiyat · gider';
    if (extras.reddiyatTo === 'ucuncu') return 'Reddiyat · üçüncü kişi';
    return 'Reddiyat';
}

function asReddiyatTo(value: unknown): ReddiyatTo | null {
    switch (value) {
        case 'biz':
        case 'muvekkil':
        case 'ucuncu':
        case 'gider':
        case 'iade':
            return value;
        default:
            return null;
    }
}

function significantTokens(value: string): string[] {
    return foldTrCourt(value)
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 2 && !PAYER_NOISE.has(token));
}

function coreTokens(value: string): string[] {
    return significantTokens(value).filter((token) => !LEGAL_SUFFIX.has(token));
}

export function isCollectionCutFee(label: string): boolean {
    const folded = foldTrCourt(label);
    return folded.includes('tahsil harc') || folded.includes('cezaevi');
}

function classifyHarcLabel(label: string, mark: string): { kind: LedgerKind; flow: CourtMoneyFlow } {
    const folded = foldTrCourt(label);
    if (folded.includes('pul')) return { kind: 'masraf', flow: 'masraf' };
    if (folded.includes('teminat')) return { kind: 'masraf', flow: 'teminat' };
    const code = mark.trim().toUpperCase();
    if (code === UYAP_HARC_MASRAF_MARK.harc || folded.includes('harc') || folded.includes('cezaevi')) {
        return { kind: 'harc', flow: 'harc' };
    }
    return { kind: 'masraf', flow: 'masraf' };
}

function classifyTahsilatLabel(label: string): { kind: LedgerKind; flow: CourtMoneyFlow } {
    const folded = foldTrCourt(label);
    if (folded.includes('avans')) return { kind: 'masraf', flow: 'dosya_avans' };
    if (folded.includes('teminat')) return { kind: 'masraf', flow: 'teminat' };
    if (folded.includes('borc')) return { kind: 'masraf', flow: 'tahsilat' };
    if (folded.includes('harc') || folded.includes('cezaevi')) return { kind: 'harc', flow: 'harc' };
    if (folded.includes('pul')) return { kind: 'masraf', flow: 'masraf' };
    return { kind: 'masraf', flow: 'masraf' };
}

function classifyCourtLine(page: UyapCourtMoneyPage, label: string, mark: string): { kind: LedgerKind; flow: CourtMoneyFlow } {
    switch (page) {
        case 'harc':
            return classifyHarcLabel(label, mark);
        case 'tahsilat':
            return classifyTahsilatLabel(label);
        case 'reddiyat':
            return { kind: 'masraf', flow: 'reddiyat' };
        default: {
            const exhaustive: never = page;
            throw new Error(`Unknown court money page: ${String(exhaustive)}`);
        }
    }
}

function headerToken(raw: string): string {
    return foldTrCourt(raw).replace(/[^a-z0-9]+/g, ' ').trim();
}

function cellString(value: unknown): string {
    if (typeof value === 'number' && Number.isFinite(value)) {
        if (Number.isSafeInteger(value)) return String(value);
        return String(value);
    }
    if (typeof value === 'string') return value.trim();
    return '';
}

function parseCourtMinor(value: unknown, allowZero: boolean): number | null {
    if (value == null) return null;
    if (typeof value === 'string' && !value.trim()) return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        const minor = Math.round(Number(value.toFixed(2)) * 100);
        if (!Number.isSafeInteger(minor) || minor < 0 || minor > 100_000_000_000) return null;
        if (minor === 0) return allowZero ? 0 : null;
        return minor;
    }
    const text = cellString(value).replace(/\s/g, '');
    if (allowZero && /^(?:0+|0[.,]0{1,2})$/.test(text)) return 0;
    return parseLedgerAmountToMinor(text);
}

function firstText(values: unknown[]): string {
    for (const value of values) {
        const text = cellString(value);
        if (text) return text;
    }
    return '';
}

function firstMinor(values: unknown[], allowZero: boolean): number | null {
    for (const value of values) {
        const minor = parseCourtMinor(value, allowZero);
        if (minor != null) return minor;
    }
    return null;
}

function firstDate(values: unknown[]): string | null {
    for (const value of values) {
        const date = parseCourtDate(value);
        if (date) return date;
    }
    return null;
}

const ENGLISH_MONTHS: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
};

/** Portal `java.util.Date` metni: `Aug 20, 2026 11:12:08 PM`. Takvim günü, saat dilimi kaydırmadan. */
function parseEnglishCourtDate(text: string): string | null {
    const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})\b/i.exec(text);
    if (!match) return null;
    const month = ENGLISH_MONTHS[match[1].slice(0, 3).toLowerCase()];
    if (!month) return null;
    return parseLedgerDate(`${Number(match[2])}.${month}.${match[3]}`);
}

function parseCourtDate(value: unknown): string | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return isoUtcDate(value);
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return isoUtcDate(date);
    }
    const text = cellString(value);
    if (!text) return null;
    const iso = /^(\d{4}-\d{2}-\d{2})/.exec(text);
    if (iso) return parseLedgerDate(iso[1]);
    const tr = /^(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})(?:\D|$)/.exec(text);
    if (tr) return parseLedgerDate(`${tr[1]}.${tr[2]}.${tr[3]}`);
    return parseEnglishCourtDate(text);
}

function isoUtcDate(date: Date): string | null {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    return parseLedgerDate(
        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
        const alias = HEADER_ALIASES[headerToken(key)];
        out[alias || key] = value;
    }
    return out;
}

function asRowObjects(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) return [];
    if (value.length === 0) return [];
    if (Array.isArray(value[0])) {
        const headers = (value[0] as unknown[]).map((cell) => cellString(cell));
        const rows: Record<string, unknown>[] = [];
        for (const raw of value.slice(1)) {
            if (!Array.isArray(raw)) continue;
            const row: Record<string, unknown> = {};
            headers.forEach((header, index) => {
                if (header) row[header] = raw[index];
            });
            rows.push(row);
        }
        return rows;
    }
    return value.filter(isRecord);
}

type Bundle = {
    dosyaNo: string;
    dosyaId: string;
    birimAdi: string;
    harc: { provided: boolean; rows: Record<string, unknown>[] };
    tahsilat: { provided: boolean; rows: Record<string, unknown>[] };
    reddiyat: { provided: boolean; rows: Record<string, unknown>[] };
    totals: UyapCourtMoneyTotals | null;
};

function pageSlot(source: Record<string, unknown>, keys: string[]): Bundle['harc'] {
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
        const value = source[key];
        if (value == null) return { provided: true, rows: [] };
        return { provided: true, rows: asRowObjects(value).map(normalizeRow) };
    }
    return { provided: false, rows: [] };
}

function readTotals(source: Record<string, unknown>): UyapCourtMoneyTotals | null {
    const totals: UyapCourtMoneyTotals = {};
    for (const key of TOTAL_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
        const value = source[key];
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
            totals[key] = value;
        }
    }
    return Object.keys(totals).length > 0 ? totals : null;
}

function bundleFromRecord(source: Record<string, unknown>): Bundle | null {
    const harc = pageSlot(source, ['harc', 'harcList', 'harcMasrafList']);
    const tahsilat = pageSlot(source, ['tahsilat', 'tahsilatList']);
    const reddiyat = pageSlot(source, ['reddiyat', 'reddiyatList']);
    if (!harc.provided && !tahsilat.provided && !reddiyat.provided) return null;
    return {
        dosyaNo: cellString(source.dosyaNo),
        dosyaId: cellString(source.dosyaId),
        birimAdi: cellString(source.birimAdi),
        harc,
        tahsilat,
        reddiyat,
        totals: readTotals(source),
    };
}

function coerceBundles(input: unknown): Bundle[] {
    if (Array.isArray(input)) {
        const records = input.filter(isRecord);
        if (records.length > 0 && records.every((row) => bundleFromRecord(row))) {
            return records.map((row) => bundleFromRecord(row)).filter((row): row is Bundle => row != null);
        }
        return groupFlatRows(asRowObjects(input).map(normalizeRow));
    }
    if (!isRecord(input)) return [];
    if (Array.isArray(input.files)) return coerceBundles(input.files);
    const bundle = bundleFromRecord(input);
    if (bundle) return [bundle];
    return [];
}

function detectPage(row: Record<string, unknown>): UyapCourtMoneyPage {
    if (row.reddiyatNedeni || row.reddiyatTarihi || row.odenecekMiktar) return 'reddiyat';
    if (row.harcMasrafAdi) return 'harc';
    if (row.tahsilatTutari != null && row.miktar == null) return 'tahsilat';
    if (row.miktar != null) return 'harc';
    if (row.tahsilatTuru) return 'tahsilat';
    return 'harc';
}

function groupFlatRows(rows: Record<string, unknown>[]): Bundle[] {
    const groups = new Map<string, Bundle>();
    for (const row of rows) {
        const dosyaNo = cellString(row.dosyaNo);
        const key = courtFileKey(dosyaNo) || dosyaNo || '_';
        let bundle = groups.get(key);
        if (!bundle) {
            bundle = {
                dosyaNo,
                dosyaId: cellString(row.dosyaId),
                birimAdi: cellString(row.birimAdi),
                harc: { provided: false, rows: [] },
                tahsilat: { provided: false, rows: [] },
                reddiyat: { provided: false, rows: [] },
                totals: null,
            };
            groups.set(key, bundle);
        }
        if (!bundle.dosyaNo && dosyaNo) bundle.dosyaNo = dosyaNo;
        if (!bundle.birimAdi) bundle.birimAdi = cellString(row.birimAdi);
        const page = detectPage(row);
        const slot = bundle[page];
        slot.provided = true;
        slot.rows.push(row);
    }
    return [...groups.values()];
}

function parseBundle(bundle: Bundle): { file: UyapCourtMoneyFile | null; skipped: number } {
    let skipped = 0;
    const fileKey = courtFileKey(bundle.dosyaNo);
    const build = (page: UyapCourtMoneyPage, slot: Bundle['harc']): UyapCourtMoneyPageLines | null => {
        if (!slot.provided) return null;
        const lines: UyapCourtMoneyLine[] = [];
        const seen = new Set<string>();
        for (const row of slot.rows) {
            const expanded = expandRow(row);
            for (const item of expanded) {
                const line = lineFromRow(page, item, {
                    dosyaNo: cellString(item.dosyaNo) || bundle.dosyaNo,
                    dosyaId: cellString(item.dosyaId) || bundle.dosyaId,
                    birimAdi: cellString(item.birimAdi) || bundle.birimAdi,
                    fileKey: courtFileKey(cellString(item.dosyaNo) || bundle.dosyaNo) || fileKey,
                });
                if (!line) {
                    skipped += 1;
                    continue;
                }
                let key = line.externalKey;
                let salt = 2;
                while (seen.has(key)) {
                    key = `${line.externalKey}:${salt}`;
                    salt += 1;
                }
                seen.add(key);
                lines.push({ ...line, externalKey: key });
            }
        }
        return { lines, prune: slot.rows.length === 0 || lines.length > 0 };
    };
    const harc = build('harc', bundle.harc);
    const tahsilat = build('tahsilat', bundle.tahsilat);
    const reddiyat = build('reddiyat', bundle.reddiyat);
    const resolvedKey = fileKey
        || harc?.lines[0]?.fileKey
        || tahsilat?.lines[0]?.fileKey
        || reddiyat?.lines[0]?.fileKey
        || '';
    if (!resolvedKey) return { file: null, skipped };
    return {
        skipped,
        file: {
            fileKey: resolvedKey,
            dosyaNo: bundle.dosyaNo || harc?.lines[0]?.dosyaNo || tahsilat?.lines[0]?.dosyaNo || '',
            dosyaId: bundle.dosyaId,
            birimAdi: bundle.birimAdi || harc?.lines[0]?.birimAdi || tahsilat?.lines[0]?.birimAdi || '',
            harc,
            tahsilat,
            reddiyat,
            totals: bundle.totals,
        },
    };
}

function expandRow(row: Record<string, unknown>): Record<string, unknown>[] {
    const nested = row.tahsilatSatirDVOList;
    if (!Array.isArray(nested) || nested.length === 0) return [row];
    const lines: Record<string, unknown>[] = [];
    for (const child of nested) {
        if (!isRecord(child)) continue;
        lines.push({
            ...normalizeRow(child),
            dosyaNo: row.dosyaNo,
            dosyaId: row.dosyaId,
            birimAdi: row.birimAdi,
            tahsilatTarihi: child.tahsilatTarihi ?? row.hmTahsilatTarih ?? row.tahsilatTarihi,
            odeyenKisi: child.odeyenKisi ?? row.odeyenKisi ?? row.aciklama,
            makbuzNo: child.makbuzNo ?? row.makbuzNo,
            kayitId: child.kayitId ?? row.kayitId ?? row.kayitID,
        });
    }
    return lines.length > 0 ? lines : [row];
}

function labelFor(page: UyapCourtMoneyPage, row: Record<string, unknown>): string {
    switch (page) {
        case 'harc':
            return cellString(row.harcMasrafAdi) || cellString(row.tahsilatTuru) || cellString(row.adi);
        case 'tahsilat':
            return cellString(row.tahsilatTuru) || cellString(row.harcMasrafAdi);
        case 'reddiyat':
            return cellString(row.reddiyatNedeni) || cellString(row.durumAciklama) || 'Reddiyat';
        default: {
            const exhaustive: never = page;
            throw new Error(`Unknown court money page: ${String(exhaustive)}`);
        }
    }
}

function amountValue(page: UyapCourtMoneyPage, row: Record<string, unknown>): unknown {
    switch (page) {
        case 'harc':
            return row.miktar ?? row.yatirilanMiktar ?? row.tahsilatTutari ?? row.tutar;
        case 'tahsilat':
            return row.tahsilatTutari ?? row.yatirilanMiktar ?? row.miktar;
        case 'reddiyat':
            return row.odenecekMiktar ?? row.miktar ?? row.tahsilatTutari;
        default: {
            const exhaustive: never = page;
            throw new Error(`Unknown court money page: ${String(exhaustive)}`);
        }
    }
}

function lineFromRow(
    page: UyapCourtMoneyPage,
    row: Record<string, unknown>,
    parent: { dosyaNo: string; dosyaId: string; birimAdi: string; fileKey: string },
): UyapCourtMoneyLine | null {
    const label = labelFor(page, row).replace(/\\+/g, '/').replace(/\s+/g, ' ').trim();
    const amountMinor = firstMinor(
        [amountValue(page, row), row.miktar, row.tahsilatTutari, row.yatirilanMiktar, row.odenecekMiktar, row.tutar],
        false,
    );
    const entryDate = firstDate([row.tahsilatTarihi, row.hmTahsilatTarih, row.reddiyatTarihi, row.tarih]);
    if (!label || amountMinor == null || !entryDate || !parent.fileKey) return null;
    const remainingMinor = parseCourtMinor(row.kalanMiktar, true);
    const payerName = firstText([row.odeyenKisi, row.kisi, row.aciklama, row.odenecekKisi]);
    const receiptNo = cellString(row.makbuzNo);
    const mark = cellString(row.harcmiMasrafmi);
    const classified = classifyCourtLine(page, label, mark);
    const kayitId = cellString(row.kayitId ?? row.kayitID);
    const slug = foldTrCourt(label).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'satir';
    const externalKey = kayitId
        ? `uyap:${page}:${parent.fileKey}:id:${kayitId}:${slug}:${amountMinor}`
        : `uyap:${page}:${parent.fileKey}:${receiptNo}:${slug}:${entryDate}:${amountMinor}`;
    return {
        page,
        fileKey: parent.fileKey,
        dosyaNo: parent.dosyaNo,
        dosyaId: parent.dosyaId,
        birimAdi: parent.birimAdi,
        kind: classified.kind,
        flow: classified.flow,
        label: label.slice(0, 400),
        amountMinor,
        remainingMinor,
        entryDate,
        payerName: payerName.slice(0, 400),
        receiptNo: receiptNo.slice(0, 80),
        externalKey,
        detailJson: detailJsonFor(page, classified.flow, row, {
            dosyaNo: parent.dosyaNo,
            dosyaId: parent.dosyaId,
            kayitId,
            remainingMinor,
        }),
    };
}

function detailJsonFor(
    page: UyapCourtMoneyPage,
    flow: CourtMoneyFlow,
    row: Record<string, unknown>,
    known: { dosyaNo: string; dosyaId: string; kayitId: string; remainingMinor: number | null },
): string {
    const detail: Record<string, unknown> = { page, flow };
    const put = (key: string, value: unknown) => {
        if (typeof value === 'string' && value.trim()) detail[key] = value.trim().slice(0, 500);
        else if (typeof value === 'number' && Number.isFinite(value)) detail[key] = value;
        else if (typeof value === 'boolean') detail[key] = value;
    };
    put('dosyaNo', known.dosyaNo);
    put('dosyaId', known.dosyaId);
    put('kayitId', known.kayitId);
    put('dosyaTurAciklama', row.dosyaTurAciklama);
    put('adet', row.adet);
    put('harcmiMasrafmi', row.harcmiMasrafmi);
    put('harcMasrafKod', row.harcMasrafKod ?? row.harcMasrafKodStr ?? row.harcmasrafKodStr);
    put('harcTip', row.harcTip);
    put('detay', row.detay);
    put('durumAciklama', row.durumAciklama);
    const hesaplamaMinor = parseCourtMinor(row.hesaplamaYapilanTutar, true);
    const odenebilirMinor = parseCourtMinor(row.odenebilirMiktar, true);
    const yatirilanMinor = parseCourtMinor(row.yatirilanMiktar, true);
    if (hesaplamaMinor != null) detail.hesaplamaMinor = hesaplamaMinor;
    if (odenebilirMinor != null) detail.odenebilirMinor = odenebilirMinor;
    if (yatirilanMinor != null) detail.yatirilanMinor = yatirilanMinor;
    if (known.remainingMinor != null) detail.kalanMinor = known.remainingMinor;
    for (const key of ['basvuruHarci', 'vekaletSuretHarci', 'tahsilHarci', 'cezaeviHarcTutari', 'damgaVergisi', 'gelirVergisi']) {
        const minor = parseCourtMinor(row[key], true);
        if (minor != null) detail[key] = minor;
    }
    const consumed = new Set([
        'dosyaNo', 'dosyaId', 'birimAdi', 'harcMasrafAdi', 'tahsilatTuru', 'adi', 'tahsilatTarihi',
        'hmTahsilatTarih', 'reddiyatTarihi', 'tarih', 'odeyenKisi', 'kisi', 'aciklama', 'odenecekKisi',
        'makbuzNo', 'miktar', 'tahsilatTutari', 'yatirilanMiktar', 'tutar', 'odenecekMiktar', 'kalanMiktar',
        'reddiyatNedeni', 'tahsilatSatirDVOList', 'yatirilanToplamMiktar', 'kayitId', 'kayitID',
        'dosyaTurAciklama', 'adet', 'harcmiMasrafmi', 'harcMasrafKod', 'harcMasrafKodStr', 'harcmasrafKodStr',
        'harcTip', 'detay', 'durumAciklama', 'hesaplamaYapilanTutar', 'odenebilirMiktar',
        'basvuruHarci', 'vekaletSuretHarci', 'tahsilHarci', 'cezaeviHarcTutari', 'damgaVergisi', 'gelirVergisi',
    ]);
    const extras: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(row)) {
        if (consumed.has(key)) continue;
        if (typeof value === 'string' && value.trim()) extras[key] = value.trim().slice(0, 500);
        else if (typeof value === 'number' && Number.isFinite(value)) extras[key] = value;
        else if (typeof value === 'boolean') extras[key] = value;
        if (Object.keys(extras).length >= 40) break;
    }
    if (Object.keys(extras).length > 0) detail.extras = extras;
    let json = JSON.stringify(detail);
    if (json.length > 6000) {
        delete detail.extras;
        json = JSON.stringify(detail).slice(0, 6000);
    }
    return json;
}
