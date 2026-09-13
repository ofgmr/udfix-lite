export type AutosaveDebounceMs = 0 | 2000 | 5000 | 10000;

export type TelemetryConsent = 'unknown' | 'opted_in' | 'opted_out';

export interface AppPreferences {
    showRuler: boolean;
    tableBubbleEnabled: boolean;
    floatingFormatMenuEnabled: boolean;
    showUserGuidanceLabels: boolean;
    autosaveDebounceMs: AutosaveDebounceMs;
    workspaceRoot: string | null;
    workspaceRecents: string[];
    telemetryConsent: TelemetryConsent;
    menuBarTrayEnabled: boolean;
    udfDefaultHandlerEnabled: boolean;
    udfDefaultHandlerPromptDismissed: boolean;
    uyapEvrakDownloadDir: string | null;
}

export const APP_PREFERENCES_CHANGED_EVENT = 'udfix-app-preferences-changed';
export const NOTIFICATIONS_CHANGED_EVENT = 'udfix-notifications-changed';

export type AppMenuAction =
    | { type: 'preferences-changed'; preferences: AppPreferences }
    | { type: 'show-file-explorer' }
    | { type: 'open-workspace-recent'; path: string }
    | { type: 'close-active-tab' }
    | { type: 'open-udf-file'; path: string; name: string }
    | { type: 'open-calendar' }
    | { type: 'notifications-changed' };
