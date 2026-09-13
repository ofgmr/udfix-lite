import type { UyapEvrakDoc, UyapEvrakFolder } from '../services/dataService';

export interface NestedEvrakNode {
    doc: UyapEvrakDoc;
    ek: UyapEvrakDoc[];
}

export interface DerivedTurFolder {
    tur: string;
    docs: NestedEvrakNode[];
}

export interface DerivedRelatedGroup {
    relatedKey: string;
    label: string;
    turFolders: DerivedTurFolder[];
}

export interface DerivedEvrakTree {
    recent: NestedEvrakNode[];
    groups: DerivedRelatedGroup[];
}

function parseMetadata(metadataStr: string | null | undefined): Record<string, unknown> {
    if (!metadataStr) return {};
    try {
        return JSON.parse(metadataStr) as Record<string, unknown>;
    } catch {
        return {};
    }
}

function uyapOf(doc: UyapEvrakDoc): Record<string, unknown> {
    const meta = parseMetadata(doc.metadata);
    return (meta?.uyap as Record<string, unknown>) || {};
}

export function itemKeyOfDoc(doc: UyapEvrakDoc): string | null {
    const key = uyapOf(doc).itemKey;
    return typeof key === 'string' && key.trim() ? key.trim() : null;
}

export function parentItemKeyOfDoc(doc: UyapEvrakDoc): string | null {
    const key = uyapOf(doc).parentItemKey;
    return typeof key === 'string' && key.trim() ? key.trim() : null;
}

function getPortalDate(doc: UyapEvrakDoc): string {
    const uyap = uyapOf(doc);
    const dateRaw = uyap.tarih || uyap.sistemeGonderildigiTarih || uyap.onaylandigiTarih || doc.incoming_date || '';
    return String(dateRaw).trim();
}

function portalSortKey(doc: UyapEvrakDoc): string {
    const raw = getPortalDate(doc);
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const trMatch = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    const year = isoMatch ? Number(isoMatch[1]) : trMatch ? Number(trMatch[3]) : NaN;
    const maxYear = new Date().getFullYear() + 1;
    if (!Number.isFinite(year) || year < 1990 || year > maxYear) return '';
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    if (!trMatch) return '';
    return `${trMatch[3]}-${String(Number(trMatch[2])).padStart(2, '0')}-${String(Number(trMatch[1])).padStart(2, '0')}`;
}

function sortByPortalDate(docs: UyapEvrakDoc[]): UyapEvrakDoc[] {
    return [...docs].sort((a, b) => {
        const dateA = portalSortKey(a);
        const dateB = portalSortKey(b);
        if (dateA === dateB) return (a.title || '').localeCompare(b.title || '', 'tr');
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA < dateB ? 1 : -1;
    });
}

function ekSortKey(doc: UyapEvrakDoc): number {
    const sira = uyapOf(doc).sira;
    const n = typeof sira === 'number' ? sira : Number(sira);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

function sortEk(docs: UyapEvrakDoc[]): UyapEvrakDoc[] {
    return [...docs].sort((a, b) => {
        const siraA = ekSortKey(a);
        const siraB = ekSortKey(b);
        if (siraA !== siraB) return siraA - siraB;
        const dateA = portalSortKey(a);
        const dateB = portalSortKey(b);
        if (dateA === dateB) return (a.title || '').localeCompare(b.title || '', 'tr');
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA < dateB ? -1 : 1;
    });
}

function labelForRelatedKey(relatedKey: string): string {
    const text = String(relatedKey || '').trim();
    const match = text.match(/^(.+?)\((.+)\)\s*$/);
    if (match) return `${match[1].trim()} ${match[2].trim()}`.trim();
    return text;
}

function withParentItemKey(doc: UyapEvrakDoc, parentItemKey: string | null): UyapEvrakDoc {
    if (!parentItemKey || parentItemKeyOfDoc(doc) === parentItemKey) return doc;
    const meta = parseMetadata(doc.metadata);
    const uyap = { ...(uyapOf(doc)), parentItemKey };
    return { ...doc, metadata: JSON.stringify({ ...meta, uyap }) };
}

function preferCatalogDoc(current: UyapEvrakDoc, next: UyapEvrakDoc): UyapEvrakDoc {
    const currentPath = Boolean(current.file_path);
    const nextPath = Boolean(next.file_path);
    let winner = current;
    if (nextPath && !currentPath) winner = next;
    else {
        const currentRelated = typeof uyapOf(current).relatedKey === 'string';
        const nextRelated = typeof uyapOf(next).relatedKey === 'string';
        if (nextRelated && !currentRelated) winner = next;
    }
    const other = winner === current ? next : current;
    const parent = parentItemKeyOfDoc(winner) || parentItemKeyOfDoc(other);
    return parent ? withParentItemKey(winner, parent) : winner;
}

/** One catalog card per durable itemKey. Son 20 is a slice of this set, not extra rows. */
export function uniqueUyapEvrakDocs(docs: UyapEvrakDoc[]): UyapEvrakDoc[] {
    const byKey = new Map<string, UyapEvrakDoc>();
    const passthrough: UyapEvrakDoc[] = [];
    for (const doc of docs || []) {
        const key = itemKeyOfDoc(doc);
        if (!key) {
            passthrough.push(doc);
            continue;
        }
        const prev = byKey.get(key);
        byKey.set(key, prev ? preferCatalogDoc(prev, doc) : doc);
    }
    return [...byKey.values(), ...passthrough];
}

function wouldCycle(childKey: string, parentKey: string, parentOf: Map<string, string>): boolean {
    const seen = new Set<string>([childKey]);
    let current: string | undefined = parentKey;
    while (current) {
        if (seen.has(current)) return true;
        seen.add(current);
        current = parentOf.get(current);
    }
    return false;
}

/** Top-level cards with nested ek. Orphans (missing parent) stay top-level. */
export function nestEvrakDocs(docs: UyapEvrakDoc[]): NestedEvrakNode[] {
    const unique = uniqueUyapEvrakDocs(docs);
    const byKey = new Map<string, UyapEvrakDoc>();
    const parentOf = new Map<string, string>();
    for (const doc of unique) {
        const key = itemKeyOfDoc(doc);
        if (key) byKey.set(key, doc);
        const parentKey = parentItemKeyOfDoc(doc);
        if (key && parentKey && parentKey !== key) parentOf.set(key, parentKey);
    }

    const childKeys = new Set<string>();
    const children = new Map<string, UyapEvrakDoc[]>();
    for (const doc of unique) {
        const key = itemKeyOfDoc(doc);
        if (!key) continue;
        const parentKey = parentOf.get(key);
        if (!parentKey || !byKey.has(parentKey)) continue;
        if (wouldCycle(key, parentKey, parentOf)) continue;
        childKeys.add(key);
        const list = children.get(parentKey) ?? [];
        list.push(doc);
        children.set(parentKey, list);
    }

    const topLevel = unique.filter((doc) => {
        const key = itemKeyOfDoc(doc);
        return !key || !childKeys.has(key);
    });

    return sortByPortalDate(topLevel).map((doc) => {
        const key = itemKeyOfDoc(doc);
        return {
            doc,
            ek: key ? sortEk(children.get(key) ?? []) : [],
        };
    });
}

export function deriveUyapEvrakTree(folders: UyapEvrakFolder[], docs: UyapEvrakDoc[]): DerivedEvrakTree {
    const nested = nestEvrakDocs(docs);
    const recent = nested.slice(0, 20);
    const groupsMap = new Map<string, Map<string, NestedEvrakNode[]>>();

    for (const node of nested) {
        const uyap = uyapOf(node.doc);
        let relatedKey = typeof uyap.relatedKey === 'string' && uyap.relatedKey.trim()
            ? uyap.relatedKey.trim()
            : '';
        if (!relatedKey) {
            const folder = folders.find(
                (f) => f.id === node.doc.folder_id && String(f.id).startsWith('uyap-folder-'),
            );
            relatedKey = folder ? folder.name : 'Ana Dosya';
        }
        const tur = (typeof uyap.tur === 'string' && uyap.tur.trim()) || node.doc.title || 'Evrak';
        if (!groupsMap.has(relatedKey)) groupsMap.set(relatedKey, new Map());
        const turMap = groupsMap.get(relatedKey)!;
        if (!turMap.has(tur)) turMap.set(tur, []);
        turMap.get(tur)!.push(node);
    }

    const groups: DerivedRelatedGroup[] = [];
    for (const [relatedKey, turMap] of groupsMap.entries()) {
        const turFolders: DerivedTurFolder[] = [];
        for (const [tur, turDocs] of turMap.entries()) {
            turFolders.push({ tur, docs: turDocs });
        }
        turFolders.sort((a, b) => a.tur.localeCompare(b.tur, 'tr'));
        groups.push({ relatedKey, label: labelForRelatedKey(relatedKey), turFolders });
    }

    groups.sort((a, b) => {
        if (a.relatedKey === 'Ana Dosya') return -1;
        if (b.relatedKey === 'Ana Dosya') return 1;
        return a.label.localeCompare(b.label, 'tr');
    });

    return { recent, groups };
}
