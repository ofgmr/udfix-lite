import type { TelemetryEventCategory } from './telemetryTypes';
import { getElectronInvoke } from '../utils/electronBridge';
import { getCachedAppPreferences } from '../preferences/appPreferencesClient';

let invokeFailed = false;

function isOptedIn(): boolean {
    return getCachedAppPreferences()?.telemetryConsent === 'opted_in';
}

/**
 * Record an anonymized usage event. No-op when telemetry is disabled or Electron is unavailable.
 */
export function trackEvent(
    name: string,
    properties?: Record<string, unknown>,
    category: TelemetryEventCategory = 'feature',
): void {
    if (!isOptedIn() || invokeFailed) return;

    const invoke = getElectronInvoke();
    void invoke('telemetry-track', { category, name, properties }).catch(() => {
        invokeFailed = true;
    });
}

export function trackShortcutUsed(shortcutId: string): void {
    trackEvent('shortcut_used', { shortcutId });
}

export function trackPanelOpened(panelId: string): void {
    trackEvent('panel_opened', { panelId });
}

export function trackExportAction(format: string): void {
    trackEvent('export_action', { format });
}
