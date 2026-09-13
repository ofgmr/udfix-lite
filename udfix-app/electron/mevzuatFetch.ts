import https from 'https';
import {
    iframeUrl,
    looksLikeMevzuatContent,
    MEVZUAT_TUR_KANUN,
} from './mevzuatParse';

export const MEVZUAT_TERTIPS = [5, 4, 3, 2, 1] as const;

const USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function fetchUrl(url: string, timeoutMs = 25000): Promise<string> {
    return new Promise((resolve, reject) => {
        const req = https.get(
            url,
            {
                headers: {
                    'User-Agent': USER_AGENT,
                    Accept: 'text/html,application/xhtml+xml',
                },
                timeout: timeoutMs,
                rejectUnauthorized: false,
            },
            (res) => {
                const status = res.statusCode ?? 0;
                if (status >= 300 && status < 400 && res.headers.location) {
                    res.resume();
                    const next = new URL(res.headers.location, url).toString();
                    fetchUrl(next, timeoutMs).then(resolve, reject);
                    return;
                }
                if (status < 200 || status >= 300) {
                    res.resume();
                    reject(new Error(`HTTP ${status} for ${url}`));
                    return;
                }
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    resolve(Buffer.concat(chunks).toString('utf8'));
                });
            }
        );
        req.on('timeout', () => {
            req.destroy(new Error(`Timeout after ${timeoutMs}ms: ${url}`));
        });
        req.on('error', reject);
    });
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchInstrumentHtml(
    no: string,
    turCandidates: readonly number[] = [MEVZUAT_TUR_KANUN],
    sleepMs = 0,
): Promise<{ html: string; tertip: number; tur: number }> {
    let lastError: Error | null = null;
    for (const tur of turCandidates) {
        for (const tertip of MEVZUAT_TERTIPS) {
            const url = iframeUrl(no, tertip, tur);
            try {
                const html = await fetchUrl(url);
                if (looksLikeMevzuatContent(html)) {
                    return { html, tertip, tur };
                }
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
            }
            if (sleepMs > 0) await sleep(Math.min(120, sleepMs));
        }
    }
    throw (
        lastError ??
        new Error(
            `No mevzuat HTML for ${no} (tried tur ${turCandidates.join(', ')}, tertip ${MEVZUAT_TERTIPS.join(', ')})`
        )
    );
}

export async function fetchKanunHtml(
    no: string,
    sleepMs = 0,
): Promise<{ html: string; tertip: number }> {
    const { html, tertip } = await fetchInstrumentHtml(no, [MEVZUAT_TUR_KANUN], sleepMs);
    return { html, tertip };
}
