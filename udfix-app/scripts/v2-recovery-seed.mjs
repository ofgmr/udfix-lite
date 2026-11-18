/**
 * Seed an isolated UDFIX sqlite with synthetic recovery rows.
 * Run under Electron's Node so better-sqlite3 matches the app ABI:
 * ELECTRON_RUN_AS_NODE=1 electron scripts/v2-recovery-seed.mjs
 */
import Database from 'better-sqlite3';

const dbPath = process.env.UDFIX_RECOVERY_DB;
if (!dbPath) {
    console.error('UDFIX_RECOVERY_DB is required');
    process.exit(1);
}

const count = 105;
const db = new Database(dbPath);
db.pragma('busy_timeout = 5000');
const insertDoc = db.prepare(
    `INSERT INTO editor_documents
     (document_id, title, kind, file_path, created_at, updated_at, last_opened_at)
     VALUES (?, ?, 'editor', NULL, ?, ?, ?)`,
);
const insertVersion = db.prepare(
    `INSERT INTO document_versions
     (id, document_id, version_no, created_at, source, content, checksum, size_bytes)
     VALUES (?, ?, 1, ?, 'auto', ?, 'synthetic', ?)`,
);

const stamp = (index) => {
    const hour = String(Math.floor(index / 3600)).padStart(2, '0');
    const minute = String(Math.floor((index % 3600) / 60)).padStart(2, '0');
    const second = String(index % 60).padStart(2, '0');
    return `2026-01-01 ${hour}:${minute}:${second}`;
};

const seed = db.transaction(() => {
    for (let index = 0; index < count; index += 1) {
        const n = String(index).padStart(4, '0');
        const id = `recovery-${n}`;
        const at = stamp(index);
        const html = `<p>SENTETIK-${n}</p>`;
        insertDoc.run(id, `Kurtarma ${n}`, at, at, at);
        insertVersion.run(`ver-${id}`, id, at, html, html.length);
    }
});
seed();
const stored = db.prepare(`SELECT COUNT(*) AS n FROM editor_documents`).get().n;
db.close();
console.log(`seeded ${stored} synthetic recovery documents`);
if (stored !== count) process.exit(1);
