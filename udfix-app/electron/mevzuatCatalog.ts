export type MevzuatCatalogEntry = {
    no: string;
    title: string;
    abbrev: string[];
};

/** Core kanunlar for the bundled madde corpus (mevzuat.gov.tr, MevzuatTur=1). */
export const MEVZUAT_CATALOG: MevzuatCatalogEntry[] = [
    { no: '2709', title: 'Türkiye Cumhuriyeti Anayasası', abbrev: ['Anayasa', 'AY'] },
    { no: '1136', title: 'Avukatlık Kanunu', abbrev: ['AvK'] },
    { no: '1512', title: 'Noterlik Kanunu', abbrev: [] },
    { no: '7201', title: 'Tebligat Kanunu', abbrev: ['TebK'] },
    { no: '4982', title: 'Bilgi Edinme Hakkı Kanunu', abbrev: [] },
    { no: '6754', title: 'Bilirkişilik Kanunu', abbrev: [] },
    { no: '4721', title: 'Türk Medeni Kanunu', abbrev: ['TMK'] },
    {
        no: '6284',
        title: 'Ailenin Korunması ve Kadına Karşı Şiddetin Önlenmesine Dair Kanun',
        abbrev: [],
    },
    { no: '5490', title: 'Nüfus Hizmetleri Kanunu', abbrev: [] },
    { no: '6698', title: 'Kişisel Verilerin Korunması Kanunu', abbrev: ['KVKK'] },
    { no: '5253', title: 'Dernekler Kanunu', abbrev: [] },
    { no: '5737', title: 'Vakıflar Kanunu', abbrev: [] },
    { no: '6098', title: 'Türk Borçlar Kanunu', abbrev: ['TBK'] },
    { no: '6102', title: 'Türk Ticaret Kanunu', abbrev: ['TTK'] },
    { no: '6502', title: 'Tüketicinin Korunması Hakkında Kanun', abbrev: ['TKHK'] },
    { no: '5941', title: 'Çek Kanunu', abbrev: [] },
    { no: '2920', title: 'Türk Sivil Havacılık Kanunu', abbrev: [] },
    { no: '6362', title: 'Sermaye Piyasası Kanunu', abbrev: ['SPK'] },
    { no: '6563', title: 'Elektronik Ticaretin Düzenlenmesi Hakkında Kanun', abbrev: [] },
    { no: '4857', title: 'İş Kanunu', abbrev: ['İşK'] },
    {
        no: '5510',
        title: 'Sosyal Sigortalar ve Genel Sağlık Sigortası Kanunu',
        abbrev: ['SSGSSK'],
    },
    { no: '7036', title: 'İş Mahkemeleri Kanunu', abbrev: [] },
    { no: '6331', title: 'İş Sağlığı ve Güvenliği Kanunu', abbrev: ['İSGK'] },
    { no: '6356', title: 'Sendikalar ve Toplu İş Sözleşmesi Kanunu', abbrev: [] },
    { no: '5237', title: 'Türk Ceza Kanunu', abbrev: ['TCK'] },
    { no: '5271', title: 'Ceza Muhakemesi Kanunu', abbrev: ['CMK'] },
    { no: '5275', title: 'Ceza ve Güvenlik Tedbirlerinin İnfazı Hakkında Kanun', abbrev: ['CGTİHK'] },
    { no: '5326', title: 'Kabahatler Kanunu', abbrev: [] },
    { no: '5395', title: 'Çocuk Koruma Kanunu', abbrev: ['ÇKK'] },
    { no: '5607', title: 'Kaçakçılıkla Mücadele Kanunu', abbrev: [] },
    {
        no: '5651',
        title: 'İnternet Ortamında Yapılan Yayınların Düzenlenmesi ve Bu Yayınlar Yoluyla İşlenen Suçlarla Mücadele Edilmesi Hakkında Kanun',
        abbrev: ['İnternet Kanunu'],
    },
    { no: '634', title: 'Kat Mülkiyeti Kanunu', abbrev: ['KMK'] },
    { no: '3194', title: 'İmar Kanunu', abbrev: [] },
    {
        no: '6306',
        title: 'Afet Riski Altındaki Alanların Dönüştürülmesi Hakkında Kanun',
        abbrev: [],
    },
    { no: '2644', title: 'Tapu Kanunu', abbrev: [] },
    { no: '2942', title: 'Kamulaştırma Kanunu', abbrev: [] },
    { no: '3402', title: 'Kadastro Kanunu', abbrev: [] },
    { no: '2872', title: 'Çevre Kanunu', abbrev: [] },
    { no: '6100', title: 'Hukuk Muhakemeleri Kanunu', abbrev: ['HMK'] },
    { no: '2004', title: 'İcra ve İflas Kanunu', abbrev: ['İİK'] },
    { no: '2577', title: 'İdari Yargılama Usulü Kanunu', abbrev: ['İYUK'] },
    { no: '6325', title: 'Hukuk Uyuşmazlıklarında Arabuluculuk Kanunu', abbrev: ['HUAK'] },
    { no: '2918', title: 'Karayolları Trafik Kanunu', abbrev: ['KTK'] },
    { no: '1593', title: 'Umumi Hıfzıssıhha Kanunu', abbrev: [] },
    { no: '657', title: 'Devlet Memurları Kanunu', abbrev: ['DMK'] },
    { no: '6183', title: 'Amme Alacaklarının Tahsil Usulü Hakkında Kanun', abbrev: ['AATUHK'] },
    { no: '213', title: 'Vergi Usul Kanunu', abbrev: ['VUK'] },
    { no: '4734', title: 'Kamu İhale Kanunu', abbrev: ['KİK'] },
    { no: '5393', title: 'Belediye Kanunu', abbrev: [] },
    { no: '492', title: 'Harçlar Kanunu', abbrev: [] },
    { no: '5846', title: 'Fikir ve Sanat Eserleri Kanunu', abbrev: ['FSEK'] },
    { no: '6769', title: 'Sınaî Mülkiyet Kanunu', abbrev: ['SMK'] },
    { no: '5070', title: 'Elektronik İmza Kanunu', abbrev: [] },
    {
        no: '6216',
        title: 'Anayasa Mahkemesinin Kuruluşu ve Yargılama Usulleri Hakkında Kanun',
        abbrev: [],
    },
    { no: '2797', title: 'Yargıtay Kanunu', abbrev: [] },
    { no: '2575', title: 'Danıştay Kanunu', abbrev: [] },
    { no: '2802', title: 'Hakimler ve Savcılar Kanunu', abbrev: ['HSK'] },
    { no: '5411', title: 'Bankacılık Kanunu', abbrev: [] },
    { no: '4054', title: 'Rekabetin Korunması Hakkında Kanun', abbrev: [] },
    { no: '5684', title: 'Sigortacılık Kanunu', abbrev: [] },
    {
        no: '6361',
        title: 'Finansal Kiralama, Faktoring, Finansman ve Tasarruf Finansman Şirketleri Kanunu',
        abbrev: [],
    },
    { no: '6750', title: 'Ticari İşlemlerde Taşınır Rehni Kanunu', abbrev: [] },
    { no: '854', title: 'Deniz İş Kanunu', abbrev: [] },
    { no: '5953', title: 'Basın Mesleğinde Çalışanlarla Çalıştıranlar Arasındaki Münasebetlerin Tanzimi Hakkında Kanun', abbrev: ['Basın İş Kanunu'] },
    { no: '4688', title: 'Kamu Görevlileri Sendikaları ve Toplu Sözleşme Kanunu', abbrev: [] },
    { no: '3713', title: 'Terörle Mücadele Kanunu', abbrev: ['TMK-Terör'] },
    { no: '6136', title: 'Ateşli Silahlar ve Bıçaklar ile Diğer Aletler Hakkında Kanun', abbrev: [] },
    { no: '2559', title: 'Polis Vazife ve Salahiyet Kanunu', abbrev: ['PVSK'] },
    { no: '3628', title: 'Mal Bildiriminde Bulunulması, Rüşvet ve Yolsuzluklarla Mücadele Kanunu', abbrev: [] },
    { no: '5549', title: 'Suç Gelirlerinin Aklanmasının Önlenmesi Hakkında Kanun', abbrev: [] },
    { no: '4686', title: 'Milletlerarası Tahkim Kanunu', abbrev: [] },
    { no: '5718', title: 'Milletlerarası Özel Hukuk ve Usul Hukuku Hakkında Kanun', abbrev: ['MÖHUK'] },
    { no: '193', title: 'Gelir Vergisi Kanunu', abbrev: ['GVK'] },
    { no: '5520', title: 'Kurumlar Vergisi Kanunu', abbrev: ['KVK'] },
    { no: '3065', title: 'Katma Değer Vergisi Kanunu', abbrev: ['KDVK', 'KDV'] },
    { no: '488', title: 'Damga Vergisi Kanunu', abbrev: [] },
    { no: '4735', title: 'Kamu İhale Sözleşmeleri Kanunu', abbrev: [] },
    { no: '2886', title: 'Devlet İhale Kanunu', abbrev: [] },
    { no: '5216', title: 'Büyükşehir Belediyesi Kanunu', abbrev: [] },
    { no: '5442', title: 'İl İdaresi Kanunu', abbrev: [] },
    { no: '6831', title: 'Orman Kanunu', abbrev: [] },
    { no: '3621', title: 'Kıyı Kanunu', abbrev: [] },
    { no: '5403', title: 'Toprak Koruma ve Arazi Kullanımı Kanunu', abbrev: [] },
    { no: '3213', title: 'Maden Kanunu', abbrev: [] },
    { no: '6458', title: 'Yabancılar ve Uluslararası Koruma Kanunu', abbrev: ['YUKK'] },
    { no: '5901', title: 'Türk Vatandaşlığı Kanunu', abbrev: [] },
    { no: '6735', title: 'Uluslararası İşgücü Kanunu', abbrev: [] },
    { no: '4875', title: 'Doğrudan Yabancı Yatırımlar Kanunu', abbrev: [] },
    { no: '5682', title: 'Pasaport Kanunu', abbrev: [] },
    { no: '7338', title: 'Veraset ve İntikal Vergisi Kanunu', abbrev: [] },
    { no: '1319', title: 'Emlak Vergisi Kanunu', abbrev: [] },
    { no: '4458', title: 'Gümrük Kanunu', abbrev: [] },
    { no: '4760', title: 'Özel Tüketim Vergisi Kanunu', abbrev: ['ÖTVK'] },
    { no: '4925', title: 'Karayolları Taşıma Kanunu', abbrev: [] },
    { no: '6446', title: 'Elektrik Piyasası Kanunu', abbrev: [] },
    { no: '5015', title: 'Petrol Piyasası Kanunu', abbrev: [] },
    { no: '5187', title: 'Basın Kanunu', abbrev: [] },
    { no: '6112', title: 'Radyo ve Televizyonların Kuruluş ve Yayın Hizmetleri Hakkında Kanun', abbrev: ['RTÜK Kanunu'] },
    { no: '1219', title: 'Tababet ve Şuabatı San’atlarının Tarzı İcrasına Dair Kanun', abbrev: [] },
    { no: '3359', title: 'Sağlık Hizmetleri Temel Kanunu', abbrev: [] },
    { no: '2547', title: 'Yükseköğretim Kanunu', abbrev: [] },
    { no: '7405', title: 'Spor Kulüpleri ve Spor Federasyonları Kanunu', abbrev: [] },
    { no: '3218', title: 'Serbest Bölgeler Kanunu', abbrev: [] },
    { no: '4562', title: 'Organize Sanayi Bölgeleri Kanunu', abbrev: [] },
    { no: '4691', title: 'Teknoloji Geliştirme Bölgeleri Kanunu', abbrev: [] },
    { no: '6585', title: 'Perakende Ticaretin Düzenlenmesi Hakkında Kanun', abbrev: [] },
    { no: '5346', title: 'Yenilenebilir Enerji Kaynaklarının Elektrik Enerjisi Üretimi Amaçlı Kullanımına İlişkin Kanun', abbrev: [] },
    { no: '5686', title: 'Jeotermal Kaynaklar ve Doğal Mineralli Sular Kanunu', abbrev: [] },
    { no: '5300', title: 'Tarım Ürünleri Lisanslı Depoculuk Kanunu', abbrev: [] },
    { no: '2863', title: 'Kültür ve Tabiat Varlıklarını Koruma Kanunu', abbrev: [] },
    { no: '2634', title: 'Turizmi Teşvik Kanunu', abbrev: [] },
    { no: '2873', title: 'Milli Parklar Kanunu', abbrev: [] },
    { no: '5199', title: 'Hayvanları Koruma Kanunu', abbrev: [] },
    { no: '197', title: 'Motorlu Taşıtlar Vergisi Kanunu', abbrev: ['MTVK'] },
    { no: '6802', title: 'Gider Vergileri Kanunu', abbrev: [] },
    { no: '7194', title: 'Dijital Hizmet Vergisi ile Bazı Kanunlarda ve 375 Sayılı Kanun Hükmünde Kararnamede Değişiklik Yapılması Hakkında Kanun', abbrev: ['DHV'] },
    { no: '210', title: 'Değerli Kağıtlar Kanunu', abbrev: [] },
    { no: '2820', title: 'Siyasi Partiler Kanunu', abbrev: ['SPK-Siyasi'] },
    { no: '5188', title: 'Özel Güvenlik Hizmetlerine Dair Kanun', abbrev: [] },
    { no: '5543', title: 'İskân Kanunu', abbrev: [] },
    { no: '7269', title: 'Umumi Hayata Müessir Afetler Dolayısiyle Alınacak Tedbirlerle Yapılacak Yardımlara Dair Kanun', abbrev: [] },
];

/**
 * Lawyer shorthand for instrument search. Keys are official MevzuatNo from
 * `MEVZUAT_CATALOG` — do not invent numbers.
 */
export const MEVZUAT_SEARCH_ALIASES: Readonly<Record<string, readonly string[]>> = {
    '6098': ['borçlar', 'borçlar kanunu', 'türk borçlar', 'türk borçlar kanunu'],
    '4721': ['medeni', 'medeni kanun', 'türk medeni', 'türk medeni kanunu'],
    '5237': ['ceza', 'ceza kanunu', 'türk ceza', 'türk ceza kanunu'],
    '6102': ['ticaret', 'ticaret kanunu', 'türk ticaret', 'türk ticaret kanunu'],
    '6100': ['hukuk muhakemeleri', 'hukuk muhakemeleri kanunu', 'hukuk usulü'],
    '5271': ['ceza muhakemesi', 'ceza muhakemesi kanunu', 'ceza usulü'],
    '2004': ['icra iflas', 'icra ve iflas', 'icra iflas kanunu', 'icra ve iflas kanunu', 'icra'],
    '2577': ['idari yargılama', 'idari yargılama usulü', 'idari yargılama usulü kanunu'],
    '213': ['vergi usul', 'vergi usul kanunu'],
    '1136': ['avukatlık', 'avukatlık kanunu'],
    '1512': ['noterlik', 'noterlik kanunu'],
    '7201': ['tebligat', 'tebligat kanunu'],
    '4857': ['iş kanunu', 'is kanunu'],
    '5326': ['kabahatler', 'kabahatler kanunu'],
};

export function catalogSearchAliases(no: string): readonly string[] {
    return MEVZUAT_SEARCH_ALIASES[no] ?? [];
}

export type MevzuatYonetmelikCatalogEntry = MevzuatCatalogEntry & {
    /** Official MevzuatTur values to probe (4 = Yönetmelik, 7 = Kurum ve Kuruluş Yönetmeliği). */
    turCandidates: number[];
};

/**
 * Focused lawyer-relevant yönetmelikler. Numbers come from mevzuat.gov.tr iframe URLs
 * (not invented). Generate skips any that do not resolve.
 */
export const YONETMELIK_CATALOG: MevzuatYonetmelikCatalogEntry[] = [
    {
        no: '15828',
        title: 'Tebligat Kanununun Uygulanmasına Dair Yönetmelik',
        abbrev: ['TebYön', 'Tebligat Yönetmeliği'],
        turCandidates: [7, 4],
    },
    {
        no: '23615',
        title: 'Bölge Adliye ve Adlî Yargı İlk Derece Mahkemeleri ile Cumhuriyet Başsavcılıkları İdarî ve Yazı İşleri Hizmetlerinin Yürütülmesine Dair Yönetmelik',
        abbrev: ['HMKYön', 'Yazı İşleri Yönetmeliği'],
        turCandidates: [7, 4],
    },
    {
        no: '38760',
        title: 'Hukuk Muhakemelerinde Ses ve Görüntü Nakledilmesi Yoluyla Duruşma İcrası Hakkında Yönetmelik',
        abbrev: ['e-Duruşma'],
        turCandidates: [7, 4],
    },
    {
        no: '8043',
        title: 'İcra ve İflâs Kanunu Yönetmeliği',
        abbrev: ['İİKYön', 'İİK Yönetmeliği'],
        turCandidates: [7, 4],
    },
    {
        no: '5780',
        title: 'Türkiye Barolar Birliği Avukatlık Kanunu Yönetmeliği',
        abbrev: ['AvYön', 'TBB Yönetmeliği'],
        turCandidates: [7, 4],
    },
    {
        no: '5040',
        title: 'Noterlik Kanunu Yönetmeliği',
        abbrev: ['NoterYön'],
        turCandidates: [7, 4],
    },
    {
        no: '7076',
        title: 'Adlî Tıp Kurumu Kanunu Uygulama Yönetmeliği',
        abbrev: ['AdliTıpYön'],
        turCandidates: [7, 4],
    },
    {
        no: '23818',
        title: 'Bilirkişilik Yönetmeliği',
        abbrev: ['BilirkişiYön'],
        turCandidates: [7, 4],
    },
    {
        no: '24638',
        title: 'Hukuk Uyuşmazlıklarında Arabuluculuk Kanunu Yönetmeliği',
        abbrev: ['ArabuluculukYön', 'HUAKYön'],
        turCandidates: [7, 4],
    },
];

export type BundledMevzuatCatalogEntry = {
    kind: 'kanun' | 'yonetmelik';
    no: string;
    title: string;
    abbrev: string[];
    turCandidates: number[];
};

export function bundledMevzuatCatalog(): BundledMevzuatCatalogEntry[] {
    const kanun: BundledMevzuatCatalogEntry[] = MEVZUAT_CATALOG.map((row) => ({
        kind: 'kanun',
        no: row.no,
        title: row.title,
        abbrev: row.abbrev,
        turCandidates: [1],
    }));
    const yonetmelik: BundledMevzuatCatalogEntry[] = YONETMELIK_CATALOG.map((row) => ({
        kind: 'yonetmelik',
        no: row.no,
        title: row.title,
        abbrev: row.abbrev,
        turCandidates: row.turCandidates,
    }));
    return [...kanun, ...yonetmelik];
}

export function catalogShortName(entry: { title: string; abbrev: string[] }): string {
    return entry.abbrev[0] || entry.title;
}
