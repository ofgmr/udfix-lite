import type { HeaderFooterSection } from '../stores/useHeaderFooterStore';

export type ExportHeaderFooterPickInput = {
    differentFirstPage: boolean;
    differentLastPage: boolean;
    differentOddEvenPages: boolean;
    sections: {
        default: HeaderFooterSection;
        firstPage: HeaderFooterSection;
        lastPage: HeaderFooterSection;
        oddPage: HeaderFooterSection;
        evenPage: HeaderFooterSection;
    };
};

function hasSectionContent(sec: HeaderFooterSection): boolean {
    return Boolean(
        sec.headerLeft.trim() ||
            sec.headerCenter.trim() ||
            sec.headerRight.trim() ||
            sec.footerLeft.trim() ||
            sec.footerCenter.trim() ||
            sec.footerRight.trim(),
    );
}

/**
 * Single-template exports (DOCX global header/footer, HF compile when only one
 * variant can be chosen). Multi-variant PDF uses paginated DOM instead.
 *
 * Priority: filled first-page → odd page (Tek/Çift açıksa tek şablonda temsil) →
 * even → default. Tek şablonda hem ilk hem tek/çift mümkün değil; ilk sayfa doluysa önce o.
 */
export function pickExportHeaderFooterSection(s: ExportHeaderFooterPickInput): HeaderFooterSection {
    if (s.differentFirstPage && hasSectionContent(s.sections.firstPage)) {
        return s.sections.firstPage;
    }
    if (s.differentOddEvenPages) {
        if (hasSectionContent(s.sections.oddPage)) return s.sections.oddPage;
        if (hasSectionContent(s.sections.evenPage)) return s.sections.evenPage;
        return s.sections.default;
    }
    return s.sections.default;
}

/** Which section `pickExportHeaderFooterSection` chose (for DOCX/PDF compile logs). */
export type ExportPickedSectionLabel = 'default' | 'firstPage' | 'oddPage' | 'evenPage' | 'lastPage';

export function exportPickedSectionLabel(s: ExportHeaderFooterPickInput): ExportPickedSectionLabel {
    const picked = pickExportHeaderFooterSection(s);
    if (picked === s.sections.firstPage) return 'firstPage';
    if (picked === s.sections.oddPage) return 'oddPage';
    if (picked === s.sections.evenPage) return 'evenPage';
    if (picked === s.sections.lastPage) return 'lastPage';
    return 'default';
}
