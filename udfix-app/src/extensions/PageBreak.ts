import { Node, mergeAttributes } from '@tiptap/core'

export type PageBreakKind = 'page' | 'sectionNext'
export type PageBreakCommandOptions = {
    kind?: PageBreakKind
    startsNewSection?: boolean
    sectionId?: string
    previousSectionId?: string
    forceNextPage?: boolean
}

export interface PageBreakOptions {
    HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        pageBreak: {
            setPageBreak: (options?: PageBreakCommandOptions) => ReturnType
        }
    }
}

const BREAK_LABELS: Record<PageBreakKind, string> = {
    page: 'Sayfa Sonu',
    sectionNext: 'Bölüm Sonu — Sonraki Sayfa',
}

const CLEAN_PARAGRAPH_AFTER_BREAK = {
    type: 'paragraph',
    attrs: {
        keepWithNext: false,
        keepLines: false,
        preventSingleLines: false,
        pageBreakBefore: false,
        nomaiSectionStart: null,
        nomaiSectionId: null,
        nomaiPreviousSectionId: null,
    },
} as const

function buildBreakDom(kind: PageBreakKind): HTMLDivElement {
    const dom = document.createElement('div')
    dom.className = 'page-break'
    dom.setAttribute('contenteditable', 'false')
    if (kind !== 'page') dom.setAttribute('data-break-kind', kind)

    const visual = document.createElement('div')
    visual.className = 'nomai-break-visual'
    visual.setAttribute('aria-hidden', 'true')

    const lineL = document.createElement('span')
    lineL.className = 'nomai-break-line'

    const label = document.createElement('span')
    label.className = 'nomai-break-label'
    label.textContent = BREAK_LABELS[kind]

    const lineR = document.createElement('span')
    lineR.className = 'nomai-break-line'

    visual.appendChild(lineL)
    visual.appendChild(label)
    visual.appendChild(lineR)
    dom.appendChild(visual)
    return dom
}

export const PageBreak = Node.create<PageBreakOptions>({
    name: 'pageBreak',

    group: 'block',

    atom: true,
    selectable: false,
    draggable: false,
    isolating: true,

    addAttributes() {
        return {
            kind: {
                default: 'page',
                parseHTML: (element) => {
                    const k = element.getAttribute('data-break-kind')
                    if (k === 'sectionNext') return 'sectionNext'
                    return 'page'
                },
                renderHTML: (attributes) => {
                    const k = attributes.kind as PageBreakKind | undefined
                    if (!k || k === 'page') return {}
                    return { 'data-break-kind': k }
                },
            },
            startsNewSection: {
                default: false,
                parseHTML: (element) => element.getAttribute('data-starts-new-section') === 'true',
                renderHTML: (attributes) => {
                    if (!attributes.startsNewSection) return {}
                    return { 'data-starts-new-section': 'true' }
                },
            },
            sectionId: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-section-id'),
                renderHTML: (attributes) => {
                    const sectionId = attributes.sectionId as string | null | undefined
                    if (!sectionId) return {}
                    return { 'data-section-id': sectionId }
                },
            },
            previousSectionId: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-previous-section-id'),
                renderHTML: (attributes) => {
                    const previousSectionId = attributes.previousSectionId as string | null | undefined
                    if (!previousSectionId) return {}
                    return { 'data-previous-section-id': previousSectionId }
                },
            },
            forceNextPage: {
                default: false,
                parseHTML: (element) => element.getAttribute('data-force-next-page') === 'true',
                renderHTML: (attributes) => {
                    if (!attributes.forceNextPage) return {}
                    return { 'data-force-next-page': 'true' }
                },
            },
        }
    },

    addOptions() {
        return {
            HTMLAttributes: {
                class: 'page-break',
            },
        }
    },

    parseHTML() {
        return [
            { tag: 'div[data-break-kind="sectionNext"]' },
            { tag: 'div.page-break' },
        ]
    },

    renderHTML({ HTMLAttributes, node }) {
        const kind = node.attrs.kind as PageBreakKind | undefined
        const startsNewSection = node.attrs.startsNewSection === true
        const sectionId = node.attrs.sectionId as string | null | undefined
        const previousSectionId = node.attrs.previousSectionId as string | null | undefined
        const forceNextPage = node.attrs.forceNextPage === true
        const extra: Record<string, string> = {}
        if (kind && kind !== 'page') extra['data-break-kind'] = kind
        if (startsNewSection) extra['data-starts-new-section'] = 'true'
        if (sectionId) extra['data-section-id'] = sectionId
        if (previousSectionId) extra['data-previous-section-id'] = previousSectionId
        if (forceNextPage) extra['data-force-next-page'] = 'true'
        return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, extra)]
    },

    addNodeView() {
        return ({ node }: { node: { attrs: Record<string, unknown> } }) => {
            let currentKind = ((node.attrs.kind as PageBreakKind | undefined) ?? 'page')
            const dom = buildBreakDom(currentKind)
            const label = dom.querySelector<HTMLSpanElement>('.nomai-break-label')!
            const syncMetaAttributes = (attrs: Record<string, unknown>) => {
                const startsNewSection = attrs.startsNewSection === true
                const sectionId = typeof attrs.sectionId === 'string' ? attrs.sectionId : null
                const previousSectionId =
                    typeof attrs.previousSectionId === 'string' ? attrs.previousSectionId : null
                const forceNextPage = attrs.forceNextPage === true
                if (startsNewSection) {
                    dom.setAttribute('data-starts-new-section', 'true')
                } else {
                    dom.removeAttribute('data-starts-new-section')
                }
                if (sectionId) {
                    dom.setAttribute('data-section-id', sectionId)
                } else {
                    dom.removeAttribute('data-section-id')
                }
                if (previousSectionId) {
                    dom.setAttribute('data-previous-section-id', previousSectionId)
                } else {
                    dom.removeAttribute('data-previous-section-id')
                }
                if (forceNextPage) {
                    dom.setAttribute('data-force-next-page', 'true')
                } else {
                    dom.removeAttribute('data-force-next-page')
                }
            }
            syncMetaAttributes(node.attrs)

            const update = (updatedNode: { attrs: Record<string, unknown> }) => {
                const newKind = ((updatedNode.attrs.kind as PageBreakKind | undefined) ?? 'page')
                if (newKind !== currentKind) {
                    currentKind = newKind
                    if (newKind === 'page') {
                        dom.removeAttribute('data-break-kind')
                    } else {
                        dom.setAttribute('data-break-kind', newKind)
                    }
                    label.textContent = BREAK_LABELS[newKind]
                }
                syncMetaAttributes(updatedNode.attrs)
                return true
            }

            return { dom, update, ignoreMutation: () => true, stopEvent: () => false }
        }
    },

    addCommands() {
        return {
            setPageBreak:
                (options?: PageBreakCommandOptions) =>
                ({ chain }) => {
                    const kind: PageBreakKind = options?.kind === 'sectionNext' ? 'sectionNext' : 'page'
                    const startsNewSection =
                        options?.startsNewSection ?? (kind === 'sectionNext' ? true : false)
                    const forceNextPage = options?.forceNextPage ?? true
                    return chain()
                        .insertContent({
                            type: this.name,
                            attrs: {
                                kind,
                                startsNewSection,
                                sectionId: options?.sectionId ?? null,
                                previousSectionId: options?.previousSectionId ?? null,
                                forceNextPage,
                            },
                        })
                        .insertContent(CLEAN_PARAGRAPH_AFTER_BREAK)
                        .run()
                },
        }
    },
})
