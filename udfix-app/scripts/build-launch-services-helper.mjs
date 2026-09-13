#!/usr/bin/env node
/**
 * Compile udfLaunchServices.swift to a native helper so packaged macOS builds
 * never invoke `/usr/bin/swift` on end-user machines (that triggers CLT install).
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'electron', 'swift', 'udfLaunchServices.swift');
const outDir = path.join(root, 'dist-electron', 'swift');
const out = path.join(outDir, 'udfLaunchServices');

const requireBinary =
    process.env.UDFIX_REQUIRE_LAUNCH_HELPER === '1' ||
    process.env.npm_lifecycle_event === 'build' ||
    process.env.npm_lifecycle_event === 'build:mac:signed';

if (process.platform !== 'darwin') {
    if (requireBinary) {
        console.error('build-launch-services-helper: macOS helper required but build is not on darwin');
        process.exit(1);
    }
    console.log('build-launch-services-helper: skip (not macOS)');
    process.exit(0);
}

if (!fs.existsSync(src)) {
    console.warn('build-launch-services-helper: missing source swift file');
    process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

const compile = (compiler, args) => {
    execFileSync(compiler, args, { stdio: 'inherit' });
};

try {
    compile('xcrun', ['swiftc', '-O', '-o', out, src]);
    console.log(`build-launch-services-helper: ${path.relative(root, out)}`);
} catch {
    try {
        compile('/usr/bin/swiftc', ['-O', '-o', out, src]);
        console.log(`build-launch-services-helper: ${path.relative(root, out)}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (requireBinary) {
            console.error(
                'build-launch-services-helper: swiftc unavailable — cannot package without native helper',
            );
            console.error(message);
            process.exit(1);
        }
        console.warn(
            'build-launch-services-helper: swiftc unavailable; dev can still run (helper not built)',
        );
        console.warn(message);
        process.exit(0);
    }
}
