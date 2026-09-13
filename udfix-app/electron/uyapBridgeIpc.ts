import { app } from 'electron';
import { isKatirRuntimeEnabled } from './appEdition';
import { KATIR_LIVE_LOCKED_MESSAGE } from './entitlements';
import { registerIpcHandler } from './ipcAllowlist';
import {
    fetchUyapBridgeStatus,
    setUyapBridgeSchedule,
    startUyapBridgeWalk,
    stopUyapBridgeWalk,
    type UyapWalkStartPayload,
} from './uyapBridgeClient';

function requireKatirLive(): { ok: false; error: string } | null {
    if (isKatirRuntimeEnabled()) return null;
    return { ok: false, error: KATIR_LIVE_LOCKED_MESSAGE };
}

export function registerUyapBridgeHandlers(): void {
    registerIpcHandler('uyap-bridge-status', () => fetchUyapBridgeStatus());
    registerIpcHandler('uyap-bridge-walk-start', (_event, payload?: UyapWalkStartPayload) => {
        const locked = requireKatirLive();
        if (locked) return locked;
        return startUyapBridgeWalk(payload || {});
    });
    registerIpcHandler('uyap-bridge-walk-stop', () => {
        const locked = requireKatirLive();
        if (locked) return locked;
        return stopUyapBridgeWalk();
    });
    registerIpcHandler('uyap-bridge-schedule-set', (_event, enabled?: boolean) => {
        const locked = requireKatirLive();
        if (locked) return locked;
        return setUyapBridgeSchedule(enabled !== false);
    });
}
