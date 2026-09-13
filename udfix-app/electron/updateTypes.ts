export type AppUpdatePhase =
    | 'disabled'
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error';

export interface AppUpdateSnapshot {
    phase: AppUpdatePhase;
    currentVersion: string;
    availableVersion?: string;
    releaseNotes?: string;
    releaseName?: string;
    downloadPercent?: number;
    errorMessage?: string;
    checkedAt?: string;
    /** True when the latest check was initiated from the app menu. */
    triggeredByUser?: boolean;
}

export const UPDATE_EVENT_CHANNEL = 'app-update-event';
