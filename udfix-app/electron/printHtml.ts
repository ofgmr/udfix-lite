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

export function htmlForPrintWindow(documentHtml: string): string {
    const stripped = String(documentHtml || '')
        .replace(/<script\b[\s\S]*?<\/script>/gi, '')
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    const cspTag = `<meta http-equiv="Content-Security-Policy" content="${PRINT_CSP}">`;
    if (/<head[\s>]/i.test(stripped)) {
        return stripped.replace(/<head([^>]*)>/i, `<head$1>${cspTag}`);
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
