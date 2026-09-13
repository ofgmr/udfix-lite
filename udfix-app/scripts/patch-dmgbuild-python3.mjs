#!/usr/bin/env node
/**
 * dmg-builder 22.x ships Python-2-only dmgbuild/core.py (reload/sys.setdefaultencoding).
 * Patch in place so DMG creation works with macOS system python3.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const corePath = path.join(root, 'node_modules/dmg-builder/vendor/dmgbuild/core.py');

if (!fs.existsSync(corePath)) {
    process.exit(0);
}

const source = fs.readFileSync(corePath, 'utf8');
const marker = '# udfix: python3 compat';

if (source.includes(marker)) {
    process.exit(0);
}

const legacy = `reload(sys)  # Reload is a hack
sys.setdefaultencoding('UTF8')`;

const patched = `${marker}
try:
    reload
except NameError:
    from importlib import reload
reload(sys)  # Reload is a hack
try:
    sys.setdefaultencoding('UTF8')
except AttributeError:
    pass`;

if (!source.includes(legacy)) {
    console.warn('patch-dmgbuild-python3: unexpected core.py layout — skip');
    process.exit(0);
}

fs.writeFileSync(corePath, source.replace(legacy, patched));
console.log('patch-dmgbuild-python3: core.py updated for Python 3');
