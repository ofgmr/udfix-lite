import { toast } from 'sonner';
import { useHeaderFooterStore } from '../stores/useHeaderFooterStore';

export const HF_PAGE_VARIANT_NON_PDF_EXPORT_MESSAGE =
    'HF sayfa varyantları yalnızca PDF export\'a yansır';

const WARNED_DOCUMENT_IDS = new Set<string>();

export type HfPageVariantFlags = {
    differentFirstPage: boolean;
    differentLastPage: boolean;
    differentOddEvenPages: boolean;
};

/** True when first/last/odd-even HF variants would be dropped by UDF/DOCX default-band serialize. */
export function hfPageVariantsActiveOnNonPdfExport(flags: HfPageVariantFlags): boolean {
    return flags.differentFirstPage || flags.differentLastPage || flags.differentOddEvenPages;
}

/**
 * One toast per document per session. Autosave and repeated DOCX/UDF writes must not stack.
 */
export function warnHfPageVariantsOmittedFromNonPdfExport(documentId?: string | null): void {
    const flags = useHeaderFooterStore.getState();
    if (!hfPageVariantsActiveOnNonPdfExport(flags)) return;
    const key = documentId?.trim() || '__active__';
    if (WARNED_DOCUMENT_IDS.has(key)) return;
    WARNED_DOCUMENT_IDS.add(key);
    toast.warning(HF_PAGE_VARIANT_NON_PDF_EXPORT_MESSAGE, {
        id: `hf-page-variants-non-pdf:${key}`,
        duration: 8000,
    });
}
