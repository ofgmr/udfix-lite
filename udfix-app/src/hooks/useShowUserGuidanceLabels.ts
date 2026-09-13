import { useEffect, useState } from 'react';
import { APP_PREFERENCES_CHANGED_EVENT, type AppPreferences } from '../preferences/appPreferencesTypes';
import { getCachedAppPreferences } from '../preferences/appPreferencesClient';
import { readDevGuidanceLabelsPreference } from '../preferences/pushEditorPreferences';

function readInitialGuidanceState(): boolean {
    const cached = getCachedAppPreferences()?.showUserGuidanceLabels;
    if (cached !== undefined) return Boolean(cached);
    return readDevGuidanceLabelsPreference() ?? false;
}

export function useShowUserGuidanceLabels(): boolean {
    const [show, setShow] = useState(readInitialGuidanceState);

    useEffect(() => {
        const handler = (event: Event) => {
            const prefs = (event as CustomEvent<AppPreferences>).detail;
            setShow(Boolean(prefs.showUserGuidanceLabels));
        };
        window.addEventListener(APP_PREFERENCES_CHANGED_EVENT, handler);
        return () => window.removeEventListener(APP_PREFERENCES_CHANGED_EVENT, handler);
    }, []);

    return show;
}
