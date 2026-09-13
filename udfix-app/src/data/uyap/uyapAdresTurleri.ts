/** UYAP adres türleri (get_adres_turleri_by_taraf.ajx). Sanitized harvest — no PII. */
export type UyapAdresTuruId =
    | 'ADRTR00001'
    | 'ADRTR00002'
    | 'ADRTR00003'
    | 'ADRTR00004'
    | 'ADRTR00005'
    | 'ADRTR00006'
    | 'ADRTR00007'
    | 'ADRTR00008'
    | 'ADRTR00009'
    | 'ADRTR00010'
    | 'ADRTR00011'
    | 'ADRTR00012'
    | 'ADRTR00013'
    | 'ADRTR00014'
    | 'ADRTR00015'
    | 'ADRTR00016'
    | 'ADRTR00018';

export interface UyapAdresTuru {
    tktId: UyapAdresTuruId;
    aciklama: string;
    /** attribute_tag_catalog / entity_attributes key */
    tagKey: string;
}

export const UYAP_ADRES_TURLERI: readonly UyapAdresTuru[] = [
    { tktId: 'ADRTR00001', aciklama: 'Yurt İçi İkametgah Adresi', tagKey: 'adres_yurt_ici_ikametgah' },
    { tktId: 'ADRTR00002', aciklama: 'Yurt İçi İşyeri Adresi', tagKey: 'adres_yurt_ici_isyeri' },
    { tktId: 'ADRTR00003', aciklama: 'Depo Adresi', tagKey: 'adres_depo' },
    { tktId: 'ADRTR00004', aciklama: 'Askerlik Adresi', tagKey: 'adres_askerlik' },
    { tktId: 'ADRTR00005', aciklama: 'Yurtdışı İkametgah Adresi', tagKey: 'adres_yurtdisi_ikametgah' },
    { tktId: 'ADRTR00006', aciklama: 'Yurtdışı İşyeri Adresi', tagKey: 'adres_yurtdisi_isyeri' },
    { tktId: 'ADRTR00007', aciklama: 'Cezaevi Adresi', tagKey: 'adres_cezaevi' },
    { tktId: 'ADRTR00008', aciklama: 'Mernis Adresi', tagKey: 'adres_mernis' },
    { tktId: 'ADRTR00009', aciklama: 'Avukatlık Adresi', tagKey: 'adres_avukatlik' },
    { tktId: 'ADRTR00010', aciklama: 'Eski Mernis Adresi', tagKey: 'adres_eski_mernis' },
    { tktId: 'ADRTR00011', aciklama: 'Mersis Adresi', tagKey: 'adres_mersis' },
    { tktId: 'ADRTR00012', aciklama: 'Eski Mersis Adresi', tagKey: 'adres_eski_mersis' },
    { tktId: 'ADRTR00013', aciklama: 'Elektronik Tebligat Adresi', tagKey: 'adres_e_tebligat' },
    { tktId: 'ADRTR00014', aciklama: 'Eski Elektronik Tebligat Adresi', tagKey: 'adres_eski_e_tebligat' },
    { tktId: 'ADRTR00015', aciklama: 'Avukatlık Elektronik Tebligat Adresi', tagKey: 'adres_avukatlik_e_tebligat' },
    { tktId: 'ADRTR00016', aciklama: 'Şönim Adresi', tagKey: 'adres_sonim' },
    { tktId: 'ADRTR00018', aciklama: 'Bilirkişi Beyan Adresi', tagKey: 'adres_bilirkisi_beyan' },
] as const;

export type UyapAdresTuruTagKey = (typeof UYAP_ADRES_TURLERI)[number]['tagKey'];

export const UYAP_ADRES_TURU_BY_TAG_KEY: Record<UyapAdresTuruTagKey, UyapAdresTuru> = Object.fromEntries(
    UYAP_ADRES_TURLERI.map((a) => [a.tagKey, a])
) as Record<UyapAdresTuruTagKey, UyapAdresTuru>;

/** Sık kullanılan adres türleri — PartyDialog hızlı etiket şeridi */
export const UYAP_ADRES_TURU_QUICK_PICKS: readonly UyapAdresTuruTagKey[] = [
    'adres_mernis',
    'adres_e_tebligat',
    'adres_yurt_ici_ikametgah',
    'adres_yurt_ici_isyeri',
    'adres_cezaevi',
    'adres_mersis',
] as const;
