import { create } from 'zustand';
import { toast } from 'sonner';
import { flushSyncHfToEditor, scheduleSyncHfToEditor } from '../utils/headerFooterSyncScheduler';
import { resolveUdfixEditorForDocument } from '../utils/udfixEditorDocumentRegistry';
import { useLayoutStore } from './useLayoutStore';
import { flushAllHfEditors } from '../utils/hfEditorFlushRegistry';
import { DataService } from '../services/dataService';
import {
    deletePresetAssets,
    externalizeSectionsImages,
    getPresetAssets,
    hydrateSectionsImages,
    loadPresetAssetsStore,
    savePresetAssetsStore,
    setPresetAssets,
    type HfPresetAssetsMap,
    type HfSectionBundle,
} from '../utils/hfPresetAssets';
import {
    coerceHfPresetList,
    mergeHfAssetMaps,
    mergeHfPresetLists,
    readHfPresetsFromLocalStorage,
    shouldSkipEmptyHfLibraryWrite,
    writeHfPresetsToLocalStorage,
} from '../utils/hfPresetLibrary';
import {
    isDocumentHfPayloadEmpty,
    parseDocumentHfPayload,
    readDocumentHfFromLocalStorage,
    removeDocumentHfFromLocalStorage,
    resolveDocumentHfLoad,
    writeDocumentHfToLocalStorage,
    type DocumentHfPersistedPayload,
} from '../utils/documentHfPersistence';
import type { UyapPageNumberFontAttrs } from '../utils/uyapExportBuild';

// ── Types ──────────────────────────────────────────────────

export interface HeaderFooterSection {
    headerLeft: string;
    headerCenter: string;
    headerRight: string;
    footerLeft: string;
    footerCenter: string;
    footerRight: string;
}

const emptySection = (): HeaderFooterSection => ({
    headerLeft: '',
    headerCenter: '',
    headerRight: '',
    footerLeft: '',
    footerCenter: '',
    footerRight: '',
});

export type DateFormatType = 'DD.MM.YYYY' | 'DD MMMM YYYY' | 'YYYY-MM-DD';

export interface HeaderFooterSettings {
    pageNumberStart: number;
    dateFormat: DateFormatType;
    /** @deprecated Use showHeaderSeparatorLine / showFooterSeparatorLine */
    showSeparatorLine?: boolean;
    showHeaderSeparatorLine: boolean;
    showFooterSeparatorLine: boolean;
    separatorLineColor: string;
    separatorLineWidth: number;
    headerMarginTop: number;
    footerMarginBottom: number;
    hidePageNumberOnFirstPage: boolean;
    headerIndent: number;
    footerIndent: number;
    headerLayout: '1-col' | '2-col-70-30' | '2-col-30-70' | '2-col-80-20' | '2-col-20-80' | '3-col-equal';
    footerLayout: '1-col' | '2-col-70-30' | '2-col-30-70' | '2-col-80-20' | '2-col-20-80' | '3-col-equal';
    /** Imported UYAP page-number attrs (e.g. `BSP32_2120`). */
    uyapPageNumberFont?: UyapPageNumberFontAttrs;
    /** `<header startPage="N">` — header band starts on page N (UYAP). */
    headerStartPage?: number;
}

export function normalizeHeaderFooterSettings(
    raw: Partial<HeaderFooterSettings> | undefined,
): HeaderFooterSettings {
    const base = defaultSettings();
    if (!raw) return base;
    const legacySep = raw.showSeparatorLine;
    return {
        ...base,
        ...raw,
        showHeaderSeparatorLine:
            raw.showHeaderSeparatorLine ?? legacySep ?? base.showHeaderSeparatorLine,
        showFooterSeparatorLine:
            raw.showFooterSeparatorLine ?? legacySep ?? base.showFooterSeparatorLine,
    };
}

const defaultSettings = (): HeaderFooterSettings => ({
    pageNumberStart: 1,
    dateFormat: 'DD.MM.YYYY',
    showHeaderSeparatorLine: true,
    showFooterSeparatorLine: true,
    separatorLineColor: 'rgba(0, 0, 0, 0.3)',
    separatorLineWidth: 1,
    headerMarginTop: 0,
    footerMarginBottom: 0,
    hidePageNumberOnFirstPage: false,
    headerIndent: 0,
    footerIndent: 0,
    headerLayout: '3-col-equal',
    footerLayout: '3-col-equal',
});

/** Immediate HF sync (debounce cancelled + single RAF). */
export function syncHfToEditor() {
    flushSyncHfToEditor();
}

export { scheduleSyncHfToEditor, flushSyncHfToEditor };

export interface HeaderFooterPreset {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    sections: {
        default: HeaderFooterSection;
        firstPage: HeaderFooterSection;
        lastPage: HeaderFooterSection;
        oddPage: HeaderFooterSection;
        evenPage: HeaderFooterSection;
    };
    settings: HeaderFooterSettings;
    differentFirstPage: boolean;
    differentLastPage: boolean;
    differentOddEvenPages: boolean;
    createdAt: number;
}

// ── State Interface ────────────────────────────────────────

// ── State Interface ────────────────────────────────────────

interface HeaderFooterState {
    // Feature toggles
    differentFirstPage: boolean;
    differentLastPage: boolean;
    differentOddEvenPages: boolean;
    lastUpdated: number;

    // Section content
    sections: {
        default: HeaderFooterSection;
        firstPage: HeaderFooterSection;
        lastPage: HeaderFooterSection;
        oddPage: HeaderFooterSection;
        evenPage: HeaderFooterSection;
    };

    // Advanced settings
    settings: HeaderFooterSettings;

    // Current document ID being edited
    currentDocumentId: string;

    // Panel state (replaces modal)
    panelOpen: boolean;
    panelActiveTab: 'default' | 'firstPage' | 'lastPage' | 'oddPage' | 'evenPage';
    panelAnchorRect: { top: number; left: number; width: number; bottom: number } | null;
    openPanel: (anchorRect?: { top: number; left: number; width: number; bottom: number }) => void;
    closePanel: () => void;
    setPanelActiveTab: (tab: 'default' | 'firstPage' | 'lastPage' | 'oddPage' | 'evenPage') => void;

    // Draft state for apply/discard
    draftSections: {
        default: HeaderFooterSection;
        firstPage: HeaderFooterSection;
        lastPage: HeaderFooterSection;
        oddPage: HeaderFooterSection;
        evenPage: HeaderFooterSection;
    } | null;
    draftSettings: HeaderFooterSettings | null;
    draftDifferentFirstPage: boolean | null;
    draftDifferentLastPage: boolean | null;
    draftDifferentOddEvenPages: boolean | null;

    // Context Editing (WYSIWYG)
    isContextEditing: boolean;
    contextEditSection: 'default' | 'firstPage' | 'lastPage' | 'oddPage' | 'evenPage' | null;
    startContextEdit: (section: 'default' | 'firstPage' | 'lastPage' | 'oddPage' | 'evenPage') => void;
    stopContextEdit: () => void;

    // Actions
    setDifferentFirstPage: (value: boolean) => void;
    setDifferentLastPage: (value: boolean) => void;
    setDifferentOddEvenPages: (value: boolean) => void;
    updateSection: (
        sectionKey: 'default' | 'firstPage' | 'lastPage' | 'oddPage' | 'evenPage',
        field: keyof HeaderFooterSection,
        value: string
    ) => void;
    updateSettings: (patch: Partial<HeaderFooterSettings>) => void;
    clearSection: (type: 'header' | 'footer' | 'all', sectionKey?: 'default' | 'firstPage' | 'lastPage' | 'oddPage' | 'evenPage') => void;

    // Apply / Discard
    applyChanges: () => void;
    discardChanges: () => void;

    // Presets
    presets: HeaderFooterPreset[];
    savePreset: (name: string, description?: string, icon?: string) => void;
    loadPreset: (presetId: string) => void;
    updatePreset: (presetId: string) => void;
    deletePreset: (presetId: string) => void;
    loadAllPresets: () => Promise<void>;

    // Ghost Preview
    previewPresetId: string | null;
    previewPreset: (presetId: string) => void;
    clearPreview: () => void;

    // Persistence
    load: (documentId: string) => Promise<void>;
    save: () => Promise<void>;

    // Computed    // Helpers
    getContentForPage: (pageIndex: number, totalPages: number) => HeaderFooterSection;
    getSectionKeyForPage: (pageIndex: number, totalPages: number) => 'default' | 'firstPage' | 'lastPage' | 'oddPage' | 'evenPage';
    // Date format helper
    getFormattedDate: () => string;
}

// ── Constants ──────────────────────────────────────────────

let presetsHydratePromise: Promise<void> | null = null;
let documentHfLoadSeq = 0;
let hydratedDocumentHfId: string | null = null;

function emptySections(): HeaderFooterState['sections'] {
    return {
        default: emptySection(),
        firstPage: emptySection(),
        lastPage: emptySection(),
        oddPage: emptySection(),
        evenPage: emptySection(),
    };
}

function snapshotDocumentHfPayload(state: {
    differentFirstPage: boolean;
    differentLastPage: boolean;
    differentOddEvenPages: boolean;
    sections: HeaderFooterState['sections'];
    settings: HeaderFooterSettings;
}): DocumentHfPersistedPayload {
    return {
        differentFirstPage: state.differentFirstPage,
        differentLastPage: state.differentLastPage,
        differentOddEvenPages: state.differentOddEvenPages,
        sections: cloneSections(state.sections),
        settings: { ...state.settings },
    };
}

function storeSliceFromDocumentHfPayload(payload: DocumentHfPersistedPayload | null): {
    differentFirstPage: boolean;
    differentLastPage: boolean;
    differentOddEvenPages: boolean;
    sections: HeaderFooterState['sections'];
    settings: HeaderFooterSettings;
} {
    if (!payload) {
        return {
            differentFirstPage: false,
            differentLastPage: false,
            differentOddEvenPages: false,
            sections: emptySections(),
            settings: defaultSettings(),
        };
    }
    return {
        differentFirstPage: payload.differentFirstPage,
        differentLastPage: payload.differentLastPage,
        differentOddEvenPages: payload.differentOddEvenPages,
        sections: {
            default: { ...emptySection(), ...payload.sections.default },
            firstPage: { ...emptySection(), ...payload.sections.firstPage },
            lastPage: { ...emptySection(), ...payload.sections.lastPage },
            oddPage: { ...emptySection(), ...payload.sections.oddPage },
            evenPage: { ...emptySection(), ...payload.sections.evenPage },
        },
        settings: normalizeHeaderFooterSettings(payload.settings),
    };
}

async function persistHeaderFooterLibrary(
    presets: HeaderFooterPreset[],
    assets: HfPresetAssetsMap,
    allowEmpty: boolean,
): Promise<void> {
    const existingLs = readHfPresetsFromLocalStorage();
    if (shouldSkipEmptyHfLibraryWrite(presets.length, existingLs.length, allowEmpty)) {
        return;
    }
    writeHfPresetsToLocalStorage(presets);
    savePresetAssetsStore(assets);
    try {
        await DataService.setHeaderFooterLibrary({ presets, assets, allowEmpty });
    } catch (err) {
        console.warn('[hf] SQLite letterhead library save failed; kept localStorage copy.', err);
    }
}

async function hydrateHeaderFooterLibrary(
    set: (partial: Partial<HeaderFooterState>) => void,
    get: () => HeaderFooterState,
): Promise<void> {
    const lsPresets = readHfPresetsFromLocalStorage();
    let lsAssets: HfPresetAssetsMap = {};
    try {
        lsAssets = loadPresetAssetsStore();
    } catch {
        lsAssets = {};
    }

    let dbPresets: HeaderFooterPreset[] = [];
    let dbAssets: HfPresetAssetsMap = {};
    try {
        const lib = await DataService.getHeaderFooterLibrary();
        dbPresets = coerceHfPresetList(lib.presets);
        dbAssets = lib.assets && typeof lib.assets === 'object' ? lib.assets : {};
    } catch {
        /* Vite / missing IPC — localStorage only */
    }

    let mergedPresets = mergeHfPresetLists(lsPresets, dbPresets, get().presets);
    let mergedAssets = mergeHfAssetMaps(lsAssets, dbAssets);
    mergedPresets = mergedPresets.map((preset) => {
        if (!sectionsHaveInlineImages(preset.sections)) return preset;
        const { sections, assets } = externalizeSectionsImages(preset.sections);
        if (Object.keys(assets).length === 0) return preset;
        mergedAssets = {
            ...mergedAssets,
            [preset.id]: { ...mergedAssets[preset.id], ...assets },
        };
        return { ...preset, sections };
    });
    const nextPresets = mergedPresets.length > 0 ? mergedPresets : get().presets;

    if (nextPresets.length > 0) {
        await persistHeaderFooterLibrary(nextPresets, mergedAssets, false);
    }

    set({ presets: nextPresets });
}

// ── Helpers ────────────────────────────────────────────────

function formatDate(format: DateFormatType): string {
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth(); // 0-indexed
    const year = now.getFullYear();

    const months = [
        'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
    ];

    const pad = (n: number) => String(n).padStart(2, '0');

    switch (format) {
        case 'DD.MM.YYYY':
            return `${pad(day)}.${pad(month + 1)}.${year}`;
        case 'DD MMMM YYYY':
            return `${day} ${months[month]} ${year}`;
        case 'YYYY-MM-DD':
            return `${year}-${pad(month + 1)}-${pad(day)}`;
        default:
            return `${pad(day)}.${pad(month + 1)}.${year}`;
    }
}

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneSections(sections: HeaderFooterState['sections']): HfSectionBundle {
    return {
        default: { ...sections.default },
        firstPage: { ...sections.firstPage },
        lastPage: { ...sections.lastPage },
        oddPage: { ...sections.oddPage },
        evenPage: { ...sections.evenPage },
    };
}

function sectionsHaveInlineImages(sections: HfSectionBundle): boolean {
    for (const sec of Object.values(sections)) {
        for (const html of Object.values(sec)) {
            if (typeof html === 'string' && html.includes('data:image/')) return true;
        }
    }
    return false;
}

// ── Store ──────────────────────────────────────────────────

export const useHeaderFooterStore = create<HeaderFooterState>()((set, get) => ({
    lastUpdated: Date.now(),
    differentFirstPage: false,
    differentLastPage: false,
    differentOddEvenPages: false,

    sections: {
        default: emptySection(),
        firstPage: emptySection(),
        lastPage: emptySection(),
        oddPage: emptySection(),
        evenPage: emptySection(),
    },

    settings: defaultSettings(),

    currentDocumentId: 'default',

    // Panel
    panelOpen: false,
    panelActiveTab: 'default',
    panelAnchorRect: null,
    openPanel: (anchorRect) => {
        const state = get();
        set({
            panelOpen: true,
            panelAnchorRect: anchorRect ?? null,
            draftSections: cloneSections(state.sections),
            draftSettings: { ...state.settings },
            draftDifferentFirstPage: state.differentFirstPage,
            draftDifferentLastPage: state.differentLastPage,
            draftDifferentOddEvenPages: state.differentOddEvenPages,
        });
    },
    closePanel: () => set({ panelOpen: false, panelAnchorRect: null }),
    setPanelActiveTab: (tab) => set({ panelActiveTab: tab }),

    // Draft state
    draftSections: null,
    draftSettings: null,
    draftDifferentFirstPage: null,
    draftDifferentLastPage: null,
    draftDifferentOddEvenPages: null,

    // Feature toggles
    setDifferentFirstPage: (value) => {
        set({ differentFirstPage: value });
    },
    setDifferentLastPage: (value) => {
        set({ differentLastPage: value });
    },
    setDifferentOddEvenPages: (value) => {
        set({ differentOddEvenPages: value });
    },

    // Context Editing
    isContextEditing: false,
    contextEditSection: null,
    startContextEdit: (section) => {
        const state = get();
        set({
            isContextEditing: true,
            contextEditSection: section,
            // also load drafted snapshot
            draftSections: cloneSections(state.sections),
            draftSettings: { ...state.settings },
            draftDifferentFirstPage: state.differentFirstPage,
            draftDifferentLastPage: state.differentLastPage,
            draftDifferentOddEvenPages: state.differentOddEvenPages,
            lastUpdated: Date.now(),
            panelOpen: false, // close side panel if open
        });
    },
    stopContextEdit: () => {
        set({
            isContextEditing: false,
            contextEditSection: null,
        });
        get().applyChanges();
    },

    // Content editing
    updateSection: (sectionKey, field, value) => {

        set((state) => ({
            lastUpdated: Date.now(),
            sections: {
                ...state.sections,
                [sectionKey]: {
                    ...state.sections[sectionKey as 'default' | 'firstPage' | 'lastPage' | 'oddPage' | 'evenPage'],
                    [field]: value,
                },
            },
        }));

    },

    // Settings editing
    updateSettings: (patch) => {
        set((state) => ({
            lastUpdated: Date.now(),
            settings: { ...state.settings, ...patch },
        }));
    },


    // Clear section
    clearSection: (type, sectionKey) => {
        set((state) => {
            const keys: Array<'default' | 'firstPage' | 'lastPage' | 'oddPage' | 'evenPage'> = sectionKey
                ? [sectionKey]
                : ['default', 'firstPage', 'lastPage', 'oddPage', 'evenPage'];

            const newSections = { ...state.sections };
            for (const key of keys) {
                const sec = { ...newSections[key] };
                if (type === 'header' || type === 'all') {
                    sec.headerLeft = '';
                    sec.headerCenter = '';
                    sec.headerRight = '';
                }
                if (type === 'footer' || type === 'all') {
                    sec.footerLeft = '';
                    sec.footerCenter = '';
                    sec.footerRight = '';
                }
                newSections[key] = sec;
            }
            return { sections: newSections, lastUpdated: Date.now() };
        });
    },

    // Apply / Discard
    applyChanges: () => {
        flushAllHfEditors();
        void get().save();
        set({
            lastUpdated: Date.now(),
            panelOpen: false,
            isContextEditing: false,
            contextEditSection: null,
            draftSections: null,
            draftSettings: null,
            draftDifferentFirstPage: null,
            draftDifferentLastPage: null,
            draftDifferentOddEvenPages: null,
        });
        const docId = get().currentDocumentId;
        if (docId) {
            const editor = resolveUdfixEditorForDocument(docId);
            if (editor) {
                useLayoutStore.getState().setEditor(editor);
            }
        }
        // Directly dispatch to ProseMirror — bypasses React lifecycle
        syncHfToEditor();
    },
    discardChanges: () => {
        const state = get();
        if (state.draftSections && state.draftSettings !== null) {
            set({
                sections: state.draftSections,
                settings: state.draftSettings!,
                differentFirstPage: state.draftDifferentFirstPage ?? false,
                differentLastPage: state.draftDifferentLastPage ?? false,
                differentOddEvenPages: state.draftDifferentOddEvenPages ?? false,
                panelOpen: false,
                draftSections: null,
                draftSettings: null,
                draftDifferentFirstPage: null,
                draftDifferentLastPage: null,
                draftDifferentOddEvenPages: null,
            });
        } else {
            set({ panelOpen: false });
        }
    },

    // Presets
    presets: [],
    loadAllPresets: () => {
        if (!presetsHydratePromise) {
            presetsHydratePromise = hydrateHeaderFooterLibrary(set, get).catch((err) => {
                console.warn('[hf] letterhead library hydrate failed', err);
                presetsHydratePromise = null;
            });
        }
        return presetsHydratePromise ?? Promise.resolve();
    },
    savePreset: (name, description, icon) => {
        flushAllHfEditors();
        void (async () => {
            await get().loadAllPresets();
            const state = get();
            const presetId = generateId();
            const { sections: storedSections, assets } = externalizeSectionsImages(
                cloneSections(state.sections),
            );

            const preset: HeaderFooterPreset = {
                id: presetId,
                name,
                description,
                icon: icon || 'bookmark',
                sections: storedSections,
                settings: { ...state.settings },
                differentFirstPage: state.differentFirstPage,
                differentLastPage: state.differentLastPage,
                differentOddEvenPages: state.differentOddEvenPages,
                createdAt: Date.now(),
            };

            if (Object.keys(assets).length > 0 && !setPresetAssets(presetId, assets)) {
                toast.error('Logo kaydedilemedi — depolama alanı dolu olabilir.');
            }

            const updated = mergeHfPresetLists(readHfPresetsFromLocalStorage(), get().presets, [preset]);
            try {
                await persistHeaderFooterLibrary(updated, loadPresetAssetsStore(), false);
                set({ presets: updated });
            } catch (err) {
                console.error('[hf] preset save failed', err);
                deletePresetAssets(presetId);
                toast.error('Antet şablonu kaydedilemedi — depolama alanı dolu olabilir.');
            }
        })();
    },
    loadPreset: (presetId) => {
        const state = get();
        const preset = state.presets.find((p) => p.id === presetId);
        if (!preset) return;

        const assets = getPresetAssets(presetId);
        const hydrated = hydrateSectionsImages(preset.sections, assets);

        set({
            lastUpdated: Date.now(),
            sections: cloneSections(hydrated),
            settings: normalizeHeaderFooterSettings(preset.settings),
            differentFirstPage: preset.differentFirstPage,
            differentLastPage: preset.differentLastPage,
            differentOddEvenPages: preset.differentOddEvenPages,
            previewPresetId: null,
        });
        syncHfToEditor();
    },
    updatePreset: (presetId) => {
        flushAllHfEditors();
        const state = get();
        const preset = state.presets.find((p) => p.id === presetId);
        if (!preset) return;

        const { sections: storedSections, assets } = externalizeSectionsImages(
            cloneSections(state.sections),
        );

        const updatedPreset: HeaderFooterPreset = {
            ...preset,
            sections: storedSections,
            settings: { ...state.settings },
            differentFirstPage: state.differentFirstPage,
            differentLastPage: state.differentLastPage,
            differentOddEvenPages: state.differentOddEvenPages,
            createdAt: Date.now(),
        };

        if (Object.keys(assets).length > 0 && !setPresetAssets(presetId, assets)) {
            toast.error('Logo güncellenemedi — depolama alanı dolu olabilir.');
            return;
        }
        if (Object.keys(assets).length === 0) {
            deletePresetAssets(presetId);
        }

        const updatedPresets = state.presets.map((p) =>
            p.id === presetId ? updatedPreset : p
        );
        void persistHeaderFooterLibrary(updatedPresets, loadPresetAssetsStore(), false)
            .then(() => set({ presets: updatedPresets }))
            .catch((err) => {
                console.error('[hf] preset update failed', err);
                toast.error('Antet şablonu güncellenemedi.');
            });
    },
    deletePreset: (presetId) => {
        const state = get();
        const preset = state.presets.find(p => p.id === presetId);
        if (!preset) return;

        const remaining = state.presets.filter((p) => p.id !== presetId);
        deletePresetAssets(presetId);
        void persistHeaderFooterLibrary(remaining, loadPresetAssetsStore(), true);
        set({ presets: remaining });
    },

    // Ghost Preview
    previewPresetId: null,
    previewPreset: (presetId) => {
        set({ previewPresetId: presetId });
    },
    clearPreview: () => {
        set({ previewPresetId: null });
    },

    // Persistence
    load: async (documentId) => {
        const seq = ++documentHfLoadSeq;
        const lsPayload = readDocumentHfFromLocalStorage(documentId);
        hydratedDocumentHfId = null;
        set({
            currentDocumentId: documentId,
            ...storeSliceFromDocumentHfPayload(lsPayload),
        });

        let dbPayload = null as ReturnType<typeof parseDocumentHfPayload>;
        try {
            dbPayload = parseDocumentHfPayload(await DataService.getDocumentHeaderFooter(documentId));
        } catch {
            /* Vite / missing IPC — localStorage only */
        }
        if (seq !== documentHfLoadSeq) return;

        const resolution = resolveDocumentHfLoad(dbPayload, lsPayload);
        set({
            currentDocumentId: documentId,
            ...storeSliceFromDocumentHfPayload(resolution.payload),
        });
        hydratedDocumentHfId = documentId;
        void get().loadAllPresets();

        if (!resolution.migrateFromLocalStorage || !resolution.payload) return;
        try {
            const result = await DataService.setDocumentHeaderFooter({
                documentId,
                payload: resolution.payload,
                allowEmpty: isDocumentHfPayloadEmpty(resolution.payload),
            });
            if (seq !== documentHfLoadSeq) return;
            if (result?.ok && !result.skippedEmpty) {
                removeDocumentHfFromLocalStorage(documentId);
            }
        } catch (err) {
            console.warn('[hf] SQLite document HF migrate failed; kept localStorage copy.', err);
        }
    },

    save: async () => {
        const state = get();
        const documentId = state.currentDocumentId;
        if (!documentId || documentId !== hydratedDocumentHfId) return;
        const data = snapshotDocumentHfPayload(state);
        const allowEmpty = isDocumentHfPayloadEmpty(data);
        try {
            const result = await DataService.setDocumentHeaderFooter({
                documentId,
                payload: data,
                allowEmpty,
            });
            if (result?.ok && !result.skippedEmpty) {
                removeDocumentHfFromLocalStorage(documentId);
                return;
            }
            if (result?.ok && result.skippedEmpty) return;
        } catch {
            /* Vite / missing IPC — localStorage fallback */
        }
        writeDocumentHfToLocalStorage(documentId, data);
    },

    getContentForPage: (pageIndex, totalPages) => {
        const state = get();
        const key = state.getSectionKeyForPage(pageIndex, totalPages);
        return state.sections[key];
    },

    getSectionKeyForPage: (pageIndex, totalPages) => {
        const state = get();
        const isFirstPage = pageIndex === 0;
        const isLastPage = pageIndex === totalPages - 1;

        if (isFirstPage && state.differentFirstPage) {
            return 'firstPage';
        }
        if (isLastPage && state.differentLastPage && totalPages > 1) {
            return 'lastPage';
        }
        if (state.differentOddEvenPages) {
            const isOdd = (pageIndex + 1) % 2 !== 0;
            return isOdd ? 'oddPage' : 'evenPage';
        }
        return 'default';
    },

    getFormattedDate: () => {
        return formatDate(get().settings.dateFormat);
    },
}));
