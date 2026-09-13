import type { AppPreferences } from './appPreferencesTypes';
import { readLegacyPreferencePatch, syncPreferencesToLegacyStorage } from './syncPreferencesToLegacy';
import { getElectronInvoke } from '../utils/electronBridge';

let cached: AppPreferences | null = null;

const invoke = async <T>(channel: string, ...args: unknown[]): Promise<T> =>
    getElectronInvoke()(channel, ...args) as Promise<T>;

export async function loadAppPreferencesFromMain(): Promise<AppPreferences> {
    const prefs = await invoke<AppPreferences>('app-preferences-get');
    cached = prefs;
    syncPreferencesToLegacyStorage(prefs);
    return prefs;
}

export async function migrateLegacyPreferencesToMain(): Promise<AppPreferences> {
    const legacy = readLegacyPreferencePatch();
    if (!legacy) return loadAppPreferencesFromMain();
    const prefs = await invoke<AppPreferences>('app-preferences-patch', legacy);
    cached = prefs;
    syncPreferencesToLegacyStorage(prefs);
    return prefs;
}

export async function patchAppPreferencesOnMain(
    patch: Partial<AppPreferences>,
): Promise<AppPreferences> {
    const prefs = await invoke<AppPreferences>('app-preferences-patch', patch);
    cached = prefs;
    syncPreferencesToLegacyStorage(prefs);
    return prefs;
}

export function getCachedAppPreferences(): AppPreferences | null {
    return cached;
}

export function mergeCachedAppPreferences(patch: Partial<AppPreferences>): AppPreferences {
    const base: AppPreferences = cached ?? {
        showRuler: true,
        tableBubbleEnabled: true,
        floatingFormatMenuEnabled: true,
        showUserGuidanceLabels: false,
        autosaveDebounceMs: 2000,
        workspaceRoot: null,
        workspaceRecents: [],
        telemetryConsent: 'opted_in',
        menuBarTrayEnabled: true,
        udfDefaultHandlerEnabled: false,
        udfDefaultHandlerPromptDismissed: false,
        uyapEvrakDownloadDir: null,
    };
    cached = { ...base, ...patch };
    return cached;
}
