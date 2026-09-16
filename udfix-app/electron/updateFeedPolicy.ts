/** Packaged builds ignore `UDFIX_UPDATE_FEED_URL` (F-12). Unpackaged may override HTTPS only. */
export function resolveFeedUrlFromEnv(fromEnv: string | undefined, packaged: boolean): string | null {
    const raw = fromEnv?.trim();
    if (!raw || packaged) return null;
    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:') return null;
        return raw;
    } catch {
        return null;
    }
}
