#!/usr/bin/env node
/**
 * Copy non-TS electron assets beside dist-electron/*.js for packaged builds (tsc does not copy HTML/images).
 * Skips files whose destination is already up to date.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronDir = path.join(root, 'electron');
const distDir = path.join(root, 'dist-electron');
const brandingSrc = path.join(root, 'public', 'branding');
const brandingDest = path.join(distDir, 'branding');

function copyIfStale(src, dest) {
    if (!fs.existsSync(src)) return false;
    if (fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= fs.statSync(src).mtimeMs) {
        return false;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`copy-electron-assets: ${path.relative(root, dest)}`);
    return true;
}

function copyDirIfStale(srcDir, destDir) {
    if (!fs.existsSync(srcDir)) return 0;
    let copied = 0;
    for (const name of fs.readdirSync(srcDir)) {
        const src = path.join(srcDir, name);
        if (!fs.statSync(src).isFile()) continue;
        if (copyIfStale(src, path.join(destDir, name))) copied++;
    }
    return copied;
}

if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

let copied = 0;
for (const name of ['AboutCredits.html', 'AboutWindow.html']) {
    if (copyIfStale(path.join(electronDir, name), path.join(distDir, name))) copied++;
}

copied += copyDirIfStale(brandingSrc, brandingDest);
if (!fs.existsSync(brandingSrc)) {
    console.warn('copy-electron-assets: missing public/branding/');
}

const swiftSrc = path.join(electronDir, 'swift');
const swiftDest = path.join(distDir, 'swift');
if (fs.existsSync(swiftSrc)) {
    fs.mkdirSync(swiftDest, { recursive: true });
    for (const name of fs.readdirSync(swiftSrc)) {
        if (!name.endsWith('.swift')) continue;
        const src = path.join(swiftSrc, name);
        if (!fs.statSync(src).isFile()) continue;
        if (copyIfStale(src, path.join(swiftDest, name))) copied++;
    }
}

if (copied === 0) {
    console.log('copy-electron-assets: up to date');
}
