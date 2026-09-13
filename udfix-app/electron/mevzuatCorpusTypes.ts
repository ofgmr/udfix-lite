export type MevzuatInstrumentKind = 'kanun' | 'yonetmelik';
export type MevzuatMaddeKind = 'madde' | 'ek' | 'gecici';

export type MevzuatMaddeRecord = {
    id: string;
    maddeKind: MevzuatMaddeKind;
    maddeNo: string;
    heading: string;
    text: string;
    preview: string;
    kitap: string | null;
    kisim: string | null;
    bolum: string | null;
    ayirim: string | null;
    maddeBaslik: string | null;
    sectionPath: string[];
};

export type MevzuatInstrumentFile = {
    id: string;
    kind: MevzuatInstrumentKind;
    no: string;
    title: string;
    shortName: string;
    aliases: string[];
    tur: number;
    tertip: number;
    sourceUrl: string;
    kabulTarihi: string | null;
    maddeCount: number;
    maddeler: MevzuatMaddeRecord[];
};

export type MevzuatManifestEntry = {
    id: string;
    file: string;
    kind: MevzuatInstrumentKind;
    no: string;
    title: string;
    shortName: string;
    aliases: string[];
    tur: number;
    tertip: number;
    maddeCount: number;
};

export type MevzuatManifest = {
    version: number;
    generatedAt: string;
    instruments: MevzuatManifestEntry[];
};
