/** İcra takip sözlüğü — icra_takip_*.ajx (deduplicated, örnek şablon satırları hariç). */

export interface UyapIcraOption {
    name: string;
    value: number;
}

export const UYAP_ICRA_TAKIP_TURU: readonly UyapIcraOption[] = [
    { name: 'İlamlı Takip', value: 0 },
    { name: 'İlamsız Takip', value: 1 },
] as const;

export const UYAP_ICRA_TAKIP_YOLU: readonly UyapIcraOption[] = [
    { name: 'Genel Haciz Yoluyla Takip', value: 0 },
    { name: 'İflas Yoluyla Takip', value: 1 },
    { name: 'Rehnin Paraya Çevrilmesi Yolu İle Takip', value: 2 },
    { name: 'Kambiyo Senetlerine Mahsus Haciz Yolu', value: 3 },
    { name: 'Kiralanan Gayrimenkullerin İlamsız Tahliyesi', value: 4 },
    { name: 'Diğer', value: 5 },
] as const;

export const UYAP_ICRA_TAKIP_MAHIYETLERI: readonly UyapIcraOption[] = [
    { name: 'Belgesiz', value: 1307 },
    { name: 'Cocuk Teslimi', value: 1107 },
    { name: 'Diğer', value: 1407 },
    { name: 'Doğal Gaz', value: 6007 },
    { name: 'Elektrik', value: 5007 },
    { name: 'İnternet/Tv', value: 3007 },
    { name: 'Kredi Kartı', value: 7007 },
    { name: 'Kredi Sözleşmesi', value: 8008 },
    { name: 'Nafaka', value: 9009 },
    { name: 'Su', value: 4007 },
    { name: 'Telefon(Cep)', value: 2007 },
    { name: 'Telefon(Sabit)', value: 1007 },
    { name: 'Tük.Hakem Heyeti', value: 1207 },
] as const;

/** Örnek (ÖRNEK:) satırları ve tekrarlar çıkarıldı */
export const UYAP_ICRA_TAKIP_SEKLI: readonly UyapIcraOption[] = [
    { name: 'İhtiyati Haciz', value: 0 },
    { name: 'İhtiyati Tedbir', value: 1 },
    { name: 'Hapis Hakkı', value: 2 },
    { name: 'İİK. 153. Mad. Gereğince İpotek Kaydının Terkini', value: 3 },
    { name: 'Aciz Belgesi', value: 4 },
    { name: 'Rehin Açığı Belgesi', value: 5 },
    { name: 'Hayvan Rehni Sicili İşlemleri', value: 6 },
    { name: 'Konkordato Komiseri Mal Varlığı Tespit İşlemleri', value: 7 },
] as const;

export interface UyapIcraMetadata {
    takipTuru?: number;
    takipYolu?: number;
    takipMahiyeti?: number;
    takipSekli?: number;
}

export function findIcraOptionLabel(
    list: readonly UyapIcraOption[],
    value: number | undefined | null
): string | undefined {
    if (value == null) return undefined;
    return list.find((o) => o.value === value)?.name;
}
