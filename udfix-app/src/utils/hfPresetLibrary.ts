import type { HeaderFooterPreset } from '../stores/useHeaderFooterStore';
import type { HfPresetAssetsMap } from './hfPresetAssets';

/** Chromium localStorage keys (legacy; SQLite is the durable copy). */
export const HF_PRESETS_LS_KEY = 'nomai-hf-presets';
export const HF_PRESET_ASSETS_LS_KEY = 'nomai-hf-preset-assets';

export type IdentifiedHfPreset = {
    id: string;
    createdAt?: number;
};

function isHfPresetRecord(item: unknown): item is HeaderFooterPreset {
    if (!item || typeof item !== 'object') return false;
    const rec = item as { id?: unknown; sections?: unknown };
    return typeof rec.id === 'string' && rec.id.length > 0 && rec.sections != null;
}

export function coerceHfPresetList(value: unknown): HeaderFooterPreset[] {
    if (!Array.isArray(value)) return [];
    return value.filter(isHfPresetRecord);
}

export function parseHfPresetList(raw: string | null | undefined): HeaderFooterPreset[] {
    if (!raw) return [];
    try {
        return coerceHfPresetList(JSON.parse(raw) as unknown);
    } catch {
        return [];
    }
}

export function parseHfAssetMap(raw: string | null | undefined): HfPresetAssetsMap {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return parsed as HfPresetAssetsMap;
    } catch {
        return {};
    }
}

export function mergeHfPresetLists<T extends IdentifiedHfPreset>(...lists: T[][]): T[] {
    const map = new Map<string, T>();
    for (const list of lists) {
        for (const preset of list) {
            if (!preset?.id) continue;
            const existing = map.get(preset.id);
            if (!existing || (preset.createdAt ?? 0) >= (existing.createdAt ?? 0)) {
                map.set(preset.id, preset);
            }
        }
    }
    return [...map.values()].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

export function mergeHfAssetMaps(...maps: HfPresetAssetsMap[]): HfPresetAssetsMap {
    const out: HfPresetAssetsMap = {};
    for (const map of maps) {
        for (const [presetId, bucket] of Object.entries(map)) {
            if (!bucket || typeof bucket !== 'object') continue;
            out[presetId] = { ...out[presetId], ...bucket };
        }
    }
    return out;
}

/** Never treat an empty snapshot as authoritative if a non-empty library already exists. */
export function shouldSkipEmptyHfLibraryWrite(
    incomingCount: number,
    existingCount: number,
    allowEmpty: boolean,
): boolean {
    return incomingCount === 0 && existingCount > 0 && !allowEmpty;
}

export function readHfPresetsFromLocalStorage(): HeaderFooterPreset[] {
    if (typeof localStorage === 'undefined') return [];
    try {
        return parseHfPresetList(localStorage.getItem(HF_PRESETS_LS_KEY));
    } catch {
        return [];
    }
}

export function writeHfPresetsToLocalStorage(presets: HeaderFooterPreset[]): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
        localStorage.setItem(HF_PRESETS_LS_KEY, JSON.stringify(presets));
        return true;
    } catch (err) {
        console.error('[hf] preset localStorage write failed', err);
        return false;
    }
}
