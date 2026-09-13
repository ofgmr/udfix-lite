#!/usr/bin/env node
/**
 * macOS dev: patch Electron.app display name + bundle icon so Dock / Stage Manager show UDFIX branding.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const APP_NAME = 'UDFIX';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronApp = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app');
const plistPath = path.join(electronApp, 'Contents', 'Info.plist');
const icnsDest = path.join(electronApp, 'Contents', 'Resources', 'electron.icns');
const iconPng = path.join(root, 'public', 'branding', 'udfix-app-icon.png');
const iconStamp = path.join(root, 'public', 'branding', '.electron-icns-stamp');

function readPlistString(key) {
    try {
        return execFileSync('plutil', ['-extract', key, 'raw', plistPath], { encoding: 'utf8' }).trim();
    } catch {
        return '';
    }
}

function patchPlistNames() {
    if (readPlistString('CFBundleDisplayName') === APP_NAME && readPlistString('CFBundleName') === APP_NAME) {
        return false;
    }
    execFileSync('plutil', ['-replace', 'CFBundleDisplayName', '-string', APP_NAME, plistPath]);
    execFileSync('plutil', ['-replace', 'CFBundleName', '-string', APP_NAME, plistPath]);
    console.log(`patch-electron-mac-branding: Dock tooltip → ${APP_NAME}`);
    return true;
}

function buildIcnsFromPng(pngPath, outIcns) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'udfix-icns-'));
    const iconset = path.join(tmpDir, 'icon.iconset');
    fs.mkdirSync(iconset);

    const entries = [
        [16, 'icon_16x16.png'],
        [32, 'icon_16x16@2x.png'],
        [32, 'icon_32x32.png'],
        [64, 'icon_32x32@2x.png'],
        [128, 'icon_128x128.png'],
        [256, 'icon_128x128@2x.png'],
        [256, 'icon_256x256.png'],
        [512, 'icon_256x256@2x.png'],
        [512, 'icon_512x512.png'],
        [1024, 'icon_512x512@2x.png'],
    ];

    for (const [size, name] of entries) {
        execFileSync('sips', ['-z', String(size), String(size), pngPath, '--out', path.join(iconset, name)], {
            stdio: 'ignore',
        });
    }

    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', outIcns], { stdio: 'ignore' });
    fs.rmSync(tmpDir, { recursive: true, force: true });
}

function patchElectronBundleIcon() {
    if (!fs.existsSync(iconPng)) {
        console.warn('patch-electron-mac-branding: missing public/branding/udfix-app-icon.png');
        return false;
    }
    if (!fs.existsSync(path.dirname(icnsDest))) {
        console.warn('patch-electron-mac-branding: Electron.app Resources not found (skip icon)');
        return false;
    }

    const pngMtime = fs.statSync(iconPng).mtimeMs;
    const stampMtime = fs.existsSync(iconStamp) ? Number(fs.readFileSync(iconStamp, 'utf8')) : 0;
    const icnsFresh = fs.existsSync(icnsDest) && fs.statSync(icnsDest).mtimeMs >= pngMtime;

    if (icnsFresh && stampMtime >= pngMtime) {
        return false;
    }

    const tmpIcns = path.join(os.tmpdir(), `udfix-electron-${Date.now()}.icns`);
    buildIcnsFromPng(iconPng, tmpIcns);
    fs.copyFileSync(tmpIcns, icnsDest);
    fs.rmSync(tmpIcns, { force: true });
    fs.writeFileSync(iconStamp, String(pngMtime));
    console.log('patch-electron-mac-branding: Electron.app bundle icon → UDFIX');
    return true;
}

if (process.platform !== 'darwin') {
    process.exit(0);
}

if (!fs.existsSync(plistPath)) {
    console.warn('patch-electron-mac-branding: Electron.app Info.plist not found (skip)');
    process.exit(0);
}

patchPlistNames();
patchElectronBundleIcon();
