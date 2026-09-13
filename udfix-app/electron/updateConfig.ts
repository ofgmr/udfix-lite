import { app } from 'electron';
import { loadAccount } from './accountSession';
import { isKatirRuntimeEnabled, resolvePackagedEdition } from './appEdition';

export const LITE_UPDATE_FEED_URL = 'https://releases.udfix.com/lite/macos/';
export const KATIR_UPDATE_FEED_URL = 'https://releases.udfix.com/katir/macos/';

/** @deprecated alias — Lite public feed */
export const DEFAULT_UPDATE_FEED_URL = LITE_UPDATE_FEED_URL;

export const UPDATE_CHECK_DELAY_MS = 30_000;
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function isMasEdition(): boolean {
    const proc = process as NodeJS.Process & { mas?: boolean };
    return proc.mas === true || process.env.UDFIX_EDITION === 'mas';
}

export function isUpdateEnabled(): boolean {
    if (!app.isPackaged) return false;
    if (isMasEdition()) return false;
    if (process.platform !== 'darwin') return false;
    return true;
}

function withSlash(url: string): string {
    return url.endsWith('/') ? url : `${url}/`;
}

export type UpdateFeedSelection = {
    url: string;
    requestHeaders?: Record<string, string>;
};

/**
 * Lite binary + lite account → public Lite feed.
 * Katır account (upgrade) or Katır binary → authenticated Katır feed.
 * UDFIX_UPDATE_FEED_URL still overrides the URL (ops); headers still attach when a token exists.
 */
export function resolveUpdateFeed(userDataPath?: string): UpdateFeedSelection {
    const fromEnv = process.env.UDFIX_UPDATE_FEED_URL?.trim();
    const account = userDataPath ? loadAccount(userDataPath) : null;
    const wantKatir =
        isKatirRuntimeEnabled() ||
        account?.plan === 'katir' ||
        resolvePackagedEdition() === 'katir';
    const base = fromEnv
        ? fromEnv
        : wantKatir
          ? KATIR_UPDATE_FEED_URL
          : LITE_UPDATE_FEED_URL;
    const headers =
        wantKatir && account?.token
            ? { Authorization: `Bearer ${account.token}` }
            : undefined;
    return { url: withSlash(base), requestHeaders: headers };
}

export function resolveUpdateFeedUrl(userDataPath?: string): string | undefined {
    return resolveUpdateFeed(userDataPath).url;
}
