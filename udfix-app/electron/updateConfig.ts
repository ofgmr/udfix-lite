import { app } from 'electron';

export const LITE_UPDATE_FEED_URL = 'https://releases.udfix.com/lite/macos/';
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

export function resolveUpdateFeed(): UpdateFeedSelection {
    const fromEnv = process.env.UDFIX_UPDATE_FEED_URL?.trim();
    return { url: withSlash(fromEnv || LITE_UPDATE_FEED_URL) };
}

export function resolveUpdateFeedUrl(): string | undefined {
    return resolveUpdateFeed().url;
}
