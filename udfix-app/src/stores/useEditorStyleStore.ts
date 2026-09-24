import { create } from 'zustand';
import {
    DataService,
    type EditorTypographyDefaultsRow,
    type EditorTypographyPreset,
} from '../services/dataService';
import type { EditorTypographyPayload } from '../utils/editorTypography';
import type { BlockStyleKey } from '../utils/blockStyleFormat';

const LEGACY_BLOCK_STYLE_LS = 'nomai-block-style-defaults-v1';
/** Electron dışı (Vite) ve DB yedeği: blok stilleri tek JSON. */
const BLOCK_STYLE_LS = 'nomai-block-style-defaults-v2';

function readBlockDefaultsFromLocalStorage(): Partial<Record<BlockStyleKey, EditorTypographyPayload>> {
    if (typeof localStorage === 'undefined') return {};
    try {
        const raw = localStorage.getItem(BLOCK_STYLE_LS);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Partial<Record<BlockStyleKey, EditorTypographyPayload>>;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeBlockDefaultsToLocalStorage(payload: Partial<Record<BlockStyleKey, EditorTypographyPayload>>): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(BLOCK_STYLE_LS, JSON.stringify(payload));
    } catch {
        /* quota / private mode */
    }
}

interface EditorStyleState {
    defaults: EditorTypographyDefaultsRow | null;
    presets: EditorTypographyPreset[];
    /** Paragraf / başlık yuvası (H1…, B/T, A/S) — SQLite + localStorage yedek */
    blockDefaults: Partial<Record<BlockStyleKey, EditorTypographyPayload>>;
    loaded: boolean;
    loadFromDb: () => Promise<void>;
    saveDefaults: (payload: EditorTypographyPayload, applyOnOpen?: boolean) => Promise<void>;
    setApplyOnOpen: (applyOnOpen: boolean) => Promise<void>;
    addPreset: (name: string, payload: EditorTypographyPayload) => Promise<void>;
    removePreset: (id: string) => Promise<void>;
    refreshPresets: () => Promise<void>;
    saveBlockDefault: (key: BlockStyleKey, payload: EditorTypographyPayload) => Promise<void>;
    clearDefaults: () => Promise<void>;
}

export const useEditorStyleStore = create<EditorStyleState>((set, get) => ({
    defaults: null,
    presets: [],
    blockDefaults: {},
    loaded: false,

    loadFromDb: async () => {
        try {
            const defaults = await DataService.getEditorTypographyDefaults();
            const presets = await DataService.listEditorTypographyPresets();
            let blockDefaults = await DataService.getEditorBlockStyleDefaults();

            if (!blockDefaults || Object.keys(blockDefaults).length === 0) {
                blockDefaults = readBlockDefaultsFromLocalStorage();
            }

            if (!blockDefaults || Object.keys(blockDefaults).length === 0) {
                try {
                    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LEGACY_BLOCK_STYLE_LS) : null;
                    if (raw) {
                        const parsed = JSON.parse(raw) as Partial<Record<BlockStyleKey, EditorTypographyPayload>>;
                        if (parsed && typeof parsed === 'object') {
                            blockDefaults = parsed;
                            await DataService.setEditorBlockStyleDefaults(parsed);
                            writeBlockDefaultsToLocalStorage(parsed);
                            localStorage.removeItem(LEGACY_BLOCK_STYLE_LS);
                        }
                    }
                } catch {
                    /* ignore migration */
                }
            }

            const existingBlock = get().blockDefaults;
            const incomingBlock = blockDefaults ?? {};
            const mergedBlock =
                Object.keys(incomingBlock).length > 0
                    ? { ...existingBlock, ...incomingBlock }
                    : Object.keys(existingBlock).length > 0
                      ? existingBlock
                      : incomingBlock;

            set({ defaults, presets, blockDefaults: mergedBlock, loaded: true });
        } catch (e) {
            console.warn('Editor typography load failed (Electron DB may be unavailable):', e);
            const fromLs = readBlockDefaultsFromLocalStorage();
            const existingBlock = get().blockDefaults;
            const mergedCatch =
                Object.keys(fromLs).length > 0 ? { ...existingBlock, ...fromLs } : Object.keys(existingBlock).length > 0 ? existingBlock : fromLs;
            set({ loaded: true, blockDefaults: mergedCatch });
        }
    },

    saveDefaults: async (payload, applyOnOpen) => {
        await DataService.setEditorTypographyDefaults({
            payload,
            applyOnOpen: applyOnOpen ?? true,
        });
        const defaults = await DataService.getEditorTypographyDefaults();
        set({ defaults });
    },

    setApplyOnOpen: async (applyOnOpen) => {
        const cur = get().defaults?.payload ?? {};
        await DataService.setEditorTypographyDefaults({ payload: cur, applyOnOpen });
        const defaults = await DataService.getEditorTypographyDefaults();
        set({ defaults });
    },

    addPreset: async (name, payload) => {
        await DataService.addEditorTypographyPreset({ name, payload });
        await get().refreshPresets();
    },

    removePreset: async (id) => {
        await DataService.deleteEditorTypographyPreset(id);
        await get().refreshPresets();
    },

    refreshPresets: async () => {
        const presets = await DataService.listEditorTypographyPresets();
        set({ presets });
    },

    saveBlockDefault: async (key, payload) => {
        const prev = get().blockDefaults ?? {};
        const next = { ...prev, [key]: payload };
        writeBlockDefaultsToLocalStorage(next);
        try {
            await DataService.setEditorBlockStyleDefaults(next);
        } catch (e) {
            console.warn('Block style DB save failed; kept in localStorage + memory.', e);
        }
        set({ blockDefaults: next });
    },

    clearDefaults: async () => {
        await DataService.setEditorTypographyDefaults({ payload: {}, applyOnOpen: false });
        const defaults = await DataService.getEditorTypographyDefaults();
        set({ defaults });
    },
}));

export type { BlockStyleKey } from '../utils/blockStyleFormat';
