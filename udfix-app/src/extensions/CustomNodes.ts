import Paragraph from '@tiptap/extension-paragraph'
import Heading from '@tiptap/extension-heading'
import { uyapTabSetFirstStopCssPx } from '../utils/uyapImportUnits'

const layoutAttributes = {
    marginTop: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.marginTop || null,
        renderHTML: (attributes: Record<string, unknown>) => {
            if (!attributes.marginTop) return {}
            return { style: `margin-top: ${attributes.marginTop}` }
        },
    },
    marginBottom: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.marginBottom || null,
        renderHTML: (attributes: Record<string, unknown>) => {
            if (!attributes.marginBottom) return {}
            return { style: `margin-bottom: ${attributes.marginBottom}` }
        },
    },
    keepWithNext: {
        default: false,
        parseHTML: (element: HTMLElement) => element.style.breakAfter === 'avoid',
        renderHTML: (attributes: Record<string, unknown>) => {
            if (!attributes.keepWithNext) return {}
            return { style: 'break-after: avoid' }
        },
    },
    keepLines: {
        default: false,
        parseHTML: (element: HTMLElement) => element.style.breakInside === 'avoid',
        renderHTML: (attributes: Record<string, unknown>) => {
            if (!attributes.keepLines) return {}
            return { style: 'break-inside: avoid' }
        },
    },
    preventSingleLines: {
        default: false,
        parseHTML: (element: HTMLElement) => element.style.widows === '2' && element.style.orphans === '2',
        renderHTML: (attributes: Record<string, unknown>) => {
            if (!attributes.preventSingleLines) return {}
            return { style: 'widows: 2; orphans: 2' }
        },
    },
    pageBreakBefore: {
        default: false,
        parseHTML: (element: HTMLElement) => element.style.breakBefore === 'page',
        renderHTML: (attributes: Record<string, unknown>) => {
            if (!attributes.pageBreakBefore) return {}
            return { style: 'break-before: page' }
        },
    },
    uyapTabSet: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-uyap-tab-set'),
        renderHTML: (attributes: Record<string, unknown>) => {
            const v = attributes.uyapTabSet
            if (typeof v !== 'string' || !v.trim()) return {}
            const tabPx = uyapTabSetFirstStopCssPx(v)
            const tabSizeStyle = tabPx != null ? `tab-size: ${tabPx}px` : ''
            return {
                'data-uyap-tab-set': v,
                ...(tabSizeStyle ? { style: tabSizeStyle } : {}),
            }
        },
    },
}

/** Başlık satırı / alt başlık gibi paragraf tabanlı stiller punto değişince kaybolmasın diye kalıcı işaret. */
export type UdfixParagraphBlockStyle = 'title' | 'subtitle' | 'normal' | null;
export type UdfixSectionStart = 'continuous' | 'nextPage' | null;

export const CustomParagraph = Paragraph.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            ...layoutAttributes,
            nomaiBlockStyle: {
                default: null,
                parseHTML: (element) => {
                    const v = element.getAttribute('data-nomai-block-style');
                    if (v === 'title' || v === 'subtitle' || v === 'normal') return v;
                    return null;
                },
                renderHTML: (attributes) => {
                    const v = attributes.nomaiBlockStyle as UdfixParagraphBlockStyle;
                    if (!v) return {};
                    return { 'data-nomai-block-style': v };
                },
            },
            /** Bölüm başlangıcı işareti: continuous veya nextPage section break sonrası hedef paragraf. */
            nomaiSectionStart: {
                default: null,
                keepOnSplit: false,
                parseHTML: (element) => {
                    const v = element.getAttribute('data-nomai-section-start');
                    if (v === 'continuous' || v === 'nextPage') return v;
                    return null;
                },
                renderHTML: (attributes) => {
                    const v = attributes.nomaiSectionStart as UdfixSectionStart;
                    if (!v) return {};
                    return {
                        'data-nomai-section-start': v,
                        contenteditable: 'false',
                    };
                },
            },
            nomaiSectionId: {
                default: null,
                keepOnSplit: false,
                parseHTML: (element) => element.getAttribute('data-nomai-section-id'),
                renderHTML: (attributes) => {
                    const v = attributes.nomaiSectionId as string | null | undefined;
                    if (!v) return {};
                    return { 'data-nomai-section-id': v };
                },
            },
            nomaiPreviousSectionId: {
                default: null,
                keepOnSplit: false,
                parseHTML: (element) => element.getAttribute('data-nomai-previous-section-id'),
                renderHTML: (attributes) => {
                    const v = attributes.nomaiPreviousSectionId as string | null | undefined;
                    if (!v) return {};
                    return { 'data-nomai-previous-section-id': v };
                },
            },
            /** UDF import: UYAP paragraf sonu boşluğu → editörde `margin-bottom`; export `nomaiUyapParagraphEnd`. */
            nomaiUyapBlockGap: {
                default: null,
                keepOnSplit: false,
                parseHTML: (element) =>
                    element.getAttribute('data-nomai-uyap-block-gap') === '1' ? true : null,
                renderHTML: (attributes) => {
                    if (!attributes.nomaiUyapBlockGap) return {};
                    return {
                        'data-nomai-uyap-block-gap': '1',
                        style: 'margin-bottom: 0.65em',
                    };
                },
            },
            /** UDF export: CDATA paragraf kapanışı (`\n` veya `\n\n`); editör görünümüne etki etmez. */
            nomaiUyapParagraphEnd: {
                default: null,
                keepOnSplit: false,
                parseHTML: (element) => {
                    const v = element.getAttribute('data-nomai-uyap-paragraph-end');
                    if (v === 'double') return '\n\n';
                    if (v === 'single') return '\n';
                    return null;
                },
                renderHTML: (attributes) => {
                    const end = attributes.nomaiUyapParagraphEnd as string | null | undefined;
                    if (end === '\n\n') return { 'data-nomai-uyap-paragraph-end': 'double' };
                    if (end === '\n') return { 'data-nomai-uyap-paragraph-end': 'single' };
                    return {};
                },
            },
            /** UDF import: paragraf CDATA sonunda `\n` yok → export’ta ek `\n` yazma. */
            nomaiUyapSuppressParagraphEnd: {
                default: null,
                keepOnSplit: false,
                parseHTML: (element) =>
                    element.getAttribute('data-nomai-uyap-suppress-paragraph-end') === '1' ? true : null,
                renderHTML: (attributes) => {
                    if (!attributes.nomaiUyapSuppressParagraphEnd) return {};
                    return { 'data-nomai-uyap-suppress-paragraph-end': '1' };
                },
            },
            /** UDF import: `<tab>` elemanları vardı → export `<tab>` kullanır; yoksa sekmeler `<content>` içinde kalır. */
            nomaiUyapTabElements: {
                default: null,
                keepOnSplit: false,
                parseHTML: (element) =>
                    element.getAttribute('data-nomai-uyap-tab-elements') === '1' ? true : null,
                renderHTML: (attributes) => {
                    if (!attributes.nomaiUyapTabElements) return {};
                    return { 'data-nomai-uyap-tab-elements': '1' };
                },
            },
        }
    }
})

export const CustomHeading = Heading.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            ...layoutAttributes,
        }
    }
})
