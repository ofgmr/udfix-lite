import type { HeaderFooterSection } from '../stores/useHeaderFooterStore';
import { HF_PRESET_ASSETS_LS_KEY } from './hfPresetLibrary';

/** Matches HeaderFooterPanel upload cap. */
export const HF_PRESET_MAX_IMAGE_BYTES = 500 * 1024;

export const HF_ASSET_SRC_PREFIX = 'nomai-hf-asset:';

const DATA_IMAGE_SRC_RE = /src=(["'])(data:image\/[^"']+)\1/gi;
const ASSET_SRC_RE = /src=(["'])nomai-hf-asset:([^"']+)\1/gi;

export type HfPresetAssetsMap = Record<string, Record<string, string>>;

export type HfSectionBundle = {
    default: HeaderFooterSection;
    firstPage: HeaderFooterSection;
    lastPage: HeaderFooterSection;
    oddPage: HeaderFooterSection;
    evenPage: HeaderFooterSection;
};

const SECTION_KEYS = ['default', 'firstPage', 'lastPage', 'oddPage', 'evenPage'] as const;
const FIELD_KEYS: (keyof HeaderFooterSection)[] = [
    'headerLeft',
    'headerCenter',
    'headerRight',
    'footerLeft',
    'footerCenter',
    'footerRight',
];

function estimateDataUrlBytes(dataUrl: string): number {
    const comma = dataUrl.indexOf(',');
    if (comma < 0) return dataUrl.length;
    const base64 = dataUrl.slice(comma + 1);
    return Math.floor((base64.length * 3) / 4);
}

function assetIdForDataUrl(dataUrl: string): string {
    let hash = 0;
    for (let i = 0; i < dataUrl.length; i++) {
        hash = (hash * 31 + dataUrl.charCodeAt(i)) | 0;
    }
    return `img${Math.abs(hash).toString(36)}`;
}

export function externalizeHtmlImages(
    html: string,
    bucket: Record<string, string>,
): string {
    if (!html || !html.includes('data:image/')) return html;

    return html.replace(DATA_IMAGE_SRC_RE, (_match, quote: string, dataUrl: string) => {
        const bytes = estimateDataUrlBytes(dataUrl);
        if (bytes > HF_PRESET_MAX_IMAGE_BYTES) {
            console.warn('[hf] skipping oversized preset image', bytes);
            return `src=${quote}${dataUrl}${quote}`;
        }

        let assetId = assetIdForDataUrl(dataUrl);
        if (bucket[assetId] && bucket[assetId] !== dataUrl) {
            assetId = `${assetId}-${Math.random().toString(36).slice(2, 6)}`;
        }
        bucket[assetId] = dataUrl;
        return `src=${quote}${HF_ASSET_SRC_PREFIX}${assetId}${quote}`;
    });
}

export function hydrateHtmlImages(html: string, bucket: Record<string, string> | undefined): string {
    if (!html || !html.includes(HF_ASSET_SRC_PREFIX)) return html;
    if (!bucket || Object.keys(bucket).length === 0) return html;

    return html.replace(ASSET_SRC_RE, (match, quote: string, assetId: string) => {
        const dataUrl = bucket[assetId];
        if (!dataUrl) return match;
        return `src=${quote}${dataUrl}${quote}`;
    });
}

export function externalizeSectionsImages(sections: HfSectionBundle): {
    sections: HfSectionBundle;
    assets: Record<string, string>;
} {
    const assets: Record<string, string> = {};
    const out = {} as HfSectionBundle;

    for (const sk of SECTION_KEYS) {
        const sec = { ...sections[sk] };
        for (const fk of FIELD_KEYS) {
            sec[fk] = externalizeHtmlImages(sec[fk] ?? '', assets);
        }
        out[sk] = sec;
    }

    return { sections: out, assets };
}

export function hydrateSectionsImages(
    sections: HfSectionBundle,
    assets: Record<string, string> | undefined,
): HfSectionBundle {
    const out = {} as HfSectionBundle;

    for (const sk of SECTION_KEYS) {
        const sec = { ...sections[sk] };
        for (const fk of FIELD_KEYS) {
            sec[fk] = hydrateHtmlImages(sec[fk] ?? '', assets);
        }
        out[sk] = sec;
    }

    return out;
}

export function loadPresetAssetsStore(): HfPresetAssetsMap {
    try {
        const raw = localStorage.getItem(HF_PRESET_ASSETS_LS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as HfPresetAssetsMap;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

export function savePresetAssetsStore(store: HfPresetAssetsMap): boolean {
    try {
        localStorage.setItem(HF_PRESET_ASSETS_LS_KEY, JSON.stringify(store));
        return true;
    } catch (err) {
        console.error('[hf] failed to persist preset assets', err);
        return false;
    }
}

export function deletePresetAssets(presetId: string): void {
    const store = loadPresetAssetsStore();
    if (!store[presetId]) return;
    delete store[presetId];
    savePresetAssetsStore(store);
}

export function setPresetAssets(presetId: string, assets: Record<string, string>): boolean {
    const store = loadPresetAssetsStore();
    if (Object.keys(assets).length === 0) {
        delete store[presetId];
    } else {
        store[presetId] = assets;
    }
    return savePresetAssetsStore(store);
}

export function getPresetAssets(presetId: string): Record<string, string> {
    return loadPresetAssetsStore()[presetId] ?? {};
}
