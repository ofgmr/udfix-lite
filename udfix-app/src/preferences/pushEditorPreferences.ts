import {
    APP_PREFERENCES_CHANGED_EVENT,
    type AppPreferences,
} from './appPreferencesTypes';
import { mergeCachedAppPreferences, patchAppPreferencesOnMain } from './appPreferencesClient';

const GUIDANCE_LABELS_KEY = 'udfix-show-user-guidance-labels';

function dispatchPreferencesChanged(preferences: AppPreferences): void {
    window.dispatchEvent(
        new CustomEvent(APP_PREFERENCES_CHANGED_EVENT, { detail: preferences }),
    );
}

function patchLocalDevPreferences(
    patch: Partial<Pick<AppPreferences, 'showUserGuidanceLabels'>>,
): AppPreferences {
    if (typeof localStorage !== 'undefined' && patch.showUserGuidanceLabels !== undefined) {
        localStorage.setItem(GUIDANCE_LABELS_KEY, String(patch.showUserGuidanceLabels));
    }
    return mergeCachedAppPreferences(patch);
}

/** Persist a preference toggle from in-app UI and sync the macOS menu checkboxes. */
export async function pushEditorPreferenceToggle(
    patch: Partial<
        Pick<
            AppPreferences,
            'showRuler' | 'tableBubbleEnabled' | 'floatingFormatMenuEnabled' | 'showUserGuidanceLabels'
        >
    >,
): Promise<void> {
    try {
        const prefs = await patchAppPreferencesOnMain(patch);
        dispatchPreferencesChanged(prefs);
    } catch {
        if (patch.showUserGuidanceLabels !== undefined) {
            dispatchPreferencesChanged(patchLocalDevPreferences(patch));
        }
    }
}

export function readDevGuidanceLabelsPreference(): boolean | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(GUIDANCE_LABELS_KEY);
    if (raw === null) return null;
    return raw === 'true';
}
