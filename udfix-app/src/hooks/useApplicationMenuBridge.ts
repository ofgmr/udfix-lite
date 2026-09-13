import { useEffect } from 'react';
import { useLayoutStore } from '../stores/useLayoutStore';
import {
    APP_PREFERENCES_CHANGED_EVENT,
    NOTIFICATIONS_CHANGED_EVENT,
    type AppMenuAction,
    type AppPreferences,
} from '../preferences/appPreferencesTypes';
import {
    loadAppPreferencesFromMain,
    migrateLegacyPreferencesToMain,
} from '../preferences/appPreferencesClient';
import { syncPreferencesToLegacyStorage } from '../preferences/syncPreferencesToLegacy';
import { setTableBubbleMenuEnabled } from '../components/editor/tableBubbleMenuPreference';
import { setFloatingFormatMenuEnabled } from '../components/editor/floatingFormatMenuPreference';

const MENU_CHANNEL = 'app-menu-action';
export const WORKSPACE_ROOT_CHANGED_EVENT = 'nomai-workspace-root-changed';

function dispatchPreferencesChanged(preferences: AppPreferences): void {
    syncPreferencesToLegacyStorage(preferences);
    setTableBubbleMenuEnabled(preferences.tableBubbleEnabled);
    setFloatingFormatMenuEnabled(preferences.floatingFormatMenuEnabled);
    window.dispatchEvent(
        new CustomEvent(APP_PREFERENCES_CHANGED_EVENT, { detail: preferences }),
    );
    if (preferences.workspaceRoot) {
        window.dispatchEvent(
            new CustomEvent(WORKSPACE_ROOT_CHANGED_EVENT, {
                detail: { root: preferences.workspaceRoot },
            }),
        );
    }
}

function subscribeMenuChannel(handler: (action: AppMenuAction) => void): (() => void) | undefined {
    if (!window.electron?.on) return undefined;

    const listener = (...args: unknown[]) => {
        const payload = args[0] as AppMenuAction;
        if (payload && typeof payload === 'object' && 'type' in payload) {
            handler(payload);
        }
    };

    window.electron.on(MENU_CHANNEL, listener);
    return () => window.electron?.off?.(MENU_CHANNEL, listener);
}

export function useApplicationMenuBridge(): void {
    useEffect(() => {
        let cancelled = false;

        void (async () => {
            try {
                const prefs = await migrateLegacyPreferencesToMain();
                if (!cancelled) dispatchPreferencesChanged(prefs);
            } catch {
                try {
                    const prefs = await loadAppPreferencesFromMain();
                    if (!cancelled) dispatchPreferencesChanged(prefs);
                } catch {
                    /* Vite-only dev without Electron */
                }
            }
        })();

        const off = subscribeMenuChannel((action) => {
            switch (action.type) {
                case 'preferences-changed':
                    dispatchPreferencesChanged(action.preferences);
                    return;
                case 'close-active-tab':
                    useLayoutStore.getState().closeActiveTab();
                    return;
                case 'show-file-explorer':
                    useLayoutStore.getState().openExplorerPanel();
                    return;
                case 'open-workspace-recent':
                    useLayoutStore.getState().openExplorerPanel();
                    window.dispatchEvent(
                        new CustomEvent(WORKSPACE_ROOT_CHANGED_EVENT, {
                            detail: { root: action.path },
                        }),
                    );
                    return;
                case 'open-udf-file':
                    useLayoutStore.getState().closeExplorerPanel();
                    useLayoutStore.getState().requestUdfOpenChoice({
                        fsPath: action.path,
                        viewerUrl: action.path,
                        name: action.name,
                    });
                    return;
                case 'open-calendar':
                    useLayoutStore.getState().openRightPanel('calendar');
                    return;
                case 'notifications-changed':
                    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
                    return;
                default: {
                    const _never: never = action;
                    return _never;
                }
            }
        });

        return () => {
            cancelled = true;
            off?.();
        };
    }, []);
}
