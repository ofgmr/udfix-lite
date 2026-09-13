import { BrowserWindow, shell } from 'electron';
import { activateKatirAccount, loadAccount, publicAccountView, type UdixAccount } from './accountSession';
import { isKatirRuntimeEnabled, resolvePackagedEdition, type UdixEdition } from './appEdition';
import { registerIpcHandler } from './ipcAllowlist';
import { applyAccountUpdateFeed, checkForAppUpdates } from './updateService';

export type AppEntitlements = {
    edition: UdixEdition;
    katirLive: boolean;
    accountPlan: 'lite' | 'katir';
    upgradePending: boolean;
    hasAccountToken: boolean;
    accountEmail: string | null;
};

export const ENTITLEMENTS_EVENT = 'app-entitlements-changed';
export const KATIR_LIVE_LOCKED_MESSAGE = 'Katır canlı yolu bu sürümde kapalı.';
export const KATIR_UPGRADE_URL = 'https://udfiix.app/indir#katir';

const ALLOWED_EXTERNAL_ORIGINS = new Set(['https://udfiix.app', 'https://www.udfiix.app']);

let entitlementsUserDataPath = '';

export function snapshotEntitlements(userDataPath = entitlementsUserDataPath): AppEntitlements {
    const account = userDataPath ? loadAccount(userDataPath) : ({ plan: 'lite', email: null, token: null, updatedAt: null } as UdixAccount);
    const katirLive = isKatirRuntimeEnabled();
    const edition = katirLive ? 'katir' : resolvePackagedEdition();
    return {
        edition,
        katirLive,
        accountPlan: account.plan,
        upgradePending: account.plan === 'katir' && !katirLive,
        hasAccountToken: Boolean(account.token),
        accountEmail: account.email,
    };
}

function broadcastEntitlements(): void {
    const payload = snapshotEntitlements();
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
            win.webContents.send(ENTITLEMENTS_EVENT, payload);
        }
    }
}

function isAllowedExternalUrl(raw: string): boolean {
    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:') return false;
        return ALLOWED_EXTERNAL_ORIGINS.has(`${url.protocol}//${url.host}`);
    } catch {
        return false;
    }
}

export async function activateKatirAndMaybeUpgrade(
    userDataPath: string,
    payload: { token: string; email?: string | null },
): Promise<{ ok: boolean; error?: string; entitlements?: AppEntitlements }> {
    const result = activateKatirAccount(userDataPath, payload);
    if (!result.ok) return { ok: false, error: result.error };
    applyAccountUpdateFeed(userDataPath);
    broadcastEntitlements();
    if (!isKatirRuntimeEnabled()) {
        await checkForAppUpdates({ manual: true });
    }
    return { ok: true, entitlements: snapshotEntitlements(userDataPath) };
}

export function registerEntitlementHandlers(userDataPath: string): void {
    entitlementsUserDataPath = userDataPath;
    registerIpcHandler('app-entitlements-get', () => snapshotEntitlements(userDataPath));
    registerIpcHandler('app-account-get', () => publicAccountView(loadAccount(userDataPath)));
    registerIpcHandler('app-account-activate-katir', (_event, payload?: { token?: string; email?: string | null }) => {
        const token = typeof payload?.token === 'string' ? payload.token : '';
        return activateKatirAndMaybeUpgrade(userDataPath, {
            token,
            email: payload?.email ?? null,
        });
    });
    registerIpcHandler('app-katir-upgrade-start', async () => {
        const account = loadAccount(userDataPath);
        if (account.plan !== 'katir' || !account.token) {
            return { ok: false as const, error: 'Katır hesabı yok.' };
        }
        applyAccountUpdateFeed(userDataPath);
        const snapshot = await checkForAppUpdates({ manual: true });
        return { ok: true as const, update: snapshot };
    });
    registerIpcHandler('app-open-external-url', async (_event, raw?: string) => {
        const href = typeof raw === 'string' ? raw.trim() : '';
        if (!href || !isAllowedExternalUrl(href)) {
            return { ok: false as const, error: 'Adres açılamadı.' };
        }
        await shell.openExternal(href);
        return { ok: true as const };
    });
}

export { publicAccountView };
