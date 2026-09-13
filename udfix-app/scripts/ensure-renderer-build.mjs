#!/usr/bin/env node
/**
 * Ensure dist/index.html exists before Electron starts (local file:// dev, no Vite dev server).
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { viteNodeEnv } from './vite-node-env.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = path.join(root, 'dist', 'index.html');

if (fs.existsSync(indexHtml)) {
    console.log('ensure-renderer-build: dist/index.html present');
    process.exit(0);
}

console.log('ensure-renderer-build: first production build (one-time, ~1–3 min)…');
execFileSync('npx', ['vite', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: viteNodeEnv(),
});
