import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import type { AttrStep, Mapping, ReplaceStep, Step } from '@tiptap/pm/transform';

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

/** Nodes visited by a full section rebuild. Typing that does not move a section boundary only maps positions. */
export const sectionScanStats = { nodes: 0, mapped: 0 };

function isSectionMarker(node: ProseMirrorNode): boolean {
    if (node.type.name === 'pageBreak' && node.attrs.kind === 'sectionNext') return true;
    if (node.type.name === 'paragraph') {
        const marker = node.attrs.nomaiSectionStart;
        return marker === 'continuous' || marker === 'nextPage';
    }
    return false;
}

function contentHasSectionMarker(node: ProseMirrorNode): boolean {
    if (isSectionMarker(node)) return true;
    let found = false;
    node.forEach((child) => {
        if (!found && contentHasSectionMarker(child)) found = true;
    });
    return found;
}

function rangeHasSectionMarker(doc: ProseMirrorNode, from: number, to: number): boolean {
    if (from === to) return false;
    const max = doc.content.size;
    const start = Math.max(0, Math.min(from, max));
    const end = Math.max(start, Math.min(to, max));
    if (start === end) return false;
    let found = false;
    doc.nodesBetween(start, end, (node) => {
        if (isSectionMarker(node)) {
            found = true;
            return false;
        }
        return !found;
    });
    return found;
}

function stepJsonId(step: Step): string {
    const labeled = step as Step & { jsonID?: string };
    return labeled.jsonID ?? '';
}

/**
 * True when a step inserts, deletes, or retargets a section break.
 * Step classes are compared by jsonID because the editor and this module
 * can each load their own copy of prosemirror-transform.
 */
export function transactionChangesSectionStructure(tr: Transaction): boolean {
    if (!tr.docChanged) return false;
    let doc = tr.before;
    for (const step of tr.steps) {
        const kind = stepJsonId(step);
        if (kind === 'addMark' || kind === 'removeMark') {
            const applied = step.apply(doc);
            if (applied.failed || !applied.doc) return true;
            doc = applied.doc;
            continue;
        }
        if (kind === 'attr') {
            const attrStep = step as AttrStep;
            const node = doc.nodeAt(attrStep.pos);
            if (!node) return true;
            if (node.type.name === 'pageBreak') return true;
            if (node.type.name === 'paragraph' && attrStep.attr.startsWith('nomaiSection')) return true;
            const applied = step.apply(doc);
            if (applied.failed || !applied.doc) return true;
            doc = applied.doc;
            continue;
        }
        if (kind === 'replace' || kind === 'replaceAround') {
            const replace = step as ReplaceStep;
            let inserted = false;
            replace.slice.content.forEach((node) => {
                if (!inserted && contentHasSectionMarker(node)) inserted = true;
            });
            if (inserted || rangeHasSectionMarker(doc, replace.from, replace.to)) return true;
        } else {
            return true;
        }
        const applied = step.apply(doc);
        if (applied.failed || !applied.doc) return true;
        doc = applied.doc;
    }
    return false;
}

export function mapSectionPositions(
    sections: SectionRegistryEntry[],
    mapping: Mapping,
    docSize: number,
): SectionRegistryEntry[] {
    if (sections.length === 0) return sections;
    return sections.map((section, index) => {
        const startPos = index === 0 ? 0 : mapping.map(section.startPos, 1);
        const next = sections[index + 1];
        const endPos = next ? Math.max(startPos, mapping.map(next.startPos, 1) - 1) : docSize;
        return { ...section, startPos, endPos };
    });
}

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
        sectionScanStats.nodes += 1;
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

    onUpdate({ transaction }) {
        const storage = this.storage as SectionRegistryStorage;
        const doc = transaction.doc;
        if (transactionChangesSectionStructure(transaction) || storage.sections.length === 0) {
            storage.sections = buildSections(doc);
        } else if (transaction.docChanged) {
            sectionScanStats.mapped += 1;
            storage.sections = mapSectionPositions(storage.sections, transaction.mapping, doc.content.size);
        }
        storage.activeSectionId = storage.getSectionAtPos(transaction.selection.from)?.id ?? DEFAULT_SECTION_ID;
    },

    onSelectionUpdate() {
        const storage = this.storage as SectionRegistryStorage;
        storage.activeSectionId = storage.getSectionAtPos(this.editor.state.selection.from)?.id ?? DEFAULT_SECTION_ID;
    },
});
