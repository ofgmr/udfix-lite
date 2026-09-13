/** UYAP yargı birimi tablo kodları (yargiBirimleriSorgula_brd.ajx). Sanitized harvest — no PII. */
export type UyapYargiBirimiTablo =
    | '0901'
    | '0921'
    | '7702'
    | '0929'
    | '0911'
    | '0914'
    | '0924'
    | '0915'
    | '0935'
    | '0931'
    | '0934'
    | '0926'
    | '0920'
    | '0902'
    | '7710'
    | '7703'
    | '0913'
    | '0925'
    | '0908'
    | '0907'
    | '0906'
    | '0904'
    | '0912'
    | '1101'
    | '0917'
    | '0918'
    | '0919'
    | '6701'
    | '6702'
    | '9791';

export interface UyapYargiBirimi {
    tablo: UyapYargiBirimiTablo;
    label: string;
    /** Coarse yargı alanı for Nomai filters */
    yargiAlani: 'ceza' | 'hukuk' | 'icra' | 'idari' | 'arabuluculuk';
}

export const UYAP_YARGI_BIRIMLERI: readonly UyapYargiBirimi[] = [
    { tablo: '0901', label: 'AĞIR CEZA MAHKEMESİ', yargiAlani: 'ceza' },
    { tablo: '0921', label: 'ASLİYE CEZA MAHKEMESİ', yargiAlani: 'ceza' },
    { tablo: '7702', label: 'Bölge Adliye Mah. Ceza Dairesi', yargiAlani: 'ceza' },
    { tablo: '0929', label: 'ÇOCUK AĞIR CEZA MAHKEMESİ', yargiAlani: 'ceza' },
    { tablo: '0911', label: 'ÇOCUK MAHKEMESİ', yargiAlani: 'ceza' },
    { tablo: '0914', label: 'FİKRİ VE SINAİ HAKLAR CEZA MAHKEMESİ', yargiAlani: 'ceza' },
    { tablo: '0924', label: 'İCRA CEZA HAKİMLİĞİ', yargiAlani: 'ceza' },
    { tablo: '0915', label: 'İNFAZ HAKİMLİĞİ', yargiAlani: 'ceza' },
    { tablo: '0935', label: 'İSTİNAF CEZA DAİRESİ (İLK DERECE)', yargiAlani: 'ceza' },
    { tablo: '0931', label: 'SULH CEZA HAKİMLİĞİ', yargiAlani: 'ceza' },
    { tablo: '0934', label: 'YARGITAY CEZA DAİRESİ (İLK DERECE)', yargiAlani: 'ceza' },
    { tablo: '0926', label: 'AİLE MAHKEMESİ', yargiAlani: 'hukuk' },
    { tablo: '0920', label: 'ASLİYE HUKUK MAHKEMESİ', yargiAlani: 'hukuk' },
    { tablo: '0902', label: 'ASLİYE TİCARET MAHKEMESİ', yargiAlani: 'hukuk' },
    { tablo: '7710', label: 'BAM Hukuk Dairesi(İlk Derece)', yargiAlani: 'hukuk' },
    { tablo: '7703', label: 'Bölge Adliye Mah. Hukuk Dairesi', yargiAlani: 'hukuk' },
    { tablo: '0913', label: 'FİKRİ VE SINAİ HAKLAR HUKUK MAHKEMESİ', yargiAlani: 'hukuk' },
    { tablo: '0925', label: 'İCRA HUKUK MAHKEMESİ', yargiAlani: 'hukuk' },
    { tablo: '0908', label: 'İŞ MAHKEMESİ', yargiAlani: 'hukuk' },
    { tablo: '0907', label: 'KADASTRO MAHKEMESİ', yargiAlani: 'hukuk' },
    { tablo: '0906', label: 'KADASTRO MAHKEMESİ(MÜS)', yargiAlani: 'hukuk' },
    { tablo: '0904', label: 'SULH HUKUK MAHKEMESİ', yargiAlani: 'hukuk' },
    { tablo: '0912', label: 'TÜKETİCİ MAHKEMESİ', yargiAlani: 'hukuk' },
    { tablo: '1101', label: 'İCRA DAİRESİ', yargiAlani: 'icra' },
    { tablo: '0917', label: 'BÖLGE İDARE MAHKEMESİ', yargiAlani: 'idari' },
    { tablo: '0918', label: 'İDARE MAHKEMESİ', yargiAlani: 'idari' },
    { tablo: '0919', label: 'VERGİ MAHKEMESİ', yargiAlani: 'idari' },
    { tablo: '6701', label: 'Arabuluculuk', yargiAlani: 'arabuluculuk' },
    { tablo: '6702', label: 'Arabuluculuk', yargiAlani: 'arabuluculuk' },
    { tablo: '9791', label: 'Satış Memurluğu', yargiAlani: 'hukuk' },
] as const;

export const UYAP_YARGI_BIRIMI_BY_TABLO: Record<UyapYargiBirimiTablo, UyapYargiBirimi> =
    Object.fromEntries(UYAP_YARGI_BIRIMLERI.map((b) => [b.tablo, b])) as Record<
        UyapYargiBirimiTablo,
        UyapYargiBirimi
    >;
