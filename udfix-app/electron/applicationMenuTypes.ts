import type { AppPreferences } from './appPreferences';

export const MENU_CHANNEL = 'app-menu-action';

export type AppMenuAction =
    | { type: 'preferences-changed'; preferences: AppPreferences }
    | { type: 'show-file-explorer' }
    | { type: 'open-workspace-recent'; path: string }
    | { type: 'close-active-tab' }
    | { type: 'open-udf-file'; path: string; name: string }
    | { type: 'open-calendar' }
    | { type: 'notifications-changed' };
