/**
 * Editor v2 checks that run on this tree: fixtures, editor unit tests, typecheck.
 * Pass --gui to also launch the Electron window (needs a display or xvfb-run).
 *
 * Run: node scripts/v2-editor-validate.mjs
 *      node scripts/v2-editor-validate.mjs --gui
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gui = process.argv.includes('--gui');

const steps = [
    ['fixtures', 'node', ['scripts/v2-editor-fixtures.mjs'], 30_000],
    ['smart-indent', 'npx', ['tsx', 'src/extensions/SmartIndent.test.ts'], 60_000],
    ['xml-repair', 'npx', ['tsx', 'src/utils/uyapXmlRepair.test.ts'], 30_000],
    ['pasted-html', 'npx', ['tsx', 'src/utils/pastedHtml.test.ts'], 30_000],
    ['corpus', 'npx', ['tsx', 'src/utils/v2EditorCorpus.test.ts'], 60_000],
    ['udf-list', 'npx', ['tsx', 'src/utils/udfListRoundTrip.test.ts'], 60_000],
    ['stress', 'npx', ['tsx', 'src/utils/v2EditorStress.test.ts'], 90_000],
    ['recovery-list', 'npx', ['tsx', 'electron/documentRecoveryList.test.ts'], 60_000],
    ['editor-edge', 'npx', ['tsx', 'src/utils/v2EditorEdge.test.ts'], 60_000],
    ['udf-matrix', 'npx', ['tsx', 'src/utils/udfExportMatrix.test.ts'], 90_000],
    ['udf-image-schema', 'npx', ['tsx', 'src/utils/udfImageSchemaRoundTrip.test.ts'], 60_000],
    ['multi-source-paste', 'npx', ['tsx', 'src/utils/editorMultiSourcePaste.test.ts'], 90_000],
    ['paste-structure', 'npx', ['tsx', 'src/utils/editorPasteStructure.test.ts'], 60_000],
    ['toolbar-typography', 'npx', ['tsx', 'src/utils/editorToolbarTypography.test.ts'], 60_000],
    ['markdown-paste', 'npx', ['vitest', 'run', 'src/utils/editorPaste.test.ts'], 60_000],
    ['converter', 'npx', ['tsx', 'src/utils/converter.test.ts'], 120_000],
    ['uyap-io', 'npx', ['tsx', 'src/utils/uyapIO.test.ts'], 120_000],
    ['cdata', 'npx', ['tsx', 'src/utils/uyapCdataRoundTrip.test.ts'], 60_000],
    ['format-parity', 'npx', ['tsx', 'src/utils/uyapFormatParity.test.ts'], 60_000],
    ['table-row-group', 'npx', ['tsx', 'src/extensions/UdfixTableRowGroup.test.ts'], 60_000],
    ['footnote', 'npx', ['tsx', 'src/extensions/FootnoteExtension.test.ts'], 60_000],
    ['tsc-app', 'npx', ['tsc', '-p', 'tsconfig.app.json', '--noEmit'], 180_000],
    ['tsc-electron', 'npx', ['tsc', '-p', 'electron/tsconfig.json', '--noEmit'], 180_000],
    ['renderer-build', 'npx', ['vite', 'build'], 240_000],
];

if (gui) {
    steps.push(['electron-gui', 'node', ['scripts/v2-editor-gui.mjs'], 300_000]);
}

function runStep(name, command, args, timeoutMs) {
    return new Promise((resolve) => {
        const started = Date.now();
        const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit' });
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
        }, timeoutMs);
        child.on('exit', (code, signal) => {
            clearTimeout(timer);
            const ms = Date.now() - started;
            const ok = code === 0 && signal !== 'SIGKILL';
            const status = signal === 'SIGKILL' ? `TIMEOUT ${timeoutMs}ms` : `exit ${code}`;
            console.log(`[validate] ${ok ? 'ok' : 'FAIL'} ${name} ${ms}ms ${status}`);
            resolve({ name, ok, ms, status });
        });
    });
}

const results = [];
for (const [name, command, args, timeoutMs] of steps) {
    results.push(await runStep(name, command, args, timeoutMs));
}

const failed = results.filter((item) => !item.ok);
console.log(`[validate] ${results.length} step(s), ${failed.length} failure(s)`);
if (failed.length) process.exit(1);
