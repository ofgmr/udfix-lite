import { app } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isKatirRuntimeEnabled, resolveDevUyapImportEntry, resolvePackagedUyapImportEntry } from './appEdition';
import { fetchUyapBridgeStatus } from './uyapBridgeClient';

const READY_ATTEMPTS = 20;
const READY_GAP_MS = 250;

let child: ChildProcess | null = null;
let stopping = false;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveUyapImportEntry(): string | null {
    if (app.isPackaged) return resolvePackagedUyapImportEntry();
    return resolveDevUyapImportEntry();
}

function resolveBetterSqlite3Path(): string | undefined {
    const unpacked = app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked');
    const candidates = [
        path.join(unpacked, 'node_modules', 'better-sqlite3'),
        path.join(app.getAppPath(), 'node_modules', 'better-sqlite3'),
        path.join(process.cwd(), 'node_modules', 'better-sqlite3'),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate));
}

function appendBridgeLog(userDataPath: string, chunk: string): void {
    try {
        const file = path.join(userDataPath, 'logs', 'katir-bridge.log');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.appendFileSync(file, chunk);
    } catch {
        /* ignore */
    }
}

async function waitUntilBridgeUp(): Promise<boolean> {
    for (let i = 0; i < READY_ATTEMPTS; i += 1) {
        const status = await fetchUyapBridgeStatus();
        if (status.up) return true;
        await sleep(READY_GAP_MS);
    }
    return false;
}

export type EnsureUyapCliBridgeOptions = {
    userDataPath: string;
    dbPath: string;
};

export async function ensureUyapCliBridge(options: EnsureUyapCliBridgeOptions): Promise<void> {
    if (!isKatirRuntimeEnabled()) return;
    if (child && !child.killed) return;

    const already = await fetchUyapBridgeStatus();
    if (already.up) return;

    const entry = resolveUyapImportEntry();
    if (!entry) {
        console.warn('[katir] köprü bu kesimde yok; canlı yol atlandı');
        return;
    }

    const spawnToken = randomBytes(32).toString('hex');
    const betterSqlite3 = resolveBetterSqlite3Path();
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        UDFIX_DB_PATH: options.dbPath,
        UDFIX_KATIR_SPAWN_TOKEN: spawnToken,
        UDFIX_APP_ROOT: app.getAppPath(),
    };
    if (betterSqlite3) env.UDFIX_BETTER_SQLITE3 = betterSqlite3;
    delete env.UDFIX_KATIR_ALLOW_CLI;

    stopping = false;
    child = spawn(process.execPath, [entry, 'bridge', '-v'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });

    child.stdout?.on('data', (buf: Buffer) => appendBridgeLog(options.userDataPath, buf.toString('utf8')));
    child.stderr?.on('data', (buf: Buffer) => appendBridgeLog(options.userDataPath, buf.toString('utf8')));
    child.on('exit', (code, signal) => {
        if (!stopping) console.warn('[katir] köprü çıktı', { code, signal });
        child = null;
    });

    const up = await waitUntilBridgeUp();
    if (!up) console.warn('[katir] köprü /health yanıt vermedi');
}

export function stopUyapCliBridge(): void {
    stopping = true;
    const proc = child;
    child = null;
    if (!proc || proc.killed) return;
    try {
        proc.kill('SIGTERM');
    } catch {
        /* already gone */
    }
    const killer = setTimeout(() => {
        if (!proc.killed) {
            try {
                proc.kill('SIGKILL');
            } catch {
                /* ignore */
            }
        }
    }, 1500);
    killer.unref?.();
}
