/**
 * UYAP taraf rolleri (dosya_taraf_bilgileri_brd.ajx).
 *
 * - **uyapProcessRole**: resmi süreç sıfatı (Davacı, Sanık, Alacaklı …).
 * - **officeRole**: büro ilişkisi (MÜVEKKİL, KARŞI_TARAF …) — `matter_parties.role` alanında kalır.
 */
export type UyapProcessRoleLabel =
    | 'Alacaklı'
    | 'Borçlu'
    | 'Davacı'
    | 'Davalı'
    | 'Müşteki'
    | 'Sanık';

export type UyapTarafRoleCode = 1 | 2 | 3 | 7 | 21 | 22;

export interface UyapTarafRole {
    label: UyapProcessRoleLabel;
    tarafRolu: UyapTarafRoleCode;
}

/** Harvested UYAP tarafRolu → label (2026-05 discovery session). */
export const UYAP_TARAF_ROLES: readonly UyapTarafRole[] = [
    { label: 'Davacı', tarafRolu: 1 },
    { label: 'Davalı', tarafRolu: 2 },
    { label: 'Sanık', tarafRolu: 3 },
    { label: 'Müşteki', tarafRolu: 7 },
    { label: 'Alacaklı', tarafRolu: 21 },
    { label: 'Borçlu', tarafRolu: 22 },
] as const;

export const UYAP_TARAF_ROLE_BY_CODE: Record<UyapTarafRoleCode, UyapTarafRole> = Object.fromEntries(
    UYAP_TARAF_ROLES.map((r) => [r.tarafRolu, r])
) as Record<UyapTarafRoleCode, UyapTarafRole>;

export const UYAP_TARAF_ROLE_BY_LABEL: Record<UyapProcessRoleLabel, UyapTarafRole> = Object.fromEntries(
    UYAP_TARAF_ROLES.map((r) => [r.label, r])
) as Record<UyapProcessRoleLabel, UyapTarafRole>;

/** Büro / vekillik rolü — matter_parties.role */
export const OFFICE_MATTER_PARTY_ROLES = [
    { value: 'DAVACI', label: 'Davacı' },
    { value: 'DAVALI', label: 'Davalı' },
    { value: 'MÜŞTEKİ', label: 'Müşteki' },
    { value: 'SANIK', label: 'Sanık' },
    { value: 'MÜVEKKİL', label: 'Müvekkil' },
    { value: 'KARŞI_TARAF', label: 'Karşı taraf' },
    { value: 'BORÇLU', label: 'Borçlu' },
    { value: 'ÜÇÜNCÜ_ŞAHIS', label: 'Üçüncü şahıs' },
    { value: 'TANIK', label: 'Tanık' },
    { value: 'VEKİL', label: 'Vekil' },
    { value: 'DİĞER', label: 'Diğer' },
] as const;

export type OfficeMatterPartyRole = (typeof OFFICE_MATTER_PARTY_ROLES)[number]['value'];

/**
 * Müflis: UYAP harvest örneğinde görülmedi; icra/iflas bağlamında olası sıfat —
 * manuel etiket veya ileri import için ayrılmış, kod tablosuna eklenmedi.
 */
