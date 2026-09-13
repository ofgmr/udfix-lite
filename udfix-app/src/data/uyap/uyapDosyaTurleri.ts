import type { MatterCategory } from '../../services/dataService';

/** UYAP dosyaTur string labels from search / detail (6 values in harvest session). */
export type UyapDosyaTurLabel =
    | 'Ceza Dava Dosyası'
    | 'Hukuk Dava Dosyası'
    | 'Hukuk Değişik İş Dosyası'
    | 'İcra Dosyası'
    | 'İdari Dava Dosyası';

export interface UyapDosyaTuru {
    label: UyapDosyaTurLabel;
    dosyaTurKod: number;
    matterCategoryHint?: MatterCategory;
    matterTypeHint?: 'LAW_CASE' | 'ENFORCEMENT' | 'MEDIATION' | 'ADVISORY';
}

export const UYAP_DOSYA_TURLERI: readonly UyapDosyaTuru[] = [
    { label: 'Ceza Dava Dosyası', dosyaTurKod: 3, matterCategoryHint: 'CRIMINAL', matterTypeHint: 'LAW_CASE' },
    { label: 'Hukuk Dava Dosyası', dosyaTurKod: 15, matterCategoryHint: 'CIVIL', matterTypeHint: 'LAW_CASE' },
    { label: 'Hukuk Değişik İş Dosyası', dosyaTurKod: 14, matterCategoryHint: 'CIVIL', matterTypeHint: 'LAW_CASE' },
    { label: 'İcra Dosyası', dosyaTurKod: 35, matterCategoryHint: 'ENFORCEMENT_PROCEEDING', matterTypeHint: 'ENFORCEMENT' },
    { label: 'İdari Dava Dosyası', dosyaTurKod: 9, matterCategoryHint: 'ADMINISTRATIVE', matterTypeHint: 'LAW_CASE' },
] as const;

export const UYAP_DOSYA_TURU_BY_LABEL: Record<UyapDosyaTurLabel, UyapDosyaTuru> = Object.fromEntries(
    UYAP_DOSYA_TURLERI.map((d) => [d.label, d])
) as Record<UyapDosyaTurLabel, UyapDosyaTuru>;

export const UYAP_DOSYA_TURU_BY_KOD: Record<number, UyapDosyaTuru> = Object.fromEntries(
    UYAP_DOSYA_TURLERI.map((d) => [d.dosyaTurKod, d])
);
