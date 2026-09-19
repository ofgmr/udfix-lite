import type { UyapDashboardStats } from '../services/dataService';

export const KATIR_UPGRADE_URL = 'https://udfiix.app/indir#katir';

export type EntitlementPhase =
    | 'anonymous'
    | 'authenticated'
    | 'entitled'
    | 'grace'
    | 'expired'
    | 'revoked';

export type AppEntitlements = {
    edition: 'lite' | 'katir';
    katirLive: boolean;
    accountPlan: 'lite' | 'katir';
    upgradePending: boolean;
    hasAccountToken: boolean;
    accountEmail: string | null;
    signedIn: boolean;
    phase: EntitlementPhase;
    periodEndsAt: string | null;
    graceEndsAt: string | null;
    reason: string;
    source: string;
    seatBound: boolean;
    boundLawyerName: string | null;
};

export function dashboardHasKatirCorpus(
    dash: UyapDashboardStats | null,
    recentCount = 0,
): boolean {
    if (recentCount > 0) return true;
    if (!dash) return false;
    return (dash.uyapLinked ?? 0) > 0 || (dash.evrakCards ?? 0) > 0;
}
