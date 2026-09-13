export type TelemetryConsent = 'unknown' | 'opted_in' | 'opted_out';

export type TelemetryEventCategory = 'lifecycle' | 'feature' | 'error' | 'crash' | 'performance';

export interface TelemetryTrackInput {
    category: TelemetryEventCategory;
    name: string;
    properties?: Record<string, unknown>;
}
