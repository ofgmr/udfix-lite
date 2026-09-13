import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export type SectionStartKind = 'root' | 'continuous' | 'nextPage';

export type SectionRegistryEntry = {
    id: string;
    previousSectionId: string | null;
    startPos: number;
    endPos: number;
    startKind: SectionStartKind;
};

export type SectionRegistryStorage = {
    sections: SectionRegistryEntry[];
    activeSectionId: string;
    getSectionAtPos: (pos: number) => SectionRegistryEntry | null;
    getSectionById: (id: string) => SectionRegistryEntry | null;
};

const DEFAULT_SECTION_ID = 'default';

function cleanSectionId(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

function sectionStartFromPageBreak(
    node: ProseMirrorNode,
    pos: number,
): Omit<SectionRegistryEntry, 'endPos'> | null {
    if (node.type.name !== 'pageBreak') return null;
    const kind = node.attrs.kind;
    if (kind !== 'sectionNext') return null;
    const sectionId = cleanSectionId(node.attrs.sectionId, `section-next-${pos}`);
    const previousSectionId = cleanSectionId(node.attrs.previousSectionId, DEFAULT_SECTION_ID);
    return {
        id: sectionId,
        previousSectionId,
        startPos: pos + node.nodeSize,
        startKind: 'nextPage',
    };
}

function sectionStartFromParagraph(
    node: ProseMirrorNode,
    pos: number,
): Omit<SectionRegistryEntry, 'endPos'> | null {
    if (node.type.name !== 'paragraph') return null;
    const marker = node.attrs.nomaiSectionStart;
    if (marker !== 'continuous' && marker !== 'nextPage') return null;
    const sectionId = cleanSectionId(node.attrs.nomaiSectionId, `section-${marker}-${pos}`);
    const previousSectionId = cleanSectionId(node.attrs.nomaiPreviousSectionId, DEFAULT_SECTION_ID);
    return {
        id: sectionId,
        previousSectionId,
        startPos: pos,
        startKind: marker,
    };
}

function buildSections(doc: ProseMirrorNode): SectionRegistryEntry[] {
    const starts: Array<Omit<SectionRegistryEntry, 'endPos'>> = [
        {
            id: DEFAULT_SECTION_ID,
            previousSectionId: null,
            startPos: 0,
            startKind: 'root',
        },
    ];
    doc.descendants((node, pos) => {
        const fromBreak = sectionStartFromPageBreak(node, pos);
        if (fromBreak) {
            starts.push(fromBreak);
            return;
        }
        const fromParagraph = sectionStartFromParagraph(node, pos);
        if (fromParagraph) {
            starts.push(fromParagraph);
        }
    });

    const uniqueByPos = new Map<number, Omit<SectionRegistryEntry, 'endPos'>>();
    for (const entry of starts) {
        const previous = uniqueByPos.get(entry.startPos);
        if (!previous || previous.startKind === 'root') {
            uniqueByPos.set(entry.startPos, entry);
        }
    }
    const sorted = Array.from(uniqueByPos.values()).sort((a, b) => a.startPos - b.startPos);
    const maxPos = Math.max(0, doc.content.size);
    return sorted.map((entry, index) => {
        const next = sorted[index + 1];
        const endPos = next ? Math.max(entry.startPos, next.startPos - 1) : maxPos;
        return { ...entry, endPos };
    });
}

declare module '@tiptap/core' {
    interface Storage {
        sectionRegistry: SectionRegistryStorage;
    }
}

export const SectionRegistry = Extension.create({
    name: 'sectionRegistry',

    addStorage() {
        const storage: SectionRegistryStorage = {
            sections: [],
            activeSectionId: DEFAULT_SECTION_ID,
            getSectionAtPos: (pos: number) => {
                const hit = storage.sections.find((section) => pos >= section.startPos && pos <= section.endPos);
                return hit ?? null;
            },
            getSectionById: (id: string) => {
                const key = id.trim();
                if (!key) return null;
                return storage.sections.find((section) => section.id === key) ?? null;
            },
        };
        return storage;
    },

    onCreate() {
        const storage = this.storage as SectionRegistryStorage;
        storage.sections = buildSections(this.editor.state.doc);
        storage.activeSectionId = storage.getSectionAtPos(this.editor.state.selection.from)?.id ?? DEFAULT_SECTION_ID;
    },

    onUpdate() {
        const storage = this.storage as SectionRegistryStorage;
        storage.sections = buildSections(this.editor.state.doc);
        storage.activeSectionId = storage.getSectionAtPos(this.editor.state.selection.from)?.id ?? DEFAULT_SECTION_ID;
    },

    onSelectionUpdate() {
        const storage = this.storage as SectionRegistryStorage;
        storage.activeSectionId = storage.getSectionAtPos(this.editor.state.selection.from)?.id ?? DEFAULT_SECTION_ID;
    },
});
