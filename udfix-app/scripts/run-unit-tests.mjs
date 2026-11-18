#!/usr/bin/env node
/**
 * Run the repo's unit tests.
 * Vitest files (import from 'vitest') go through `vitest run`.
 * The rest are tsx scripts that assert and exit.
 *
 * better-sqlite3 is rebuilt for Electron by postinstall. Tests that import it
 * run under Node, so this restores the Node ABI for the run and puts the
 * Electron ABI back afterwards.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, acc = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === 'dist-electron' || ent.name === 'release') {
            continue;
        }
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full, acc);
        else if (ent.name.endsWith('.test.ts') || ent.name.endsWith('.test.tsx')) acc.push(full);
    }
    return acc;
}

function run(command, args) {
    const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
    return result.status ?? 1;
}

const files = walk(ROOT).sort();
const vitest = [];
const tsx = [];
for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes("from 'vitest'") || text.includes('from "vitest"')) vitest.push(file);
    else tsx.push(file);
}

let sqliteWasElectron = false;
function sqliteLoadsInNode() {
    const probe = spawnSync(process.execPath, ['-e', "require('better-sqlite3')(':memory:').close()"], {
        cwd: ROOT,
        stdio: 'ignore',
    });
    return probe.status === 0;
}

if (!sqliteLoadsInNode()) {
    console.log('[test] rebuilding better-sqlite3 for Node (postinstall targets Electron)');
    sqliteWasElectron = true;
    const status = run('npm', ['rebuild', 'better-sqlite3']);
    if (status !== 0) process.exit(status);
    if (!sqliteLoadsInNode()) {
        console.error('[test] better-sqlite3 still does not load in Node');
        process.exit(1);
    }
}

let failed = 0;
console.log(`[test] ${tsx.length} tsx scripts, ${vitest.length} vitest files`);

for (const file of tsx) {
    const rel = path.relative(ROOT, file);
    process.stdout.write(`\n[test] ${rel}\n`);
    const status = run('npx', ['tsx', rel]);
    if (status !== 0) {
        failed += 1;
        console.error(`[test] FAIL ${rel} (exit ${status})`);
    }
}

if (vitest.length) {
    process.stdout.write('\n[test] vitest\n');
    const rels = vitest.map((file) => path.relative(ROOT, file));
    const status = run('npx', ['vitest', 'run', ...rels]);
    if (status !== 0) {
        failed += 1;
        console.error(`[test] FAIL vitest (exit ${status})`);
    }
}

if (sqliteWasElectron) {
    console.log('[test] restoring better-sqlite3 Electron ABI');
    const status = run('npx', ['@electron/rebuild', '-f', '-w', 'better-sqlite3']);
    if (status !== 0) {
        console.error('[test] electron rebuild of better-sqlite3 failed');
        process.exit(status);
    }
}

if (failed) {
    console.error(`\n[test] ${failed} failure(s)`);
    process.exit(1);
}
console.log('\n[test] all unit tests passed');
