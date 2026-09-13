import { app } from 'electron';
import fs from 'fs';
import path from 'path';

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
    /** macOS menu bar tray icon (UDF quick toggle + klasör kısayolları). */
    menuBarTrayEnabled: boolean;
    /** User opted in / system reports UDFIX as default .udf handler. */
    udfDefaultHandlerEnabled: boolean;
    /** First-launch “varsayılan uygulama” prompt dismissed. */
    udfDefaultHandlerPromptDismissed: boolean;
    /** Last folder the user chose for UYAP evrak İndir (not a secret). */
    uyapEvrakDownloadDir: string | null;
}

const PREFS_FILENAME = 'app-preferences.json';
const MAX_WORKSPACE_RECENTS = 5;

const DEFAULT_PREFERENCES: AppPreferences = {
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

function prefsPath(): string {
    return path.join(app.getPath('userData'), PREFS_FILENAME);
}

function normalizeRecents(recents: unknown): string[] {
    if (!Array.isArray(recents)) return [];
    const out: string[] = [];
    for (const item of recents) {
        if (typeof item !== 'string' || !item.trim()) continue;
        const p = item.trim();
        if (!out.includes(p)) out.push(p);
        if (out.length >= MAX_WORKSPACE_RECENTS) break;
    }
    return out;
}

export function loadAppPreferences(): AppPreferences {
    try {
        const raw = fs.readFileSync(prefsPath(), 'utf8');
        const parsed = JSON.parse(raw) as Partial<AppPreferences>;
        const debounce = parsed.autosaveDebounceMs as number | undefined;
        const migratedDebounce = debounce === 1000 ? 2000 : debounce;
        const autosaveDebounceMs: AutosaveDebounceMs =
            migratedDebounce === 0 ||
            migratedDebounce === 2000 ||
            migratedDebounce === 5000 ||
            migratedDebounce === 10000
                ? migratedDebounce
                : DEFAULT_PREFERENCES.autosaveDebounceMs;

        const telemetryConsent =
            parsed.telemetryConsent === 'opted_out'
                ? 'opted_out'
                : parsed.telemetryConsent === 'opted_in'
                  ? 'opted_in'
                  : DEFAULT_PREFERENCES.telemetryConsent;

        return {
            showRuler: parsed.showRuler !== false,
            tableBubbleEnabled: parsed.tableBubbleEnabled !== false,
            floatingFormatMenuEnabled: parsed.floatingFormatMenuEnabled !== false,
            showUserGuidanceLabels: parsed.showUserGuidanceLabels === true,
            autosaveDebounceMs,
            workspaceRoot: typeof parsed.workspaceRoot === 'string' ? parsed.workspaceRoot : null,
            workspaceRecents: normalizeRecents(parsed.workspaceRecents),
            telemetryConsent,
            menuBarTrayEnabled: parsed.menuBarTrayEnabled !== false,
            udfDefaultHandlerEnabled: parsed.udfDefaultHandlerEnabled === true,
            udfDefaultHandlerPromptDismissed: parsed.udfDefaultHandlerPromptDismissed === true,
            uyapEvrakDownloadDir:
                typeof parsed.uyapEvrakDownloadDir === 'string' && parsed.uyapEvrakDownloadDir.trim()
                    ? parsed.uyapEvrakDownloadDir.trim()
                    : null,
        };
    } catch {
        return { ...DEFAULT_PREFERENCES, workspaceRoot: null, workspaceRecents: [] };
    }
}

export function saveAppPreferences(prefs: AppPreferences): void {
    const dir = app.getPath('userData');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
        prefsPath(),
        JSON.stringify(
            {
                ...prefs,
                workspaceRecents: normalizeRecents(prefs.workspaceRecents),
            },
            null,
            2,
        ),
        'utf8',
    );
}

function normalizeAutosaveDebounceMs(raw: unknown): AutosaveDebounceMs | undefined {
    const migrated = typeof raw === 'number' && raw === 1000 ? 2000 : raw;
    if (migrated === 0 || migrated === 2000 || migrated === 5000 || migrated === 10000) {
        return migrated;
    }
    return undefined;
}

export function patchAppPreferences(patch: Partial<AppPreferences>): AppPreferences {
    const next = { ...loadAppPreferences(), ...patch };
    const debounce = normalizeAutosaveDebounceMs(next.autosaveDebounceMs);
    if (debounce !== undefined) {
        next.autosaveDebounceMs = debounce;
    }
    if (patch.workspaceRecents) {
        next.workspaceRecents = normalizeRecents(patch.workspaceRecents);
    }
    saveAppPreferences(next);
    return next;
}

export function pushWorkspaceRecent(folderPath: string): string[] {
    const prefs = loadAppPreferences();
    const recents = [folderPath, ...prefs.workspaceRecents.filter((p) => p !== folderPath)].slice(
        0,
        MAX_WORKSPACE_RECENTS,
    );
    patchAppPreferences({ workspaceRecents: recents, workspaceRoot: folderPath });
    return recents;
}

export { MAX_WORKSPACE_RECENTS, DEFAULT_PREFERENCES };
