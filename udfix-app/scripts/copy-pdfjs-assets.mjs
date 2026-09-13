/**
 * Copies pdfjs-dist CMap and standard font binaries into public/pdfjs for
 * offline PDF.js loading (Electron + Vite base: './').
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pdfjsRoot = join(appRoot, 'node_modules', 'pdfjs-dist');
const destRoot = join(appRoot, 'public', 'pdfjs');

if (!existsSync(pdfjsRoot)) {
    console.warn('[copy-pdfjs-assets] pdfjs-dist not installed; skipping.');
    process.exit(0);
}

mkdirSync(join(destRoot, 'cmaps'), { recursive: true });
mkdirSync(join(destRoot, 'standard_fonts'), { recursive: true });
mkdirSync(join(destRoot, 'wasm'), { recursive: true });

cpSync(join(pdfjsRoot, 'cmaps'), join(destRoot, 'cmaps'), { recursive: true });
cpSync(join(pdfjsRoot, 'standard_fonts'), join(destRoot, 'standard_fonts'), { recursive: true });
cpSync(join(pdfjsRoot, 'wasm'), join(destRoot, 'wasm'), { recursive: true });

console.log('[copy-pdfjs-assets] synced cmaps + standard_fonts + wasm → public/pdfjs/');
