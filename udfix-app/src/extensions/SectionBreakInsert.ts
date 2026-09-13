import { Extension, type Editor } from '@tiptap/core';

type SectionRegistryLike = {
    activeSectionId?: string | null;
};

function createSectionId(): string {
    const rand = Math.random().toString(36).slice(2, 8);
    return `sec-${Date.now().toString(36)}-${rand}`;
}

function resolvePreviousSectionId(editor: Editor): string {
    const storage = editor.storage as { sectionRegistry?: SectionRegistryLike } | undefined;
    const current = storage?.sectionRegistry?.activeSectionId;
    return typeof current === 'string' && current.trim().length > 0 ? current : 'default';
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
} as const;

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        sectionBreakInsert: {
            /** Aynı sayfada yeni bölüm (Word: "Section Break Continuous"). */
            insertSectionBreakContinuous: () => ReturnType;
            /** Sonraki sayfada yeni bölüm (Word: "Section Break Next Page"). */
            insertSectionBreakNextPage: () => ReturnType;
        };
    }
}

export const SectionBreakInsert = Extension.create({
    name: 'sectionBreakInsert',

    addCommands() {
        return {
            insertSectionBreakContinuous:
                () =>
                ({ chain, editor }) => {
                    const previousSectionId = resolvePreviousSectionId(editor);
                    const sectionId = createSectionId();
                    return chain()
                        .focus()
                        .insertContent([
                            {
                                type: 'paragraph',
                                attrs: {
                                    nomaiSectionStart: 'continuous',
                                    nomaiSectionId: sectionId,
                                    nomaiPreviousSectionId: previousSectionId,
                                },
                            },
                            CLEAN_PARAGRAPH_AFTER_BREAK,
                        ])
                        .run();
                },

            insertSectionBreakNextPage:
                () =>
                ({ chain, editor }) => {
                    const previousSectionId = resolvePreviousSectionId(editor);
                    const sectionId = createSectionId();
                    return chain()
                        .focus()
                        .insertContent([
                            {
                                type: 'pageBreak',
                                attrs: {
                                    kind: 'sectionNext',
                                    startsNewSection: true,
                                    sectionId,
                                    previousSectionId,
                                },
                            },
                            {
                                type: 'paragraph',
                                attrs: {
                                    nomaiSectionStart: 'nextPage',
                                    nomaiSectionId: sectionId,
                                    nomaiPreviousSectionId: previousSectionId,
                                },
                            },
                            CLEAN_PARAGRAPH_AFTER_BREAK,
                        ])
                        .run();
                },
        };
    },
});
