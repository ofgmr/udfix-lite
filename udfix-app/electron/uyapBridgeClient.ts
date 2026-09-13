import { net } from 'electron';

export const UYAP_BRIDGE_ORIGIN = 'http://127.0.0.1:17821';

const BRIDGE_DOWN_MESSAGE = 'Katır bağlı değil. Chrome’da Avukat Portal açık olsun.';

function isBridgeUnreachable(message: string): boolean {
    return /abort|fetch failed|ECONNREFUSED|ERR_CONNECTION|ETIMEDOUT|ENOTFOUND/i.test(message);
}

function bridgeFailureMessage(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);
    return isBridgeUnreachable(message) ? BRIDGE_DOWN_MESSAGE : message;
}

export type UyapWalkJob = 'katir' | 'hesap' | 'detail' | 'inventory' | 'evrak' | 'download';

export type UyapWalkProgress = {
    phase?: string;
    current?: number;
    total?: number;
    file_number?: string;
    job?: UyapWalkJob;
    result?: string;
    message?: string;
    level?: 'info' | 'warn' | 'error';
};

export type UyapWalkRecent = {
    file_number: string;
    result?: string;
    at?: string;
};

export type UyapWalkLogEvent = {
    at: string;
    level?: 'info' | 'warn' | 'error' | string;
    message: string;
    job?: UyapWalkJob | string | null;
    file_number?: string | null;
    phase?: string | null;
};

export type UyapLastWalk = {
    ok?: boolean;
    started?: boolean;
    finished?: boolean;
    stopped?: boolean;
    preempted?: boolean;
    error?: string;
    warning?: string;
    lawyer?: string;
    at?: string;
    job?: UyapWalkJob;
    class?: 'interactive' | 'background';
    scheduled?: boolean;
    dosyaNo?: string | null;
    stats?: Record<string, unknown>;
    progress?: UyapWalkProgress | null;
    recent?: UyapWalkRecent[];
    events?: UyapWalkLogEvent[];
};

export type UyapBridgeStatus = {
    up: boolean;
    sessionReady: boolean;
    sessionHost: string | null;
    sessionCookieCount: number;
    walkRunning: boolean;
    scanningQuietly?: boolean;
    lastWalk: UyapLastWalk | null;
    lastInteractiveWalk?: UyapLastWalk | null;
    ingestCount: number;
    scheduleEnabled?: boolean;
    lastEvrakScanAt?: string | null;
    catalogCoverage?: string | null;
    error?: string;
};

export type UyapWalkStartPayload = {
    job?: UyapWalkJob;
    dosya?: string;
    downloadNew?: boolean;
    hesap?: boolean;
    keys?: string[];
    stale?: boolean;
    preview?: boolean;
    force?: boolean;
    destDir?: string;
    interactive?: boolean;
};

async function bridgeFetch(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const url = `${UYAP_BRIDGE_ORIGIN}${path}`;
    try {
        return await net.fetch(url, {
            method: init?.method,
            headers: init?.headers as Record<string, string> | undefined,
            body: typeof init?.body === 'string' ? init.body : undefined,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
}

function emptyStatus(error: string): UyapBridgeStatus {
    return {
        up: false,
        sessionReady: false,
        sessionHost: null,
        sessionCookieCount: 0,
        walkRunning: false,
        lastWalk: null,
        lastInteractiveWalk: null,
        scanningQuietly: false,
        ingestCount: 0,
        error,
    };
}

export async function fetchUyapBridgeStatus(): Promise<UyapBridgeStatus> {
    try {
        const res = await bridgeFetch('/health');
        if (!res.ok) return emptyStatus(BRIDGE_DOWN_MESSAGE);
        const body = (await res.json()) as Record<string, unknown>;
        return {
            up: true,
            sessionReady: body.sessionReady === true,
            sessionHost: typeof body.sessionHost === 'string' ? body.sessionHost : null,
            sessionCookieCount: Number(body.sessionCookieCount) || 0,
            walkRunning: body.walkRunning === true,
            scanningQuietly: body.scanningQuietly === true,
            lastWalk: (body.lastWalk as UyapLastWalk) || null,
            lastInteractiveWalk: (body.lastInteractiveWalk as UyapLastWalk) || null,
            ingestCount: Number(body.ingestCount) || 0,
            scheduleEnabled: body.scheduleEnabled !== false,
            lastEvrakScanAt: typeof body.lastEvrakScanAt === 'string' ? body.lastEvrakScanAt : null,
            catalogCoverage: typeof body.catalogCoverage === 'string' ? body.catalogCoverage : null,
        };
    } catch (err) {
        return emptyStatus(bridgeFailureMessage(err));
    }
}

export async function startUyapBridgeWalk(
    payload: UyapWalkStartPayload = {},
): Promise<{ ok: boolean; error?: string; started?: boolean }> {
    try {
        const res = await bridgeFetch('/v1/walk', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify({
                verbose: true,
                job: payload.job,
                dosya: payload.dosya,
                ...(payload.downloadNew ? { downloadNew: true } : {}),
                ...(payload.hesap ? { hesap: true } : {}),
                ...(payload.keys?.length ? { keys: payload.keys } : {}),
                ...(payload.stale ? { stale: true } : {}),
                ...(payload.preview ? { preview: true } : {}),
                ...(payload.force ? { force: true } : {}),
                ...(payload.destDir ? { destDir: payload.destDir } : {}),
                interactive: true,
            }),
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok) return { ok: false, error: body.error || BRIDGE_DOWN_MESSAGE };
        return { ok: true, started: true };
    } catch (err) {
        return { ok: false, error: bridgeFailureMessage(err) };
    }
}

export async function stopUyapBridgeWalk(): Promise<{ ok: boolean; error?: string }> {
    try {
        const res = await bridgeFetch('/v1/walk/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: '{}',
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok) return { ok: false, error: body.error || BRIDGE_DOWN_MESSAGE };
        return { ok: true };
    } catch (err) {
        return { ok: false, error: bridgeFailureMessage(err) };
    }
}

export async function setUyapBridgeSchedule(
    enabled: boolean,
): Promise<{ ok: boolean; enabled?: boolean; lastEvrakScanAt?: string | null; error?: string }> {
    try {
        const res = await bridgeFetch('/v1/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify({ enabled }),
        });
        const body = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            enabled?: boolean;
            lastEvrakScanAt?: string | null;
            error?: string;
        };
        if (!res.ok) return { ok: false, error: body.error || BRIDGE_DOWN_MESSAGE };
        return { ok: true, enabled: body.enabled, lastEvrakScanAt: body.lastEvrakScanAt };
    } catch (err) {
        return { ok: false, error: bridgeFailureMessage(err) };
    }
}
