const PROTOCOL = 'udfix';

export function parseKatirReadyUrl(raw: string): { token: string; email: string | null } | null {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    if (url.protocol !== `${PROTOCOL}:`) return null;
    const host = url.hostname || url.host;
    const path = url.pathname.replace(/^\//, '');
    const action = host || path;
    if (action !== 'katir-ready') return null;
    const token = url.searchParams.get('token')?.trim() || '';
    if (!token) return null;
    const email = url.searchParams.get('email')?.trim() || null;
    return { token, email };
}

export { PROTOCOL as UDFIX_PROTOCOL };
