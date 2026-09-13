export type TelemetryConsent = 'unknown' | 'opted_in' | 'opted_out';

export type TelemetryEventCategory = 'lifecycle' | 'feature' | 'error' | 'crash' | 'performance';

export interface TelemetryEvent {
    id: string;
    ts: number;
    category: TelemetryEventCategory;
    name: string;
    properties?: Record<string, string | number | boolean | null>;
}

export interface TelemetryBatchPayload {
    schemaVersion: 1;
    sessionId: string;
    installId: string;
    appVersion: string;
    platform: NodeJS.Platform;
    osRelease: string;
    locale: string;
    sentAt: number;
    events: TelemetryEvent[];
}

export interface TelemetryTrackInput {
    category: TelemetryEventCategory;
    name: string;
    properties?: Record<string, unknown>;
}
