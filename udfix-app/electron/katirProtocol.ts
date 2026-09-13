import { app } from 'electron';
import { activateKatirAndMaybeUpgrade } from './entitlements';
import { parseKatirReadyUrl, UDFIX_PROTOCOL } from './katirProtocolParse';

const PROTOCOL = UDFIX_PROTOCOL;

export function registerKatirProtocolClient(): void {
    if (process.defaultApp && process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [process.argv[1]]);
        return;
    }
    app.setAsDefaultProtocolClient(PROTOCOL);
}

export function collectProtocolUrlsFromArgv(argv: string[] = process.argv): string[] {
    return argv.filter((arg) => arg.startsWith(`${PROTOCOL}://`));
}

export async function handleKatirProtocolUrl(raw: string, userDataPath: string): Promise<void> {
    const payload = parseKatirReadyUrl(raw);
    if (!payload) return;
    await activateKatirAndMaybeUpgrade(userDataPath, payload);
}

const queuedUrls: string[] = [];
let readyUserDataPath: string | null = null;

export function queueKatirProtocolUrl(url: string): void {
    if (readyUserDataPath) {
        void handleKatirProtocolUrl(url, readyUserDataPath);
        return;
    }
    queuedUrls.push(url);
}

export function attachKatirProtocolQueue(userDataPath: string): void {
    readyUserDataPath = userDataPath;
    const extra = collectProtocolUrlsFromArgv();
    const pending = [...queuedUrls, ...extra];
    queuedUrls.length = 0;
    for (const url of pending) {
        void handleKatirProtocolUrl(url, userDataPath);
    }
}

export function bindKatirProtocolEvents(): void {
    registerKatirProtocolClient();
    app.on('open-url', (event, url) => {
        event.preventDefault();
        queueKatirProtocolUrl(url);
    });
}

export { parseKatirReadyUrl } from './katirProtocolParse';
