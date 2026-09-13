import type { Matter, MatterCategory } from '../../services/dataService';

/** Office-only matter categories — keep büro taxonomy, hide UYAP court classification UI. */
const OFFICE_ONLY_MATTER_CATEGORIES: ReadonlySet<string> = new Set(['ADVISORY_WORK']);

/**
 * Whether UYAP classification fields (dosya türü, yargı birimi, icra, süreç rolü)
 * should appear in matter entry UIs. Does not delete existing `metadata.uyap` on save.
 */
export function isMatterUyapClassificationVisible(
    matterType: Matter['matter_type'] | string | undefined,
    matterCategory?: MatterCategory | string | null
): boolean {
    if (matterType === 'ADVISORY') return false;
    if (matterCategory && OFFICE_ONLY_MATTER_CATEGORIES.has(matterCategory)) return false;
    return matterType === 'LAW_CASE' || matterType === 'ENFORCEMENT' || matterType === 'MEDIATION';
}
