import type { Matter, MatterCategory, MatterMerci } from '../../services/dataService';
import type { UyapDosyaTurLabel } from './uyapDosyaTurleri';
import { UYAP_DOSYA_TURU_BY_LABEL } from './uyapDosyaTurleri';

export const OFFICE_MATTER_TYPE_LABELS: Record<Matter['matter_type'], string> = {
    LAW_CASE: 'Dava',
    ENFORCEMENT: 'İcra',
    ADVISORY: 'Danışmanlık',
    MEDIATION: 'Arabuluculuk/Uzlaşma',
    PROSECUTION: 'Soruşturma',
    ARBITRATION: 'Tahkim',
};

/** Office Merci options (stored in `matter_category`). */
export const MATTER_CATEGORIES_BY_TYPE: Record<Matter['matter_type'], readonly MatterMerci[]> = {
    LAW_CASE: ['COURT', 'ENFORCEMENT_OFFICE', 'CBS', 'ADMINISTRATIVE_BODY', 'OTHER'],
    ENFORCEMENT: ['COURT', 'ENFORCEMENT_OFFICE', 'CBS', 'ADMINISTRATIVE_BODY', 'OTHER'],
    MEDIATION: ['COURT', 'ENFORCEMENT_OFFICE', 'CBS', 'ADMINISTRATIVE_BODY', 'OTHER'],
    ADVISORY: ['COURT', 'ENFORCEMENT_OFFICE', 'CBS', 'ADMINISTRATIVE_BODY', 'OTHER'],
    PROSECUTION: ['COURT', 'ENFORCEMENT_OFFICE', 'CBS', 'ADMINISTRATIVE_BODY', 'OTHER'],
    ARBITRATION: ['COURT', 'ENFORCEMENT_OFFICE', 'CBS', 'ADMINISTRATIVE_BODY', 'OTHER'],
};

export interface DerivedOfficeMatterFields {
    matterType: Matter['matter_type'];
    matterCategory: MatterMerci | '';
}

/** Map UYAP dosya türü → office `matter_type` + default `matter_category`. */
export function deriveOfficeFieldsFromUyapDosyaTur(
    dosyaTur: UyapDosyaTurLabel | '' | undefined
): DerivedOfficeMatterFields {
    if (!dosyaTur) {
        return { matterType: 'LAW_CASE', matterCategory: '' };
    }
    const entry = UYAP_DOSYA_TURU_BY_LABEL[dosyaTur];
    if (!entry) {
        return { matterType: 'LAW_CASE', matterCategory: '' };
    }
    return {
        matterType: entry.matterTypeHint ?? 'LAW_CASE',
        matterCategory: mapLegacyCategoryHintToMerci(entry.matterCategoryHint),
    };
}

function mapLegacyCategoryHintToMerci(hint: MatterCategory | undefined): MatterMerci | '' {
    if (!hint) return '';
    if (hint === 'ENFORCEMENT_PROCEEDING') return 'ENFORCEMENT_OFFICE';
    if (hint === 'PROSECUTION') return 'CBS';
    if (['CIVIL', 'CRIMINAL', 'ADMINISTRATIVE', 'CONSTITUTIONAL'].includes(hint)) return 'COURT';
    return 'OTHER';
}

export function getMatterCategoriesForType(
    matterType: Matter['matter_type'] | undefined
): readonly MatterMerci[] {
    if (!matterType) return MATTER_CATEGORIES_BY_TYPE.LAW_CASE;
    return MATTER_CATEGORIES_BY_TYPE[matterType] ?? MATTER_CATEGORIES_BY_TYPE.LAW_CASE;
}

/** Keep category valid when matter type changes (office-only flows). */
export function coerceMatterCategoryForType(
    matterType: Matter['matter_type'],
    category: MatterMerci | MatterCategory | string | null | undefined
): MatterMerci | '' {
    const allowed = getMatterCategoriesForType(matterType);
    const normalized = mapLegacyCategoryHintToMerci(category as MatterCategory);
    if (normalized && allowed.includes(normalized)) return normalized;
    if (category && allowed.includes(category as MatterMerci)) return category as MatterMerci;
    return '';
}
