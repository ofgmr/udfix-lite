import type { AppPreferences } from './appPreferencesTypes';

const SHOW_RULER_KEY = 'nomai-show-ruler';
const TABLE_BUBBLE_KEY = 'udfix-table-bubble-enabled';
const FLOATING_FORMAT_KEY = 'udfix-floating-format-enabled';
const WORKSPACE_ROOT_KEY = 'nomai-workspace-root';

/** Mirror app preferences into keys existing editor/explorer code reads. */
export function syncPreferencesToLegacyStorage(prefs: AppPreferences): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SHOW_RULER_KEY, String(prefs.showRuler));
    localStorage.setItem(TABLE_BUBBLE_KEY, String(prefs.tableBubbleEnabled));
    localStorage.setItem(FLOATING_FORMAT_KEY, String(prefs.floatingFormatMenuEnabled));
    if (prefs.workspaceRoot) {
        localStorage.setItem(WORKSPACE_ROOT_KEY, prefs.workspaceRoot);
    }
}

export function readLegacyPreferencePatch(): Partial<AppPreferences> | null {
    if (typeof localStorage === 'undefined') return null;
    const patch: Partial<AppPreferences> = {};
    let hasAny = false;

    const ruler = localStorage.getItem(SHOW_RULER_KEY);
    if (ruler !== null) {
        patch.showRuler = ruler !== 'false';
        hasAny = true;
    }

    const bubble = localStorage.getItem(TABLE_BUBBLE_KEY);
    if (bubble !== null) {
        patch.tableBubbleEnabled = bubble !== 'false';
        hasAny = true;
    }

    const floating = localStorage.getItem(FLOATING_FORMAT_KEY);
    if (floating !== null) {
        patch.floatingFormatMenuEnabled = floating !== 'false';
        hasAny = true;
    }

    const root = localStorage.getItem(WORKSPACE_ROOT_KEY);
    if (root) {
        patch.workspaceRoot = root;
        hasAny = true;
    }

    return hasAny ? patch : null;
}
