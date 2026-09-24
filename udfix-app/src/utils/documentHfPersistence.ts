import type { HeaderFooterSection, HeaderFooterSettings } from '../stores/useHeaderFooterStore';

/** Chromium localStorage key prefix for per-document HF (legacy; SQLite is durable). */
export const DOCUMENT_HF_LS_PREFIX = 'nomai-hf-';

export const DOCUMENT_HF_SECTION_KEYS = [
    'default',
    'firstPage',
    'lastPage',
    'oddPage',
    'evenPage',
] as const;

export type DocumentHfSectionKey = (typeof DOCUMENT_HF_SECTION_KEYS)[number];

export const DOCUMENT_HF_FIELD_KEYS = [
    'headerLeft',
    'headerCenter',
    'headerRight',
    'footerLeft',
    'footerCenter',
    'footerRight',
] as const;

export type DocumentHfFieldKey = (typeof DOCUMENT_HF_FIELD_KEYS)[number];

export type DocumentHfPersistedPayload = {
    differentFirstPage: boolean;
    differentLastPage: boolean;
    differentOddEvenPages: boolean;
    sections: Record<DocumentHfSectionKey, HeaderFooterSection>;
    settings: Partial<HeaderFooterSettings>;
};

export type DocumentHfLoadSource = 'sqlite' | 'localStorage' | 'empty';

export type DocumentHfLoadResolution = {
    source: DocumentHfLoadSource;
    payload: DocumentHfPersistedPayload | null;
    migrateFromLocalStorage: boolean;
};

const emptySection = (): HeaderFooterSection => ({
    headerLeft: '',
    headerCenter: '',
    headerRight: '',
    footerLeft: '',
    footerCenter: '',
    footerRight: '',
});

export function documentHfLocalStorageKey(documentId: string): string {
    return `${DOCUMENT_HF_LS_PREFIX}${documentId}`;
}

function coerceBoolean(value: unknown, fallback = false): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function coerceSection(raw: unknown): HeaderFooterSection {
    const base = emptySection();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
    const rec = raw as Record<string, unknown>;
    for (const field of DOCUMENT_HF_FIELD_KEYS) {
        const value = rec[field];
        base[field] = typeof value === 'string' ? value : '';
    }
    return base;
}

function coerceSections(raw: unknown): Record<DocumentHfSectionKey, HeaderFooterSection> {
    const rec = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const sections = {} as Record<DocumentHfSectionKey, HeaderFooterSection>;
    for (const key of DOCUMENT_HF_SECTION_KEYS) {
        sections[key] = coerceSection(rec[key]);
    }
    return sections;
}

export function parseDocumentHfPayload(raw: unknown): DocumentHfPersistedPayload | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const rec = raw as Record<string, unknown>;
    if (rec.sections == null && rec.settings == null) return null;
    return {
        differentFirstPage: coerceBoolean(rec.differentFirstPage),
        differentLastPage: coerceBoolean(rec.differentLastPage),
        differentOddEvenPages: coerceBoolean(rec.differentOddEvenPages),
        sections: coerceSections(rec.sections),
        settings: rec.settings && typeof rec.settings === 'object' && !Array.isArray(rec.settings)
            ? (rec.settings as Partial<HeaderFooterSettings>)
            : {},
    };
}

export function parseDocumentHfPayloadJson(raw: string | null | undefined): DocumentHfPersistedPayload | null {
    if (!raw || raw.trim().length === 0) return null;
    try {
        return parseDocumentHfPayload(JSON.parse(raw) as unknown);
    } catch {
        return null;
    }
}

function sectionHasContent(section: HeaderFooterSection): boolean {
    for (const field of DOCUMENT_HF_FIELD_KEYS) {
        if (section[field].trim().length > 0) return true;
    }
    return false;
}

/** True when no band text and no page-variant flags (settings-only still counts as empty for skip). */
export function isDocumentHfPayloadEmpty(payload: DocumentHfPersistedPayload | null | undefined): boolean {
    if (!payload) return true;
    if (payload.differentFirstPage || payload.differentLastPage || payload.differentOddEvenPages) {
        return false;
    }
    for (const key of DOCUMENT_HF_SECTION_KEYS) {
        if (sectionHasContent(payload.sections[key])) return false;
    }
    return true;
}

/** Never treat an empty snapshot as authoritative if a non-empty row already exists. */
export function shouldSkipEmptyDocumentHfWrite(
    incomingEmpty: boolean,
    existingEmpty: boolean,
    allowEmpty: boolean,
): boolean {
    return incomingEmpty && !existingEmpty && !allowEmpty;
}

export function resolveDocumentHfLoad(
    dbPayload: DocumentHfPersistedPayload | null,
    lsPayload: DocumentHfPersistedPayload | null,
): DocumentHfLoadResolution {
    const source: DocumentHfLoadSource = dbPayload ? 'sqlite' : lsPayload ? 'localStorage' : 'empty';
    switch (source) {
        case 'sqlite':
            return { source, payload: dbPayload, migrateFromLocalStorage: false };
        case 'localStorage':
            return { source, payload: lsPayload, migrateFromLocalStorage: true };
        case 'empty':
            return { source, payload: null, migrateFromLocalStorage: false };
        default: {
            const _exhaustive: never = source;
            return _exhaustive;
        }
    }
}

export function readDocumentHfFromLocalStorage(documentId: string): DocumentHfPersistedPayload | null {
    if (typeof localStorage === 'undefined') return null;
    try {
        return parseDocumentHfPayloadJson(localStorage.getItem(documentHfLocalStorageKey(documentId)));
    } catch {
        return null;
    }
}

export function writeDocumentHfToLocalStorage(
    documentId: string,
    payload: DocumentHfPersistedPayload,
): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
        localStorage.setItem(documentHfLocalStorageKey(documentId), JSON.stringify(payload));
        return true;
    } catch (err) {
        console.error('[hf] document localStorage write failed', err);
        return false;
    }
}

export function removeDocumentHfFromLocalStorage(documentId: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.removeItem(documentHfLocalStorageKey(documentId));
    } catch {
        /* quota / private mode */
    }
}
