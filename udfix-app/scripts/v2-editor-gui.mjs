/**
 * Live Electron window for the develop editor.
 * Linux uses xvfb when DISPLAY is unset. This is not macOS/Windows and not an OS clipboard test.
 *
 * Run: node scripts/v2-editor-gui.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = process.env.UDFIX_V2_ARTIFACTS || '/opt/cursor/artifacts';
const PORT = Number(process.env.UDFIX_V2_CDP_PORT || 9333);
const VITE_PORT = Number(process.env.UDFIX_V2_VITE_PORT || 5173);
const USER_DATA = path.join('/tmp', `udfix-v2-gui-${process.pid}`);
const FIXTURE_DIR = path.join('/tmp', `udfix-v2-fixtures-${process.pid}`);
const ACTION_MS = 12_000;
const READY_MS = 60_000;

const children = [];
const report = {
    kind: 'electron-gui',
    startedAt: new Date().toISOString(),
    platform: `${process.platform} ${process.arch}`,
    scenarios: [],
    exceptions: [],
    screenshots: [],
    notes: [
        'OS file dialogs, macOS/Windows native menus, and the system clipboard were not driven.',
        'HTML paste is a ClipboardEvent inside the live editor document.',
    ],
};

function log(line) {
    console.log(`[gui] ${line}`);
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
            if (response.ok || response.status < 500) return;
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
    const logPath = extra.logPath;
    if (logPath) {
        const stream = fs.createWriteStream(logPath, { flags: 'a' });
        child.stdout?.pipe(stream);
        child.stderr?.pipe(stream);
    }
    child.on('exit', (code, signal) => {
        if (extra.name) log(`${extra.name} exited code=${code} signal=${signal}`);
    });
    return child;
}

function connectCdp(wsUrl) {
    const ws = new WebSocket(wsUrl);
    let nextId = 0;
    const pending = new Map();
    const exceptions = [];
    return new Promise((resolve, reject) => {
        const fail = (error) => reject(error);
        ws.addEventListener('error', fail);
        ws.addEventListener('open', () => {
            ws.removeEventListener('error', fail);
            resolve(api);
        });
        ws.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            if (message.id && pending.has(message.id)) {
                const slot = pending.get(message.id);
                clearTimeout(slot.timer);
                pending.delete(message.id);
                if (message.error) slot.reject(new Error(`${message.error.message || 'cdp error'}`));
                else slot.resolve(message.result);
                return;
            }
            if (message.method === 'Runtime.exceptionThrown') {
                const details = message.params?.exceptionDetails;
                const text = details?.exception?.description || details?.text || 'exception';
                exceptions.push(String(text).slice(0, 500));
            }
        });
        const api = {
            exceptions,
            send(method, params = {}, timeoutMs = ACTION_MS) {
                const id = ++nextId;
                return new Promise((resolveSend, rejectSend) => {
                    const timer = setTimeout(() => {
                        pending.delete(id);
                        rejectSend(new Error(`CDP timeout ${method} after ${timeoutMs}ms`));
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

async function evaluate(cdp, expression, timeoutMs = ACTION_MS) {
    const result = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
    }, timeoutMs);
    if (result.exceptionDetails) {
        const text = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'eval failed';
        throw new Error(String(text).slice(0, 500));
    }
    return result.result?.value;
}

async function screenshot(cdp, filename) {
    fs.mkdirSync(ARTIFACTS, { recursive: true });
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, ACTION_MS);
    const file = path.join(ARTIFACTS, filename);
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    report.screenshots.push(file);
    log(`screenshot ${file}`);
}

function udfParagraphs(lines) {
    let cdata = '';
    const elements = [];
    for (const line of lines) {
        const start = cdata.length;
        cdata += `${line.text}\n`;
        elements.push(
            `<paragraph Alignment="0" LeftIndent="${line.indent}"><content startOffset="${start}" length="${line.text.length}" /></paragraph>`,
        );
    }
    return `<?xml version="1.0" encoding="UTF-8" ?>
<template format_id="1.8">
<content><![CDATA[${cdata}]]></content>
<elements>
${elements.join('\n')}
</elements>
</template>
`;
}

async function readUdfXml(raw) {
    if (raw[0] === 0x50 && raw[1] === 0x4b) {
        const zip = await JSZip.loadAsync(raw);
        return (await zip.file('content.xml')?.async('string')) || '';
    }
    return raw.toString('utf8');
}

async function dropPath(cdp, filePath) {
    await evaluate(cdp, `(() => {
        const editor = document.querySelector('.ProseMirror') || document.body;
        const data = new DataTransfer();
        data.setData('text/plain', ${JSON.stringify(filePath)});
        editor.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
        return true;
    })()`);
}

async function waitForEditorText(cdp, marker, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let text = '';
    while (Date.now() < deadline) {
        text = await evaluate(cdp, `[...document.querySelectorAll('.ProseMirror')].map((node) => node.innerText).join('\\n')`);
        if (String(text).includes(marker)) return String(text);
        await sleep(400);
    }
    throw new Error(`editor text missing ${marker}: ${String(text).slice(0, 180)}`);
}

async function pasteCount(cdp, count, timeoutMs) {
    const html = JSON.stringify(Array.from({ length: count }, (_, index) => {
        const n = String(index + 1).padStart(4, '0');
        return `<p>Sentetik paragraf ${n}.</p>`;
    }).join(''));
    const detail = await evaluate(cdp, `(() => {
        const editor = document.querySelector('.ProseMirror');
        editor.focus();
        const data = new DataTransfer();
        data.setData('text/html', ${html});
        data.setData('text/plain', 'Sentetik paragraf');
        editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
        const heap = performance.memory ? performance.memory.usedJSHeapSize : null;
        return { length: editor.innerText.length, tail: editor.innerText.slice(-60), heap };
    })()`, timeoutMs);
    const needle = String(count).padStart(4, '0');
    if (!String(detail.tail).includes(needle) && !String(detail.tail).includes(String(count))) {
        throw new Error(`paste ${count} tail missing: ${detail.tail}`);
    }
    return { ...detail, platform: `${process.platform} ${process.arch}`, note: 'heap is this Electron process when exposed; not a limit' };
}

async function scenario(name, fn) {
    const started = Date.now();
    try {
        const detail = await fn();
        const row = { name, ok: true, ms: Date.now() - started, detail: detail ?? null };
        report.scenarios.push(row);
        log(`ok ${name} ${row.ms}ms ${detail ? JSON.stringify(detail).slice(0, 180) : ''}`);
    } catch (error) {
        const row = { name, ok: false, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
        report.scenarios.push(row);
        log(`FAIL ${name} ${row.ms}ms ${row.error}`);
    }
}

async function main() {
    fs.mkdirSync(ARTIFACTS, { recursive: true });
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    fs.rmSync(USER_DATA, { recursive: true, force: true });
    const udfPath = path.join(FIXTURE_DIR, 'sentetik.udf');
    const udfMarker = 'SentetikUdfAcilis';
    const udfXml = fs.readFileSync(path.join(ROOT, 'fixtures/v2-editor/short-raw.udf'), 'utf8')
        .replace('Örnek kısa metin', udfMarker);
    fs.writeFileSync(udfPath, udfXml);

    log('compiling electron main');
    await new Promise((resolve, reject) => {
        const child = track(spawn('npx', ['tsc', '-p', 'electron/tsconfig.json'], { cwd: ROOT, stdio: 'inherit' }));
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`electron tsc exit ${code}`))));
    });

    const viteLog = path.join(ARTIFACTS, 'v2-editor-vite.log');
    const electronLog = path.join(ARTIFACTS, 'v2-editor-electron.log');
    let viteOwned = false;
    const viteHtml = await fetch(`http://127.0.0.1:${VITE_PORT}/`).then((response) => response.text()).catch(() => '');
    if (!viteHtml.includes('UDFIX')) {
        viteOwned = true;
        run('npx', ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'], {
            name: 'vite',
            logPath: viteLog,
            env: { NODE_ENV: 'development' },
        });
        await waitForHttp(`http://127.0.0.1:${VITE_PORT}/`, 60_000);
    }
    log(viteOwned ? 'vite started' : 'vite already serving UDFIX');

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
    run(command, args, {
        name: 'electron',
        logPath: electronLog,
        env: {
            NODE_ENV: 'development',
            UDFIX_KATIR: '0',
            UDFIX_OPEN_DEVTOOLS: '0',
        },
    });

    let wsUrl = '';
    const cdpDeadline = Date.now() + READY_MS;
    while (Date.now() < cdpDeadline) {
        try {
            const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((response) => response.json());
            const pages = list.filter((item) => item.type === 'page' && item.webSocketDebuggerUrl);
            const page = pages.find((item) => String(item.url || '').includes(String(VITE_PORT))) || pages[0];
            if (page && String(page.url || '').includes(String(VITE_PORT))) {
                wsUrl = page.webSocketDebuggerUrl;
                log(`cdp ${page.url}`);
                break;
            }
        } catch {
            /* debugger not up */
        }
        await sleep(300);
    }
    if (!wsUrl) throw new Error('CDP page was not published');
    const cdp = await connectCdp(wsUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    await scenario('editor surface', async () => {
        const deadline = Date.now() + READY_MS;
        let snapshot = '';
        while (Date.now() < deadline) {
            snapshot = await evaluate(cdp, `(() => {
                const button = [...document.querySelectorAll('button,[role="button"]')].find((node) =>
                    (node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || '').includes('Yeni Belge'));
                if (button && !document.querySelector('.ProseMirror')) button.click();
                return JSON.stringify({
                    href: location.href,
                    title: document.title,
                    editors: document.querySelectorAll('.ProseMirror').length,
                    text: (document.body?.innerText || '').slice(0, 240),
                });
            })()`, 5_000);
            const parsed = JSON.parse(snapshot);
            if (parsed.editors > 0) break;
            await sleep(400);
        }
        const parsed = JSON.parse(snapshot || '{}');
        if (!parsed.editors) {
            await screenshot(cdp, 'v2-editor-not-ready.png');
            throw new Error(`ProseMirror did not mount ${snapshot}`);
        }
        const dismissed = await evaluate(cdp, `(() => {
            const button = [...document.querySelectorAll('button')].find((node) => (node.textContent || '').includes('Şimdi değil'));
            if (button) button.click();
            return Boolean(button);
        })()`);
        await sleep(300);
        await screenshot(cdp, 'v2-editor-ready.png');
        return { ...parsed, telemetryDismissed: dismissed };
    });

    await scenario('type turkish', async () => {
        const box = await evaluate(cdp, `(() => {
            const editor = document.querySelector('.ProseMirror');
            editor.focus();
            const rect = editor.getBoundingClientRect();
            return { x: Math.max(8, rect.x + Math.min(80, rect.width / 2)), y: Math.max(8, rect.y + Math.min(80, rect.height / 2)) };
        })()`);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
        await evaluate(cdp, 'document.querySelector(".ProseMirror").focus()');
        await cdp.send('Input.insertText', { text: 'Örnek kısa metin İıŞş 📄' });
        const text = await evaluate(cdp, 'document.querySelector(".ProseMirror").innerText');
        if (!String(text).includes('Örnek kısa metin')) throw new Error(`typed text missing: ${text}`);
        await screenshot(cdp, 'v2-editor-typed.png');
        return { text: String(text).slice(0, 120) };
    });

    await scenario('paste html', async () => {
        const html = JSON.stringify(fs.readFileSync(path.join(ROOT, 'fixtures/v2-editor/word-like.html'), 'utf8'));
        const plain = JSON.stringify(fs.readFileSync(path.join(ROOT, 'fixtures/v2-editor/plain.txt'), 'utf8'));
        const detail = await evaluate(cdp, `(() => {
            const editor = document.querySelector('.ProseMirror');
            editor.focus();
            const data = new DataTransfer();
            data.setData('text/html', ${html});
            data.setData('text/plain', ${plain});
            const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data });
            const notCanceled = editor.dispatchEvent(event);
            return { notCanceled, text: editor.innerText.slice(0, 240) };
        })()`, 20_000);
        if (!String(detail.text).includes('Örnek gerekçe') && !String(detail.text).includes('iç madde')) {
            throw new Error(`paste text missing: ${detail.text}`);
        }
        await screenshot(cdp, 'v2-editor-paste.png');
        return detail;
    });

    await scenario('shift-tab', async () => {
        const before = await evaluate(cdp, 'document.querySelector(".ProseMirror").innerText');
        const detail = await evaluate(cdp, `(() => {
            const editor = document.querySelector('.ProseMirror');
            editor.focus();
            const event = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
            editor.dispatchEvent(event);
            return { text: editor.innerText.slice(0, 180) };
        })()`);
        if (String(detail.text) !== String(before) && !String(detail.text).includes('Örnek')) {
            throw new Error(`Shift-Tab replaced the document: ${detail.text}`);
        }
        const stillThere = await evaluate(cdp, 'Boolean(document.querySelector(".ProseMirror"))');
        if (!stillThere) throw new Error('editor disappeared after Shift-Tab');
        await cdp.send('Input.insertText', { text: 'X' });
        const text = await evaluate(cdp, 'document.querySelector(".ProseMirror").innerText');
        if (!String(text).includes('X')) throw new Error('editor did not accept input after Shift-Tab');
        return { ...detail, after: String(text).slice(0, 80) };
    });

    await scenario('undo', async () => {
        const before = await evaluate(cdp, 'document.querySelector(".ProseMirror").innerText');
        await cdp.send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            modifiers: process.platform === 'darwin' ? 4 : 2,
            key: 'z',
            code: 'KeyZ',
            windowsVirtualKeyCode: 90,
        });
        await cdp.send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            modifiers: process.platform === 'darwin' ? 4 : 2,
            key: 'z',
            code: 'KeyZ',
            windowsVirtualKeyCode: 90,
        });
        const text = await evaluate(cdp, 'document.querySelector(".ProseMirror").innerText');
        if (String(text) === String(before)) throw new Error('undo did not change the document');
        return { text: String(text).slice(0, 80) };
    });

    await scenario('large paste', async () => {
        const html = JSON.stringify(Array.from({ length: 40 }, (_, index) => {
            const n = String(index + 1).padStart(2, '0');
            return `<p>Sentetik paragraf ${n}.</p><br clear=all style="page-break-before:always">`;
        }).join(''));
        const detail = await evaluate(cdp, `(() => {
            const editor = document.querySelector('.ProseMirror');
            editor.focus();
            const data = new DataTransfer();
            data.setData('text/html', ${html});
            data.setData('text/plain', 'Sentetik paragraf');
            editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
            return { length: editor.innerText.length, tail: editor.innerText.slice(-80) };
        })()`, 20_000);
        if (!String(detail.tail).includes('40') && !String(detail.tail).includes('paragraf')) {
            throw new Error(`large paste tail missing: ${detail.tail}`);
        }
        return detail;
    });

    await scenario('open udf by path drop', async () => {
        const dropped = await evaluate(cdp, `(() => {
            const editor = document.querySelector('.ProseMirror');
            const data = new DataTransfer();
            data.setData('text/plain', ${JSON.stringify(udfPath)});
            const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data });
            editor.dispatchEvent(event);
            return true;
        })()`);
        const deadline = Date.now() + ACTION_MS;
        let text = '';
        while (Date.now() < deadline) {
            text = await evaluate(cdp, `[...document.querySelectorAll('.ProseMirror')].map((node) => node.innerText).join('\\n')`);
            if (String(text).includes(udfMarker)) break;
            await sleep(400);
        }
        if (!String(text).includes(udfMarker)) {
            throw new Error(`udf text did not appear (${dropped})`);
        }
        await screenshot(cdp, 'v2-editor-udf-open.png');
        return { text: String(text).slice(0, 160) };
    });

    await scenario('edit and autosave udf', async () => {
        const before = fs.readFileSync(udfPath);
        await evaluate(cdp, `(() => {
            const nodes = [...document.querySelectorAll('.ProseMirror')];
            const editor = nodes.find((node) => node.innerText.includes(${JSON.stringify(udfMarker)})) || nodes[nodes.length - 1];
            editor.focus();
            return true;
        })()`);
        await cdp.send('Input.insertText', { text: ' KALEM' });
        const deadline = Date.now() + 15_000;
        let saved = false;
        while (Date.now() < deadline) {
            const raw = fs.readFileSync(udfPath);
            if (!raw.equals(before)) {
                let xml = raw.toString('utf8');
                if (raw[0] === 0x50 && raw[1] === 0x4b) {
                    const zip = await JSZip.loadAsync(raw);
                    xml = (await zip.file('content.xml')?.async('string')) || '';
                }
                if (xml.includes('KALEM')) {
                    saved = true;
                    break;
                }
            }
            await sleep(500);
        }
        if (!saved) throw new Error('autosave did not write KALEM back to the udf file within 15s');
        return { saved: true };
    });

    const listPath = path.join(FIXTURE_DIR, 'listeler.udf');
    const listReopenPath = path.join(FIXTURE_DIR, 'listeler-yeniden.udf');
    fs.writeFileSync(listPath, udfParagraphs([
        { indent: '25', text: '• dış madde' },
        { indent: '50', text: '• iç madde' },
    ]));

    await scenario('open nested list udf', async () => {
        await dropPath(cdp, listPath);
        const text = await waitForEditorText(cdp, 'iç madde', ACTION_MS);
        if (!text.includes('dış madde')) throw new Error(`list text missing: ${text}`);
        return { text: text.slice(0, 160) };
    });

    await scenario('save and reopen list udf', async () => {
        const before = fs.readFileSync(listPath);
        await evaluate(cdp, `(() => {
            const editor = [...document.querySelectorAll('.ProseMirror')].find((node) => node.innerText.includes('iç madde'));
            if (!editor) throw new Error('list editor missing');
            editor.focus();
            return true;
        })()`);
        await cdp.send('Input.insertText', { text: ' EK' });
        const deadline = Date.now() + 15_000;
        let xml = '';
        while (Date.now() < deadline) {
            const raw = fs.readFileSync(listPath);
            if (!raw.equals(before)) {
                xml = await readUdfXml(raw);
                if (xml.includes('EK') && xml.includes('iç madde') && xml.includes('LeftIndent')) break;
            }
            await sleep(400);
        }
        if (!xml.includes('EK')) throw new Error('list autosave did not write EK');
        const markerCount = (xml.match(/• /g) ?? []).length;
        fs.writeFileSync(listReopenPath, fs.readFileSync(listPath));
        await dropPath(cdp, listReopenPath);
        const reopened = await waitForEditorText(cdp, 'EK', ACTION_MS);
        if (!reopened.includes('iç madde')) throw new Error(`reopen dropped nested item: ${reopened}`);
        return { markers: markerCount, reopened: reopened.slice(0, 180) };
    });

    await scenario('paste 100 paragraphs', async () => pasteCount(cdp, 100, 20_000));
    await scenario('paste 1000 paragraphs', async () => pasteCount(cdp, 1000, 45_000));

    report.exceptions = cdp.exceptions.slice(0, 20);
    report.ok = report.scenarios.every((item) => item.ok);
    cdp.close();
}

try {
    await main();
} catch (error) {
    report.ok = false;
    report.fatal = error instanceof Error ? error.message : String(error);
    log(`fatal ${report.fatal}`);
} finally {
    stopChildren();
    report.finishedAt = new Date().toISOString();
    fs.mkdirSync(ARTIFACTS, { recursive: true });
    const reportPath = path.join(ARTIFACTS, 'v2-editor-gui-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log(`report ${reportPath}`);
    process.exit(report.ok ? 0 : 1);
}
