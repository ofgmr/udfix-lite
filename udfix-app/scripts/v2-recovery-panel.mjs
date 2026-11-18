/**
 * Drive the Belge Kurtarma panel: scroll to the oldest visible row and open it.
 * Uses an isolated user-data directory and synthetic rows. This is not the SQL unit test.
 *
 * Run: node scripts/v2-recovery-panel.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = process.env.UDFIX_V2_ARTIFACTS || '/opt/cursor/artifacts';
const PORT = Number(process.env.UDFIX_RECOVERY_CDP_PORT || 9334);
const VITE_PORT = Number(process.env.UDFIX_V2_VITE_PORT || 5173);
const USER_DATA = path.join('/tmp', `udfix-recovery-panel-${process.pid}`);
const OLDEST_IN_WINDOW = 'Kurtarma 0005';
const OLDEST_BODY = 'SENTETIK-0005';
const children = [];

function log(line) {
    console.log(`[recovery-ui] ${line}`);
}

function track(child) {
    children.push(child);
    return child;
}

function stopChildren() {
    for (const child of children) {
        if (child.exitCode != null || child.signalCode) continue;
        try {
            child.kill('SIGTERM');
        } catch {
            /* already gone */
        }
    }
}

async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        try {
            const response = await fetch(url);
            if (response.status < 500) return;
        } catch {
            /* not up */
        }
        await sleep(250);
    }
    throw new Error(`timeout waiting for ${url}`);
}

function run(command, args, extra = {}) {
    const child = track(spawn(command, args, {
        cwd: ROOT,
        env: { ...process.env, ...extra.env },
        stdio: ['ignore', 'pipe', 'pipe'],
    }));
    if (extra.logPath) {
        const stream = fs.createWriteStream(extra.logPath, { flags: 'a' });
        child.stdout?.pipe(stream);
        child.stderr?.pipe(stream);
    }
    return child;
}

function connectCdp(wsUrl) {
    const ws = new WebSocket(wsUrl);
    let nextId = 0;
    const pending = new Map();
    return new Promise((resolve, reject) => {
        ws.addEventListener('error', () => reject(new Error('cdp socket failed')));
        ws.addEventListener('open', () => resolve(api));
        ws.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            if (!message.id || !pending.has(message.id)) return;
            const slot = pending.get(message.id);
            clearTimeout(slot.timer);
            pending.delete(message.id);
            if (message.error) slot.reject(new Error(message.error.message || 'cdp error'));
            else slot.resolve(message.result);
        });
        const api = {
            send(method, params = {}, timeoutMs = 15000) {
                const id = ++nextId;
                return new Promise((resolveSend, rejectSend) => {
                    const timer = setTimeout(() => {
                        pending.delete(id);
                        rejectSend(new Error(`CDP timeout ${method}`));
                    }, timeoutMs);
                    pending.set(id, { resolve: resolveSend, reject: rejectSend, timer });
                    ws.send(JSON.stringify({ id, method, params }));
                });
            },
            close() {
                ws.close();
            },
        };
    });
}

async function evaluate(cdp, expression, timeoutMs = 15000) {
    const result = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
    }, timeoutMs);
    if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'eval failed');
    }
    return result.result?.value;
}

async function launchElectron() {
    const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
    const electronArgs = [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        `--remote-debugging-port=${PORT}`,
        '--remote-debugging-address=127.0.0.1',
        '--remote-allow-origins=*',
        `--user-data-dir=${USER_DATA}`,
        ROOT,
    ];
    const command = process.env.DISPLAY ? electronBin : 'xvfb-run';
    const args = process.env.DISPLAY ? electronArgs : ['-a', electronBin, ...electronArgs];
    return run(command, args, {
        logPath: path.join(ARTIFACTS, 'v2-recovery-electron.log'),
        env: {
            NODE_ENV: 'development',
            UDFIX_KATIR: '0',
            UDFIX_OPEN_DEVTOOLS: '0',
        },
    });
}

async function cdpPage() {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        try {
            const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((response) => response.json());
            const page = list.find((item) => item.type === 'page' && String(item.url || '').includes(String(VITE_PORT)));
            if (page) return connectCdp(page.webSocketDebuggerUrl);
        } catch {
            /* debugger not up */
        }
        await sleep(300);
    }
    throw new Error('CDP page was not published');
}

const report = { ok: false, kind: 'recovery-panel-gui' };

try {
    fs.mkdirSync(ARTIFACTS, { recursive: true });
    fs.rmSync(USER_DATA, { recursive: true, force: true });
    const viteHtml = await fetch(`http://127.0.0.1:${VITE_PORT}/`).then((response) => response.text()).catch(() => '');
    if (!viteHtml.includes('UDFIX')) {
        run('npx', ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'], {
            env: { NODE_ENV: 'development' },
            logPath: path.join(ARTIFACTS, 'v2-recovery-vite.log'),
        });
        await waitForHttp(`http://127.0.0.1:${VITE_PORT}/`, 60_000);
    }

    const electron = await launchElectron();
    const dbPath = path.join(USER_DATA, 'udfix-data', 'udfix.db');
    const dbDeadline = Date.now() + 30_000;
    while (!fs.existsSync(dbPath)) {
        if (Date.now() > dbDeadline) throw new Error('sqlite file was not created');
        await sleep(200);
    }
    electron.kill('SIGTERM');
    const closed = Date.now() + 10_000;
    while (Date.now() < closed) {
        try {
            await fetch(`http://127.0.0.1:${PORT}/json/version`);
            await sleep(200);
        } catch {
            break;
        }
    }

    const seed = spawn(path.join(ROOT, 'node_modules', '.bin', 'electron'), ['scripts/v2-recovery-seed.mjs'], {
        cwd: ROOT,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', UDFIX_RECOVERY_DB: dbPath },
        stdio: 'inherit',
    });
    const seedCode = await new Promise((resolve) => seed.on('exit', (code) => resolve(code ?? 1)));
    if (seedCode !== 0) throw new Error(`seed exit ${seedCode}`);

    await launchElectron();
    const cdp = await cdpPage();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    const readyDeadline = Date.now() + 60_000;
    let opened = false;
    while (Date.now() < readyDeadline) {
        opened = await evaluate(cdp, `(() => {
            const later = [...document.querySelectorAll('button')].find((node) => (node.textContent || '').includes('Şimdi değil'));
            if (later) later.click();
            const yeni = [...document.querySelectorAll('button')].find((node) =>
                (node.getAttribute('aria-label') || '').includes('Yeni Belge'));
            if (yeni) yeni.focus();
            const button = [...document.querySelectorAll('button')].find((node) =>
                (node.getAttribute('aria-label') || node.getAttribute('title') || '').includes('Belge Kurtarma'));
            if (button) button.click();
            return Boolean(document.body.innerText.includes('Belge Kurtarma Merkezi'));
        })()`);
        if (opened) break;
        await sleep(400);
    }
    if (!opened) {
        const labels = await evaluate(cdp, `[...document.querySelectorAll('button')].map((node) => node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || '').slice(0, 30)`);
        throw new Error(`recovery panel did not open; buttons=${JSON.stringify(labels)}`);
    }

    const listed = await evaluate(cdp, `(() => {
        const heading = [...document.querySelectorAll('h3')].find((node) => node.textContent.includes('Belge Kurtarma Merkezi'));
        const root = heading?.closest('div.h-full') || heading?.parentElement?.parentElement;
        const scroller = root?.querySelector('.overflow-y-auto');
        if (!scroller) return { error: 'scroller missing' };
        const titles = [...scroller.querySelectorAll('*')].filter((node) => /^Kurtarma \\d{4}$/.test((node.textContent || '').trim()) && node.children.length === 0);
        return { count: new Set(titles.map((node) => node.textContent.trim())).size, caption: root.innerText.includes('100') };
    })()`);
    if (listed.error) throw new Error(listed.error);
    if (listed.count !== 100) throw new Error(`panel listed ${listed.count} titles, expected 100`);

    const scrolled = await evaluate(cdp, `(() => {
        const heading = [...document.querySelectorAll('h3')].find((node) => node.textContent.includes('Belge Kurtarma Merkezi'));
        const root = heading.closest('div.h-full');
        const scroller = root.querySelector('.overflow-y-auto');
        const title = [...scroller.querySelectorAll('*')].find((node) => (node.textContent || '').trim() === ${JSON.stringify(OLDEST_IN_WINDOW)} && node.children.length === 0);
        if (!title) return { error: 'oldest title missing' };
        title.scrollIntoView({ block: 'nearest' });
        const box = scroller.getBoundingClientRect();
        const rect = title.getBoundingClientRect();
        const visible = rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1;
        title.click();
        return { visible, top: rect.top, bottom: rect.bottom, boxTop: box.top, boxBottom: box.bottom };
    })()`);
    if (scrolled.error) throw new Error(scrolled.error);
    if (!scrolled.visible) throw new Error(`oldest row not in the scrollport ${JSON.stringify(scrolled)}`);

    const textDeadline = Date.now() + 15_000;
    let editorText = '';
    while (Date.now() < textDeadline) {
        editorText = await evaluate(cdp, `[...document.querySelectorAll('.ProseMirror')].map((node) => node.innerText).join('\\n')`);
        if (String(editorText).includes(OLDEST_BODY)) break;
        await sleep(300);
    }
    if (!String(editorText).includes(OLDEST_BODY)) {
        throw new Error(`restored editor missing ${OLDEST_BODY}: ${String(editorText).slice(0, 180)}`);
    }

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const shotPath = path.join(ARTIFACTS, 'v2-recovery-oldest.png');
    fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
    report.ok = true;
    report.listed = listed.count;
    report.oldestVisible = scrolled;
    report.restored = OLDEST_BODY;
    report.screenshot = shotPath;
    log(`ok listed=${listed.count} restored=${OLDEST_BODY}`);
    cdp.close();
} catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    log(`FAIL ${report.error}`);
} finally {
    stopChildren();
    const reportPath = path.join(ARTIFACTS, 'v2-recovery-panel.json');
    fs.mkdirSync(ARTIFACTS, { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
}
