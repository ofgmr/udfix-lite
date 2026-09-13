import {
    UYAP_ADRES_TURU_BY_TAG_KEY,
    type UyapAdresTuruTagKey,
} from './uyapAdresTurleri';

/** Büro adres etiketleri (legacy + ofis kullanımı). */
export const OFFICE_PARTY_ADDRESS_TAGS = [
    { key: 'adres', label: 'Adres' },
    { key: 'is_adresi', label: 'İş Adresi' },
    { key: 'ikametgah', label: 'İkametgah' },
    { key: 'tasinmaz', label: 'Taşınmaz' },
    { key: 'posta', label: 'Posta Adresi' },
    { key: 'fatura_adresi', label: 'Fatura Adresi' },
] as const;

export type OfficePartyAddressTagKey = (typeof OFFICE_PARTY_ADDRESS_TAGS)[number]['key'];

const OFFICE_ADDRESS_KEY_SET = new Set<string>(OFFICE_PARTY_ADDRESS_TAGS.map((t) => t.key));
const UYAP_ADDRESS_KEY_SET = new Set<string>(Object.keys(UYAP_ADRES_TURU_BY_TAG_KEY));

export function isPartyAddressTagKey(tagKey: string): boolean {
    return OFFICE_ADDRESS_KEY_SET.has(tagKey) || UYAP_ADDRESS_KEY_SET.has(tagKey);
}

export function getPartyAddressTagLabel(tagKey: string): string {
    const office = OFFICE_PARTY_ADDRESS_TAGS.find((t) => t.key === tagKey);
    if (office) return office.label;
    const uyap = UYAP_ADRES_TURU_BY_TAG_KEY[tagKey as UyapAdresTuruTagKey];
    if (uyap) return uyap.aciklama.replace(' Adresi', '').replace(' Adres', '');
    return tagKey;
}
