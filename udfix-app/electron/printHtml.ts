import type { BrowserWindow } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';

const PRINT_CSP = [
    "default-src 'none'",
    "img-src data: blob: file: nomai-file:",
    "style-src 'unsafe-inline'",
    "font-src data: file:",
    "script-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
].join('; ');

const DROP_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form']);

function isNameChar(ch: string): boolean {
    const c = ch.charCodeAt(0);
    return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || ch === '-' || ch === ':';
}

function skipWs(s: string, i: number): number {
    while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n' || s[i] === '\r')) i += 1;
    return i;
}

function indexOfIgnoreCase(haystackLower: string, needleLower: string, from: number): number {
    return haystackLower.indexOf(needleLower, from);
}

/** Drop script/iframe/etc. and event-handler attributes without regex HTML filters. */
export function sanitizePrintMarkup(input: string): string {
    const html = String(input || '');
    const lowered = html.toLowerCase();
    let out = '';
    let i = 0;
    while (i < html.length) {
        const lt = html.indexOf('<', i);
        if (lt === -1) {
            out += html.slice(i);
            break;
        }
        out += html.slice(i, lt);
        if (lowered.startsWith('<!--', lt)) {
            const end = html.indexOf('-->', lt + 4);
            i = end === -1 ? html.length : end + 3;
            continue;
        }
        const gt = html.indexOf('>', lt + 1);
        if (gt === -1) {
            break;
        }
        let p = lt + 1;
        const isClose = html[p] === '/';
        if (isClose) p += 1;
        p = skipWs(html, p);
        let name = '';
        while (p < gt && isNameChar(html[p] ?? '')) {
            name += (html[p] ?? '').toLowerCase();
            p += 1;
        }
        if (DROP_TAGS.has(name)) {
            if (!isClose && name === 'script') {
                const close = indexOfIgnoreCase(lowered, '</script', gt + 1);
                if (close === -1) break;
                const closeGt = html.indexOf('>', close);
                i = closeGt === -1 ? html.length : closeGt + 1;
                continue;
            }
            i = gt + 1;
            continue;
        }
        out += isClose ? `</${name}>` : `<${name}${filterAttributes(html.slice(p, gt))}>`;
        i = gt + 1;
    }
    return out;
}

function filterAttributes(raw: string): string {
    let i = 0;
    let attrs = '';
    const s = raw;
    while (i < s.length) {
        i = skipWs(s, i);
        if (i >= s.length || s[i] === '/') break;
        let name = '';
        while (i < s.length && isNameChar(s[i] ?? '')) {
            name += (s[i] ?? '').toLowerCase();
            i += 1;
        }
        if (!name) {
            i += 1;
            continue;
        }
        i = skipWs(s, i);
        let value = '';
        if (s[i] === '=') {
            i = skipWs(s, i + 1);
            const q = s[i];
            if (q === '"' || q === "'") {
                i += 1;
                const end = s.indexOf(q, i);
                value = end === -1 ? s.slice(i) : s.slice(i, end);
                i = end === -1 ? s.length : end + 1;
            } else {
                const start = i;
                while (i < s.length && s[i] !== ' ' && s[i] !== '\t' && s[i] !== '\n' && s[i] !== '\r' && s[i] !== '/') {
                    i += 1;
                }
                value = s.slice(start, i);
            }
        }
        if (name.startsWith('on')) continue;
        const lowered = value.trim().toLowerCase();
        if (
            (name === 'href' || name === 'src' || name === 'xlink:href' || name === 'action') &&
            (lowered.startsWith('javascript:') || lowered.startsWith('vbscript:') || lowered.startsWith('data:text/html'))
        ) {
            continue;
        }
        if (value.length > 0) {
            attrs += ` ${name}="${value.replace(/"/g, '&quot;')}"`;
        } else {
            attrs += ` ${name}`;
        }
    }
    return attrs;
}

function isHtmlHeadOpen(html: string, pos: number): boolean {
    if (pos < 0) return false;
    const lowered = html.toLowerCase();
    if (!lowered.startsWith('<head', pos)) return false;
    const after = lowered[pos + 5];
    return after === undefined || after === '>' || after === ' ' || after === '\t' || after === '\n' || after === '\r' || after === '/';
}

export function htmlForPrintWindow(documentHtml: string): string {
    const stripped = sanitizePrintMarkup(documentHtml);
    const cspTag = `<meta http-equiv="Content-Security-Policy" content="${PRINT_CSP}">`;
    const headOpen = stripped.toLowerCase().indexOf('<head');
    if (isHtmlHeadOpen(stripped, headOpen)) {
        const headGt = stripped.indexOf('>', headOpen);
        if (headGt !== -1) {
            return `${stripped.slice(0, headGt + 1)}${cspTag}${stripped.slice(headGt + 1)}`;
        }
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>${cspTag}</head><body>${stripped}</body></html>`;
}

export async function loadPrintHtmlFile(printWin: BrowserWindow, documentHtml: string): Promise<string> {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'udfix-print-'));
    const file = path.join(dir, 'print.html');
    await fs.promises.writeFile(file, htmlForPrintWindow(documentHtml), 'utf8');
    await printWin.loadFile(file);
    return dir;
}

export const PRINT_WINDOW_WEB_PREFERENCES = {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
} as const;
