import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { resolveDatabaseLocation, setupDatabase } from './database';

function rmrf(target: string) {
    if (!fs.existsSync(target)) return;
    fs.rmSync(target, { recursive: true, force: true });
}

function tableExists(db: Database.Database, name: string): boolean {
    const row = db
        .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .get(name) as { ok?: number } | undefined;
    return Boolean(row?.ok);
}

function simulateEntitySaveFlow(db: Database.Database) {
    const partyId = 'verify-party-001';
    db.prepare(
        `INSERT INTO parties (id, type, full_name, is_client) VALUES (?, 'INDIVIDUAL', 'Verify Taraf', 0)`,
    ).run(partyId);

    const deleteStmt = db.prepare(
        `DELETE FROM entity_attributes WHERE entity_type = ? AND entity_id = ?`,
    );
    const insertStmt = db.prepare(
        `INSERT INTO entity_attributes (id, entity_type, entity_id, tag_key, tag_value, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const count = db.transaction(() => {
        deleteStmt.run('PARTY', partyId);
        insertStmt.run('attr-1', 'PARTY', partyId, 'kep', 'verify@kep.tr', 0);
        return 1;
    })();
    assert.equal(count, 1);

    const kbId = 'verify-kb-001';
    db.prepare(`INSERT INTO knowledge_base (id, type, title) VALUES (?, 'PRECEDENT', 'Verify KB')`).run(
        kbId,
    );
    deleteStmt.run('KNOWLEDGE', kbId);
    insertStmt.run('attr-2', 'KNOWLEDGE', kbId, 'karar_no', '2026/1', 0);

    const matterId = 'verify-matter-001';
    db.prepare(
        `INSERT INTO matters (id, matter_type, title, status) VALUES (?, 'LAW_CASE', 'Verify Dosya', 'OPEN')`,
    ).run(matterId);
    deleteStmt.run('MATTER', matterId);
    insertStmt.run('attr-3', 'MATTER', matterId, 'durusma_tarihi', '2026-06-12', 0);
}

function verifyFreshInstall() {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'udfix-db-fresh-'));
    try {
        const { dbPath } = resolveDatabaseLocation(base);
        assert.match(dbPath, /udfix-data[\\/]udfix\.db$/);
        setupDatabase(base, 'verify');
        const db = new Database(dbPath, { readonly: true });
        try {
            assert.ok(tableExists(db, 'parties'));
            assert.ok(tableExists(db, 'matters'));
            assert.ok(tableExists(db, 'knowledge_base'));
            assert.ok(tableExists(db, 'entity_attributes'));
            assert.ok(tableExists(db, 'attribute_tag_catalog'));
            const catalogCount = (
                db.prepare(`SELECT COUNT(*) AS c FROM attribute_tag_catalog`).get() as { c: number }
            ).c;
            assert.ok(catalogCount > 0, 'attribute_tag_catalog should be seeded');
        } finally {
            db.close();
        }
        const rw = new Database(dbPath);
        try {
            simulateEntitySaveFlow(rw);
        } finally {
            rw.close();
        }
        console.log('verify-db-fix: fresh install OK');
    } finally {
        rmrf(base);
    }
}

function verifyLegacyMigration() {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'udfix-db-legacy-'));
    const legacyDir = path.join(base, 'nomai-data');
    fs.mkdirSync(legacyDir, { recursive: true });
    const legacyDb = path.join(legacyDir, 'nomai-data.db');

    const seed = new Database(legacyDb);
    seed.exec(`
        CREATE TABLE parties (
            id TEXT PRIMARY KEY,
            type TEXT,
            full_name TEXT NOT NULL,
            is_client INTEGER DEFAULT 0
        );
        INSERT INTO parties (id, type, full_name, is_client)
        VALUES ('legacy-party', 'INDIVIDUAL', 'Legacy', 1);
    `);
    seed.close();

    try {
        const { dbPath } = resolveDatabaseLocation(base);
        assert.match(dbPath, /udfix-data[\\/]udfix\.db$/);
        assert.ok(fs.existsSync(dbPath), 'legacy db should migrate to udfix.db');
        assert.ok(!fs.existsSync(legacyDb), 'legacy db file should move away');

        setupDatabase(base, 'verify');
        const db = new Database(dbPath, { readonly: true });
        try {
            assert.ok(tableExists(db, 'entity_attributes'), 'migration must create entity_attributes');
            const legacyParty = db
                .prepare(`SELECT full_name FROM parties WHERE id = 'legacy-party'`)
                .get() as { full_name?: string } | undefined;
            assert.equal(legacyParty?.full_name, 'Legacy');
        } finally {
            db.close();
        }
        console.log('verify-db-fix: legacy migration OK');
    } finally {
        rmrf(base);
    }
}

function verifyBrokenLegacyWithoutMigration() {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'udfix-db-upgrade-'));
    try {
        const { dbPath } = resolveDatabaseLocation(base);
        setupDatabase(base, 'verify');

        const strip = new Database(dbPath);
        try {
            strip.exec(`DROP TABLE IF EXISTS entity_attributes`);
            strip.exec(`DROP TABLE IF EXISTS attribute_tag_catalog`);
            assert.ok(!tableExists(strip, 'entity_attributes'), 'test setup should drop entity_attributes');
        } finally {
            strip.close();
        }

        setupDatabase(base, 'verify');
        const db = new Database(dbPath, { readonly: true });
        try {
            assert.ok(
                tableExists(db, 'entity_attributes'),
                'upgrade on existing udfix.db must add entity_attributes',
            );
        } finally {
            db.close();
        }
        const rw = new Database(dbPath);
        try {
            simulateEntitySaveFlow(rw);
        } finally {
            rw.close();
        }
        console.log('verify-db-fix: existing-db upgrade OK');
    } finally {
        rmrf(base);
    }
}

export function runVerifyDatabaseFixCli(): void {
    verifyFreshInstall();
    verifyLegacyMigration();
    verifyBrokenLegacyWithoutMigration();
    console.log('verify-db-fix: all checks passed');
}
