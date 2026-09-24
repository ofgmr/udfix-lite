import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { createHash, randomUUID } from 'crypto';
import { registerIpcHandler } from './ipcAllowlist';
import { buildFtsMatchQuery } from './ftsQuery';
import {
    coalesceOpeningMonth,
    openingMonthKey,
    trailingOpeningTotals,
    type OpeningMonthAccum,
} from './openingMonths';
import {
    addClosingMonthCount,
    addInventoryFreshnessScore,
    addOpeningMonthFact,
    asDosyaTurBucket,
    bucketDosyaTur,
    classifyIcraMuvekkilRole,
    classifyMatterClosure,
    courtTypeLabel,
    emptyInventoryFreshness,
    emptyTypeStatusCounts,
    EVRAK_ADDED_HOURS,
    EVRAK_RECENT_DAYS,
    finalizeInventoryFreshness,
    icraAmountWithFallback,
    icraSubtypeLabel,
    incrementBreakdownPair,
    isClosedLikeStatus,
    isDigerYargiCourt,
    isIcraAlacakOpen,
    isIdleOpenMatter,
    isOfficeKarsiRole,
    KATIR_LAST_SCAN_META_KEY,
    partitionIdleOpenMatters,
    resolveNotificationDosyaTurLabel,
    scoreInventoryCatalogFreshness,
    isOfficeMuvekkilRole,
    isOpenLikeStatus,
    parseTrAmount,
    serializeOpeningMonthWindow,
    toBreakdownPairRows,
    toTurkishTitleCase,
    displayCourtName,
} from './uyapDashboardAgg';
import {
    assembleClientReport,
    clampLastEvrakLimit,
    coalesceOpeningDate,
    formatLastOperations,
    formatReportKarsiTaraf,
    localIsoDate,
    lookupPartyProcessRole,
    resolveClientSifat,
    toIsoDate,
    type ClientReport,
    type ClientReportEvrakItem,
    type ClientReportMatterInput,
    type ReportPartyLink,
} from './clientReport';
import { formatCompactMatterPartyLine } from './matterPartyLine';
import {
    turkishIncludes,
    turkishLikePatterns,
    turkishSqlLikeFilter,
    buildLikeOrClause,
    buildFoldedLikeOrClause,
    filterRowsByTurkishQuery,
} from './turkishSearch';
import { isAppOwnedEvrakPath, isPreviewTempPath, isUserKeptEvrakPath, publicEvrakFilePath } from './uyapEvrakStorage';
import { sanitizeUyapPortalDate, sortBySanitizedPortalDate, sqlIsoYearIsPlausible } from './uyapPortalDate';
import { coerceWritableKnowledgeType, purgeKnowledgeBaseKanunRows } from './knowledgeBaseKanunPurge';

let db: Database.Database | null = null;
let sqlitePath: string | null = null;

export function getSqlitePath(): string | null {
    return sqlitePath;
}

type UyapAggCache<T> = { fingerprint: string; payload: T };
let uyapDashboardCache: UyapAggCache<unknown> | null = null;
let uyapRecentEvrakCache: UyapAggCache<unknown> | null = null;

const LEGACY_DB_DIR = 'nomai-data';
const LEGACY_DB_FILE = 'nomai-data.db';
const UDFIX_DB_DIR = 'udfix-data';
const UDFIX_DB_FILE = 'udfix.db';

/** gg/aa/yyyy, gg.aa.yyyy, or YYYY-MM-DD → YYYY-MM-DD (portal date, not Katır clock). */
function sqlUyapDateToIso(expr: string): string {
    return `CASE
        WHEN ${expr} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*' THEN substr(${expr}, 1, 10)
        WHEN ${expr} GLOB '[0-9][0-9]/[0-9][0-9]/[0-9][0-9][0-9][0-9]*' THEN substr(${expr}, 7, 4) || '-' || substr(${expr}, 4, 2) || '-' || substr(${expr}, 1, 2)
        WHEN ${expr} GLOB '[0-9][0-9].[0-9][0-9].[0-9][0-9][0-9][0-9]*' THEN substr(${expr}, 7, 4) || '-' || substr(${expr}, 4, 2) || '-' || substr(${expr}, 1, 2)
        ELSE NULL
    END`;
}

function sqlUyapPlausibleIso(expr: string): string {
    const iso = sqlUyapDateToIso(expr);
    return `CASE WHEN ${sqlIsoYearIsPlausible(iso)} THEN (${iso}) ELSE NULL END`;
}

function sqlUyapIncomingDateOnly(alias: string): string {
    const trimmed = `trim(COALESCE(${alias}.incoming_date, ''))`;
    return `CASE
        WHEN length(${trimmed}) = 10 AND ${trimmed} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        THEN ${trimmed}
        ELSE NULL
    END`;
}

function sqlUyapPlausibleIncoming(alias: string): string {
    const iso = sqlUyapIncomingDateOnly(alias);
    return `CASE WHEN ${sqlIsoYearIsPlausible(iso)} THEN (${iso}) ELSE NULL END`;
}

/** Own plausible portal date (tarih / gönderildi / onay / date-only incoming). Rejects year 5314. */
function sqlUyapPortalDate(alias = 'd'): string {
    const field = (key: string) => sqlUyapPlausibleIso(`json_extract(${alias}.metadata, '$.uyap.${key}')`);
    return `COALESCE(
        ${field('tarih')},
        ${field('sistemeGonderildigiTarih')},
        ${field('onaylandigiTarih')},
        ${sqlUyapPlausibleIncoming(alias)}
    )`;
}

/**
 * Same fields as `sqlUyapPortalDate`, but date-only `incoming_date` first so SQLite
 * COALESCE never json_extracts metadata on rows ingest already dated.
 */
function sqlUyapPortalDateColumnFirst(alias = 'd'): string {
    const field = (key: string) => sqlUyapPlausibleIso(`json_extract(${alias}.metadata, '$.uyap.${key}')`);
    return `COALESCE(
        ${sqlUyapPlausibleIncoming(alias)},
        ${field('tarih')},
        ${field('sistemeGonderildigiTarih')},
        ${field('onaylandigiTarih')}
    )`;
}

function sqlIncomingIsDateOnly(alias: string): string {
    const trimmed = `trim(COALESCE(${alias}.incoming_date, ''))`;
    return `length(${trimmed}) = 10 AND ${trimmed} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`;
}

function clearUyapAggCaches() {
    uyapDashboardCache = null;
    uyapRecentEvrakCache = null;
}

/** Other-connection writes bump `data_version`; this connection bumps `total_changes()`. UTC day for 14g/idle windows. */
function uyapAggFingerprint(database: Database.Database): string {
    const dataVersion = Number(database.pragma('data_version', { simple: true }));
    const changes = database.prepare('SELECT total_changes() AS n').get() as { n: number } | undefined;
    const day = database.prepare(`SELECT date('now') AS d`).get() as { d: string } | undefined;
    const counts = database
        .prepare(
            `SELECT
                (SELECT COUNT(*) FROM documents WHERE source_system = 'UYAP') AS docs,
                (SELECT COUNT(*) FROM matters) AS matters,
                (SELECT value FROM app_meta WHERE key = '${KATIR_LAST_SCAN_META_KEY}') AS last_scan`,
        )
        .get() as { docs: number; matters: number; last_scan: string | null } | undefined;
    let mtime = '0';
    if (sqlitePath) {
        try {
            const dbMs = fs.statSync(sqlitePath).mtimeMs;
            const wal = `${sqlitePath}-wal`;
            const walMs = fs.existsSync(wal) ? fs.statSync(wal).mtimeMs : 0;
            mtime = `${dbMs}:${walMs}`;
        } catch {
            mtime = '0';
        }
    }
    return `${dataVersion}:${Number(changes?.n) || 0}:${day?.d || ''}:${Number(counts?.docs) || 0}:${Number(counts?.matters) || 0}:${counts?.last_scan || ''}:${mtime}`;
}

function withPublicEvrakPath<T extends { file_path?: string | null; metadata?: string | null; source_system?: string | null }>(
    row: T,
): T {
    if (row.source_system && row.source_system !== 'UYAP') return row;
    return { ...row, file_path: publicEvrakFilePath(row.file_path, row.metadata) };
}

function parseUyapMeta(metadata: string | null | undefined): Record<string, unknown> {
    if (!metadata) return {};
    try {
        const parsed = JSON.parse(metadata) as { uyap?: Record<string, unknown> };
        return parsed?.uyap && typeof parsed.uyap === 'object' ? parsed.uyap : {};
    } catch {
        return {};
    }
}

function uyapItemKeyFromRow(row: { metadata?: string | null }): string | null {
    const key = parseUyapMeta(row.metadata).itemKey;
    return typeof key === 'string' && key.trim() ? key.trim() : null;
}

function durableUyapIdentity(row: {
    id: string;
    matter_id: string;
    title?: string | null;
    metadata?: string | null;
}): string {
    const uyap = parseUyapMeta(row.metadata);
    const itemKey = uyapItemKeyFromRow(row);
    if (itemKey && itemKey.startsWith('no:')) {
        return `${row.matter_id}\0${itemKey}`;
    }
    const birim = uyap.birimEvrakNo != null && String(uyap.birimEvrakNo).trim() !== ''
        ? String(uyap.birimEvrakNo).trim()
        : itemKey?.startsWith('no:')
          ? itemKey.slice(3).split('|')[0]
          : null;
    const tur = String(uyap.tur || row.title || '').trim();
    if (birim) return `${row.matter_id}\0no:${birim}|${tur}`;
    const parent = typeof uyap.parentItemKey === 'string' ? uyap.parentItemKey.trim() : '';
    const ekTuru = String(uyap.ekTuru || uyap.tur || '').trim();
    if (parent && ekTuru) {
        const sira = uyap.sira != null && String(uyap.sira).trim() !== '' ? String(uyap.sira).trim() : '0';
        return `${row.matter_id}\0ek:${parent}:${sira}:${ekTuru}`;
    }
    if (itemKey) return `${row.matter_id}\0${itemKey}`;
    return `${row.matter_id}\0row:${row.id}`;
}

function stableUyapCardKey(row: { id: string; title?: string | null; metadata?: string | null }): string | null {
    const uyap = parseUyapMeta(row.metadata);
    const itemKey = uyapItemKeyFromRow(row);
    if (itemKey && itemKey.startsWith('no:')) return itemKey;
    const parent = typeof uyap.parentItemKey === 'string' ? uyap.parentItemKey.trim() : '';
    const ekTuru = String(uyap.ekTuru || uyap.tur || '').trim();
    if (parent && ekTuru) {
        const sira = uyap.sira != null && String(uyap.sira).trim() !== '' ? String(uyap.sira).trim() : '0';
        return `ek:${parent}:${sira}:${ekTuru}`;
    }
    return itemKey;
}

function scoreUyapEvrakRow(row: { id: string; file_path?: string | null; metadata?: string | null }): number {
    let score = 0;
    if (isUserKeptEvrakPath(row.file_path)) score += 1000;
    else if (row.file_path && !isAppOwnedEvrakPath(row.file_path)) score += 100;
    else if (row.file_path) score += 10;
    const key = uyapItemKeyFromRow(row);
    if (key && !key.startsWith('id:')) score += 2;
    return score;
}

function uniqueUyapEvrakRows<T extends { id: string; file_path?: string | null; metadata?: string | null }>(
    rows: T[],
): T[] {
    const byKey = new Map<string, T>();
    const passthrough: T[] = [];
    for (const row of rows) {
        const key = stableUyapCardKey(row);
        if (!key) {
            passthrough.push(row);
            continue;
        }
        const prev = byKey.get(key);
        if (!prev) {
            byKey.set(key, row);
            continue;
        }
        byKey.set(key, scoreUyapEvrakRow(row) > scoreUyapEvrakRow(prev) ? row : prev);
    }
    return [...byKey.values(), ...passthrough];
}

/** Prefer `udfix-data/udfix.db`; migrate from legacy `nomai-data/nomai-data.db` when present. */
export function resolveDatabaseLocation(userDataPath: string): { dbDir: string; dbPath: string } {
    const newDir = path.join(userDataPath, UDFIX_DB_DIR);
    const newDb = path.join(newDir, UDFIX_DB_FILE);
    const legacyDir = path.join(userDataPath, LEGACY_DB_DIR);
    const legacyDb = path.join(legacyDir, LEGACY_DB_FILE);

    if (fs.existsSync(newDb)) {
        return { dbDir: newDir, dbPath: newDb };
    }

    if (fs.existsSync(legacyDb)) {
        fs.mkdirSync(newDir, { recursive: true });
        try {
            fs.renameSync(legacyDb, newDb);
            for (const suffix of ['-wal', '-shm']) {
                const legacySidecar = legacyDb + suffix;
                if (fs.existsSync(legacySidecar)) {
                    fs.renameSync(legacySidecar, newDb + suffix);
                }
            }
            try {
                fs.rmdirSync(legacyDir);
            } catch {
                /* legacy dir may still hold other files */
            }
            console.log('Migrated SQLite database from nomai-data to udfix-data');
        } catch (err) {
            console.warn('SQLite path migration failed; using legacy nomai-data path:', err);
            return { dbDir: legacyDir, dbPath: legacyDb };
        }
        return { dbDir: newDir, dbPath: newDb };
    }

    fs.mkdirSync(newDir, { recursive: true });
    return { dbDir: newDir, dbPath: newDb };
}

type UyapDavaKonuSnapshotRow = {
    davaKonuId: number;
    yargiTuru: '6' | '7';
    aciklama: string;
    altKategoriler: string[];
};

type UyapDavaTurSnapshotRow = {
    davaTurId: number;
    aciklama: string;
    dosyaTurKod?: number;
    mahkemeKod?: string;
    arabuluculukSartiVar?: boolean;
    altTurler: Array<{ davaTurId: number; aciklama: string }>;
};

type UyapDanistayDavaTuruSnapshotRow = {
    kod: number;
    aciklama: string;
};

type UyapArabuluculukUzmanlikSnapshotRow = {
    kod: string;
    kodTuru?: string;
    tktId?: string;
    aciklama: string;
};

type UyapFullTaxonomySnapshot = {
    schemaVersion: number;
    sourcePath: string;
    davaKonular: UyapDavaKonuSnapshotRow[];
    davaTurleri: UyapDavaTurSnapshotRow[];
    danistayDavaTurleri: UyapDanistayDavaTuruSnapshotRow[];
    arabuluculukUzmanlikAlanlari: UyapArabuluculukUzmanlikSnapshotRow[];
};

let uyapFullTaxonomyCache:
    | {
          filePath: string;
          mtimeMs: number;
          data: UyapFullTaxonomySnapshot;
      }
    | null = null;

function resolveUyapTaxonomyFilePath(): string | null {
    const envPath = String(process.env.NOMAI_UYAP_TAXONOMY_PATH || '').trim();
    const home = process.env.HOME || '';
    const candidates = [
        envPath,
        path.join(home, 'Downloads', 'uyap_tam_taksonomi_envanteri.json'),
        path.join(home, 'Downloads', 'uyap_tam_taksonomi_verisi.json'),
        path.join(process.cwd(), 'uyap_tam_taksonomi_envanteri.json'),
        path.join(process.cwd(), 'uyap_tam_taksonomi_verisi.json'),
    ].filter(Boolean);
    for (const candidate of candidates) {
        try {
            if (candidate && fs.existsSync(candidate)) return candidate;
        } catch {
            // no-op
        }
    }
    return null;
}

function readUyapFullTaxonomySnapshot(): UyapFullTaxonomySnapshot | null {
    const filePath = resolveUyapTaxonomyFilePath();
    if (!filePath) return null;
    const stat = fs.statSync(filePath);
    if (
        uyapFullTaxonomyCache &&
        uyapFullTaxonomyCache.filePath === filePath &&
        uyapFullTaxonomyCache.mtimeMs === stat.mtimeMs
    ) {
        return uyapFullTaxonomyCache.data;
    }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    const schemaVersion = Number(raw?.schemaVersion || 0);
    const toKonu = (row: unknown, yargiTuru: '6' | '7') => {
        const r = row as Record<string, unknown>;
        const id = Number(r?.davaKonuId);
        const aciklama = String(r?.aciklama || '').trim();
        if (!Number.isFinite(id) || !aciklama) return null;
        const altKategoriler = Array.isArray(r?.alt_kategoriler)
            ? r.alt_kategoriler
                  .map((alt) => String(alt || '').trim())
                  .filter(Boolean)
            : [];
        return { davaKonuId: id, yargiTuru, aciklama, altKategoriler };
    };
    const konularRoot = (raw?.idari_ve_vergi_yargisi_dava_konulari || {}) as Record<string, unknown>;
    const idari = Array.isArray(konularRoot?.idari_yargi_konulari)
        ? konularRoot.idari_yargi_konulari.map((r) => toKonu(r, '6')).filter(Boolean)
        : [];
    const vergi = Array.isArray(konularRoot?.vergi_yargisi_konulari)
        ? konularRoot.vergi_yargisi_konulari.map((r) => toKonu(r, '7')).filter(Boolean)
        : [];

    const toTur = (row: unknown) => {
        const r = row as Record<string, unknown>;
        const davaTurId = Number(r?.davaTurId);
        const aciklama = String(r?.aciklama || '').trim();
        if (!Number.isFinite(davaTurId) || !aciklama) return null;
        const dosyaTurKodRaw = Number(r?.dosyaTurKod);
        const dosyaTurKod = Number.isFinite(dosyaTurKodRaw) ? dosyaTurKodRaw : undefined;
        const mahkemeKodRaw = String(r?.mahkemeKod || r?.kodu || '').trim();
        const mahkemeKod = mahkemeKodRaw || undefined;
        const altTurler = Array.isArray(r?.alt_turler)
            ? (r.alt_turler as Array<Record<string, unknown>>)
                  .map((alt) => {
                      const id = Number(alt?.davaTurId);
                      const text = String(alt?.aciklama || '').trim();
                      if (!Number.isFinite(id) || !text) return null;
                      return { davaTurId: id, aciklama: text };
                  })
                  .filter(Boolean)
            : [];
        return {
            davaTurId,
            aciklama,
            dosyaTurKod,
            mahkemeKod,
            arabuluculukSartiVar: Boolean(r?.arabuluculukSartiVar),
            altTurler: altTurler as Array<{ davaTurId: number; aciklama: string }>,
        };
    };

    const turArrays = [
        Array.isArray(raw?.hukuk_dava_turleri) ? raw.hukuk_dava_turleri : [],
        Array.isArray(raw?.arabuluculuk_ve_is_yargisi_taksonomisi)
            ? raw.arabuluculuk_ve_is_yargisi_taksonomisi
            : [],
        Array.isArray(raw?.tuketici_yargisi_taksonomisi) ? raw.tuketici_yargisi_taksonomisi : [],
    ] as unknown[][];
    const davaTurleri = turArrays.flat().map(toTur).filter(Boolean) as UyapDavaTurSnapshotRow[];

    const danistayDavaTurleri = Array.isArray(raw?.danistay_dava_turleri)
        ? (raw.danistay_dava_turleri as Array<Record<string, unknown>>)
              .map((row) => {
                  const kod = Number(row?.kod);
                  const aciklama = String(row?.aciklama || '').trim();
                  if (!Number.isFinite(kod) || !aciklama) return null;
                  return { kod, aciklama };
              })
              .filter(Boolean) as UyapDanistayDavaTuruSnapshotRow[]
        : [];

    const arabuluculukUzmanlikAlanlari = Array.isArray(raw?.arabuluculuk_ozel_uzmanlik_alanlari)
        ? (raw.arabuluculuk_ozel_uzmanlik_alanlari as Array<Record<string, unknown>>)
              .map((row) => {
                  const kod = String(row?.kod || '').trim();
                  const aciklama = String(row?.aciklama || '').trim();
                  if (!kod || !aciklama) return null;
                  const kodTuru = String(row?.kodTuru || '').trim() || undefined;
                  const tktId = String(row?.tktId || '').trim() || undefined;
                  return { kod, kodTuru, tktId, aciklama };
              })
              .filter(Boolean) as UyapArabuluculukUzmanlikSnapshotRow[]
        : [];

    const snapshot = {
        schemaVersion,
        sourcePath: filePath,
        davaKonular: [
            ...(idari as UyapDavaKonuSnapshotRow[]),
            ...(vergi as UyapDavaKonuSnapshotRow[]),
        ],
        davaTurleri,
        danistayDavaTurleri,
        arabuluculukUzmanlikAlanlari,
    };
    uyapFullTaxonomyCache = { filePath, mtimeMs: stat.mtimeMs, data: snapshot };
    return snapshot;
}

export function setupDatabase(userDataPath: string, appVersion?: string) {
    const { dbDir, dbPath } = resolveDatabaseLocation(userDataPath);

    console.log("Initializing SQLite database at:", dbPath);
    sqlitePath = dbPath;
    clearUyapAggCaches();
    db = new Database(dbPath, {
        verbose: process.env.DEBUG_SQL === '1' ? console.log : undefined,
    });

    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    initSchema();
    runScheduledDatabaseMaintenance(db, appVersion);
}

/** FTS5 external content triggers — single source for init + recreate. */
const NOTES_FTS_TRIGGERS_SQL = `
        CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
            INSERT INTO notes_fts(rowid, title, content_plain)
            VALUES (new.rowid, new.title, new.content_plain);
        END;

        CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
            INSERT INTO notes_fts(notes_fts, rowid, title, content_plain)
            VALUES('delete', old.rowid, old.title, old.content_plain);
        END;

        CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
            INSERT INTO notes_fts(notes_fts, rowid, title, content_plain)
            VALUES('delete', old.rowid, old.title, old.content_plain);
            INSERT INTO notes_fts(rowid, title, content_plain)
            VALUES (new.rowid, new.title, new.content_plain);
        END;
`;

function isSqliteFtsCorruptError(e: unknown): boolean {
    const err = e as { code?: string; message?: string };
    if (err?.code === 'SQLITE_CORRUPT_VTAB' || err?.code === 'SQLITE_CORRUPT') return true;
    if (typeof err?.message === 'string' && /malformed|CORRUPT/i.test(err.message)) return true;
    return false;
}

function recreateNotesFtsAndTriggers(database: Database.Database) {
    database.exec(`DROP TRIGGER IF EXISTS notes_ai;`);
    database.exec(`DROP TRIGGER IF EXISTS notes_ad;`);
    database.exec(`DROP TRIGGER IF EXISTS notes_au;`);
    database.exec(`DROP TABLE IF EXISTS notes_fts;`);
    database.exec(`
        CREATE VIRTUAL TABLE notes_fts USING fts5(
            title,
            content_plain,
            content='notes',
            content_rowid='rowid'
        )
    `);
    database.exec(NOTES_FTS_TRIGGERS_SQL);
    database.exec(`INSERT INTO notes_fts(notes_fts) VALUES('rebuild');`);
}

function initSchema() {
    if (!db) return;

    // COURTS Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS courts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT,
            city TEXT,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // === NEW SCHEMA FOR NOTES & CLIENT MANAGEMENT ===

    // 1. PARTIES: Müvekkiller, Karşı Taraflar, Tanıklar
    db.exec(`
        CREATE TABLE IF NOT EXISTS parties (
            id TEXT PRIMARY KEY,
            type TEXT CHECK(type IN ('INDIVIDUAL', 'CORPORATE')),
            party_kind TEXT,
            full_name TEXT NOT NULL,
            id_number TEXT,
            tax_office TEXT,
            email TEXT,
            phone TEXT,
            address TEXT,
            postal_address TEXT,
            secondary_address TEXT,
            property_address TEXT,
            power_of_attorney_journal TEXT,
            is_client INTEGER DEFAULT 0 CHECK(is_client IN (0, 1)),
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 2. MATTERS: Davalar, İcra, Danışmanlık
    db.exec(`
        CREATE TABLE IF NOT EXISTS matters (
            id TEXT PRIMARY KEY,
            matter_type TEXT CHECK(matter_type IN ('LAW_CASE', 'ENFORCEMENT', 'ADVISORY', 'MEDIATION')),
            matter_category TEXT,
            internal_id TEXT UNIQUE,
            title TEXT,
            court_name TEXT,
            court_id TEXT REFERENCES courts(id) ON DELETE SET NULL,
            file_number TEXT,
            esas_no TEXT,
            dis_no TEXT,
            decision_number TEXT,
            status TEXT DEFAULT 'OPEN',
            opening_date DATE,
            closing_date DATE,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 3. MATTER_PARTIES: Junction table
    db.exec(`
        CREATE TABLE IF NOT EXISTS matter_parties (
            matter_id TEXT,
            party_id TEXT,
            role TEXT,
            PRIMARY KEY (matter_id, party_id),
            FOREIGN KEY (matter_id) REFERENCES matters(id) ON DELETE CASCADE,
            FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
        )
    `);

    // 4. NOTES: Tiptap/Markdown Tabanlı Notlar
    db.exec(`
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            title TEXT,
            content_json TEXT,
            content_plain TEXT,
            parent_type TEXT CHECK(parent_type IN ('MATTER', 'PARTY', 'DOCUMENT', 'GENERAL')),
            parent_id TEXT,
            is_pinned INTEGER DEFAULT 0 CHECK(is_pinned IN (0, 1)),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 5. KNOWLEDGE_BASE: İçtihatlar, Kitaplar, Makaleler.
    // LEGISLATIVE remains in CHECK for leftover user DBs; startup purges kanun rows
    // (`mevzuat-*` / mevzuat-gov-tr-import) and reclassifies leftover LEGISLATIVE → PRECEDENT.
    // Kanun metinleri live in the bundled mevzuat corpus, not this table.
    db.exec(`
        CREATE TABLE IF NOT EXISTS knowledge_base (
            id TEXT PRIMARY KEY,
            type TEXT CHECK(type IN ('PRECEDENT', 'BOOK', 'ARTICLE', 'LEGISLATIVE')),
            title TEXT NOT NULL,
            author TEXT,
            content TEXT,
            source_url TEXT,
            metadata TEXT,
            tags TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 6. TAGS: Etiket sistemi
    db.exec(`
        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            color TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 6. ENTITY_TAGS: Çoktan çoğa ilişki
    db.exec(`
        CREATE TABLE IF NOT EXISTS entity_tags (
            tag_id TEXT,
            entity_id TEXT,
            entity_type TEXT,
            PRIMARY KEY (tag_id, entity_id),
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )
    `);

    // 7. LINKS: Entity'ler arası bağlantılar
    db.exec(`
        CREATE TABLE IF NOT EXISTS links (
            id TEXT PRIMARY KEY,
            source_id TEXT,
            source_type TEXT,
            target_id TEXT,
            target_type TEXT,
            link_context TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 8. DOCUMENTS: Dosyalar, Deliller, Uyap Evrakları, Tebligatlar
    db.exec(`
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            matter_id TEXT,
            folder_id TEXT,
            title TEXT NOT NULL,
            file_path TEXT,
            file_hash TEXT,
            doc_type TEXT CHECK(doc_type IN ('PETITION', 'EVIDENCE', 'REPORT', 'CORRESPONDENCE', 'TEBLIGAT', 'OTHER')),
            source_system TEXT CHECK(source_system IN ('UYAP', 'E_TEBLIGAT', 'MANUAL', 'LOCAL')),
            incoming_date DATETIME,
            barcode_no TEXT,
            content TEXT,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (matter_id) REFERENCES matters(id) ON DELETE CASCADE,
            FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
        )
    `);

    // 8.1 FOLDERS: Dosya içi klasörleme (e.g., "Gelen Evrak", "Deliller")
    db.exec(`
        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            matter_id TEXT,
            name TEXT NOT NULL,
            parent_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (matter_id) REFERENCES matters(id) ON DELETE CASCADE
        )
    `);

    // 9. TASKS: Yapılacaklar (source of truth; dated rows mirror to deadlines as GOREV)
    db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'done')),
            due_date DATETIME,
            matter_id TEXT,
            party_id TEXT,
            source_note_id TEXT,
            completed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (matter_id) REFERENCES matters(id) ON DELETE CASCADE,
            FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE SET NULL,
            FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE SET NULL
        )
    `);

    // 9.1 DEADLINES: Duruşmalar ve Süreler (calendar UI; optional matter/party/task links)
    db.exec(`
        CREATE TABLE IF NOT EXISTS deadlines (
            id TEXT PRIMARY KEY,
            matter_id TEXT,
            party_id TEXT,
            task_id TEXT UNIQUE,
            event_type TEXT,
            event_date DATETIME NOT NULL,
            description TEXT,
            is_completed INTEGER DEFAULT 0 CHECK(is_completed IN (0, 1)),
            reminder_date DATETIME,
            calendar_metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (matter_id) REFERENCES matters(id) ON DELETE CASCADE,
            FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE SET NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    `);

    // 9.2 FILESYSTEM METADATA (optional layer over absolute paths)
    db.exec(`
        CREATE TABLE IF NOT EXISTS file_tags (
            path TEXT NOT NULL,
            tag TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (path, tag)
        )
    `);
    db.exec(`
        CREATE TABLE IF NOT EXISTS file_pins (
            path TEXT PRIMARY KEY,
            pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    db.exec(`
        CREATE TABLE IF NOT EXISTS file_recent (
            path TEXT PRIMARY KEY,
            opened_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 10. FTS5 VIRTUAL TABLE for Notes (rebuild only on first create or recovery)
    let notesFtsNeedsInitialRebuild = false;
    try {
        const ftsRow = db.prepare(
            `SELECT 1 as ok FROM sqlite_master WHERE type='table' AND name='notes_fts'`
        ).get() as { ok: number } | undefined;
        if (!ftsRow) {
            db.exec(`
                CREATE VIRTUAL TABLE notes_fts USING fts5(
                    title,
                    content_plain,
                    content='notes',
                    content_rowid='rowid'
                )
            `);
            notesFtsNeedsInitialRebuild = true;
        } else {
            db.prepare(`SELECT 1 FROM notes_fts LIMIT 1`).get();
        }
    } catch (e) {
        console.warn("FTS5 table is corrupted or misconfigured, dropping and recreating cleanly...", e);
        db.exec(`DROP TRIGGER IF EXISTS notes_ai;`);
        db.exec(`DROP TRIGGER IF EXISTS notes_ad;`);
        db.exec(`DROP TRIGGER IF EXISTS notes_au;`);
        db.exec(`DROP TABLE IF EXISTS notes_fts;`);

        db.exec(`
            CREATE VIRTUAL TABLE notes_fts USING fts5(
                title,
                content_plain,
                content='notes',
                content_rowid='rowid'
            )
        `);
        notesFtsNeedsInitialRebuild = true;
    }

    // 11. TRIGGERS: Auto-sync FTS5 (Correct external content triggers)
    db.exec(NOTES_FTS_TRIGGERS_SQL);

    // 12. INDEXES for Performance
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_parties_is_client ON parties(is_client);
        CREATE INDEX IF NOT EXISTS idx_parties_name ON parties(full_name);
        CREATE INDEX IF NOT EXISTS idx_parties_name_nocase ON parties(full_name COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_matters_status ON matters(status);
        CREATE INDEX IF NOT EXISTS idx_matters_opening_date ON matters(opening_date DESC);
        CREATE INDEX IF NOT EXISTS idx_matters_internal_id ON matters(internal_id);
        CREATE INDEX IF NOT EXISTS idx_matters_court_id ON matters(court_id);
        CREATE INDEX IF NOT EXISTS idx_matter_parties_party ON matter_parties(party_id);
        CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parent_type, parent_id);
        CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(is_pinned DESC, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_entity_tags_entity ON entity_tags(entity_type, entity_id);
        CREATE INDEX IF NOT EXISTS idx_entity_tags_entity_id ON entity_tags(entity_id);
        CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_type, source_id);
        CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_type, target_id);
        CREATE INDEX IF NOT EXISTS idx_documents_matter ON documents(matter_id);
        CREATE INDEX IF NOT EXISTS idx_documents_source_matter ON documents(source_system, matter_id);
        CREATE INDEX IF NOT EXISTS idx_documents_uyap_incoming ON documents(incoming_date DESC)
            WHERE source_system = 'UYAP';
        CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(file_hash);
        CREATE INDEX IF NOT EXISTS idx_deadlines_matter ON deadlines(matter_id);
        CREATE INDEX IF NOT EXISTS idx_deadlines_date ON deadlines(event_date, is_completed);
        CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_date);
        CREATE INDEX IF NOT EXISTS idx_tasks_matter ON tasks(matter_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_party ON tasks(party_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_source_note ON tasks(source_note_id);
        CREATE INDEX IF NOT EXISTS idx_file_tags_tag ON file_tags(tag);
        CREATE INDEX IF NOT EXISTS idx_file_recent_opened ON file_recent(opened_at DESC);
        CREATE INDEX IF NOT EXISTS idx_file_pins_time ON file_pins(pinned_at DESC);
    `);

    migrateLegacyClientsAndCasesToModern(db);
    migrateNotesAttachments(db);
    migrateEditorTypography(db);
    migrateHeaderFooterLibrary(db);
    migrateDocumentHeaderFooter(db);
    migrateDocumentHistory(db);
    migrateDocumentTemplates(db);
    migrateMentionLineageLog(db);
    migrateDomainLegalEntities(db);
    migrateBooleanFlagsSoft(db);
    migrateSchemaAuditAndIndexes(db);
    migrateEntityAttributeTables(db);
    migrateAppMeta(db);
    purgeKnowledgeBaseKanunRows(db);
    migrateNotifications(db);
    migrateDedupeUyapEvrakDocuments(db);
    migrateDeadlinesPartyId(db);
    migrateTasksAndDeadlineTaskId(db);
    if (notesFtsNeedsInitialRebuild) {
        try {
            db.exec(`INSERT INTO notes_fts(notes_fts) VALUES('rebuild');`);
        } catch (rebuildErr) {
            console.warn('notes_fts initial rebuild failed:', rebuildErr);
        }
    }

    console.log("Database schema initialized with notes and client management tables.");
}

function checksumText(text: string): string {
    return createHash('sha256').update(text || '', 'utf8').digest('hex');
}

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
    return UUID_RE.test(s.trim());
}

function parsePartyMetadata(raw: unknown): Record<string, unknown> {
    if (typeof raw !== 'string' || !raw.trim()) return {};
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function findPartyIdsForContextFilter(database: Database.Database, partyId: string): string[] {
    const party = database
        .prepare(`SELECT id, full_name, metadata FROM parties WHERE id = ?`)
        .get(partyId) as { id: string; full_name?: string; metadata?: string } | undefined;
    if (!party) return [partyId];

    const meta = parsePartyMetadata(party.metadata);
    const uyap = (meta.uyap ?? {}) as Record<string, unknown>;
    const dedupKey = typeof uyap.dedupKey === 'string' ? uyap.dedupKey : null;
    const ids = new Set<string>([partyId]);

    if (dedupKey) {
        const rows = database
            .prepare(
                `SELECT id FROM parties WHERE json_extract(metadata, '$.uyap.dedupKey') = ?`
            )
            .all(dedupKey) as Array<{ id: string }>;
        for (const row of rows) ids.add(row.id);
    }

    if (party.full_name) {
        const rows = database
            .prepare(
                `SELECT id FROM parties
                 WHERE TRIM(LOWER(full_name)) = TRIM(LOWER(?))`
            )
            .all(party.full_name) as Array<{ id: string }>;
        for (const row of rows) ids.add(row.id);
    }

    return [...ids];
}

function fetchPartyRelatedNotesSummary(
    database: Database.Database,
    partyId: string,
    limit: number = 5
): Array<Record<string, unknown>> {
    const partyIds = findPartyIdsForContextFilter(database, partyId);
    if (partyIds.length === 0) return [];
    const placeholders = partyIds.map(() => '?').join(', ');
    const safeLimit = Math.max(1, Math.min(50, limit));

    return database
        .prepare(
            `
        SELECT DISTINCT
            n.id,
            n.title,
            CASE
                WHEN LENGTH(n.content_plain) > 220 THEN SUBSTR(n.content_plain, 1, 220) || '…'
                ELSE n.content_plain
            END AS content_preview,
            n.parent_type,
            n.parent_id,
            n.is_pinned,
            n.metadata,
            n.created_at,
            n.updated_at
        FROM notes n
        LEFT JOIN links l
            ON l.source_id = n.id
            AND l.source_type = 'NOTE'
            AND l.link_context = 'mention'
        WHERE (n.parent_type = 'PARTY' AND n.parent_id IN (${placeholders}))
           OR (l.target_type = 'PARTY' AND l.target_id IN (${placeholders}))
        ORDER BY n.updated_at DESC
        LIMIT ?
    `
        )
        .all(...partyIds, ...partyIds, safeLimit) as Array<Record<string, unknown>>;
}

function fetchPartyRelatedCounts(
    database: Database.Database,
    partyId: string
): { matter_count: number; note_count: number } {
    const partyIds = findPartyIdsForContextFilter(database, partyId);
    if (partyIds.length === 0) return { matter_count: 0, note_count: 0 };
    const placeholders = partyIds.map(() => '?').join(', ');

    const matterRow = database
        .prepare(
            `
        SELECT COUNT(DISTINCT m.id) AS c
        FROM matters m
        JOIN matter_parties mp ON m.id = mp.matter_id
        WHERE mp.party_id IN (${placeholders})
    `
        )
        .get(...partyIds) as { c?: number };

    const noteRow = database
        .prepare(
            `
        SELECT COUNT(DISTINCT n.id) AS c
        FROM notes n
        LEFT JOIN links l
            ON l.source_id = n.id
            AND l.source_type = 'NOTE'
            AND l.link_context = 'mention'
        WHERE (n.parent_type = 'PARTY' AND n.parent_id IN (${placeholders}))
           OR (l.target_type = 'PARTY' AND l.target_id IN (${placeholders}))
    `
        )
        .get(...partyIds, ...partyIds) as { c?: number };

    return {
        matter_count: Number(matterRow?.c ?? 0),
        note_count: Number(noteRow?.c ?? 0),
    };
}

function fetchClientReport(
    database: Database.Database,
    partyId: string,
    lastEvrakLimit?: number,
): ClientReport | null {
    const id = String(partyId ?? '').trim();
    if (!id) return null;
    const party = database
        .prepare(`SELECT id, full_name FROM parties WHERE id = ?`)
        .get(id) as { id: string; full_name?: string } | undefined;
    if (!party) return null;

    const limit = clampLastEvrakLimit(lastEvrakLimit);
    const generatedAt = localIsoDate();
    const partyName = String(party.full_name || '').trim() || 'Müvekkil';
    const partyIds = findPartyIdsForContextFilter(database, id);
    if (partyIds.length === 0) {
        return assembleClientReport({ partyId: id, partyName, generatedAt, matters: [] });
    }
    const placeholders = partyIds.map(() => '?').join(', ');

    const matterRows = database
        .prepare(
            `
        SELECT
            m.id,
            m.file_number,
            m.court_name,
            m.matter_type,
            m.status,
            m.opening_date,
            m.closing_date,
            json_extract(m.metadata, '$.uyap.dosyaTurKod') AS dosya_tur_kod,
            json_extract(m.metadata, '$.uyap.dosyaTur') AS dosya_tur,
            json_extract(m.metadata, '$.uyap.dosyaAcilisTarihi') AS dosya_acilis_tarihi,
            json_extract(m.metadata, '$.uyap.yargiBirimTablo') AS yargi_birim_tablo,
            json_extract(m.metadata, '$.uyap.birimAdi') AS birim_adi,
            json_extract(m.metadata, '$.uyap.dosyaDurum') AS dosya_durum,
            json_extract(m.metadata, '$.uyap.davaTurleriStr') AS dava_turleri_str,
            json_extract(m.metadata, '$.uyap.icra.takipYolu') AS icra_takip_yolu_kod,
            json_extract(m.metadata, '$.uyap.partyProcessRoles') AS party_process_roles
        FROM matters m
        WHERE m.id IN (
            SELECT matter_id FROM matter_parties WHERE party_id IN (${placeholders})
        )
        ORDER BY m.opening_date DESC
        `,
        )
        .all(...partyIds) as Array<{
        id: string;
        file_number: string | null;
        court_name: string | null;
        matter_type: string | null;
        status: string | null;
        opening_date: string | null;
        closing_date: string | null;
        dosya_tur_kod: unknown;
        dosya_tur: unknown;
        dosya_acilis_tarihi: unknown;
        yargi_birim_tablo: unknown;
        birim_adi: unknown;
        dosya_durum: unknown;
        dava_turleri_str: unknown;
        icra_takip_yolu_kod: unknown;
        party_process_roles: unknown;
    }>;

    if (matterRows.length === 0) {
        return assembleClientReport({ partyId: id, partyName, generatedAt, matters: [] });
    }

    const matterIds = matterRows.map((row) => row.id);
    const matterPlaceholders = matterIds.map(() => '?').join(', ');
    const linkRows = database
        .prepare(
            `
        SELECT mp.matter_id, mp.party_id, mp.role, p.full_name
        FROM matter_parties mp
        LEFT JOIN parties p ON p.id = mp.party_id
        WHERE mp.matter_id IN (${matterPlaceholders})
        `,
        )
        .all(...matterIds) as Array<{
        matter_id: string;
        party_id: string;
        role: string | null;
        full_name: string | null;
    }>;
    const linksByMatter = new Map<string, ReportPartyLink[]>();
    for (const link of linkRows) {
        const list = linksByMatter.get(link.matter_id) ?? [];
        list.push({ partyId: link.party_id, role: link.role, fullName: link.full_name });
        linksByMatter.set(link.matter_id, list);
    }

    const attrRows = database
        .prepare(
            `
        SELECT entity_id, tag_key, tag_value
        FROM entity_attributes
        WHERE entity_type = 'MATTER'
          AND entity_id IN (${matterPlaceholders})
          AND tag_key IN (
            'uyap_dava_turu',
            'uyap_icra_takip_yolu',
            'icra_takip_yolu',
            'uyap_dosya_durumu',
            'uyap_dosya_acilis_tarihi',
            'uyap_evrak_son'
          )
        `,
        )
        .all(...matterIds) as Array<{ entity_id: string; tag_key: string; tag_value: string | null }>;
    const attrsByMatter = new Map<string, Record<string, string>>();
    for (const row of attrRows) {
        if (!row.tag_value) continue;
        const bag = attrsByMatter.get(row.entity_id) ?? {};
        bag[row.tag_key] = row.tag_value;
        attrsByMatter.set(row.entity_id, bag);
    }

    const portalDateSql = sqlUyapPortalDateColumnFirst('d');
    const evrakRows = database
        .prepare(
            `
        SELECT
            d.matter_id AS matter_id,
            COALESCE(json_extract(d.metadata, '$.uyap.tur'), d.title, '') AS tur,
            ${portalDateSql} AS portal_date
        FROM documents d
        WHERE d.source_system = 'UYAP'
          AND d.matter_id IN (${matterPlaceholders})
        `,
        )
        .all(...matterIds) as Array<{ matter_id: string; tur: string | null; portal_date: string | null }>;
    const evrakByMatter = new Map<string, ClientReportEvrakItem[]>();
    for (const row of evrakRows) {
        const list = evrakByMatter.get(row.matter_id) ?? [];
        list.push({
            tur: String(row.tur || '').trim(),
            date: String(row.portal_date || '').trim().slice(0, 10),
        });
        evrakByMatter.set(row.matter_id, list);
    }
    for (const [matterId, items] of evrakByMatter) {
        items.sort((a, b) => {
            if (a.date && b.date) return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
            if (a.date) return -1;
            if (b.date) return 1;
            return 0;
        });
        evrakByMatter.set(matterId, items.slice(0, limit));
    }

    const matters: ClientReportMatterInput[] = matterRows.map((row) => {
        const links = linksByMatter.get(row.id) ?? [];
        const preferred =
            links.find((link) => link.partyId === id) ??
            links.find((link) => partyIds.includes(link.partyId)) ??
            links[0];
        const officeRole = preferred?.role ?? null;
        const processRole = lookupPartyProcessRole(row.party_process_roles, [
            preferred?.partyId ?? '',
            id,
            ...partyIds,
        ]);
        const attrs = attrsByMatter.get(row.id) ?? {};
        const courtHint = {
            yargiBirimTablo:
                row.yargi_birim_tablo == null || String(row.yargi_birim_tablo).trim() === ''
                    ? null
                    : String(row.yargi_birim_tablo).trim(),
            courtName: row.court_name ?? (row.birim_adi != null ? String(row.birim_adi) : null),
            birimAdi: row.birim_adi != null ? String(row.birim_adi) : null,
            dosyaTurKod: row.dosya_tur_kod,
            dosyaTur: row.dosya_tur != null ? String(row.dosya_tur) : null,
        };
        let turBucket = bucketDosyaTur(row.dosya_tur_kod, courtHint);
        if (
            String(row.matter_type || '') === 'ENFORCEMENT' &&
            turBucket === 'other' &&
            !isDigerYargiCourt(courtHint)
        ) {
            turBucket = 'icra';
        }
        const dosyaTuru = resolveNotificationDosyaTurLabel({
            matterType: row.matter_type,
            dosyaTurKod: row.dosya_tur_kod,
            dosyaTur: row.dosya_tur != null ? String(row.dosya_tur) : null,
            yargiBirimTablo: row.yargi_birim_tablo,
            courtName: courtHint.courtName,
            davaTuru: attrs.uyap_dava_turu || (row.dava_turleri_str != null ? String(row.dava_turleri_str) : ''),
            icraTakipYolu: attrs.uyap_icra_takip_yolu || attrs.icra_takip_yolu || '',
            icraTakipYoluKod: row.icra_takip_yolu_kod,
        });
        const latestEvrak = evrakByMatter.get(row.id) ?? [];
        const fallbackSon = String(attrs.uyap_evrak_son || '').trim();
        const lastOperations = formatLastOperations(latestEvrak) || fallbackSon;
        const lastItem = latestEvrak[0];
        let lastEvrakTur = lastItem?.tur || '';
        let lastEvrakDate = lastItem?.date || '';
        if (!lastEvrakTur && fallbackSon) {
            const match = fallbackSon.match(/^(.*?)(?:\s*\(([^)]+)\))?$/);
            lastEvrakTur = (match?.[1] || fallbackSon).trim();
            lastEvrakDate = toIsoDate(match?.[2] || '') || lastEvrakDate;
        }

        return {
            id: row.id,
            fileNumber: row.file_number,
            courtName: displayCourtName(row.court_name || row.birim_adi, ''),
            matterType: row.matter_type,
            status: row.status,
            openingDate: coalesceOpeningDate({
                openingDate: row.opening_date,
                dosyaAcilisTarihi: row.dosya_acilis_tarihi,
                attrOpening: attrs.uyap_dosya_acilis_tarihi ?? null,
            }),
            closingDate: row.closing_date,
            turBucket,
            dosyaTuru,
            uyapDurum: attrs.uyap_dosya_durumu || (row.dosya_durum != null ? String(row.dosya_durum) : ''),
            sifat: resolveClientSifat(officeRole, processRole),
            karsiTaraf: formatReportKarsiTaraf(links, partyIds),
            lastEvrakTur,
            lastEvrakDate,
            lastOperations,
        };
    });

    return assembleClientReport({ partyId: id, partyName, generatedAt, matters });
}

const NOTES_SUMMARY_SELECT = `
    n.id,
    n.title,
    CASE
        WHEN LENGTH(n.content_plain) > 220 THEN SUBSTR(n.content_plain, 1, 220) || '…'
        ELSE n.content_plain
    END AS content_preview,
    n.parent_type,
    n.parent_id,
    n.is_pinned,
    n.metadata,
    n.created_at,
    n.updated_at`;

type NoteContextFilterSql = { sql: string; params: unknown[]; empty: boolean };

/** Notes linked via parent_type/parent_id or @mention in links — used by Notlar panel + FTS search. */
function buildNoteContextFilterSql(
    database: Database.Database,
    parentType: string,
    parentId: string
): NoteContextFilterSql {
    const type = String(parentType ?? '').trim().toUpperCase();
    const id = String(parentId ?? '').trim();
    if (!type || !id) return { sql: '', params: [], empty: false };

    switch (type) {
        case 'PARTY': {
            const partyIds = findPartyIdsForContextFilter(database, id);
            if (partyIds.length === 0) return { sql: ' AND 1=0', params: [], empty: true };
            const ph = partyIds.map(() => '?').join(', ');
            return {
                sql: `
                    AND (
                        (n.parent_type = 'PARTY' AND n.parent_id IN (${ph}))
                        OR EXISTS (
                            SELECT 1 FROM links l
                            WHERE l.source_id = n.id
                              AND l.source_type = 'NOTE'
                              AND l.link_context = 'mention'
                              AND l.target_type = 'PARTY'
                              AND l.target_id IN (${ph})
                        )
                        OR (n.parent_type = 'MATTER' AND n.parent_id IN (
                            SELECT mp.matter_id FROM matter_parties mp WHERE mp.party_id IN (${ph})
                        ))
                        OR EXISTS (
                            SELECT 1 FROM links l
                            WHERE l.source_id = n.id
                              AND l.source_type = 'NOTE'
                              AND l.link_context = 'mention'
                              AND l.target_type = 'MATTER'
                              AND l.target_id IN (
                                  SELECT mp.matter_id FROM matter_parties mp WHERE mp.party_id IN (${ph})
                              )
                        )
                    )`,
                params: [...partyIds, ...partyIds, ...partyIds, ...partyIds],
                empty: false,
            };
        }
        case 'MATTER':
            return {
                sql: `
                    AND (
                        (n.parent_type = 'MATTER' AND n.parent_id = ?)
                        OR EXISTS (
                            SELECT 1 FROM links l
                            WHERE l.source_id = n.id
                              AND l.source_type = 'NOTE'
                              AND l.link_context = 'mention'
                              AND l.target_type = 'MATTER'
                              AND l.target_id = ?
                        )
                    )`,
                params: [id, id],
                empty: false,
            };
        case 'DOCUMENT':
            return {
                sql: `
                    AND (
                        (n.parent_type = 'DOCUMENT' AND n.parent_id = ?)
                        OR EXISTS (
                            SELECT 1 FROM links l
                            WHERE l.source_id = n.id
                              AND l.source_type = 'NOTE'
                              AND l.link_context = 'mention'
                              AND l.target_type = 'DOCUMENT'
                              AND l.target_id = ?
                        )
                    )`,
                params: [id, id],
                empty: false,
            };
        case 'KNOWLEDGE':
            return {
                sql: `
                    AND EXISTS (
                        SELECT 1 FROM links l
                        WHERE l.source_id = n.id
                          AND l.source_type = 'NOTE'
                          AND l.link_context = 'mention'
                          AND l.target_type = 'KNOWLEDGE'
                          AND l.target_id = ?
                    )`,
                params: [id],
                empty: false,
            };
        default:
            return {
                sql: ' AND n.parent_type = ? AND n.parent_id = ?',
                params: [type, id],
                empty: false,
            };
    }
}

function fetchNotesSummaryForContext(
    database: Database.Database,
    parentType: string,
    parentId: string,
    options?: { isPinned?: boolean }
): Array<Record<string, unknown>> {
    const ctx = buildNoteContextFilterSql(database, parentType, parentId);
    if (ctx.empty) return [];

    let query = `SELECT DISTINCT ${NOTES_SUMMARY_SELECT} FROM notes n WHERE 1=1${ctx.sql}`;
    const params = [...ctx.params];

    if (options?.isPinned !== undefined) {
        query += ' AND n.is_pinned = ?';
        params.push(options.isPinned ? 1 : 0);
    }

    query += ' ORDER BY n.is_pinned DESC, n.updated_at DESC';
    return database.prepare(query).all(...params) as Array<Record<string, unknown>>;
}

function knowledgeIdsForContextFilter(
    database: Database.Database,
    filters?: { linked_party_id?: string; linked_matter_id?: string }
): string[] | null {
    const partyId = String(filters?.linked_party_id ?? '').trim();
    const matterId = String(filters?.linked_matter_id ?? '').trim();
    if (!partyId && !matterId) return null;

    const ids = new Set<string>();

    const collectKnowledgeIds = (rows: Array<{ knowledge_id?: string | null }>) => {
        for (const row of rows) {
            const id = String(row.knowledge_id ?? '').trim();
            if (id) ids.add(id);
        }
    };

    if (matterId) {
        collectKnowledgeIds(
            database
                .prepare(
                    `
                SELECT CASE WHEN source_type = 'KNOWLEDGE' THEN source_id ELSE target_id END AS knowledge_id
                FROM links
                WHERE (source_type = 'KNOWLEDGE' AND target_type = 'MATTER' AND target_id = ?)
                   OR (target_type = 'KNOWLEDGE' AND source_type = 'MATTER' AND source_id = ?)
            `
                )
                .all(matterId, matterId) as Array<{ knowledge_id?: string | null }>
        );
    }

    if (partyId) {
        const partyIds = findPartyIdsForContextFilter(database, partyId);
        const placeholders = partyIds.map(() => '?').join(', ');

        collectKnowledgeIds(
            database
                .prepare(
                    `
                SELECT CASE WHEN source_type = 'KNOWLEDGE' THEN source_id ELSE target_id END AS knowledge_id
                FROM links
                WHERE (source_type = 'KNOWLEDGE' AND target_type = 'PARTY' AND target_id IN (${placeholders}))
                   OR (target_type = 'KNOWLEDGE' AND source_type = 'PARTY' AND source_id IN (${placeholders}))
            `
                )
                .all(...partyIds, ...partyIds) as Array<{ knowledge_id?: string | null }>
        );

        collectKnowledgeIds(
            database
                .prepare(
                    `
                SELECT CASE WHEN l.source_type = 'KNOWLEDGE' THEN l.source_id ELSE l.target_id END AS knowledge_id
                FROM links l
                WHERE (
                    (l.source_type = 'KNOWLEDGE' AND l.target_type = 'MATTER' AND l.target_id IN (
                        SELECT matter_id FROM matter_parties WHERE party_id IN (${placeholders})
                    ))
                    OR (l.target_type = 'KNOWLEDGE' AND l.source_type = 'MATTER' AND l.source_id IN (
                        SELECT matter_id FROM matter_parties WHERE party_id IN (${placeholders})
                    ))
                )
            `
                )
                .all(...partyIds, ...partyIds) as Array<{ knowledge_id?: string | null }>
        );
    }

    return [...ids];
}

const MATTER_SEARCH_SELECT = `
    SELECT m.id, m.matter_type, m.matter_category, m.internal_id, m.title, m.court_name,
           m.file_number, m.esas_no, m.dis_no, m.decision_number, m.status,
           m.opening_date, m.closing_date, m.created_at, m.updated_at,
        GROUP_CONCAT(
            p.full_name ||
            CASE WHEN mp.role IS NOT NULL AND TRIM(mp.role) != '' THEN ' (' || mp.role || ')' ELSE '' END,
            ', '
        ) AS parties_list,
        GROUP_CONCAT(json_extract(p.metadata, '$.uyap.vekil'), ', ') AS vekiller_list,
        GROUP_CONCAT(
            CASE WHEN ea.tag_key IN ('uyap_dava_turu', 'uyap_icra_takip_yolu')
                 THEN ea.tag_key || ': ' || ea.tag_value END,
            ' | '
        ) AS attributes_search
    FROM matters m
    LEFT JOIN matter_parties mp ON m.id = mp.matter_id
    LEFT JOIN parties p ON mp.party_id = p.id
    LEFT JOIN entity_attributes ea ON ea.entity_type = 'MATTER' AND ea.entity_id = m.id
        AND ea.tag_key IN ('uyap_dava_turu', 'uyap_icra_takip_yolu')
`;

const MATTER_TURKISH_SEARCH_FIELDS = [
    'title',
    'file_number',
    'internal_id',
    'court_name',
    'esas_no',
    'dis_no',
    'decision_number',
    'matter_category',
    'parties_list',
    'vekiller_list',
    'attributes_search',
] as const;

const KNOWLEDGE_LIST_CONTENT_CHARS = 480;

const KNOWLEDGE_LIST_SELECT = `
    SELECT kb.id, kb.type, kb.title, kb.author, kb.source_url, kb.metadata, kb.tags,
           kb.created_at, kb.updated_at,
           substr(kb.content, 1, ${KNOWLEDGE_LIST_CONTENT_CHARS}) AS content,
           length(kb.content) AS content_chars,
           GROUP_CONCAT(ea.tag_key || ': ' || ea.tag_value, ' | ') AS attributes_search
    FROM knowledge_base kb
    LEFT JOIN entity_attributes ea ON ea.entity_type = 'KNOWLEDGE' AND ea.entity_id = kb.id
`;

const KNOWLEDGE_SEARCH_SELECT = `
    SELECT kb.*,
        GROUP_CONCAT(ea.tag_key || ': ' || ea.tag_value, ' | ') AS attributes_search
    FROM knowledge_base kb
    LEFT JOIN entity_attributes ea ON ea.entity_type = 'KNOWLEDGE' AND ea.entity_id = kb.id
`;

function projectKnowledgeListRow(row: Record<string, unknown>): Record<string, unknown> {
    const content = typeof row.content === 'string' ? row.content : '';
    return {
        ...row,
        content:
            content.length > KNOWLEDGE_LIST_CONTENT_CHARS
                ? content.slice(0, KNOWLEDGE_LIST_CONTENT_CHARS)
                : content,
        content_chars: Number(row.content_chars) || content.length,
    };
}

function fetchMattersWithSearchContext(
    database: Database.Database,
    matterIds: string[],
    limit: number
): Array<Record<string, unknown>> {
    if (matterIds.length === 0) return [];
    const placeholders = matterIds.map(() => '?').join(', ');
    return database
        .prepare(
            `
        ${MATTER_SEARCH_SELECT}
        WHERE m.id IN (${placeholders})
        GROUP BY m.id
        ORDER BY m.updated_at DESC
        LIMIT ?
    `
        )
        .all(...matterIds, limit) as Array<Record<string, unknown>>;
}

function searchPartiesForGlobalQuery(
    database: Database.Database,
    query: string,
    limit: number
): Array<Record<string, unknown>> {
    const q = query.trim();
    if (!q) return [];

    const safeLimit = Math.max(1, Math.min(100, limit));
    const { clause, params } = buildFoldedLikeOrClause(
        ['full_name', 'id_number', 'email', 'phone'],
        q,
    );

    const rows = database
        .prepare(
            `
        SELECT id, type, party_kind, is_client, full_name, id_number, email, phone, address,
               created_at, updated_at
        FROM parties
        WHERE ${clause}
        LIMIT ?
    `
        )
        .all(...params, safeLimit * 4) as Array<Record<string, unknown>>;

    return filterRowsByTurkishQuery(
        rows,
        q,
        ['full_name', 'id_number', 'email', 'phone', 'address'],
        safeLimit,
    );
}

function searchMattersForGlobalQuery(
    database: Database.Database,
    query: string,
    limit: number,
    linkedPartyIds: string[] = []
): Array<Record<string, unknown>> {
    const q = query.trim();
    if (!q) return [];

    const safeLimit = Math.max(1, Math.min(100, limit));
    const byId = new Map<string, Record<string, unknown>>();
    const matchedViaPartyLink = new Set<string>();

    const ingestIds = (ids: Array<{ id?: string; entity_id?: string; matter_id?: string }>) => {
        const next = ids
            .map((row) => String(row.id ?? row.entity_id ?? row.matter_id ?? ''))
            .filter((id) => id && !byId.has(id));
        if (next.length === 0) return;
        for (const row of fetchMattersWithSearchContext(database, next, safeLimit * 4)) {
            const id = String(row.id ?? '');
            if (id) byId.set(id, row);
        }
    };

    const matterLike = buildFoldedLikeOrClause(
        ['title', 'file_number', 'internal_id', 'court_name', 'decision_number', 'matter_category', 'esas_no', 'dis_no'],
        q,
    );
    ingestIds(
        database
            .prepare(`SELECT id FROM matters WHERE ${matterLike.clause} LIMIT ?`)
            .all(...matterLike.params, safeLimit * 6) as Array<{ id?: string }>,
    );

    const attrLike = buildFoldedLikeOrClause(['tag_value'], q);
    ingestIds(
        database
            .prepare(
                `
        SELECT DISTINCT entity_id
        FROM entity_attributes
        WHERE entity_type = 'MATTER'
          AND tag_key IN ('uyap_dava_turu', 'uyap_icra_takip_yolu')
          AND (${attrLike.clause})
        LIMIT ?
    `
            )
            .all(...attrLike.params, safeLimit * 4) as Array<{ entity_id?: string }>,
    );

    const partyIds = new Set(linkedPartyIds.filter(Boolean));
    const partyLike = buildFoldedLikeOrClause(['full_name', 'id_number'], q);
    const partyCandidates = database
        .prepare(
            `
        SELECT id, full_name, id_number FROM parties
        WHERE ${partyLike.clause}
        LIMIT ?
    `
        )
        .all(...partyLike.params, safeLimit * 8) as Array<Record<string, unknown>>;

    for (const row of filterRowsByTurkishQuery(partyCandidates, q, ['full_name', 'id_number'], safeLimit * 4)) {
        const id = String(row.id ?? '');
        if (id) partyIds.add(id);
    }

    const validPartyIds = [...partyIds];
    if (validPartyIds.length > 0) {
        const placeholders = validPartyIds.map(() => '?').join(', ');
        const linkedRows = database
            .prepare(
                `
            SELECT DISTINCT matter_id
            FROM matter_parties
            WHERE party_id IN (${placeholders})
            LIMIT ?
        `
            )
            .all(...validPartyIds, safeLimit * 6) as Array<{ matter_id?: string }>;

        const linkedIds = linkedRows
            .map((row) => String(row.matter_id ?? ''))
            .filter((id) => id && !byId.has(id));
        if (linkedIds.length > 0) {
            ingestIds(linkedIds.map((id) => ({ id })));
        }
        for (const id of linkedRows.map((row) => String(row.matter_id ?? '')).filter(Boolean)) {
            matchedViaPartyLink.add(id);
        }
    }

    return [...byId.values()]
        .filter((row) => {
            const id = String(row.id ?? '');
            if (matchedViaPartyLink.has(id)) return true;
            return MATTER_TURKISH_SEARCH_FIELDS.some((field) =>
                turkishIncludes(String(row[field] ?? ''), q)
            );
        })
        .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
        .slice(0, safeLimit);
}

function fetchKnowledgeWithSearchContext(
    database: Database.Database,
    knowledgeIds: string[],
    limit: number
): Array<Record<string, unknown>> {
    if (knowledgeIds.length === 0) return [];
    const placeholders = knowledgeIds.map(() => '?').join(', ');
    return database
        .prepare(
            `
        ${KNOWLEDGE_LIST_SELECT}
        WHERE kb.id IN (${placeholders})
        GROUP BY kb.id
        ORDER BY kb.created_at DESC
        LIMIT ?
    `
        )
        .all(...knowledgeIds, limit) as Array<Record<string, unknown>>;
}

function searchKnowledgeForGlobalQuery(
    database: Database.Database,
    query: string,
    limit: number
): Array<Record<string, unknown>> {
    const q = query.trim();
    if (!q) return [];

    const safeLimit = Math.max(1, Math.min(100, limit));
    const ids: string[] = [];
    const seen = new Set<string>();
    const pushIds = (rows: Array<{ id?: string; entity_id?: string }>) => {
        for (const row of rows) {
            const id = String(row.id ?? row.entity_id ?? '');
            if (!id || seen.has(id)) continue;
            seen.add(id);
            ids.push(id);
        }
    };

    const titleLike = buildFoldedLikeOrClause(['title', 'author', 'tags'], q);
    pushIds(
        database
            .prepare(`SELECT id FROM knowledge_base WHERE ${titleLike.clause} LIMIT ?`)
            .all(...titleLike.params, safeLimit * 6) as Array<{ id?: string }>,
    );

    const attrLike = buildFoldedLikeOrClause(['tag_value'], q);
    pushIds(
        database
            .prepare(
                `
        SELECT DISTINCT entity_id
        FROM entity_attributes
        WHERE entity_type = 'KNOWLEDGE' AND (${attrLike.clause})
        LIMIT ?
    `
            )
            .all(...attrLike.params, safeLimit * 4) as Array<{ entity_id?: string }>,
    );

    if (ids.length === 0) return [];
    return fetchKnowledgeWithSearchContext(database, ids, safeLimit).map(projectKnowledgeListRow);
}

const NOTE_LIST_CONTENT_CHARS = 480;
const NOTE_SEARCH_SELECT = `
    SELECT n.id, n.title, n.parent_type, n.parent_id, n.updated_at, n.created_at, n.is_pinned,
           substr(n.content_plain, 1, ${NOTE_LIST_CONTENT_CHARS}) AS content_plain
    FROM notes n
`;

type NoteSearchFilters = { parentType?: string; parentId?: string };

function searchNotesHybrid(
    database: Database.Database,
    query: string,
    limit: number,
    filters?: NoteSearchFilters
): unknown[] {
    const q = query.trim();
    if (!q) return [];

    const safeLimit = Math.max(1, Math.min(200, limit));
    let filterSql = '';
    const filterParams: unknown[] = [];

    if (filters?.parentType && filters?.parentId) {
        const ctx = buildNoteContextFilterSql(database, filters.parentType, filters.parentId);
        if (ctx.empty) return [];
        filterSql = ctx.sql;
        filterParams.push(...ctx.params);
    } else if (filters?.parentType) {
        filterSql += ' AND n.parent_type = ?';
        filterParams.push(filters.parentType);
    } else if (filters?.parentId) {
        filterSql += ' AND n.parent_id = ?';
        filterParams.push(filters.parentId);
    }

    const byId = new Map<string, Record<string, unknown>>();

    const ftsMatch = buildFtsMatchQuery(q);
    if (ftsMatch) {
        const ftsRows = database
            .prepare(
                `
            SELECT n.id, n.title, n.parent_type, n.parent_id, n.updated_at, n.created_at, n.is_pinned,
                   substr(n.content_plain, 1, ${NOTE_LIST_CONTENT_CHARS}) AS content_plain,
                   bm25(notes_fts) as rank
            FROM notes n
            JOIN notes_fts ON n.rowid = notes_fts.rowid
            WHERE notes_fts MATCH ?${filterSql}
            ORDER BY rank
            LIMIT ?
        `
            )
            .all(ftsMatch, ...filterParams, safeLimit * 3) as Array<Record<string, unknown>>;

        for (const row of ftsRows) {
            const id = String(row.id ?? '');
            if (id) byId.set(id, row);
        }
    }

    if (byId.size >= safeLimit) {
        return [...byId.values()].slice(0, safeLimit);
    }

    const patterns = turkishLikePatterns(q);
    const { clause: noteLikeClause, params: noteLikeParams } = buildLikeOrClause(
        ['n.title'],
        patterns,
    );
    const candidateRows = database
        .prepare(
            `
        ${NOTE_SEARCH_SELECT}
        WHERE (${noteLikeClause})${filterSql}
        LIMIT ?
    `
        )
        .all(...noteLikeParams, ...filterParams, safeLimit * 6) as Array<Record<string, unknown>>;

    for (const row of candidateRows) {
        const id = String(row.id ?? '');
        if (id && !byId.has(id)) byId.set(id, row);
    }

    return [...byId.values()].slice(0, safeLimit);
}

/** Öneri: yalnız not başlıkları (## menüsü için hafif IPC). */
function suggestNotesForQuery(database: Database.Database, q: string, perType: number): unknown[] {
    const qt = q.trim();
    if (!qt) {
        return database
            .prepare(
                `
            SELECT id, title AS label, 'NOTE' AS entity_type
            FROM notes
            ORDER BY updated_at DESC
            LIMIT ?
        `
            )
            .all(perType);
    }
    const noteLike = buildFoldedLikeOrClause(['title'], qt);
    const noteCandidates = database
        .prepare(
            `
            SELECT id, title AS label, 'NOTE' AS entity_type, title
            FROM notes
            WHERE (${noteLike.clause})
            LIMIT ?
        `
        )
        .all(...noteLike.params, perType * 4) as Array<Record<string, unknown>>;
    return filterRowsByTurkishQuery(noteCandidates, qt, ['title', 'label'], perType);
}

/** Öneri: not hariç varlıklar (@ menüsü ve birleşik öneri). */
function matterSuggestLabelSql(alias = 'm'): string {
    return `TRIM(
        COALESCE(NULLIF(TRIM(${alias}.title), ''), ${alias}.internal_id, ${alias}.id) ||
        CASE WHEN NULLIF(TRIM(COALESCE(${alias}.esas_no, ${alias}.file_number)), '') IS NOT NULL
            THEN ' • ' || TRIM(COALESCE(${alias}.esas_no, ${alias}.file_number)) ELSE '' END
    )`;
}

function fetchMattersLinkedToParties(
    database: Database.Database,
    partyRows: Array<{ id?: unknown }>,
    limit: number
): unknown[] {
    const partyIds = partyRows.map((p) => String(p.id ?? '')).filter(Boolean);
    if (!partyIds.length || limit <= 0) return [];
    const placeholders = partyIds.map(() => '?').join(', ');
    return database
        .prepare(
            `
            SELECT m.id,
                   ${matterSuggestLabelSql('m')} AS label,
                   'MATTER' AS entity_type
            FROM matters m
            INNER JOIN matter_parties mp ON mp.matter_id = m.id
            WHERE mp.party_id IN (${placeholders})
            ORDER BY m.updated_at DESC
            LIMIT ?
        `
        )
        .all(...partyIds, limit);
}

function mergeMatterSuggestRows(primary: unknown[], extra: unknown[]): unknown[] {
    const out = [...primary];
    const seen = new Set(
        primary.map((row) => String((row as { id?: unknown }).id ?? '')).filter(Boolean)
    );
    for (const row of extra) {
        const id = String((row as { id?: unknown }).id ?? '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(row);
    }
    return out;
}

function suggestEntitiesForQuery(
    database: Database.Database,
    q: string,
    perType: number,
    options?: { includeFiles?: boolean }
): {
    parties: unknown[];
    matters: unknown[];
    documents: unknown[];
    knowledge: unknown[];
    files: unknown[];
} {
    const includeFiles = options?.includeFiles !== false;
    const qt = q.trim();
    if (!qt) {
        const parties = database
            .prepare(
                `
            SELECT id,
                   TRIM(
                        COALESCE(full_name, '') ||
                        CASE WHEN NULLIF(TRIM(address), '') IS NOT NULL THEN ' • ' || TRIM(address) ELSE '' END
                   ) AS label,
                   'PARTY' AS entity_type
            FROM parties
            ORDER BY full_name ASC
            LIMIT ?
        `
            )
            .all(perType);
        const matters = database
            .prepare(
                `
            SELECT id,
                   TRIM(
                       COALESCE(NULLIF(TRIM(title), ''), internal_id, id) ||
                       CASE WHEN NULLIF(TRIM(COALESCE(esas_no, file_number)), '') IS NOT NULL THEN ' • ' || TRIM(COALESCE(esas_no, file_number)) ELSE '' END ||
                       CASE WHEN NULLIF(TRIM(dis_no), '') IS NOT NULL THEN ' • D.İş: ' || TRIM(dis_no) ELSE '' END ||
                       CASE WHEN NULLIF(TRIM(decision_number), '') IS NOT NULL THEN ' • ' || TRIM(decision_number) ELSE '' END
                   ) AS label,
                   'MATTER' AS entity_type
            FROM matters
            ORDER BY updated_at DESC
            LIMIT ?
        `
            )
            .all(perType);
        const documents = database
            .prepare(
                `
            SELECT id, title AS label, 'DOCUMENT' AS entity_type, matter_id, file_path
            FROM documents
            ORDER BY created_at DESC
            LIMIT ?
        `
            )
            .all(perType);
        const knowledge = database
            .prepare(
                `
            SELECT id, title AS label, 'KNOWLEDGE' AS entity_type
            FROM knowledge_base
            ORDER BY created_at DESC
            LIMIT ?
        `
            )
            .all(perType);
        const files = includeFiles
            ? database
                  .prepare(
                      `
            SELECT path AS id,
                   path AS label,
                   'FILE' AS entity_type,
                   path AS file_path
            FROM (
                SELECT path FROM file_recent
                UNION
                SELECT path FROM file_pins
            )
            ORDER BY path ASC
            LIMIT ?
        `
                  )
                  .all(perType)
            : [];
        const partyLinkedMatters = fetchMattersLinkedToParties(
            database,
            parties as Array<{ id?: unknown }>,
            Math.max(perType * 2, 8)
        );
        return {
            parties,
            matters: mergeMatterSuggestRows(matters, partyLinkedMatters),
            documents,
            knowledge,
            files,
        };
    }

    const partyLike = buildLikeOrClause(
        ['full_name', 'address', 'postal_address', 'id_number'],
        turkishLikePatterns(qt),
    );

    const parties = filterRowsByTurkishQuery(
        database
            .prepare(
                `
            SELECT id,
                   TRIM(
                        COALESCE(full_name, '') ||
                        CASE WHEN NULLIF(TRIM(address), '') IS NOT NULL THEN ' • ' || TRIM(address) ELSE '' END
                   ) AS label,
                   'PARTY' AS entity_type,
                   full_name,
                   address,
                   postal_address,
                   id_number
            FROM parties
            WHERE (${partyLike.clause})
            ORDER BY full_name ASC
            LIMIT ?
        `
            )
            .all(...partyLike.params, perType * 4) as Array<Record<string, unknown>>,
        qt,
        ['full_name', 'address', 'postal_address', 'id_number', 'label'],
        perType
    );

    const matterLike = buildLikeOrClause(
        [
            'title',
            'internal_id',
            'file_number',
            'decision_number',
            'esas_no',
            'dis_no',
            'court_name',
        ],
        turkishLikePatterns(qt),
    );

    const matters = filterRowsByTurkishQuery(
        database
            .prepare(
                `
            SELECT id,
                   TRIM(
                       COALESCE(NULLIF(TRIM(title), ''), internal_id, id) ||
                       CASE WHEN NULLIF(TRIM(COALESCE(esas_no, file_number)), '') IS NOT NULL THEN ' • ' || TRIM(COALESCE(esas_no, file_number)) ELSE '' END ||
                       CASE WHEN NULLIF(TRIM(dis_no), '') IS NOT NULL THEN ' • D.İş: ' || TRIM(dis_no) ELSE '' END ||
                       CASE WHEN NULLIF(TRIM(decision_number), '') IS NOT NULL THEN ' • ' || TRIM(decision_number) ELSE '' END
                   ) AS label,
                   'MATTER' AS entity_type,
                   title,
                   internal_id,
                   file_number,
                   decision_number,
                   esas_no,
                   dis_no,
                   court_name
            FROM matters
            WHERE (${matterLike.clause})
            ORDER BY updated_at DESC
            LIMIT ?
        `
            )
            .all(...matterLike.params, perType * 4) as Array<Record<string, unknown>>,
        qt,
        ['title', 'internal_id', 'file_number', 'decision_number', 'esas_no', 'dis_no', 'court_name', 'label'],
        perType
    );

    const documentLike = buildLikeOrClause(['title'], turkishLikePatterns(qt));

    const documents = filterRowsByTurkishQuery(
        database
            .prepare(
                `
            SELECT id, title AS label, 'DOCUMENT' AS entity_type, matter_id, file_path, title
            FROM documents
            WHERE (${documentLike.clause})
            ORDER BY created_at DESC
            LIMIT ?
        `
            )
            .all(...documentLike.params, perType * 4) as Array<Record<string, unknown>>,
        qt,
        ['title', 'label'],
        perType
    );

    const knowledgeLike = buildFoldedLikeOrClause(['title', 'author', 'tags'], qt);

    const knowledge = filterRowsByTurkishQuery(
        database
            .prepare(
                `
            SELECT id, title AS label, 'KNOWLEDGE' AS entity_type, title, author, tags
            FROM knowledge_base
            WHERE (${knowledgeLike.clause})
            LIMIT ?
        `
            )
            .all(...knowledgeLike.params, perType * 4) as Array<Record<string, unknown>>,
        qt,
        ['title', 'author', 'tags', 'label'],
        perType
    );

    let files: unknown[] = [];
    if (includeFiles) {
        const fileLike = buildLikeOrClause(['path'], turkishLikePatterns(qt));
        const docPathLike = buildLikeOrClause(['file_path'], turkishLikePatterns(qt));
        files = filterRowsByTurkishQuery(
            database
                .prepare(
                    `
            SELECT path AS id,
                   path AS label,
                   'FILE' AS entity_type,
                   path AS file_path
            FROM (
                SELECT path FROM file_recent WHERE (${fileLike.clause})
                UNION
                SELECT path FROM file_pins WHERE (${fileLike.clause})
                UNION
                SELECT file_path AS path FROM documents
                WHERE file_path IS NOT NULL AND (${docPathLike.clause})
            )
            ORDER BY path ASC
            LIMIT ?
        `
                )
                .all(...fileLike.params, ...fileLike.params, ...docPathLike.params, perType * 4) as Array<
                    Record<string, unknown>
                >,
            qt,
            ['label', 'file_path', 'id'],
            perType
        );
    }

    const partyLinkedMatters = fetchMattersLinkedToParties(
        database,
        parties as Array<{ id?: unknown }>,
        Math.max(perType * 2, 8)
    );

    return {
        parties,
        matters: mergeMatterSuggestRows(matters, partyLinkedMatters),
        documents,
        knowledge,
        files,
    };
}

function migrateEditorTypography(database: Database.Database) {
    database.exec(`
        CREATE TABLE IF NOT EXISTS editor_typography_defaults (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            payload TEXT NOT NULL DEFAULT '{}',
            apply_on_open INTEGER NOT NULL DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    database.prepare(`INSERT OR IGNORE INTO editor_typography_defaults (id, payload, apply_on_open) VALUES (1, '{}', 1)`).run();
    // Varsayılan biçim yeni oturumda her zaman uygulanır (UI anahtarı kaldırıldı).
    database.prepare(`UPDATE editor_typography_defaults SET apply_on_open = 1 WHERE id = 1`).run();
    database.exec(`
        CREATE TABLE IF NOT EXISTS editor_typography_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            payload TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    database.exec(`CREATE INDEX IF NOT EXISTS idx_editor_typography_presets_sort ON editor_typography_presets(sort_order, name)`);
    database.exec(`
        CREATE TABLE IF NOT EXISTS editor_block_style_defaults (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            payload TEXT NOT NULL DEFAULT '{}',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    database.prepare(`INSERT OR IGNORE INTO editor_block_style_defaults (id, payload) VALUES (1, '{}')`).run();
}

function migrateHeaderFooterLibrary(database: Database.Database) {
    database.exec(`
        CREATE TABLE IF NOT EXISTS header_footer_library (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            presets_json TEXT NOT NULL DEFAULT '[]',
            assets_json TEXT NOT NULL DEFAULT '{}',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    database
        .prepare(
            `INSERT OR IGNORE INTO header_footer_library (id, presets_json, assets_json) VALUES (1, '[]', '{}')`,
        )
        .run();
}

function migrateDocumentHeaderFooter(database: Database.Database) {
    database.exec(`
        CREATE TABLE IF NOT EXISTS document_header_footer (
            document_id TEXT PRIMARY KEY,
            payload_json TEXT,
            updated_at INTEGER
        )
    `);
}

function tableExists(database: Database.Database, tableName: string): boolean {
    const row = database
        .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1`)
        .get(tableName) as { ok: number } | undefined;
    return !!row?.ok;
}

function hasColumn(database: Database.Database, tableName: string, columnName: string): boolean {
    if (!tableExists(database, tableName)) return false;
    const rows = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    return rows.some((row) => row.name === columnName);
}

function addColumnIfMissing(
    database: Database.Database,
    tableName: string,
    columnName: string,
    columnSqlDefinition: string
) {
    try {
        if (!hasColumn(database, tableName, columnName)) {
            database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSqlDefinition}`);
            console.log(`[DB Migration] Added column ${columnName} to ${tableName}`);
        }
    } catch (err) {
        console.warn(`[DB Migration] Failed to add column ${columnName} to ${tableName}:`, err);
    }
}

function parseLegacyContactInfo(raw: unknown): {
    email: string | null;
    phone: string | null;
} {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
        return { email: null, phone: null };
    }
    try {
        const parsed = JSON.parse(raw) as { email?: unknown; phone?: unknown };
        return {
            email: typeof parsed.email === 'string' ? parsed.email : null,
            phone: typeof parsed.phone === 'string' ? parsed.phone : null,
        };
    } catch {
        return { email: null, phone: raw };
    }
}

function migrateLegacyClientsAndCasesToModern(database: Database.Database) {
    const hasClients = tableExists(database, 'clients');
    const hasCases = tableExists(database, 'cases');
    if (!hasClients && !hasCases) return;

    const migrate = database.transaction(() => {
        if (hasClients) {
            const legacyClients = database
                .prepare(
                    `SELECT id, type, name, identityNumber, contactInfo, address, notes, createdAt FROM clients`
                )
                .all() as Array<{
                id: string;
                type: string | null;
                name: string | null;
                identityNumber: string | null;
                contactInfo: string | null;
                address: string | null;
                notes: string | null;
                createdAt: string | null;
            }>;

            const insertParty = database.prepare(`
                INSERT OR IGNORE INTO parties (
                    id, type, full_name, id_number, email, phone, address, is_client, metadata, created_at, updated_at
                ) VALUES (
                    @id, @type, @full_name, @id_number, @email, @phone, @address, 1, @metadata, @created_at, @updated_at
                )
            `);

            for (const client of legacyClients) {
                const contact = parseLegacyContactInfo(client.contactInfo);
                const now = new Date().toISOString();
                insertParty.run({
                    id: client.id,
                    type: client.type === 'corporate' ? 'CORPORATE' : 'INDIVIDUAL',
                    full_name: (client.name || '').trim() || `Legacy Client ${client.id}`,
                    id_number: client.identityNumber,
                    email: contact.email,
                    phone: contact.phone,
                    address: client.address,
                    metadata: client.notes
                        ? JSON.stringify({ legacy_notes: client.notes, source_table: 'clients' })
                        : null,
                    created_at: client.createdAt || now,
                    updated_at: client.createdAt || now,
                });
            }
        }

        if (hasCases) {
            const legacyCases = database
                .prepare(
                    `SELECT c.id, c.client_id, c.court_id, c.fileNumber, c.type, c.status, c.openDate, c.details, ct.name AS court_name
                     FROM cases c
                     LEFT JOIN courts ct ON c.court_id = ct.id`
                )
                .all() as Array<{
                id: string;
                client_id: string | null;
                court_id: string | null;
                fileNumber: string | null;
                type: string | null;
                status: string | null;
                openDate: string | null;
                details: string | null;
                court_name: string | null;
            }>;

            const insertMatter = database.prepare(`
                INSERT OR IGNORE INTO matters (
                    id, matter_type, internal_id, title, court_name, file_number, status, opening_date, metadata, created_at, updated_at
                ) VALUES (
                    @id, 'LAW_CASE', @internal_id, @title, @court_name, @file_number, @status, @opening_date, @metadata, @created_at, @updated_at
                )
            `);
            const insertLink = database.prepare(`
                INSERT OR IGNORE INTO matter_parties (matter_id, party_id, role)
                VALUES (@matter_id, @party_id, 'CLIENT')
            `);

            for (const row of legacyCases) {
                const now = new Date().toISOString();
                const mappedStatus = row.status === 'closed' ? 'CLOSED' : row.status === 'archived' ? 'ARCHIVED' : 'OPEN';
                insertMatter.run({
                    id: row.id,
                    internal_id: row.fileNumber || row.id,
                    title: row.type || row.fileNumber || 'Legacy Case',
                    court_name: row.court_name,
                    file_number: row.fileNumber,
                    status: mappedStatus,
                    opening_date: row.openDate,
                    metadata: JSON.stringify({
                        legacy_source: 'cases',
                        legacy_details: row.details ?? null,
                        legacy_court_id: row.court_id ?? null,
                    }),
                    created_at: row.openDate || now,
                    updated_at: row.openDate || now,
                });
                if (row.client_id) {
                    insertLink.run({ matter_id: row.id, party_id: row.client_id });
                }
            }
        }

        if (hasCases) {
            database.exec(`DROP TABLE IF EXISTS cases`);
        }
        if (hasClients) {
            database.exec(`DROP TABLE IF EXISTS clients`);
        }
    });

    migrate();
}

function migrateSchemaAuditAndIndexes(database: Database.Database) {
    addColumnIfMissing(database, 'courts', 'created_at', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    addColumnIfMissing(database, 'courts', 'updated_at', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    addColumnIfMissing(database, 'knowledge_base', 'updated_at', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    addColumnIfMissing(database, 'tags', 'created_at', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    addColumnIfMissing(database, 'tags', 'updated_at', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    addColumnIfMissing(database, 'links', 'updated_at', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    addColumnIfMissing(database, 'documents', 'updated_at', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    addColumnIfMissing(database, 'matters', 'court_id', 'court_id TEXT');

    if (tableExists(database, 'matters') && tableExists(database, 'courts')) {
        database.exec(`
            UPDATE matters
            SET court_id = (
                SELECT c.id
                FROM courts c
                WHERE TRIM(LOWER(c.name)) = TRIM(LOWER(matters.court_name))
                LIMIT 1
            )
            WHERE (court_id IS NULL OR TRIM(court_id) = '')
              AND court_name IS NOT NULL
              AND TRIM(court_name) != ''
        `);
    }

    const stampTables = ['courts', 'knowledge_base', 'tags', 'links', 'documents', 'document_templates'];
    for (const tableName of stampTables) {
        if (hasColumn(database, tableName, 'updated_at')) {
            database.exec(
                `UPDATE ${tableName} SET updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)`
            );
        }
        if (hasColumn(database, tableName, 'created_at')) {
            database.exec(
                `UPDATE ${tableName} SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)`
            );
        }
    }

    database.exec(`
        CREATE INDEX IF NOT EXISTS idx_matter_parties_party ON matter_parties(party_id);
        CREATE INDEX IF NOT EXISTS idx_entity_tags_entity_id ON entity_tags(entity_id);
        CREATE INDEX IF NOT EXISTS idx_parties_name_nocase ON parties(full_name COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_matters_internal_id ON matters(internal_id);
        CREATE INDEX IF NOT EXISTS idx_matters_court_id ON matters(court_id);
        CREATE INDEX IF NOT EXISTS idx_documents_source_matter ON documents(source_system, matter_id);
        CREATE INDEX IF NOT EXISTS idx_documents_uyap_incoming ON documents(incoming_date DESC)
            WHERE source_system = 'UYAP';
    `);

    const updatedAtTriggerTables = [
        'parties',
        'matters',
        'notes',
        'courts',
        'knowledge_base',
        'tags',
        'links',
        'documents',
        'document_templates',
    ];
    for (const tableName of updatedAtTriggerTables) {
        if (!hasColumn(database, tableName, 'updated_at') || !hasColumn(database, tableName, 'id')) {
            continue;
        }
        database.exec(`
            CREATE TRIGGER IF NOT EXISTS ${tableName}_touch_updated_at
            AFTER UPDATE ON ${tableName}
            FOR EACH ROW
            BEGIN
                UPDATE ${tableName}
                SET updated_at = CURRENT_TIMESTAMP
                WHERE id = OLD.id;
            END;
        `);
    }
}

function migrateMentionLineageLog(database: Database.Database) {
    database.exec(`
        CREATE TABLE IF NOT EXISTS mention_lineage_log (
            id TEXT PRIMARY KEY,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            payload_json TEXT NOT NULL
        );
    `);
    database.exec(`
        CREATE INDEX IF NOT EXISTS idx_mention_lineage_created
        ON mention_lineage_log(created_at DESC);
    `);
}

function migrateDocumentTemplates(database: Database.Database) {
    const hasLegacyTemplates = tableExists(database, 'text_templates');
    const hasDocumentTemplates = tableExists(database, 'document_templates');
    if (hasLegacyTemplates && !hasDocumentTemplates) {
        database.exec(`ALTER TABLE text_templates RENAME TO document_templates`);
    }

    database.exec(`
        CREATE TABLE IF NOT EXISTS document_templates (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL DEFAULT 'CUSTOM' CHECK (category IN (
                'CONTRACT', 'PETITION', 'LETTER', 'CLAUSE', 'DEFINITION', 'PROCEDURE', 'LEGISLATION', 'CUSTOM'
            )),
            name TEXT NOT NULL,
            content_json TEXT NOT NULL,
            content_plain TEXT,
            placeholder_schema TEXT,
            description TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            usage_count INTEGER NOT NULL DEFAULT 0,
            is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0, 1)),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    const ttCols = database.prepare(`PRAGMA table_info(document_templates)`).all() as { name: string }[];
    if (!ttCols.some((c) => c.name === 'placeholder_schema')) {
        database.exec(`ALTER TABLE document_templates ADD COLUMN placeholder_schema TEXT`);
    }
    database.exec(`
        CREATE INDEX IF NOT EXISTS idx_document_templates_name ON document_templates(name COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_document_templates_category ON document_templates(category, sort_order, name);
        CREATE INDEX IF NOT EXISTS idx_document_templates_updated ON document_templates(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_document_templates_fav_usage
            ON document_templates(is_favorite DESC, usage_count DESC, name COLLATE NOCASE);
    `);
    database.prepare(`DELETE FROM document_templates WHERE id LIKE 'seed-template-%'`).run();
}

function migrateDeadlinesPartyId(database: Database.Database) {
    if (!tableExists(database, 'deadlines')) return;
    addColumnIfMissing(database, 'deadlines', 'party_id', 'party_id TEXT');
    if (hasColumn(database, 'deadlines', 'party_id')) {
        database.exec(`CREATE INDEX IF NOT EXISTS idx_deadlines_party ON deadlines(party_id)`);
    }
}

function migrateTasksAndDeadlineTaskId(database: Database.Database) {
    database.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'done')),
            due_date DATETIME,
            matter_id TEXT,
            party_id TEXT,
            source_note_id TEXT,
            completed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (matter_id) REFERENCES matters(id) ON DELETE CASCADE,
            FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE SET NULL,
            FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE SET NULL
        )
    `);
    database.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_date);
        CREATE INDEX IF NOT EXISTS idx_tasks_matter ON tasks(matter_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_party ON tasks(party_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_source_note ON tasks(source_note_id);
    `);

    if (!tableExists(database, 'deadlines')) return;
    addColumnIfMissing(database, 'deadlines', 'task_id', 'task_id TEXT');
    if (hasColumn(database, 'deadlines', 'task_id')) {
        database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_deadlines_task ON deadlines(task_id)`);
    }
}

type TaskStatus = 'open' | 'done';

function normalizeTaskStatus(value: unknown): TaskStatus {
    return value === 'done' ? 'done' : 'open';
}

function taskCompletedAt(status: TaskStatus, existing?: string | null): string | null {
    if (status !== 'done') return null;
    return existing && String(existing).trim() ? String(existing) : new Date().toISOString();
}

function syncTaskDeadlineMirror(
    database: Database.Database,
    task: {
        id: string;
        title: string;
        status: TaskStatus;
        due_date?: string | null;
        matter_id?: string | null;
        party_id?: string | null;
    },
) {
    const due = task.due_date != null && String(task.due_date).trim() ? String(task.due_date).trim() : null;
    if (!due) {
        database.prepare(`DELETE FROM deadlines WHERE task_id = ?`).run(task.id);
        return;
    }

    const existing = database
        .prepare(`SELECT id FROM deadlines WHERE task_id = ?`)
        .get(task.id) as { id: string } | undefined;
    const isCompleted = task.status === 'done' ? 1 : 0;
    const matterId = task.matter_id || null;
    const partyId = task.party_id || null;
    const description = task.title || null;

    if (existing?.id) {
        database
            .prepare(
                `UPDATE deadlines SET
                    matter_id = ?, party_id = ?, event_type = 'GOREV', event_date = ?,
                    description = ?, is_completed = ?
                 WHERE id = ?`,
            )
            .run(matterId, partyId, due, description, isCompleted, existing.id);
        return;
    }

    database
        .prepare(
            `INSERT INTO deadlines (
                id, matter_id, party_id, task_id, event_type, event_date,
                description, is_completed, reminder_date, calendar_metadata
            ) VALUES (?, ?, ?, ?, 'GOREV', ?, ?, ?, NULL, NULL)`,
        )
        .run(randomUUID(), matterId, partyId, task.id, due, description, isCompleted);
}

function insertTaskRow(
    database: Database.Database,
    task: {
        id?: string;
        title: string;
        status?: unknown;
        due_date?: string | null;
        matter_id?: string | null;
        party_id?: string | null;
        source_note_id?: string | null;
        completed_at?: string | null;
    },
) {
    const id = task.id && String(task.id).trim() ? String(task.id).trim() : randomUUID();
    const status = normalizeTaskStatus(task.status);
    const completedAt = taskCompletedAt(status, task.completed_at);
    const due = task.due_date != null && String(task.due_date).trim() ? String(task.due_date).trim() : null;
    const row = {
        id,
        title: String(task.title || '').trim() || 'Görev',
        status,
        due_date: due,
        matter_id: task.matter_id || null,
        party_id: task.party_id || null,
        source_note_id: task.source_note_id || null,
        completed_at: completedAt,
    };
    database
        .prepare(
            `INSERT INTO tasks (
                id, title, status, due_date, matter_id, party_id, source_note_id,
                completed_at, created_at, updated_at
            ) VALUES (
                @id, @title, @status, @due_date, @matter_id, @party_id, @source_note_id,
                @completed_at, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )`,
        )
        .run(row);
    syncTaskDeadlineMirror(database, row);
    return row;
}

function updateTaskRow(
    database: Database.Database,
    task: {
        id: string;
        title?: string;
        status?: unknown;
        due_date?: string | null;
        matter_id?: string | null;
        party_id?: string | null;
        source_note_id?: string | null;
        completed_at?: string | null;
    },
) {
    const existing = database.prepare(`SELECT * FROM tasks WHERE id = ?`).get(task.id) as
        | {
              id: string;
              title: string;
              status: string;
              due_date: string | null;
              matter_id: string | null;
              party_id: string | null;
              source_note_id: string | null;
              completed_at: string | null;
          }
        | undefined;
    if (!existing) return null;

    const status = task.status !== undefined ? normalizeTaskStatus(task.status) : normalizeTaskStatus(existing.status);
    const due =
        task.due_date !== undefined
            ? task.due_date != null && String(task.due_date).trim()
                ? String(task.due_date).trim()
                : null
            : existing.due_date;
    const row = {
        id: existing.id,
        title: task.title !== undefined ? String(task.title || '').trim() || 'Görev' : existing.title,
        status,
        due_date: due,
        matter_id: task.matter_id !== undefined ? task.matter_id || null : existing.matter_id,
        party_id: task.party_id !== undefined ? task.party_id || null : existing.party_id,
        source_note_id:
            task.source_note_id !== undefined ? task.source_note_id || null : existing.source_note_id,
        completed_at: taskCompletedAt(status, task.completed_at ?? existing.completed_at),
    };
    database
        .prepare(
            `UPDATE tasks SET
                title = @title, status = @status, due_date = @due_date,
                matter_id = @matter_id, party_id = @party_id, source_note_id = @source_note_id,
                completed_at = @completed_at, updated_at = CURRENT_TIMESTAMP
             WHERE id = @id`,
        )
        .run(row);
    syncTaskDeadlineMirror(database, row);
    return row;
}

function migrateBooleanFlagsSoft(database: Database.Database) {
    const normalizeFlag = (tableName: string, columnName: string) => {
        if (!hasColumn(database, tableName, columnName)) return;
        database.exec(`
            UPDATE ${tableName}
            SET ${columnName} = CASE WHEN ${columnName} = 1 THEN 1 ELSE 0 END
            WHERE ${columnName} IS NULL OR ${columnName} NOT IN (0, 1)
        `);
    };

    normalizeFlag('parties', 'is_client');
    normalizeFlag('notes', 'is_pinned');
    normalizeFlag('deadlines', 'is_completed');
    normalizeFlag('document_templates', 'is_favorite');
    normalizeFlag('editor_typography_defaults', 'apply_on_open');
}

function migrateEntityAttributeTables(database: Database.Database) {
    database.exec(`
        CREATE TABLE IF NOT EXISTS attribute_tag_catalog (
            id TEXT PRIMARY KEY,
            key TEXT NOT NULL,
            label TEXT NOT NULL,
            entity_type TEXT NOT NULL CHECK(entity_type IN ('PARTY', 'MATTER', 'KNOWLEDGE')),
            is_system INTEGER NOT NULL DEFAULT 0 CHECK(is_system IN (0, 1)),
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(entity_type, key)
        )
    `);
    database.exec(`
        CREATE TABLE IF NOT EXISTS entity_attributes (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL CHECK(entity_type IN ('PARTY', 'MATTER', 'KNOWLEDGE')),
            entity_id TEXT NOT NULL,
            tag_key TEXT NOT NULL,
            tag_value TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    database.exec(`
        CREATE INDEX IF NOT EXISTS idx_attribute_tag_catalog_entity ON attribute_tag_catalog(entity_type, sort_order, label);
        CREATE INDEX IF NOT EXISTS idx_entity_attributes_entity ON entity_attributes(entity_type, entity_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_entity_attributes_tag_key ON entity_attributes(tag_key);
    `);

    const seedRows: Array<{ entity_type: 'PARTY' | 'MATTER' | 'KNOWLEDGE'; key: string; label: string; sort_order: number }> = [
        { entity_type: 'PARTY', key: 'kep', label: 'KEP Adresi', sort_order: 10 },
        { entity_type: 'PARTY', key: 'uets', label: 'UETS', sort_order: 20 },
        { entity_type: 'PARTY', key: 'iban', label: 'IBAN', sort_order: 30 },
        { entity_type: 'PARTY', key: 'mersis_no', label: 'MERSIS No', sort_order: 40 },
        { entity_type: 'PARTY', key: 'detsis_no', label: 'DETSIS No', sort_order: 41 },
        { entity_type: 'PARTY', key: 'sicil_no', label: 'Sicil No', sort_order: 50 },
        { entity_type: 'MATTER', key: 'durusma_tarihi', label: 'Durusma Tarihi', sort_order: 10 },
        { entity_type: 'MATTER', key: 'takip_yolu', label: 'Takip Yolu', sort_order: 20 },
        { entity_type: 'MATTER', key: 'haciz_statusu', label: 'Haciz Statusu', sort_order: 30 },
        { entity_type: 'MATTER', key: 'istinaf_temiyz', label: 'Istinaf/Temyiz', sort_order: 40 },
        { entity_type: 'KNOWLEDGE', key: 'karar_no', label: 'Karar No', sort_order: 10 },
        { entity_type: 'KNOWLEDGE', key: 'esas_no', label: 'Esas No', sort_order: 20 },
        { entity_type: 'KNOWLEDGE', key: 'mahkeme', label: 'Mahkeme', sort_order: 30 },
        { entity_type: 'KNOWLEDGE', key: 'yayin_tarihi', label: 'Yayin Tarihi', sort_order: 40 }, /* Yayin Tarihi değişsin Tarih kullanalım. */
    ];
    const insertSeed = database.prepare(`
        INSERT OR IGNORE INTO attribute_tag_catalog
        (id, key, label, entity_type, is_system, sort_order)
        VALUES (?, ?, ?, ?, 1, ?)
    `);
    for (const row of seedRows) {
        insertSeed.run(`${row.entity_type.toLowerCase()}-${row.key}`, row.key, row.label, row.entity_type, row.sort_order);
    }

    seedUyapReferenceCatalog(insertSeed);
}

/** UYAP harvest vocabulary — keep in sync with udfix-app/src/data/uyap/ */
function seedUyapReferenceCatalog(insertSeed: Database.Statement) {
    const uyapPartyAdres: Array<{ key: string; label: string; sort_order: number }> = [
        { key: 'adres_yurt_ici_ikametgah', label: 'Yurt İçi İkametgah Adresi', sort_order: 100 },
        { key: 'adres_yurt_ici_isyeri', label: 'Yurt İçi İşyeri Adresi', sort_order: 101 },
        { key: 'adres_depo', label: 'Depo Adresi', sort_order: 102 },
        { key: 'adres_askerlik', label: 'Askerlik Adresi', sort_order: 103 },
        { key: 'adres_yurtdisi_ikametgah', label: 'Yurtdışı İkametgah Adresi', sort_order: 104 },
        { key: 'adres_yurtdisi_isyeri', label: 'Yurtdışı İşyeri Adresi', sort_order: 105 },
        { key: 'adres_cezaevi', label: 'Cezaevi Adresi', sort_order: 106 },
        { key: 'adres_mernis', label: 'Mernis Adresi', sort_order: 107 },
        { key: 'adres_avukatlik', label: 'Avukatlık Adresi', sort_order: 108 },
        { key: 'adres_eski_mernis', label: 'Eski Mernis Adresi', sort_order: 109 },
        { key: 'adres_mersis', label: 'Mersis Adresi', sort_order: 110 },
        { key: 'adres_eski_mersis', label: 'Eski Mersis Adresi', sort_order: 111 },
        { key: 'adres_e_tebligat', label: 'Elektronik Tebligat Adresi', sort_order: 112 },
        { key: 'adres_eski_e_tebligat', label: 'Eski Elektronik Tebligat Adresi', sort_order: 113 },
        { key: 'adres_avukatlik_e_tebligat', label: 'Avukatlık Elektronik Tebligat Adresi', sort_order: 114 },
        { key: 'adres_sonim', label: 'Şönim Adresi', sort_order: 115 },
        { key: 'adres_bilirkisi_beyan', label: 'Bilirkişi Beyan Adresi', sort_order: 116 },
        { key: 'uyap_taraf_rolu', label: 'UYAP Taraf Rolü', sort_order: 120 },
    ];
    const uyapMatter: Array<{ key: string; label: string; sort_order: number }> = [
        { key: 'uyap_dosya_tur', label: 'UYAP Dosya Türü', sort_order: 100 },
        { key: 'yargi_birim_tablo', label: 'Yargı Birimi (Tablo)', sort_order: 110 },
        { key: 'yargi_alani', label: 'Yargı Alanı', sort_order: 120 },
        { key: 'icra_takip_turu', label: 'İcra Takip Türü', sort_order: 130 },
        { key: 'icra_takip_yolu', label: 'İcra Takip Yolu', sort_order: 140 },
        { key: 'icra_takip_mahiyet', label: 'İcra Takip Mahiyeti', sort_order: 150 },
        { key: 'icra_takip_sekli', label: 'İcra Takip Şekli', sort_order: 160 },
    ];
    for (const row of uyapPartyAdres) {
        insertSeed.run(`party-${row.key}`, row.key, row.label, 'PARTY', row.sort_order);
    }
    for (const row of uyapMatter) {
        insertSeed.run(`matter-${row.key}`, row.key, row.label, 'MATTER', row.sort_order);
    }
}

function migrateNotifications(database: Database.Database) {
    database.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT,
            matter_id TEXT,
            read_at DATETIME,
            payload_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(read_at, created_at DESC);
    `);
}

const HIDDEN_MATTER_ATTRIBUTE_KEY = 'uyap_evrak_sayfa';

function migrateAppMeta(database: Database.Database) {
    database.exec(`
        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

export function getSqliteDatabase(): Database.Database | null {
    return db;
}

export function readUsageSnapshot(): {
    matters: number;
    parties: number;
    notes: number;
    documents: number;
    uyapEvrak: number;
    dbBytes: number;
} | null {
    if (!db) return null;
    const count = (sql: string): number => {
        try {
            const row = db!.prepare(sql).get() as { n?: number } | undefined;
            return typeof row?.n === 'number' ? row.n : 0;
        } catch {
            return 0;
        }
    };
    let dbBytes = 0;
    if (sqlitePath) {
        try {
            dbBytes = fs.statSync(sqlitePath).size;
        } catch {
            dbBytes = 0;
        }
    }
    return {
        matters: count('SELECT COUNT(*) AS n FROM matters'),
        parties: count('SELECT COUNT(*) AS n FROM parties'),
        notes: count('SELECT COUNT(*) AS n FROM notes'),
        documents: count('SELECT COUNT(*) AS n FROM documents'),
        uyapEvrak: count(
            `SELECT COUNT(*) AS n FROM documents WHERE source_system = 'UYAP' AND json_extract(metadata, '$.uyap.itemKey') IS NOT NULL AND json_extract(metadata, '$.uyap.itemKey') != ''`,
        ),
        dbBytes,
    };
}

export function getAppMeta(database: Database.Database, key: string): string | null {
    const row = database.prepare(`SELECT value FROM app_meta WHERE key = ?`).get(key) as
        | { value: string }
        | undefined;
    return row?.value ?? null;
}

export function setAppMeta(database: Database.Database, key: string, value: string) {
    database
        .prepare(
            `INSERT INTO app_meta (key, value, updated_at)
             VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
        )
        .run(key, value);
}

export function hasNotificationDedupeKey(database: Database.Database, dedupeKey: string): boolean {
    const row = database
        .prepare(
            `SELECT 1 AS ok FROM notifications WHERE json_extract(payload_json, '$.dedupeKey') = ? LIMIT 1`,
        )
        .get(dedupeKey) as { ok: number } | undefined;
    return Boolean(row);
}

export function insertAppNotification(
    database: Database.Database,
    row: {
        kind: string;
        title: string;
        body?: string | null;
        matterId?: string | null;
        payload?: Record<string, unknown> | null;
    },
): string {
    const id = randomUUID();
    database
        .prepare(
            `INSERT INTO notifications (id, kind, title, body, matter_id, payload_json)
             VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
            id,
            row.kind,
            row.title,
            row.body ?? null,
            row.matterId ?? null,
            row.payload ? JSON.stringify(row.payload) : null,
        );
    return id;
}

type NotificationListRow = {
    id: string;
    kind: string;
    title: string;
    body: string | null;
    matter_id: string | null;
    read_at: string | null;
    payload_json: string | null;
    created_at: string;
};

type NotificationTurAttrKey = 'uyap_dava_turu' | 'uyap_icra_takip_yolu' | 'icra_takip_yolu';

function isNotificationTurAttrKey(key: string): key is NotificationTurAttrKey {
    return key === 'uyap_dava_turu' || key === 'uyap_icra_takip_yolu' || key === 'icra_takip_yolu';
}

function applyNotificationTurAttr(
    key: NotificationTurAttrKey,
    entityId: string,
    value: string,
    davaTuruByMatter: Map<string, string>,
    icraYoluByMatter: Map<string, string>,
): void {
    switch (key) {
        case 'uyap_dava_turu':
            davaTuruByMatter.set(entityId, value);
            return;
        case 'uyap_icra_takip_yolu':
            icraYoluByMatter.set(entityId, value);
            return;
        case 'icra_takip_yolu':
            if (!icraYoluByMatter.has(entityId)) icraYoluByMatter.set(entityId, value);
            return;
        default: {
            const _exhaustive: never = key;
            return _exhaustive;
        }
    }
}

type MatterHintFields = {
    parties_line: string | null;
    dosya_tur_label: string | null;
};

function loadMatterHintFields(
    database: Database.Database,
    matterIds: string[],
): Map<string, MatterHintFields> {
    const unique = [...new Set(matterIds.map((id) => String(id || '').trim()).filter(Boolean))];
    const out = new Map<string, MatterHintFields>();
    for (const id of unique) {
        out.set(id, { parties_line: null, dosya_tur_label: null });
    }
    if (unique.length === 0) return out;

    const partiesByMatter = new Map<
        string,
        Array<{
            full_name: string | null;
            role: string | null;
            is_client: number | null;
            process_role: string | null;
        }>
    >();
    const turByMatter = new Map<string, string>();
    const placeholders = unique.map(() => '?').join(', ');
    const matterRows = database
        .prepare(
            `SELECT id,
                    matter_type,
                    court_name,
                    json_extract(metadata, '$.uyap.dosyaTurKod') AS dosya_tur_kod,
                    json_extract(metadata, '$.uyap.dosyaTur') AS dosya_tur,
                    json_extract(metadata, '$.uyap.yargiBirimTablo') AS yargi_birim_tablo,
                    json_extract(metadata, '$.uyap.davaTurleriStr') AS dava_turleri_str,
                    json_extract(metadata, '$.uyap.icra.takipYolu') AS icra_takip_yolu_kod,
                    json_extract(metadata, '$.uyap.partyProcessRoles') AS party_process_roles
             FROM matters
             WHERE id IN (${placeholders})`,
        )
        .all(...unique) as Array<{
        id: string;
        matter_type: string | null;
        court_name: string | null;
        dosya_tur_kod: unknown;
        dosya_tur: unknown;
        yargi_birim_tablo: unknown;
        dava_turleri_str: unknown;
        icra_takip_yolu_kod: unknown;
        party_process_roles: unknown;
    }>;
    const davaTuruByMatter = new Map<string, string>();
    const icraYoluByMatter = new Map<string, string>();
    const attrRows = database
        .prepare(
            `SELECT entity_id, tag_key, tag_value
             FROM entity_attributes
             WHERE entity_type = 'MATTER'
               AND entity_id IN (${placeholders})
               AND tag_key IN (
                 'uyap_dava_turu',
                 'uyap_icra_takip_yolu',
                 'icra_takip_yolu'
               )`,
        )
        .all(...unique) as Array<{
        entity_id: string;
        tag_key: string;
        tag_value: string | null;
    }>;
    for (const row of attrRows) {
        const value = String(row.tag_value || '').trim();
        if (!value || !isNotificationTurAttrKey(row.tag_key)) continue;
        applyNotificationTurAttr(
            row.tag_key,
            row.entity_id,
            value,
            davaTuruByMatter,
            icraYoluByMatter,
        );
    }
    for (const row of matterRows) {
        const fromMeta = String(row.dava_turleri_str || '').trim();
        const label = resolveNotificationDosyaTurLabel({
            matterType: row.matter_type,
            dosyaTurKod: row.dosya_tur_kod,
            dosyaTur: row.dosya_tur != null ? String(row.dosya_tur) : null,
            yargiBirimTablo: row.yargi_birim_tablo,
            courtName: row.court_name,
            davaTuru: davaTuruByMatter.get(row.id) || fromMeta || null,
            icraTakipYolu: icraYoluByMatter.get(row.id) ?? null,
            icraTakipYoluKod: row.icra_takip_yolu_kod,
        });
        if (label) turByMatter.set(row.id, label);
    }
    const partyRows = database
        .prepare(
            `SELECT mp.matter_id AS matter_id, mp.party_id AS party_id, p.full_name AS full_name, mp.role AS role, p.is_client AS is_client
             FROM matter_parties mp
             INNER JOIN parties p ON p.id = mp.party_id
             WHERE mp.matter_id IN (${placeholders})`,
        )
        .all(...unique) as Array<{
        matter_id: string;
        party_id: string;
        full_name: string | null;
        role: string | null;
        is_client: number | null;
    }>;
    const processRolesByMatter = new Map(
        matterRows.map((row) => [row.id, row.party_process_roles] as const),
    );
    for (const row of partyRows) {
        const list = partiesByMatter.get(row.matter_id) ?? [];
        const processRole = lookupPartyProcessRole(processRolesByMatter.get(row.matter_id), [
            row.party_id,
        ]);
        list.push({
            full_name: row.full_name,
            role: row.role,
            is_client: row.is_client,
            process_role: processRole == null ? null : String(processRole),
        });
        partiesByMatter.set(row.matter_id, list);
    }
    for (const id of unique) {
        const partiesLine = formatCompactMatterPartyLine(partiesByMatter.get(id) ?? []);
        out.set(id, {
            parties_line: partiesLine || null,
            dosya_tur_label: turByMatter.get(id) || null,
        });
    }
    return out;
}

function applyMatterHintFields<T extends { matter_id?: string | null }>(
    database: Database.Database,
    rows: T[],
): Array<T & MatterHintFields> {
    const hints = loadMatterHintFields(
        database,
        rows.map((row) => String(row.matter_id || '')),
    );
    return rows.map((row) => {
        const hint = hints.get(String(row.matter_id || '').trim()) ?? {
            parties_line: null,
            dosya_tur_label: null,
        };
        return { ...row, ...hint };
    });
}

function decorateNotificationList(
    database: Database.Database,
    rows: NotificationListRow[],
): Array<NotificationListRow & MatterHintFields> {
    return applyMatterHintFields(database, rows);
}

export type CalendarReminderRow = {
    id: string;
    event_type: string | null;
    event_date: string;
    description: string | null;
    is_completed: number;
    matter_id: string | null;
    file_number: string | null;
    court_name: string | null;
};

export function listCalendarReminderEvents(
    database: Database.Database,
    fromDateKey: string,
    toDateKey: string,
): CalendarReminderRow[] {
    return database
        .prepare(
            `SELECT d.id, d.event_type, d.event_date, d.description, d.is_completed, d.matter_id,
                    m.file_number, m.court_name
             FROM deadlines d
             LEFT JOIN matters m ON m.id = d.matter_id
             WHERE d.is_completed = 0
               AND d.event_type IN ('DURUSMA', 'SURE', 'GOREV')
               AND substr(d.event_date, 1, 10) >= ?
               AND substr(d.event_date, 1, 10) <= ?
             ORDER BY d.event_date ASC`,
        )
        .all(fromDateKey, toDateKey) as CalendarReminderRow[];
}

type UyapEvrakDedupeRow = {
    id: string;
    matter_id: string;
    title: string | null;
    file_path: string | null;
    metadata: string | null;
    updated_at: string | null;
};

/** Collapse duplicate UYAP catalog cards. Never deletes user-folder files. */
function migrateDedupeUyapEvrakDocuments(database: Database.Database) {
    if (!tableExists(database, 'documents')) return;
    const rows = database
        .prepare(
            `SELECT id, matter_id, title, file_path, metadata, updated_at
             FROM documents WHERE source_system = 'UYAP'`
        )
        .all() as UyapEvrakDedupeRow[];
    if (rows.length === 0) {
        try {
            database.exec(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_uyap_matter_item_key
                ON documents(matter_id, json_extract(metadata, '$.uyap.itemKey'))
                WHERE source_system = 'UYAP'
                  AND json_extract(metadata, '$.uyap.itemKey') IS NOT NULL
                  AND json_extract(metadata, '$.uyap.itemKey') != ''
            `);
        } catch (err) {
            console.warn('UYAP evrak unique itemKey index skipped:', err);
        }
        return;
    }
    const groups = new Map<string, UyapEvrakDedupeRow[]>();
    for (const row of rows) {
        const identity = durableUyapIdentity(row);
        const list = groups.get(identity);
        if (list) list.push(row);
        else groups.set(identity, [row]);
    }
    const deleteStmt = database.prepare(`DELETE FROM documents WHERE id = ?`);
    const collapse = database.transaction(() => {
        for (const group of groups.values()) {
            if (group.length < 2) continue;
            const ranked = [...group].sort((a, b) => {
                const scoreDiff = scoreUyapEvrakRow(b) - scoreUyapEvrakRow(a);
                if (scoreDiff !== 0) return scoreDiff;
                const updatedDiff = String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
                if (updatedDiff !== 0) return updatedDiff;
                return String(a.id).localeCompare(String(b.id));
            });
            const winner = ranked[0];
            for (const row of ranked.slice(1)) {
                if (row.id === winner.id) continue;
                deleteStmt.run(row.id);
            }
        }
    });
    collapse();
    try {
        database.exec(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_uyap_matter_item_key
            ON documents(matter_id, json_extract(metadata, '$.uyap.itemKey'))
            WHERE source_system = 'UYAP'
              AND json_extract(metadata, '$.uyap.itemKey') IS NOT NULL
              AND json_extract(metadata, '$.uyap.itemKey') != ''
        `);
    } catch (err) {
        console.warn('UYAP evrak unique itemKey index skipped:', err);
    }
}

function runScheduledDatabaseMaintenance(database: Database.Database, appVersion?: string) {
    setImmediate(() => runScheduledDatabaseMaintenanceDeferred(database, appVersion));
}

function runScheduledDatabaseMaintenanceDeferred(database: Database.Database, appVersion?: string) {
    try {
        database.exec(`PRAGMA optimize;`);
    } catch (error) {
        console.warn('PRAGMA optimize failed:', error);
    }

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const lastIntegrityMs = Number(getAppMeta(database, 'last_integrity_check_ms') || '0');
    if (!Number.isFinite(lastIntegrityMs) || now - lastIntegrityMs >= sevenDaysMs) {
        try {
            const res = database.pragma('integrity_check') as unknown;
            const row = Array.isArray(res) ? (res[0] as Record<string, unknown> | undefined) : undefined;
            const value = row ? String(Object.values(row)[0] ?? '') : 'ok';
            if (value.toLowerCase() !== 'ok') {
                console.warn('SQLite integrity_check reported non-ok state:', value);
            }
            setAppMeta(database, 'last_integrity_check_ms', String(now));
            setAppMeta(database, 'last_integrity_check_result', value);
        } catch (error) {
            console.warn('PRAGMA integrity_check failed:', error);
        }
    }

    if (!appVersion || !appVersion.trim()) return;

    const currentVersion = appVersion.trim();
    const lastVersion = getAppMeta(database, 'app_version');
    if (lastVersion && lastVersion !== currentVersion) {
        try {
            database.exec(`INSERT INTO notes_fts(notes_fts) VALUES('rebuild');`);
        } catch (error) {
            if (isSqliteFtsCorruptError(error)) {
                recreateNotesFtsAndTriggers(database);
            } else {
                console.warn('notes_fts rebuild on version change failed:', error);
            }
        }
    }
    setAppMeta(database, 'app_version', currentVersion);
}

function migrateDocumentHistory(database: Database.Database) {
    database.exec(`
        CREATE TABLE IF NOT EXISTS editor_documents (
            document_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'editor',
            file_path TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_opened_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    database.exec(`
        CREATE INDEX IF NOT EXISTS idx_editor_documents_last_opened
        ON editor_documents(last_opened_at DESC);
    `);

    database.exec(`
        CREATE TABLE IF NOT EXISTS document_versions (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            version_no INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            source TEXT NOT NULL DEFAULT 'auto',
            content TEXT NOT NULL,
            checksum TEXT NOT NULL,
            size_bytes INTEGER NOT NULL DEFAULT 0
        );
    `);
    database.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_document_versions_doc_ver
        ON document_versions(document_id, version_no);
    `);
    database.exec(`
        CREATE INDEX IF NOT EXISTS idx_document_versions_doc_created
        ON document_versions(document_id, created_at DESC);
    `);

    database.exec(`
        CREATE TABLE IF NOT EXISTS document_drafts (
            document_id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            checksum TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    database.exec(`
        CREATE INDEX IF NOT EXISTS idx_document_drafts_updated
        ON document_drafts(updated_at DESC);
    `);

    const dvCols = database.prepare(`PRAGMA table_info(document_versions)`).all() as { name: string }[];
    if (!dvCols.some((c) => c.name === 'label')) {
        database.exec(`ALTER TABLE document_versions ADD COLUMN label TEXT`);
    }
}

function migrateNotesAttachments(database: Database.Database) {
    const cols = database.prepare(`PRAGMA table_info(notes)`).all() as { name: string }[];
    if (!cols.some((c) => c.name === 'metadata')) {
        database.exec(`ALTER TABLE notes ADD COLUMN metadata TEXT`);
    }

    const nl = database
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='note_links'`)
        .get();
    if (!nl) {
        database.exec(`
            CREATE TABLE note_links (
                id TEXT PRIMARY KEY,
                source_note_id TEXT NOT NULL,
                target_note_id TEXT,
                unresolved_title TEXT,
                display_text TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE CASCADE,
                FOREIGN KEY (target_note_id) REFERENCES notes(id) ON DELETE CASCADE
            )
        `);
        database.exec(`
            CREATE INDEX IF NOT EXISTS idx_note_links_source ON note_links(source_note_id);
            CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_note_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_note_links_resolved_unique
                ON note_links(source_note_id, target_note_id)
                WHERE target_note_id IS NOT NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_note_links_unresolved_unique
                ON note_links(source_note_id, unresolved_title)
                WHERE target_note_id IS NULL AND unresolved_title IS NOT NULL;
        `);
    }
}

function tableHasColumn(database: Database.Database, table: 'parties' | 'matters', column: string): boolean {
    const rows = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return rows.some((r) => r.name === column);
}

/** Yeni hukuk alanları (vekalet yevmiye, Esas/D.İş, çoklu karar tablosu). */
function migrateDomainLegalEntities(database: Database.Database) {
    if (!tableHasColumn(database, 'parties', 'party_kind')) {
        database.exec(`ALTER TABLE parties ADD COLUMN party_kind TEXT`);
    }
    if (!tableHasColumn(database, 'parties', 'secondary_address')) {
        database.exec(`ALTER TABLE parties ADD COLUMN secondary_address TEXT`);
    }
    if (!tableHasColumn(database, 'parties', 'property_address')) {
        database.exec(`ALTER TABLE parties ADD COLUMN property_address TEXT`);
    }
    if (!tableHasColumn(database, 'parties', 'power_of_attorney_journal')) {
        database.exec(`ALTER TABLE parties ADD COLUMN power_of_attorney_journal TEXT`);
    }

    if (!tableHasColumn(database, 'matters', 'matter_category')) {
        database.exec(`ALTER TABLE matters ADD COLUMN matter_category TEXT`);
    }
    if (!tableHasColumn(database, 'matters', 'esas_no')) {
        database.exec(`ALTER TABLE matters ADD COLUMN esas_no TEXT`);
    }
    if (!tableHasColumn(database, 'matters', 'dis_no')) {
        database.exec(`ALTER TABLE matters ADD COLUMN dis_no TEXT`);
    }

    try {
        database.exec(`
            UPDATE matters
            SET esas_no = file_number
            WHERE (esas_no IS NULL OR TRIM(esas_no) = '')
              AND file_number IS NOT NULL AND TRIM(file_number) != ''
        `);
    } catch {
        /* noop */
    }

    database.exec(`
        CREATE TABLE IF NOT EXISTS matter_decisions (
            id TEXT PRIMARY KEY,
            matter_id TEXT NOT NULL,
            decision_no TEXT,
            decision_date TEXT,
            court_name TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (matter_id) REFERENCES matters(id) ON DELETE CASCADE
        )
    `);
    database.exec(`
        CREATE INDEX IF NOT EXISTS idx_matter_decisions_matter ON matter_decisions(matter_id)
    `);
}

type NoteRow = {
    id: string;
    title: string;
    content_json: string;
    content_plain: string;
    parent_type: string;
    parent_id: string | null;
    is_pinned: number;
    metadata: string | null;
    created_at: string;
    updated_at: string;
};

type DocumentVersionRow = {
    id: string;
    document_id: string;
    version_no: number;
    created_at: string;
    source: string;
    content: string;
    checksum: string;
    size_bytes: number;
    label?: string | null;
};

type DocumentRecoverySqlRow = {
    document_id: string;
    title?: string | null;
    kind?: string | null;
    file_path?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    last_opened_at?: string | null;
    latest_version_at?: string | null;
    latest_version_no?: number | null;
    version_count?: number | null;
    latest_size_bytes?: number | null;
    draft_updated_at?: string | null;
    is_orphan?: number | null;
    sort_at?: string | null;
};

function titleForRecoveredDocument(documentId: string, title?: string | null, filePath?: string | null): string {
    const trimmed = String(title ?? '').trim();
    if (trimmed) return trimmed;
    if (filePath) return path.basename(filePath);
    if (documentId.startsWith('udf:')) {
        try {
            const decoded = decodeURIComponent(documentId.slice('udf:'.length));
            return path.basename(decoded) || 'Kurtarılan UDF';
        } catch {
            return 'Kurtarılan UDF';
        }
    }
    return 'Kurtarılan Belge';
}

function runInsertNoteRow(
    database: Database.Database,
    data: {
        id: string;
        title: string;
        content_json: string;
        content_plain: string;
        parent_type: string;
        parent_id: string | null;
        is_pinned: number;
        metadata: string | null;
    }
) {
    return database
        .prepare(`
            INSERT INTO notes (
                id, title, content_json, content_plain, parent_type, parent_id, is_pinned, metadata
            ) VALUES (
                @id, @title, @content_json, @content_plain, @parent_type, @parent_id, @is_pinned, @metadata
            )
        `)
        .run(data);
}

function runUpdateNoteRow(database: Database.Database, merged: NoteRow) {
    return database
        .prepare(`
            UPDATE notes SET
                title=@title, content_json=@content_json, content_plain=@content_plain,
                parent_type=@parent_type, parent_id=@parent_id, is_pinned=@is_pinned,
                metadata=@metadata, updated_at=CURRENT_TIMESTAMP
            WHERE id=@id
        `)
        .run(merged);
}

function walkTiptapForMentionNodes(
    node: any,
    out: { id: string; label: string; entityType: string | null | undefined }[]
) {
    if (!node) return;
    if (node.type === 'mention' && node.attrs?.id) {
        const et = node.attrs.entityType;
        const label = String(node.attrs.label ?? node.attrs.id ?? '');
        out.push({
            id: String(node.attrs.id),
            label,
            entityType: et != null && String(et).trim() !== '' ? String(et) : null,
        });
    }
    if (node.type === 'wikiNoteLink' && node.attrs?.id) {
        const id = String(node.attrs.id);
        const label = String(node.attrs.label ?? id);
        out.push({
            id,
            label,
            entityType: 'NOTE',
        });
    }
    const content = node.content;
    if (Array.isArray(content)) {
        for (const c of content) walkTiptapForMentionNodes(c, out);
    }
}

function inferMentionEntityType(database: Database.Database, id: string): string | null {
    if (database.prepare(`SELECT 1 FROM notes WHERE id = ?`).get(id)) return 'NOTE';
    if (database.prepare(`SELECT 1 FROM matters WHERE id = ?`).get(id)) return 'MATTER';
    if (database.prepare(`SELECT 1 FROM parties WHERE id = ?`).get(id)) return 'PARTY';
    if (database.prepare(`SELECT 1 FROM documents WHERE id = ?`).get(id)) return 'DOCUMENT';
    return null;
}

/** #tag → entity_tags (NOTE); not içeriği tek kaynak kabul edilir. */
function syncNoteHashtagsFromPlain(database: Database.Database, noteId: string, plain: string) {
    const tagCanonical = new Map<string, string>();
    const re = /#([\p{L}\p{M}\p{N}_][\p{L}\p{M}\p{N}_-]*)/gu;
    let m: RegExpExecArray | null;
    const text = plain || '';
    while ((m = re.exec(text)) !== null) {
        const raw = m[1].trim();
        if (!raw || raw.length > 64) continue;
        const key = raw.toLowerCase();
        if (!tagCanonical.has(key)) tagCanonical.set(key, raw);
    }

    const delEt = database.prepare(
        `DELETE FROM entity_tags WHERE entity_id = ? AND entity_type = 'NOTE'`
    );
    const findTag = database.prepare(`SELECT id FROM tags WHERE LOWER(name) = LOWER(?) LIMIT 1`);
    const insTag = database.prepare(`INSERT INTO tags (id, name, color) VALUES (?, ?, ?)`);
    const insEt = database.prepare(
        `INSERT OR IGNORE INTO entity_tags (tag_id, entity_id, entity_type) VALUES (?, ?, 'NOTE')`
    );

    delEt.run(noteId);
    for (const name of tagCanonical.values()) {
        let row = findTag.get(name) as { id: string } | undefined;
        if (!row) {
            const tid = randomUUID();
            insTag.run(tid, name, null);
            row = { id: tid };
        }
        insEt.run(row.id, noteId);
    }
}

function syncNoteLinksAndEntityRefs(database: Database.Database, noteId: string, contentJson: string, contentPlain: string) {
    const plain = contentPlain || '';
    const wikiRe = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g;
    const resolvedTargets = new Map<string, string>();
    let m: RegExpExecArray | null;
    while ((m = wikiRe.exec(plain)) !== null) {
        const left = m[1].trim();
        const display = (m[2] ?? m[1]).trim();
        if (!left) continue;

        let targetId: string | null = null;
        let unresolved: string | null = null;

        if (isUuid(left)) {
            const row = database.prepare(`SELECT id FROM notes WHERE id = ?`).get(left) as { id: string } | undefined;
            if (row) targetId = row.id;
            else unresolved = left;
        }
        if (!targetId) {
            const byTitle = database
                .prepare(`SELECT id FROM notes WHERE TRIM(title) = ? COLLATE NOCASE AND id != ? LIMIT 1`)
                .get(left, noteId) as { id: string } | undefined;
            if (byTitle) targetId = byTitle.id;
            else if (!unresolved) unresolved = left;
        }

        if (targetId === noteId) continue;

        const key = targetId ? `id:${targetId}` : `u:${unresolved}`;
        if (!resolvedTargets.has(key)) {
            resolvedTargets.set(key, JSON.stringify({ targetId, unresolved, display }));
        }
    }

    let doc: any;
    try {
        doc = JSON.parse(contentJson || '{}');
    } catch {
        doc = null;
    }
    const rawMentions: { id: string; label: string; entityType: string | null | undefined }[] = [];
    if (doc) walkTiptapForMentionNodes(doc, rawMentions);

    const mentions: { id: string; entityType: string; label: string }[] = [];
    for (const rm of rawMentions) {
        const entityType = rm.entityType || inferMentionEntityType(database, rm.id);
        if (!entityType) continue;
        mentions.push({ id: rm.id, entityType, label: rm.label });
    }

    for (const men of mentions) {
        if (men.entityType === 'NOTE') {
            if (men.id === noteId) continue;
            const exists = database.prepare(`SELECT id FROM notes WHERE id = ?`).get(men.id) as { id: string } | undefined;
            if (exists) {
                resolvedTargets.set(
                    `id:${men.id}`,
                    JSON.stringify({ targetId: men.id, unresolved: null, display: men.label || men.id })
                );
            }
        }
    }

    const delLinks = database.prepare(`DELETE FROM note_links WHERE source_note_id = ?`);
    const insLink = database.prepare(`
        INSERT INTO note_links (id, source_note_id, target_note_id, unresolved_title, display_text)
        VALUES (?, ?, ?, ?, ?)
    `);

    const tx = database.transaction(() => {
        delLinks.run(noteId);
        for (const [, payload] of resolvedTargets) {
            const { targetId, unresolved, display } = JSON.parse(payload) as {
                targetId: string | null;
                unresolved: string | null;
                display: string;
            };
            insLink.run(
                randomUUID(),
                noteId,
                targetId,
                targetId ? null : unresolved,
                display || unresolved || ''
            );
        }

        database
            .prepare(`DELETE FROM links WHERE source_id = ? AND source_type = 'NOTE' AND link_context = 'mention'`)
            .run(noteId);
        const insEnt = database.prepare(`
            INSERT INTO links (id, source_id, source_type, target_id, target_type, link_context)
            VALUES (?, ?, 'NOTE', ?, ?, 'mention')
        `);
        const seenEnt = new Set<string>();
        for (const men of mentions) {
            if (men.entityType === 'NOTE') continue;
            if (!['MATTER', 'PARTY', 'DOCUMENT', 'KNOWLEDGE'].includes(men.entityType)) continue;
            if (!men.id || seenEnt.has(men.id)) continue;
            if (men.entityType === 'KNOWLEDGE') {
                const kb = database.prepare(`SELECT id FROM knowledge_base WHERE id = ?`).get(men.id) as
                    | { id: string }
                    | undefined;
                if (!kb) continue;
            }
            seenEnt.add(men.id);
            insEnt.run(randomUUID(), noteId, men.id, men.entityType);
        }

        syncNoteHashtagsFromPlain(database, noteId, plain);
    });
    tx();
}

// --- IPC HANDLERS ---

export function registerDatabaseHandlers() {
    /** Always register handlers so the renderer never sees "No handler registered".
     *  If opening the DB failed, individual calls will throw when `db` is null. */
    registerIpcHandler(
        'db-run-maintenance',
        (_, mode: 'optimize' | 'integrity_check' | 'vacuum' | 'fts_rebuild' = 'optimize') => {
            switch (mode) {
                case 'optimize':
                    db!.exec(`PRAGMA optimize;`);
                    return { ok: true, mode };
                case 'integrity_check': {
                    const res = db!.pragma('integrity_check') as unknown;
                    const row = Array.isArray(res) ? (res[0] as Record<string, unknown> | undefined) : undefined;
                    const result = row ? String(Object.values(row)[0] ?? '') : 'ok';
                    setAppMeta(db!, 'last_integrity_check_ms', String(Date.now()));
                    setAppMeta(db!, 'last_integrity_check_result', result);
                    return { ok: true, mode, result };
                }
                case 'vacuum':
                    db!.exec(`VACUUM;`);
                    return { ok: true, mode };
                case 'fts_rebuild':
                    db!.exec(`INSERT INTO notes_fts(notes_fts) VALUES('rebuild');`);
                    return { ok: true, mode };
                default: {
                    const neverMode: never = mode;
                    return { ok: false, error: `unsupported_mode:${String(neverMode)}` };
                }
            }
        }
    );

    // === NEW IPC HANDLERS ===

    // --- PARTIES ---

    registerIpcHandler('db-get-parties', (_, filters?: { isClient?: boolean }) => {
        let query = 'SELECT * FROM parties';
        const params: any[] = [];

        if (filters?.isClient !== undefined) {
            query += ' WHERE is_client = ?';
            params.push(filters.isClient ? 1 : 0);
        }

        query += ' ORDER BY full_name ASC';
        return db!.prepare(query).all(...params);
    });

    registerIpcHandler('db-get-party', (_, id: string) => {
        return db!.prepare('SELECT * FROM parties WHERE id = ?').get(id);
    });

    registerIpcHandler('db-add-party', (_, party) => {
        const stmt = db!.prepare(`
            INSERT INTO parties (
                id, type, party_kind, full_name, id_number, tax_office, email, phone,
                address, postal_address, secondary_address, property_address,
                power_of_attorney_journal, is_client, metadata
            ) VALUES (
                @id, @type, @party_kind, @full_name, @id_number, @tax_office, @email, @phone,
                @address, @postal_address, @secondary_address, @property_address,
                @power_of_attorney_journal, @is_client, @metadata
            )
        `);
        const data = {
            party_kind: null,
            id_number: null,
            tax_office: null,
            email: null,
            phone: null,
            address: null,
            postal_address: null,
            secondary_address: null,
            property_address: null,
            power_of_attorney_journal: null,
            metadata: null,
            ...party,
            is_client: party.is_client ? 1 : 0,
        };
        return stmt.run(data);
    });

    registerIpcHandler('db-update-party', (_, party) => {
        const stmt = db!.prepare(`
            UPDATE parties SET
                type=@type, party_kind=@party_kind, full_name=@full_name, id_number=@id_number,
                tax_office=@tax_office, email=@email, phone=@phone,
                address=@address, postal_address=@postal_address,
                secondary_address=@secondary_address, property_address=@property_address,
                power_of_attorney_journal=@power_of_attorney_journal,
                is_client=@is_client, metadata=@metadata,
                updated_at=CURRENT_TIMESTAMP
            WHERE id=@id
        `);
        const data = {
            party_kind: null,
            id_number: null,
            tax_office: null,
            email: null,
            phone: null,
            address: null,
            postal_address: null,
            secondary_address: null,
            property_address: null,
            power_of_attorney_journal: null,
            metadata: null,
            ...party,
            is_client: party.is_client ? 1 : 0,
        };
        return stmt.run(data);
    });

    registerIpcHandler('db-delete-party', (_, id: string) => {
        return db!.prepare('DELETE FROM parties WHERE id = ?').run(id);
    });

    // --- MATTERS ---

    registerIpcHandler(
        'db-get-matters',
        (
            _,
            filters?: {
                status?: string;
                matter_type?: string;
                matter_category?: string;
                party_id?: string;
            }
        ) => {
            let query = `
            SELECT m.*, 
                GROUP_CONCAT(p.full_name || ' (' || mp.role || ')') as parties_list
            FROM matters m
            LEFT JOIN matter_parties mp ON m.id = mp.matter_id
            LEFT JOIN parties p ON mp.party_id = p.id
        `;
            const params: any[] = [];
            const cond: string[] = [];

            if (filters?.status) {
                cond.push('m.status = ?');
                params.push(filters.status);
            }
            if (filters?.matter_type) {
                cond.push('m.matter_type = ?');
                params.push(filters.matter_type);
            }
            if (filters?.matter_category) {
                cond.push('m.matter_category = ?');
                params.push(filters.matter_category);
            }
            if (filters?.party_id) {
                const partyIds = findPartyIdsForContextFilter(db!, filters.party_id);
                const placeholders = partyIds.map(() => '?').join(', ');
                cond.push(
                    `m.id IN (SELECT matter_id FROM matter_parties WHERE party_id IN (${placeholders}))`
                );
                params.push(...partyIds);
            }

            if (cond.length > 0) {
                query += ' WHERE ' + cond.join(' AND ');
            }

            query += ' GROUP BY m.id ORDER BY m.opening_date DESC';
            return db!.prepare(query).all(...params);
        }
    );

    registerIpcHandler('db-get-matter', (_, id: string) => {
        const matter = db!.prepare('SELECT * FROM matters WHERE id = ?').get(id);
        if (matter) {
            // Get linked parties
            const parties = db!.prepare(`
                SELECT p.*, mp.role 
                FROM parties p
                JOIN matter_parties mp ON p.id = mp.party_id
                WHERE mp.matter_id = ?
            `).all(id) as Array<{ id: string; process_role?: string | null }>;
            let processRoles: unknown = null;
            try {
                processRoles = JSON.parse(String((matter as { metadata?: string }).metadata || '')).uyap
                    ?.partyProcessRoles;
            } catch {
                processRoles = null;
            }
            for (const party of parties) {
                const processRole = lookupPartyProcessRole(processRoles, [party.id]);
                party.process_role = processRole == null ? null : String(processRole);
            }
            (matter as any).parties = parties;
        }
        return matter;
    });

    registerIpcHandler('db-add-matter', (_, matter) => {
        const stmt = db!.prepare(`
            INSERT INTO matters (
                id, matter_type, matter_category, internal_id, title, court_name, court_id, file_number,
                esas_no, dis_no, decision_number, status, opening_date, closing_date, metadata
            ) VALUES (
                @id, @matter_type, @matter_category, @internal_id, @title, @court_name, @court_id, @file_number,
                @esas_no, @dis_no, @decision_number, @status, @opening_date, @closing_date, @metadata
            )
        `);
        const data = {
            matter_category: null,
            internal_id: null,
            court_name: null,
            court_id: null,
            file_number: null,
            esas_no: null,
            dis_no: null,
            decision_number: null,
            opening_date: null,
            closing_date: null,
            metadata: null,
            ...matter,
        };
        return stmt.run(data);
    });

    registerIpcHandler('db-update-matter', (_, matter) => {
        const stmt = db!.prepare(`
            UPDATE matters SET
                matter_type=@matter_type, matter_category=@matter_category, internal_id=@internal_id, title=@title,
                court_name=@court_name, court_id=@court_id, file_number=@file_number,
                esas_no=@esas_no, dis_no=@dis_no,
                decision_number=@decision_number, status=@status,
                opening_date=@opening_date, closing_date=@closing_date,
                metadata=@metadata, updated_at=CURRENT_TIMESTAMP
            WHERE id=@id
        `);
        const data = {
            matter_category: null,
            internal_id: null,
            court_name: null,
            court_id: null,
            file_number: null,
            esas_no: null,
            dis_no: null,
            decision_number: null,
            opening_date: null,
            closing_date: null,
            metadata: null,
            ...matter,
        };
        return stmt.run(data);
    });

    registerIpcHandler(
        'db-set-matter-hareketsiz-snooze',
        (_, payload: { matterId?: string; untilIso?: string | null }) => {
            const matterId = String(payload?.matterId || '').trim();
            if (!matterId) return { ok: false };
            const row = db!
                .prepare(`SELECT metadata FROM matters WHERE id = ?`)
                .get(matterId) as { metadata: string | null } | undefined;
            if (!row) return { ok: false };
            let meta: Record<string, unknown> = {};
            if (row.metadata && String(row.metadata).trim()) {
                try {
                    const parsed = JSON.parse(row.metadata) as unknown;
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                        return { ok: false };
                    }
                    meta = parsed as Record<string, unknown>;
                } catch {
                    return { ok: false };
                }
            }
            const existingUyap = meta.uyap;
            const uyap =
                existingUyap && typeof existingUyap === 'object' && !Array.isArray(existingUyap)
                    ? { ...(existingUyap as Record<string, unknown>) }
                    : {};
            const untilIso = payload?.untilIso == null ? null : String(payload.untilIso).trim();
            if (!untilIso) {
                delete uyap.hareketsizSnoozeUntil;
            } else {
                const ms = Date.parse(untilIso);
                if (!Number.isFinite(ms)) return { ok: false };
                uyap.hareketsizSnoozeUntil = new Date(ms).toISOString();
            }
            meta.uyap = uyap;
            db!.prepare(`UPDATE matters SET metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
                JSON.stringify(meta),
                matterId,
            );
            clearUyapAggCaches();
            return { ok: true };
        },
    );

    registerIpcHandler('db-delete-matter', (_, id: string) => {
        return db!.prepare('DELETE FROM matters WHERE id = ?').run(id);
    });

    // --- COURTS (normalized lookup for matters.court_id) ---
    registerIpcHandler('db-list-courts', () => {
        return db!
            .prepare(
                `SELECT id, name, type, city, details, created_at, updated_at FROM courts ORDER BY name COLLATE NOCASE ASC`
            )
            .all();
    });

    registerIpcHandler(
        'db-add-court',
        (
            _,
            row: { id?: string; name: string; type?: string | null; city?: string | null; details?: string | null }
        ) => {
            const id = String(row.id || '').trim() || randomUUID();
            const name = String(row.name || '').trim();
            if (!name) return { changes: 0 };
            const stmt = db!.prepare(`
                INSERT INTO courts (id, name, type, city, details)
                VALUES (@id, @name, @type, @city, @details)
            `);
            return stmt.run({
                id,
                name,
                type: row.type ?? null,
                city: row.city ?? null,
                details: row.details ?? null,
            });
        }
    );

    registerIpcHandler('db-link-party-to-matter', (_, params: { matterId: string, partyId: string, role: string }) => {
        const stmt = db!.prepare(`
            INSERT OR REPLACE INTO matter_parties (matter_id, party_id, role)
            VALUES (?, ?, ?)
        `);
        return stmt.run(params.matterId, params.partyId, params.role);
    });

    registerIpcHandler('db-unlink-party-from-matter', (_, params: { matterId: string, partyId: string }) => {
        const stmt = db!.prepare('DELETE FROM matter_parties WHERE matter_id = ? AND party_id = ?');
        return stmt.run(params.matterId, params.partyId);
    });

    registerIpcHandler('db-get-matter-decisions', (_, matterId: string) => {
        const mid = String(matterId || '').trim();
        if (!mid) return [];
        return db!
            .prepare(
                `SELECT * FROM matter_decisions WHERE matter_id = ? ORDER BY decision_date IS NULL, decision_date DESC, created_at DESC`
            )
            .all(mid);
    });

    registerIpcHandler('db-add-matter-decision', (_, row: Record<string, unknown>) => {
        const id = String(row.id || '').trim() || randomUUID();
        const matter_id = String(row.matter_id || '').trim();
        if (!matter_id) return { changes: 0 };
        const stmt = db!.prepare(`
            INSERT INTO matter_decisions (id, matter_id, decision_no, decision_date, court_name, notes)
            VALUES (@id, @matter_id, @decision_no, @decision_date, @court_name, @notes)
        `);
        return stmt.run({
            id,
            matter_id,
            decision_no: row.decision_no ?? null,
            decision_date: row.decision_date ?? null,
            court_name: row.court_name ?? null,
            notes: row.notes ?? null,
        });
    });

    registerIpcHandler('db-update-matter-decision', (_, row: Record<string, unknown>) => {
        const id = String(row.id || '').trim();
        if (!id) return { changes: 0 };
        const stmt = db!.prepare(`
            UPDATE matter_decisions SET
                decision_no=@decision_no, decision_date=@decision_date,
                court_name=@court_name, notes=@notes
            WHERE id=@id
        `);
        return stmt.run({
            id,
            decision_no: row.decision_no ?? null,
            decision_date: row.decision_date ?? null,
            court_name: row.court_name ?? null,
            notes: row.notes ?? null,
        });
    });

    registerIpcHandler('db-delete-matter-decision', (_, id: string) => {
        const rid = String(id || '').trim();
        if (!rid) return { changes: 0 };
        return db!.prepare(`DELETE FROM matter_decisions WHERE id = ?`).run(rid);
    });

    // --- NOTES ---

    registerIpcHandler('db-get-notes', (_, filters?: { parentType?: string, parentId?: string, isPinned?: boolean }) => {
        if (filters?.parentType && filters?.parentId) {
            const ctx = buildNoteContextFilterSql(db!, filters.parentType, filters.parentId);
            if (ctx.empty) return [];
            let query = `SELECT n.* FROM notes n WHERE 1=1${ctx.sql}`;
            const params = [...ctx.params];
            if (filters.isPinned !== undefined) {
                query += ' AND n.is_pinned = ?';
                params.push(filters.isPinned ? 1 : 0);
            }
            query += ' ORDER BY n.is_pinned DESC, n.updated_at DESC';
            return db!.prepare(query).all(...params);
        }

        let query = 'SELECT * FROM notes WHERE 1=1';
        const params: unknown[] = [];

        if (filters?.parentType) {
            query += ' AND parent_type = ?';
            params.push(filters.parentType);
        }
        if (filters?.parentId) {
            query += ' AND parent_id = ?';
            params.push(filters.parentId);
        }
        if (filters?.isPinned !== undefined) {
            query += ' AND is_pinned = ?';
            params.push(filters.isPinned ? 1 : 0);
        }

        query += ' ORDER BY is_pinned DESC, updated_at DESC';
        return db!.prepare(query).all(...params);
    });

    registerIpcHandler(
        'db-get-notes-summary',
        (_, filters?: { parentType?: string, parentId?: string, isPinned?: boolean }) => {
            if (filters?.parentType && filters?.parentId) {
                return fetchNotesSummaryForContext(db!, filters.parentType, filters.parentId, {
                    isPinned: filters.isPinned,
                });
            }

            let query = `
            SELECT id, title,
                CASE WHEN LENGTH(content_plain) > 220 THEN SUBSTR(content_plain, 1, 220) || '…' ELSE content_plain END AS content_preview,
                parent_type, parent_id, is_pinned, metadata, created_at, updated_at
            FROM notes WHERE 1=1`;
            const params: unknown[] = [];

            if (filters?.parentType) {
                query += ' AND parent_type = ?';
                params.push(filters.parentType);
            }
            if (filters?.parentId) {
                query += ' AND parent_id = ?';
                params.push(filters.parentId);
            }
            if (filters?.isPinned !== undefined) {
                query += ' AND is_pinned = ?';
                params.push(filters.isPinned ? 1 : 0);
            }

            query += ' ORDER BY is_pinned DESC, updated_at DESC';
            return db!.prepare(query).all(...params);
        }
    );

    registerIpcHandler('db-get-recent-note-summary', () => {
        const row = db!.prepare(
            `SELECT id, title,
                CASE WHEN LENGTH(content_plain) > 220 THEN SUBSTR(content_plain, 1, 220) || '…' ELSE content_plain END AS content_preview,
                parent_type, parent_id, is_pinned, metadata, created_at, updated_at
             FROM notes
             ORDER BY updated_at DESC
             LIMIT 1`
        ).get();
        return row ?? null;
    });

    registerIpcHandler('db-get-party-related-notes', (_, partyId: string, limit: number = 5) => {
        const id = String(partyId ?? '').trim();
        if (!id) return [];
        return fetchPartyRelatedNotesSummary(db!, id, limit);
    });

    registerIpcHandler('db-get-party-related-counts', (_, partyId: string) => {
        const id = String(partyId ?? '').trim();
        if (!id) return { matter_count: 0, note_count: 0 };
        return fetchPartyRelatedCounts(db!, id);
    });

    registerIpcHandler(
        'db-get-client-report',
        (
            _,
            payload?: { partyId?: string; lastEvrakLimit?: number } | string,
        ) => {
            const partyId =
                typeof payload === 'string'
                    ? payload
                    : String(payload?.partyId ?? '').trim();
            if (!partyId) return null;
            const lastEvrakLimit =
                typeof payload === 'object' && payload != null ? payload.lastEvrakLimit : undefined;
            return fetchClientReport(db!, partyId, lastEvrakLimit);
        },
    );

    registerIpcHandler('db-get-note', (_, id: string) => {
        return db!.prepare('SELECT * FROM notes WHERE id = ?').get(id);
    });

    registerIpcHandler('db-add-note', (_, note) => {
        const data = {
            title: '',
            content_json: '',
            content_plain: '',
            parent_type: 'GENERAL',
            parent_id: null,
            metadata: null,
            ...note,
            is_pinned: note.is_pinned ? 1 : 0,
        };
        let run: { changes: number; lastInsertRowid: number | bigint };
        try {
            run = runInsertNoteRow(db!, data);
        } catch (e: unknown) {
            if (isSqliteFtsCorruptError(e)) {
                recreateNotesFtsAndTriggers(db!);
                run = runInsertNoteRow(db!, data);
            } else {
                throw e;
            }
        }
        try {
            syncNoteLinksAndEntityRefs(
                db!,
                data.id,
                String(data.content_json ?? ''),
                String(data.content_plain ?? '')
            );
        } catch (e) {
            console.warn('syncNoteLinksAndEntityRefs after add failed:', e);
        }
        return run;
    });

    registerIpcHandler('db-update-note', (_, note: Partial<NoteRow> & { id: string }) => {
        const existing = db!.prepare('SELECT * FROM notes WHERE id = ?').get(note.id) as NoteRow | undefined;

        if (!existing) return { changes: 0 };

        const merged: NoteRow = {
            ...existing,
            title: note.title !== undefined ? String(note.title) : existing.title,
            content_json: note.content_json !== undefined ? String(note.content_json) : existing.content_json,
            content_plain: note.content_plain !== undefined ? String(note.content_plain) : existing.content_plain,
            parent_type: note.parent_type !== undefined ? String(note.parent_type) : existing.parent_type,
            parent_id:
                note.parent_id !== undefined
                    ? note.parent_id === null || note.parent_id === ''
                        ? null
                        : String(note.parent_id)
                    : existing.parent_id,
            is_pinned:
                note.is_pinned !== undefined ? (note.is_pinned ? 1 : 0) : existing.is_pinned,
            metadata:
                note.metadata !== undefined
                    ? note.metadata === null || note.metadata === ''
                        ? null
                        : String(note.metadata)
                    : existing.metadata,
            id: existing.id,
            created_at: existing.created_at,
            updated_at: existing.updated_at,
        };

        let run: { changes: number };
        try {
            run = runUpdateNoteRow(db!, merged);
        } catch (e: unknown) {
            if (isSqliteFtsCorruptError(e)) {
                recreateNotesFtsAndTriggers(db!);
                run = runUpdateNoteRow(db!, merged);
            } else {
                throw e;
            }
        }
        try {
            syncNoteLinksAndEntityRefs(db!, merged.id, merged.content_json, merged.content_plain);
        } catch (e: unknown) {
            console.warn('syncNoteLinksAndEntityRefs after update failed:', e);
        }
        return run;
    });

    registerIpcHandler('db-delete-note', (_, id: string) => {
        return db!.prepare('DELETE FROM notes WHERE id = ?').run(id);
    });

    registerIpcHandler(
        'db-upsert-editor-document',
        (
            _,
            payload: {
                documentId: string;
                title?: string;
                kind?: 'editor' | 'udf';
                filePath?: string | null;
                touchOpened?: boolean;
            }
        ) => {
            const documentId = String(payload?.documentId || '').trim();
            if (!documentId) return { ok: false };
            const kind = payload?.kind === 'udf' || documentId.startsWith('udf:') ? 'udf' : 'editor';
            const filePath =
                payload?.filePath == null || String(payload.filePath).trim() === ''
                    ? kind === 'udf'
                        ? (() => {
                              try {
                                  return decodeURIComponent(documentId.slice('udf:'.length));
                              } catch {
                                  return null;
                              }
                          })()
                        : null
                    : String(payload.filePath);
            const hasTitle = typeof payload?.title === 'string' && payload.title.trim().length > 0;
            const title = titleForRecoveredDocument(documentId, payload?.title, filePath);
            const touchOpened = payload?.touchOpened !== false;

            db!
                .prepare(
                    `INSERT INTO editor_documents
                     (document_id, title, kind, file_path, created_at, updated_at, last_opened_at)
                     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                     ON CONFLICT(document_id) DO UPDATE SET
                        title = CASE
                            WHEN ? THEN excluded.title
                            ELSE editor_documents.title
                        END,
                        kind = excluded.kind,
                        file_path = excluded.file_path,
                        updated_at = CURRENT_TIMESTAMP,
                        last_opened_at = CASE
                            WHEN ? THEN CURRENT_TIMESTAMP
                            ELSE editor_documents.last_opened_at
                        END`
                )
                .run(documentId, title, kind, filePath, hasTitle ? 1 : 0, touchOpened ? 1 : 0);
            return { ok: true };
        }
    );

    registerIpcHandler('db-list-document-recovery-items', (_, limit = 20) => {
        const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Number(limit))) : 20;
        const rows = db!
            .prepare(
                `WITH latest_version_no AS (
                    SELECT document_id, MAX(version_no) AS version_no
                    FROM document_versions
                    GROUP BY document_id
                ),
                latest_versions AS (
                    SELECT v.*
                    FROM document_versions v
                    JOIN latest_version_no lv
                      ON lv.document_id = v.document_id
                     AND lv.version_no = v.version_no
                ),
                version_counts AS (
                    SELECT document_id, COUNT(*) AS version_count
                    FROM document_versions
                    GROUP BY document_id
                ),
                all_document_ids AS (
                    SELECT document_id FROM editor_documents
                    UNION
                    SELECT document_id FROM document_versions
                    UNION
                    SELECT document_id FROM document_drafts
                )
                SELECT
                    ids.document_id,
                    ed.title,
                    ed.kind,
                    ed.file_path,
                    ed.created_at,
                    ed.updated_at,
                    ed.last_opened_at,
                    lv.created_at AS latest_version_at,
                    lv.version_no AS latest_version_no,
                    COALESCE(vc.version_count, 0) AS version_count,
                    lv.size_bytes AS latest_size_bytes,
                    dd.updated_at AS draft_updated_at,
                    CASE WHEN ed.document_id IS NULL THEN 1 ELSE 0 END AS is_orphan,
                    COALESCE(dd.updated_at, ed.last_opened_at, ed.updated_at, lv.created_at, ed.created_at) AS sort_at
                FROM all_document_ids ids
                LEFT JOIN editor_documents ed ON ed.document_id = ids.document_id
                LEFT JOIN latest_versions lv ON lv.document_id = ids.document_id
                LEFT JOIN version_counts vc ON vc.document_id = ids.document_id
                LEFT JOIN document_drafts dd ON dd.document_id = ids.document_id
                ORDER BY datetime(sort_at) DESC
                LIMIT ?`
            )
            .all(safeLimit) as DocumentRecoverySqlRow[];

        return rows.map((row) => {
            const kind = row.kind === 'udf' || row.document_id.startsWith('udf:') ? 'udf' : 'editor';
            const filePath =
                row.file_path ||
                (kind === 'udf'
                    ? (() => {
                          try {
                              return decodeURIComponent(row.document_id.slice('udf:'.length));
                          } catch {
                              return null;
                          }
                      })()
                    : null);
            const fileExists = filePath ? fs.existsSync(filePath) : null;
            return {
                document_id: row.document_id,
                title: titleForRecoveredDocument(row.document_id, row.title, filePath),
                kind,
                file_path: filePath,
                file_exists: fileExists,
                created_at: row.created_at,
                updated_at: row.updated_at,
                last_opened_at: row.last_opened_at,
                latest_version_at: row.latest_version_at,
                latest_version_no: row.latest_version_no ?? null,
                version_count: row.version_count ?? 0,
                latest_size_bytes: row.latest_size_bytes ?? null,
                draft_updated_at: row.draft_updated_at,
                has_draft: Boolean(row.draft_updated_at),
                is_orphan: Boolean(row.is_orphan),
                sort_at: row.sort_at,
            };
        });
    });

    registerIpcHandler('db-get-document-recovery-content', (_, documentId: string) => {
        const id = String(documentId || '').trim();
        if (!id) return null;
        const draft = db!
            .prepare(
                `SELECT content, checksum, updated_at
                 FROM document_drafts
                 WHERE document_id = ?`
            )
            .get(id) as { content: string; checksum: string; updated_at: string } | undefined;
        if (draft) {
            return {
                document_id: id,
                content: draft.content,
                checksum: draft.checksum,
                source: 'draft',
                updated_at: draft.updated_at,
            };
        }
        const latest = db!
            .prepare(
                `SELECT content, checksum, created_at
                 FROM document_versions
                 WHERE document_id = ?
                 ORDER BY version_no DESC
                 LIMIT 1`
            )
            .get(id) as { content: string; checksum: string; created_at: string } | undefined;
        if (!latest) return null;
        return {
            document_id: id,
            content: latest.content,
            checksum: latest.checksum,
            source: 'version',
            updated_at: latest.created_at,
        };
    });

    registerIpcHandler('db-upsert-document-draft', (_, payload: { documentId: string; content: string }) => {
        const documentId = String(payload?.documentId || '').trim();
        if (!documentId) return { changes: 0 };
        const content = String(payload?.content ?? '');
        const checksum = checksumText(content);
        return db!
            .prepare(
                `INSERT INTO document_drafts (document_id, content, checksum, updated_at)
                 VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(document_id) DO UPDATE SET
                    content = excluded.content,
                    checksum = excluded.checksum,
                    updated_at = CURRENT_TIMESTAMP`
            )
            .run(documentId, content, checksum);
    });

    registerIpcHandler('db-get-document-draft', (_, documentId: string) => {
        return db!
            .prepare(
                `SELECT document_id, content, checksum, updated_at
                 FROM document_drafts
                 WHERE document_id = ?`
            )
            .get(documentId);
    });

    registerIpcHandler('db-clear-document-draft', (_, documentId: string) => {
        return db!
            .prepare(`DELETE FROM document_drafts WHERE document_id = ?`)
            .run(documentId);
    });

    registerIpcHandler(
        'db-create-document-version',
        (
            _,
            payload: { documentId: string; content: string; source?: 'auto' | 'manual' | 'recovery' | 'import' }
        ) => {
            const documentId = String(payload?.documentId || '').trim();
            if (!documentId) return { created: false };

            const content = String(payload?.content ?? '');
            const source = String(payload?.source || 'auto');
            const checksum = checksumText(content);
            const sizeBytes = Buffer.byteLength(content, 'utf8');
            const latest = db!
                .prepare(
                    `SELECT id, version_no, checksum FROM document_versions
                     WHERE document_id = ?
                     ORDER BY version_no DESC
                     LIMIT 1`
                )
                .get(documentId) as { id: string; version_no: number; checksum: string } | undefined;

            if (latest?.checksum === checksum) {
                return { created: false };
            }

            const id = randomUUID();
            const versionNo = (latest?.version_no ?? 0) + 1;
            db!
                .prepare(
                    `INSERT INTO document_versions
                     (id, document_id, version_no, source, content, checksum, size_bytes)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`
                )
                .run(id, documentId, versionNo, source, content, checksum, sizeBytes);

            return { created: true, id, createdAt: new Date().toISOString() };
        }
    );

    registerIpcHandler('db-list-document-versions', (_, documentId: string, limit = 50, offset = 0) => {
        const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Number(limit))) : 50;
        const safeOffset = Number.isFinite(offset) ? Math.max(0, Number(offset)) : 0;
        return db!
            .prepare(
                `SELECT id, document_id, version_no, created_at, source, content, checksum, size_bytes, label
                 FROM document_versions
                 WHERE document_id = ?
                 ORDER BY version_no DESC
                 LIMIT ? OFFSET ?`
            )
            .all(documentId, safeLimit, safeOffset);
    });

    registerIpcHandler('db-get-document-version', (_, versionId: string) => {
        return db!
            .prepare(
                `SELECT id, document_id, version_no, created_at, source, content, checksum, size_bytes, label
                 FROM document_versions
                 WHERE id = ?`
            )
            .get(versionId);
    });

    registerIpcHandler(
        'db-update-document-version-label',
        (_, payload: { versionId: string; label: string | null }) => {
            const versionId = String(payload?.versionId || '').trim();
            if (!versionId) return { ok: false };
            const label =
                payload?.label == null || String(payload.label).trim() === ''
                    ? null
                    : String(payload.label).trim().slice(0, 120);
            db!.prepare(`UPDATE document_versions SET label = ? WHERE id = ?`).run(label, versionId);
            return { ok: true };
        }
    );

    registerIpcHandler('db-restore-document-version', (_, payload: { documentId: string; versionId: string }) => {
        const documentId = String(payload?.documentId || '').trim();
        const versionId = String(payload?.versionId || '').trim();
        if (!documentId || !versionId) return { ok: false };

        const target = db!
            .prepare(
                `SELECT id, document_id, version_no, created_at, source, content, checksum, size_bytes, label
                 FROM document_versions
                 WHERE id = ? AND document_id = ?`
            )
            .get(versionId, documentId) as DocumentVersionRow | undefined;
        if (!target) return { ok: false };

        const latest = db!
            .prepare(
                `SELECT version_no, checksum
                 FROM document_versions
                 WHERE document_id = ?
                 ORDER BY version_no DESC
                 LIMIT 1`
            )
            .get(documentId) as { version_no: number; checksum: string } | undefined;

        if (latest?.checksum !== target.checksum) {
            const versionNo = (latest?.version_no ?? 0) + 1;
            db!
                .prepare(
                    `INSERT INTO document_versions
                    (id, document_id, version_no, source, content, checksum, size_bytes)
                    VALUES (?, ?, ?, 'recovery', ?, ?, ?)`
                )
                .run(
                    randomUUID(),
                    documentId,
                    versionNo,
                    target.content,
                    target.checksum,
                    target.size_bytes
                );
        }

        db!
            .prepare(
                `INSERT INTO document_drafts (document_id, content, checksum, updated_at)
                 VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(document_id) DO UPDATE SET
                    content = excluded.content,
                    checksum = excluded.checksum,
                    updated_at = CURRENT_TIMESTAMP`
            )
            .run(documentId, target.content, target.checksum);

        return { ok: true, content: target.content };
    });

    registerIpcHandler('db-prune-document-versions', (_, documentId: string, maxCount = 300) => {
        const safeMax = Number.isFinite(maxCount) ? Math.max(10, Math.min(1000, Number(maxCount))) : 300;
        const deleted = db!
            .prepare(
                `DELETE FROM document_versions
                 WHERE document_id = ?
                   AND id NOT IN (
                     SELECT id FROM document_versions
                     WHERE document_id = ?
                     ORDER BY version_no DESC
                     LIMIT ?
                   )`
            )
            .run(documentId, documentId, safeMax).changes;
        return { deleted };
    });

    registerIpcHandler(
        'db-search-notes',
        (
            _,
            query: string,
            limit: number = 50,
            filters?: { parentType?: string; parentId?: string }
        ) => {
            return searchNotesHybrid(db!, query, limit, filters);
        }
    );

    registerIpcHandler('db-get-note-outbound-note-links', (_, noteId: string) => {
        return db!
            .prepare(
                `
            SELECT nl.*, n.title AS target_title
            FROM note_links nl
            LEFT JOIN notes n ON nl.target_note_id = n.id
            WHERE nl.source_note_id = ?
            ORDER BY nl.created_at ASC
        `
            )
            .all(noteId);
    });

    registerIpcHandler('db-get-note-backlinks-notes', (_, noteId: string) => {
        return db!
            .prepare(
                `
            SELECT nl.*, n.title AS source_title, n.parent_type AS source_parent_type, n.parent_id AS source_parent_id
            FROM note_links nl
            JOIN notes n ON nl.source_note_id = n.id
            WHERE nl.target_note_id = ?
            ORDER BY nl.created_at DESC
        `
            )
            .all(noteId);
    });

    registerIpcHandler('db-get-note-outbound-entity-mentions', (_, noteId: string) => {
        return db!
            .prepare(
                `
            SELECT l.target_id, l.target_type, l.created_at,
                CASE l.target_type
                    WHEN 'MATTER' THEN (
                        SELECT COALESCE(NULLIF(TRIM(title), ''), internal_id, id)
                        FROM matters WHERE id = l.target_id
                    )
                    WHEN 'PARTY' THEN (SELECT full_name FROM parties WHERE id = l.target_id)
                    WHEN 'DOCUMENT' THEN (SELECT title FROM documents WHERE id = l.target_id)
                END AS target_label
            FROM links l
            WHERE l.source_id = ? AND l.source_type = 'NOTE' AND l.link_context = 'mention'
            ORDER BY l.created_at DESC
        `
            )
            .all(noteId);
    });

    registerIpcHandler('db-suggest-notes-and-entities', (_, rawQuery: string, limit: number = 24) => {
        const q = rawQuery.trim();
        const perType = Math.max(4, Math.ceil(limit / 6));
        const notes = suggestNotesForQuery(db!, q, perType);
        const entities = suggestEntitiesForQuery(db!, q, perType);
        return { notes, ...entities };
    });

    registerIpcHandler('db-suggest-entities-only', (_, rawQuery: string, limit: number = 32) => {
        const q = rawQuery.trim();
        const perType = Math.max(4, Math.ceil(limit / 4));
        return suggestEntitiesForQuery(db!, q, perType, { includeFiles: false });
    });

    registerIpcHandler('db-suggest-note-titles', (_, rawQuery: string, limit: number = 20) => {
        const lim = Math.max(1, Math.min(100, Number.isFinite(limit) ? limit : 20));
        return suggestNotesForQuery(db!, rawQuery, lim);
    });

    // --- TEXT TEMPLATES (snippets / ## expansion) ---

    registerIpcHandler('db-suggest-text-templates', (_, rawQuery: string, limit: number = 24) => {
        const q = String(rawQuery || '').trim();
        const safeLimit = Math.max(1, Math.min(100, Number.isFinite(limit) ? limit : 24));
        if (!q) {
            return db!
                .prepare(
                    `
                SELECT id, name, description, category, content_json, placeholder_schema, sort_order, usage_count, is_favorite, updated_at
                FROM document_templates
                ORDER BY is_favorite DESC, sort_order DESC, usage_count DESC, name COLLATE NOCASE ASC
                LIMIT ?
            `
                )
                .all(safeLimit);
        }
        const templateLike = buildLikeOrClause(
            ['name', 'content_plain', 'description'],
            turkishLikePatterns(q),
        );
        return filterRowsByTurkishQuery(
            db!
                .prepare(
                    `
            SELECT id, name, description, category, content_json, placeholder_schema, sort_order, usage_count, is_favorite, updated_at, content_plain
            FROM document_templates
            WHERE (${templateLike.clause})
            ORDER BY is_favorite DESC, sort_order DESC, usage_count DESC, name COLLATE NOCASE ASC
            LIMIT ?
        `
                )
                .all(...templateLike.params, safeLimit * 4) as Array<Record<string, unknown>>,
            q,
            ['name', 'description', 'content_plain'],
            safeLimit,
        );
    });

    registerIpcHandler('db-get-text-template', (_, id: string) => {
        const rid = String(id || '').trim();
        if (!rid) return null;
        return db!.prepare(`SELECT * FROM document_templates WHERE id = ?`).get(rid);
    });

    registerIpcHandler('db-increment-text-template-usage', (_, id: string) => {
        const rid = String(id || '').trim();
        if (!rid) return { changes: 0 };
        return db!
            .prepare(
                `UPDATE document_templates SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
            )
            .run(rid);
    });

    const TEXT_TEMPLATE_CATEGORY_SET = new Set([
        'CONTRACT',
        'PETITION',
        'LETTER',
        'CLAUSE',
        'DEFINITION',
        'PROCEDURE',
        'LEGISLATION',
        'CUSTOM',
    ]);

    registerIpcHandler(
        'db-add-text-template',
        (
            _,
            row: {
                id?: string;
                name: string;
                category?: string;
                content_json: string;
                content_plain?: string | null;
                placeholder_schema?: string | null;
                description?: string | null;
                sort_order?: number;
            }
        ) => {
            const name = String(row.name || '').trim();
            if (!name) return { ok: false as const, error: 'name_required' };
            const rawCat = String(row.category || 'CUSTOM').toUpperCase();
            const category = TEXT_TEMPLATE_CATEGORY_SET.has(rawCat) ? rawCat : 'CUSTOM';
            const contentJson =
                String(row.content_json || '').trim() || '{"type":"doc","content":[]}';
            const contentPlain =
                row.content_plain != null && String(row.content_plain).trim() !== ''
                    ? String(row.content_plain)
                    : null;
            const placeholderSchema =
                row.placeholder_schema != null && String(row.placeholder_schema).trim() !== ''
                    ? String(row.placeholder_schema)
                    : null;
            const desc =
                row.description != null && String(row.description).trim() !== ''
                    ? String(row.description).trim()
                    : null;
            const id = row.id && String(row.id).trim() ? String(row.id).trim() : randomUUID();
            const sortOrder = Number.isFinite(row.sort_order) ? Number(row.sort_order) : 0;
            try {
                db!.prepare(
                    `INSERT INTO document_templates (id, category, name, content_json, content_plain, placeholder_schema, description, sort_order)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
                ).run(id, category, name, contentJson, contentPlain, placeholderSchema, desc, sortOrder);
                return { ok: true as const, id };
            } catch (e) {
                console.warn('db-add-text-template failed:', e);
                return { ok: false as const, error: 'db_error' };
            }
        }
    );

    registerIpcHandler(
        'db-update-text-template',
        (
            _,
            row: {
                id: string;
                name?: string;
                category?: string;
                description?: string | null;
                placeholder_schema?: string | null;
                sort_order?: number;
                is_favorite?: number | boolean;
                content_json?: string;
                content_plain?: string | null;
            }
        ) => {
            const rid = String(row.id || '').trim();
            if (!rid) return { ok: false as const, error: 'id_required' };
            const existing = db!.prepare(`SELECT * FROM document_templates WHERE id = ?`).get(rid) as Record<
                string,
                unknown
            > | undefined;
            if (!existing) return { ok: false as const, error: 'not_found' };

            const name =
                row.name !== undefined ? String(row.name || '').trim() : String(existing.name ?? '').trim();
            if (!name) return { ok: false as const, error: 'name_required' };

            const rawCat =
                row.category !== undefined ? String(row.category || '').toUpperCase() : String(existing.category ?? 'CUSTOM');
            const category = TEXT_TEMPLATE_CATEGORY_SET.has(rawCat) ? rawCat : String(existing.category ?? 'CUSTOM');

            const description =
                row.description !== undefined
                    ? row.description === null || String(row.description).trim() === ''
                        ? null
                        : String(row.description).trim()
                    : (existing.description as string | null);
            const placeholder_schema =
                row.placeholder_schema !== undefined
                    ? row.placeholder_schema === null || String(row.placeholder_schema).trim() === ''
                        ? null
                        : String(row.placeholder_schema)
                    : (existing.placeholder_schema as string | null);
            const sort_order =
                row.sort_order !== undefined && Number.isFinite(row.sort_order)
                    ? Number(row.sort_order)
                    : Number(existing.sort_order ?? 0);
            const is_favorite =
                row.is_favorite !== undefined ? (row.is_favorite === true || row.is_favorite === 1 ? 1 : 0) : Number(existing.is_favorite ?? 0);

            const content_json =
                row.content_json !== undefined && String(row.content_json || '').trim() !== ''
                    ? String(row.content_json)
                    : String(existing.content_json ?? '{"type":"doc","content":[]}');
            const content_plain: string | null =
                row.content_plain !== undefined
                    ? row.content_plain === null || String(row.content_plain).trim() === ''
                        ? null
                        : String(row.content_plain)
                    : (existing.content_plain as string | null);

            db!.prepare(
                `UPDATE document_templates SET
                    category = ?, name = ?, content_json = ?, content_plain = ?, placeholder_schema = ?, description = ?,
                    sort_order = ?, is_favorite = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`
            ).run(category, name, content_json, content_plain, placeholder_schema, description, sort_order, is_favorite, rid);
            return { ok: true as const };
        }
    );

    registerIpcHandler('db-delete-text-template', (_, id: string) => {
        const rid = String(id || '').trim();
        if (!rid) return { ok: false as const, error: 'id_required' };
        const existing = db!.prepare(`SELECT id FROM document_templates WHERE id = ?`).get(rid);
        if (!existing) return { ok: false as const, error: 'not_found' };
        db!.prepare(`DELETE FROM document_templates WHERE id = ?`).run(rid);
        return { ok: true as const };
    });

    registerIpcHandler('db-log-mention-lineage', (_, payload: unknown) => {
        const id = randomUUID();
        let payloadJson = '{}';
        try {
            payloadJson = JSON.stringify(payload ?? {});
        } catch {
            payloadJson = '{"error":"stringify_failed"}';
        }
        try {
            db!.prepare(`INSERT INTO mention_lineage_log (id, payload_json) VALUES (?, ?)`).run(id, payloadJson);
            return { ok: true as const, id };
        } catch (e) {
            console.warn('db-log-mention-lineage failed:', e);
            return { ok: false as const, error: 'db_error' };
        }
    });

    registerIpcHandler('db-list-text-templates', (_, _filters?: { category?: string; limit?: number }) => {
        const limit = Math.max(1, Math.min(500, Number.isFinite(_filters?.limit) ? Number(_filters?.limit) : 200));
        if (_filters?.category) {
            return db!
                .prepare(
                    `SELECT id, name, description, category, content_plain, placeholder_schema, sort_order, usage_count, is_favorite, created_at, updated_at
                     FROM document_templates
                     WHERE category = ?
                     ORDER BY sort_order ASC, name COLLATE NOCASE ASC
                     LIMIT ?`
                )
                .all(_filters.category, limit);
        }
        return db!
            .prepare(
                `SELECT id, name, description, category, content_plain, placeholder_schema, sort_order, usage_count, is_favorite, created_at, updated_at
                 FROM document_templates
                 ORDER BY is_favorite DESC, sort_order ASC, name COLLATE NOCASE ASC
                 LIMIT ?`
            )
            .all(limit);
    });

    // --- TAGS ---

    registerIpcHandler('db-get-tags', () => {
        return db!.prepare('SELECT * FROM tags ORDER BY name ASC').all();
    });

    registerIpcHandler('db-get-tag-cloud', () => {
        return db!.prepare(`
            SELECT t.*, COUNT(et.entity_id) as usage_count
            FROM tags t
            LEFT JOIN entity_tags et ON t.id = et.tag_id
            GROUP BY t.id
            ORDER BY usage_count DESC, t.name ASC
        `).all();
    });

    registerIpcHandler('db-add-tag', (_, tag) => {
        const stmt = db!.prepare(`
            INSERT INTO tags (id, name, color)
            VALUES (@id, @name, @color)
        `);
        return stmt.run(tag);
    });

    registerIpcHandler('db-update-tag', (_, tag) => {
        const stmt = db!.prepare('UPDATE tags SET name=@name, color=@color WHERE id=@id');
        return stmt.run(tag);
    });

    registerIpcHandler('db-delete-tag', (_, id: string) => {
        return db!.prepare('DELETE FROM tags WHERE id = ?').run(id);
    });

    registerIpcHandler('db-link-tag-to-entity', (_, params: { tagId: string, entityId: string, entityType: string }) => {
        const stmt = db!.prepare(`
            INSERT OR IGNORE INTO entity_tags (tag_id, entity_id, entity_type)
            VALUES (?, ?, ?)
        `);
        return stmt.run(params.tagId, params.entityId, params.entityType);
    });

    registerIpcHandler('db-unlink-tag-from-entity', (_, params: { tagId: string, entityId: string }) => {
        const stmt = db!.prepare('DELETE FROM entity_tags WHERE tag_id = ? AND entity_id = ?');
        return stmt.run(params.tagId, params.entityId);
    });

    registerIpcHandler('db-get-entity-tags', (_, params: { entityId: string, entityType: string }) => {
        return db!.prepare(`
            SELECT t.*
            FROM tags t
            JOIN entity_tags et ON t.id = et.tag_id
            WHERE et.entity_id = ? AND et.entity_type = ?
        `).all(params.entityId, params.entityType);
    });

    // --- Structured entity attributes (tag catalog + per-entity values) ---

    const ENTITY_ATTRIBUTE_TYPES = new Set(['PARTY', 'MATTER', 'KNOWLEDGE']);

    registerIpcHandler('db-list-attribute-tags', (_, entityType: string) => {
        const type = String(entityType || '').trim();
        if (!ENTITY_ATTRIBUTE_TYPES.has(type)) return [];
            return db!
                .prepare(
                    `SELECT * FROM attribute_tag_catalog
                     WHERE entity_type = ?
                       AND key != ?
                     ORDER BY sort_order ASC, label COLLATE NOCASE ASC`
                )
                .all(type, HIDDEN_MATTER_ATTRIBUTE_KEY);
    });

    registerIpcHandler(
        'db-add-attribute-tag',
        (
            _,
            payload: {
                entity_type: string;
                key: string;
                label?: string;
                sort_order?: number;
            }
        ) => {
            const entityType = String(payload.entity_type || '').trim();
            const key = String(payload.key || '').trim();
            if (!ENTITY_ATTRIBUTE_TYPES.has(entityType) || !key) {
                return { ok: false as const, error: 'invalid_payload' };
            }
            const label = String(payload.label || key).trim() || key;
            const sortOrder =
                typeof payload.sort_order === 'number' && Number.isFinite(payload.sort_order)
                    ? payload.sort_order
                    : 999;
            const id = `${entityType.toLowerCase()}-${key}`;
            try {
                db!.prepare(
                    `INSERT INTO attribute_tag_catalog (id, key, label, entity_type, is_system, sort_order)
                     VALUES (?, ?, ?, ?, 0, ?)`
                ).run(id, key, label, entityType, sortOrder);
                const row = db!
                    .prepare(`SELECT * FROM attribute_tag_catalog WHERE id = ?`)
                    .get(id);
                return { ok: true as const, row };
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                if (message.includes('UNIQUE')) {
                    return { ok: false as const, error: 'duplicate_key' };
                }
                return { ok: false as const, error: message };
            }
        }
    );

    registerIpcHandler(
        'db-get-entity-attributes',
        (_, params: { entity_type: string; entity_id: string }) => {
            const entityType = String(params?.entity_type || '').trim();
            const entityId = String(params?.entity_id || '').trim();
            if (!ENTITY_ATTRIBUTE_TYPES.has(entityType) || !entityId) return [];
            return db!
                .prepare(
                    `SELECT * FROM entity_attributes
                     WHERE entity_type = ? AND entity_id = ?
                       AND tag_key != ?
                     ORDER BY sort_order ASC, tag_key COLLATE NOCASE ASC`
                )
                .all(entityType, entityId, HIDDEN_MATTER_ATTRIBUTE_KEY);
        }
    );

    registerIpcHandler(
        'db-upsert-entity-attributes',
        (
            _,
            params: {
                entity_type: string;
                entity_id: string;
                rows: Array<{ tag_key: string; tag_value: string; sort_order?: number }>;
            }
        ) => {
            const entityType = String(params?.entity_type || '').trim();
            const entityId = String(params?.entity_id || '').trim();
            if (!ENTITY_ATTRIBUTE_TYPES.has(entityType) || !entityId) {
                return { ok: false as const, error: 'invalid_payload' };
            }
            const rows = Array.isArray(params.rows) ? params.rows : [];
            try {
                const deleteStmt = db!.prepare(
                    `DELETE FROM entity_attributes
                     WHERE entity_type = ? AND entity_id = ? AND tag_key != ?`
                );
                const insertStmt = db!.prepare(
                    `INSERT INTO entity_attributes (id, entity_type, entity_id, tag_key, tag_value, sort_order)
                     VALUES (?, ?, ?, ?, ?, ?)`
                );
                const count = db!.transaction(() => {
                    deleteStmt.run(entityType, entityId, HIDDEN_MATTER_ATTRIBUTE_KEY);
                    let inserted = 0;
                    rows.forEach((row, index) => {
                        const tagKey = String(row.tag_key || '').trim();
                        if (!tagKey || tagKey === HIDDEN_MATTER_ATTRIBUTE_KEY) return;
                        const tagValue = String(row.tag_value ?? '');
                        const sortOrder =
                            typeof row.sort_order === 'number' && Number.isFinite(row.sort_order)
                                ? row.sort_order
                                : index;
                        insertStmt.run(
                            randomUUID(),
                            entityType,
                            entityId,
                            tagKey,
                            tagValue,
                            sortOrder
                        );
                        inserted += 1;
                    });
                    return inserted;
                })();
                return { ok: true as const, count };
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                return { ok: false as const, error: message };
            }
        }
    );

    // --- FILESYSTEM METADATA ---
    registerIpcHandler('db-get-file-tags', (_, path: string) => {
        return db!
            .prepare(`SELECT path, tag, created_at FROM file_tags WHERE path = ? ORDER BY tag ASC`)
            .all(path);
    });

    registerIpcHandler('db-add-file-tag', (_, payload: { path: string; tag: string }) => {
        const tag = String(payload.tag || '').trim();
        if (!tag) return { changes: 0 };
        return db!
            .prepare(`INSERT OR IGNORE INTO file_tags (path, tag) VALUES (?, ?)`)
            .run(payload.path, tag);
    });

    registerIpcHandler('db-remove-file-tag', (_, payload: { path: string; tag: string }) => {
        return db!
            .prepare(`DELETE FROM file_tags WHERE path = ? AND tag = ?`)
            .run(payload.path, payload.tag);
    });

    registerIpcHandler('db-get-starred-files', (_, limit: number = 100) => {
        return db!
            .prepare(`SELECT path, pinned_at FROM file_pins ORDER BY pinned_at DESC LIMIT ?`)
            .all(limit);
    });

    registerIpcHandler('db-set-file-starred', (_, payload: { path: string; starred: boolean }) => {
        if (payload.starred) {
            return db!
                .prepare(
                    `INSERT INTO file_pins (path, pinned_at) VALUES (?, CURRENT_TIMESTAMP)
                     ON CONFLICT(path) DO UPDATE SET pinned_at = CURRENT_TIMESTAMP`
                )
                .run(payload.path);
        }
        return db!.prepare(`DELETE FROM file_pins WHERE path = ?`).run(payload.path);
    });

    registerIpcHandler('db-touch-recent-file', (_, path: string) => {
        return db!
            .prepare(
                `INSERT INTO file_recent (path, opened_at) VALUES (?, CURRENT_TIMESTAMP)
                 ON CONFLICT(path) DO UPDATE SET opened_at = CURRENT_TIMESTAMP`
            )
            .run(path);
    });

    registerIpcHandler('db-get-recent-files', (_, limit: number = 40) => {
        return db!
            .prepare(`SELECT path, opened_at FROM file_recent ORDER BY opened_at DESC LIMIT ?`)
            .all(limit);
    });

    // --- LINKS ---

    registerIpcHandler('db-create-link', (_, link) => {
        const stmt = db!.prepare(`
            INSERT INTO links (id, source_id, source_type, target_id, target_type, link_context)
            VALUES (@id, @source_id, @source_type, @target_id, @target_type, @link_context)
        `);
        return stmt.run(link);
    });

    registerIpcHandler('db-get-backlinks', (_, params: { entityId: string, entityType: string }) => {
        return db!.prepare(`
            SELECT l.*, n.title as source_title
            FROM links l
            LEFT JOIN notes n ON l.source_id = n.id AND l.source_type = 'NOTE'
            WHERE l.target_id = ? AND l.target_type = ?
            ORDER BY l.created_at DESC
        `).all(params.entityId, params.entityType);
    });

    registerIpcHandler('db-delete-link', (_, id: string) => {
        return db!.prepare('DELETE FROM links WHERE id = ?').run(id);
    });

    // --- DOCUMENTS ---

    registerIpcHandler('db-get-documents', (_, matterId: string, folderId?: string) => {
        let query = 'SELECT * FROM documents WHERE matter_id = ?';
        const params: any[] = [matterId];

        if (folderId !== undefined) {
            query += ' AND folder_id ' + (folderId ? '= ?' : 'IS NULL');
            if (folderId) params.push(folderId);
        }

        query += ' ORDER BY created_at DESC';
        const rows = db!.prepare(query).all(...params) as Array<{
            file_path?: string | null;
            metadata?: string | null;
            source_system?: string | null;
        }>;
        return rows.map((row) => withPublicEvrakPath(row));
    });

    registerIpcHandler('db-add-document', (_, document) => {
        const stmt = db!.prepare(`
            INSERT INTO documents (
                id, matter_id, folder_id, title, file_path, file_hash, doc_type, 
                source_system, incoming_date, barcode_no, content, metadata
            ) VALUES (
                @id, @matter_id, @folder_id, @title, @file_path, @file_hash, @doc_type,
                @source_system, @incoming_date, @barcode_no, @content, @metadata
            )
        `);
        const data = {
            folder_id: null, file_path: null, file_hash: null, doc_type: 'OTHER',
            source_system: 'LOCAL', incoming_date: null, barcode_no: null,
            content: null, metadata: null,
            ...document
        };
        return stmt.run(data);
    });

    registerIpcHandler('db-update-document', (_, document) => {
        const stmt = db!.prepare(`
            UPDATE documents SET
                title=@title, folder_id=@folder_id, file_path=@file_path, doc_type=@doc_type,
                source_system=@source_system, incoming_date=@incoming_date,
                barcode_no=@barcode_no, content=@content, metadata=@metadata
            WHERE id=@id
        `);
        const data = {
            folder_id: null, file_path: null, doc_type: 'OTHER',
            source_system: 'LOCAL', incoming_date: null, barcode_no: null,
            content: null, metadata: null,
            ...document
        };
        return stmt.run(data);
    });

    registerIpcHandler('db-delete-document', (_, id: string) => {
        return db!.prepare('DELETE FROM documents WHERE id = ?').run(id);
    });

    // --- FOLDERS ---

    registerIpcHandler('db-get-folders', (_, matterId: string) => {
        return db!.prepare('SELECT * FROM folders WHERE matter_id = ? ORDER BY name ASC').all(matterId);
    });

    registerIpcHandler('db-get-uyap-evrak-stats', () => {
        const matters = db!
            .prepare(
                `SELECT COUNT(*) AS n FROM matters
                 WHERE file_number IS NOT NULL AND TRIM(file_number) != ''`,
            )
            .get() as { n: number };
        const mattersWithEvrak = db!
            .prepare(
                `SELECT COUNT(*) AS n FROM matters
                 WHERE json_array_length(json_extract(metadata, '$.uyap.evrak.items')) > 0`,
            )
            .get() as { n: number };
        const documents = db!
            .prepare(`SELECT COUNT(*) AS n FROM documents WHERE source_system = 'UYAP'`)
            .get() as { n: number };
        const downloaded = db!
            .prepare(
                `SELECT COUNT(*) AS n FROM documents
                 WHERE source_system = 'UYAP' AND file_path IS NOT NULL AND TRIM(file_path) != ''`,
            )
            .get() as { n: number };
        return {
            matters: Number(matters?.n) || 0,
            mattersWithEvrak: Number(mattersWithEvrak?.n) || 0,
            documents: Number(documents?.n) || 0,
            downloaded: Number(downloaded?.n) || 0,
        };
    });

    registerIpcHandler('db-get-uyap-dashboard', () => {
        const fingerprint = uyapAggFingerprint(db!);
        if (uyapDashboardCache && uyapDashboardCache.fingerprint === fingerprint) {
            return uyapDashboardCache.payload;
        }
        const allMattersRow = db!.prepare(`SELECT COUNT(*) AS n FROM matters`).get() as { n: number };
        const rows = db!
            .prepare(
                `SELECT id, file_number, status, matter_type, opening_date, closing_date, court_name,
                        json_extract(metadata, '$.uyap.dosyaTurKod') AS dosya_tur_kod,
                        json_extract(metadata, '$.uyap.dosyaTur') AS dosya_tur,
                        json_extract(metadata, '$.uyap.dosyaAcilisTarihi') AS dosya_acilis_tarihi,
                        json_extract(metadata, '$.uyap.yargiBirimTablo') AS yargi_birim_tablo,
                        json_extract(metadata, '$.uyap.birimId') AS birim_id,
                        json_extract(metadata, '$.uyap.birimAdi') AS birim_adi,
                        json_extract(metadata, '$.uyap.dosyaDurum') AS dosya_durum,
                        json_extract(metadata, '$.uyap.icra.takipTuru') AS icra_takip_turu,
                        json_extract(metadata, '$.uyap.icra.takipYolu') AS icra_takip_yolu,
                        json_extract(metadata, '$.uyap.partyProcessRoles') AS party_process_roles,
                        json_extract(metadata, '$.uyap.hareketsizSnoozeUntil') AS hareketsiz_snooze_until,
                        json_extract(metadata, '$.uyap.lastCatalogScanAt') AS last_catalog_scan_at,
                        json_extract(metadata, '$.uyap.lastCatalogAttemptAt') AS last_catalog_attempt_at,
                        json_extract(metadata, '$.uyap.evrak.listed') AS evrak_listed,
                        json_extract(metadata, '$.uyap.evrak.skipped') AS evrak_skipped,
                        json_extract(metadata, '$.uyap.evrak.updatedAt') AS evrak_updated_at,
                        json_extract(metadata, '$.uyap.evrak.evrakCount') AS evrak_count,
                        json_array_length(json_extract(metadata, '$.uyap.evrak.items')) AS evrak_items_length,
                        json_extract(metadata, '$.uyap.unscannable.until') AS unscannable_until
                 FROM matters
                 WHERE file_number IS NOT NULL AND TRIM(file_number) != ''`,
            )
            .all() as Array<{
            id: string;
            file_number: string;
            status: string;
            matter_type: string | null;
            opening_date: string | null;
            closing_date: string | null;
            court_name: string | null;
            dosya_tur_kod: unknown;
            dosya_tur: unknown;
            dosya_acilis_tarihi: unknown;
            yargi_birim_tablo: unknown;
            birim_id: unknown;
            birim_adi: unknown;
            dosya_durum: unknown;
            icra_takip_turu: unknown;
            icra_takip_yolu: unknown;
            party_process_roles: unknown;
            hareketsiz_snooze_until: unknown;
            last_catalog_scan_at: unknown;
            last_catalog_attempt_at: unknown;
            evrak_listed: unknown;
            evrak_skipped: unknown;
            evrak_updated_at: unknown;
            evrak_count: unknown;
            evrak_items_length: unknown;
            unscannable_until: unknown;
        }>;
        const counts = {
            icra: 0,
            icraAlacakli: 0,
            icraAlacakliOpen: 0,
            icraBorclu: 0,
            icraBorcluOpen: 0,
            icraUcuncu: 0,
            hukuk: 0,
            ceza: 0,
            idare: 0,
            other: 0,
            appeal: 0,
            open: 0,
            closed: 0,
            total: rows.length,
        };
        const statusByType = emptyTypeStatusCounts();
        const openingAccum = new Map<string, OpeningMonthAccum>();
        const muvekkilIdsByMatter = new Map<string, string[]>();
        const muvekkilProcessByMatter = new Map<string, Record<string, unknown>>();
        const karsiProcessByMatter = new Map<string, unknown[]>();
        const partyLinkRows = db!
            .prepare(
                `SELECT mp.matter_id, mp.party_id, mp.role,
                        json_extract(p.metadata, '$.uyap.rol') AS process_role
                 FROM matter_parties mp
                 LEFT JOIN parties p ON p.id = mp.party_id`,
            )
            .all() as Array<{
            matter_id: string;
            party_id: string;
            role: string | null;
            process_role: unknown;
        }>;
        for (const link of partyLinkRows) {
            if (isOfficeMuvekkilRole(link.role)) {
                const list = muvekkilIdsByMatter.get(link.matter_id) ?? [];
                list.push(link.party_id);
                muvekkilIdsByMatter.set(link.matter_id, list);
                const processMap = muvekkilProcessByMatter.get(link.matter_id) ?? {};
                if (link.process_role != null && String(link.process_role).trim() !== '') {
                    processMap[link.party_id] = link.process_role;
                }
                muvekkilProcessByMatter.set(link.matter_id, processMap);
            } else if (isOfficeKarsiRole(link.role)) {
                const list = karsiProcessByMatter.get(link.matter_id) ?? [];
                if (link.process_role != null && String(link.process_role).trim() !== '') {
                    list.push(link.process_role);
                }
                karsiProcessByMatter.set(link.matter_id, list);
            }
        }
        const portalDateColFirst = sqlUyapPortalDateColumnFirst('d');
        const lastDocRows = db!
            .prepare(
                `SELECT d.matter_id AS matter_id, MAX(${portalDateColFirst}) AS last_at
                 FROM matters m
                 INNER JOIN documents d ON d.matter_id = m.id AND d.source_system = 'UYAP'
                 WHERE m.status IN ('OPEN', 'APPEAL')
                   AND m.file_number IS NOT NULL AND TRIM(m.file_number) != ''
                 GROUP BY d.matter_id`,
            )
            .all() as Array<{ matter_id: string; last_at: string | null }>;
        const lastDocByMatter = new Map<string, string>();
        for (const row of lastDocRows) {
            if (row.last_at) lastDocByMatter.set(row.matter_id, String(row.last_at).slice(0, 10));
        }
        const idleUsesTasks = Boolean(
            db!
                .prepare(
                    `SELECT 1 AS ok
                     FROM tasks t
                     INNER JOIN matters m ON m.id = t.matter_id
                     WHERE m.file_number IS NOT NULL AND TRIM(m.file_number) != ''
                     LIMIT 1`,
                )
                .get(),
        );
        const lastTaskByMatter = new Map<string, string>();
        if (idleUsesTasks) {
            const lastTaskRows = db!
                .prepare(
                    `SELECT t.matter_id AS matter_id,
                            MAX(COALESCE(t.updated_at, t.completed_at, t.created_at)) AS last_at
                     FROM tasks t
                     INNER JOIN matters m ON m.id = t.matter_id
                     WHERE m.status IN ('OPEN', 'APPEAL')
                       AND m.file_number IS NOT NULL AND TRIM(m.file_number) != ''
                     GROUP BY t.matter_id`,
                )
                .all() as Array<{ matter_id: string; last_at: string | null }>;
            for (const row of lastTaskRows) {
                if (row.last_at) lastTaskByMatter.set(row.matter_id, String(row.last_at));
            }
        }
        const idleOpenCandidates: Array<{ id: string; file_number: string; court_name: string | null }> = [];
        const idleSnoozeUntilById = new Map<string, unknown>();
        const now = new Date();
        const attrRows = db!
            .prepare(
                `SELECT entity_id, tag_key, tag_value
                 FROM entity_attributes
                 WHERE entity_type = 'MATTER'
                   AND tag_key IN (
                     'uyap_takipte_kesinlesen_miktar',
                     'uyap_bakiye_borc_miktari',
                     'uyap_dosya_acilis_tarihi',
                     'uyap_dosya_durumu',
                     'uyap_icra_takip_turu',
                     'uyap_icra_takip_yolu'
                   )`,
            )
            .all() as Array<{ entity_id: string; tag_key: string; tag_value: string }>;
        const openingByMatter = new Map<string, string>();
        const durumByMatter = new Map<string, string>();
        const icraTuruByMatter = new Map<string, string>();
        const icraYoluByMatter = new Map<string, string>();
        const kesinlesenByMatter = new Map<string, number>();
        const bakiyeByMatter = new Map<string, number>();
        for (const row of attrRows) {
            if (row.tag_key === 'uyap_dosya_acilis_tarihi' && row.tag_value) {
                openingByMatter.set(row.entity_id, row.tag_value);
            }
            if (row.tag_key === 'uyap_dosya_durumu' && row.tag_value) {
                durumByMatter.set(row.entity_id, row.tag_value);
            }
            if (row.tag_key === 'uyap_icra_takip_turu' && row.tag_value) {
                icraTuruByMatter.set(row.entity_id, row.tag_value);
            }
            if (row.tag_key === 'uyap_icra_takip_yolu' && row.tag_value) {
                icraYoluByMatter.set(row.entity_id, row.tag_value);
            }
            if (row.tag_key === 'uyap_takipte_kesinlesen_miktar' && row.tag_value) {
                kesinlesenByMatter.set(row.entity_id, parseTrAmount(row.tag_value));
            }
            if (row.tag_key === 'uyap_bakiye_borc_miktari' && row.tag_value) {
                bakiyeByMatter.set(row.entity_id, parseTrAmount(row.tag_value));
            }
        }
        const breakdownMaps = {
            icra: new Map<string, { open: number; count: number }>(),
            hukuk: new Map<string, { open: number; count: number }>(),
            ceza: new Map<string, { open: number; count: number }>(),
            idare: new Map<string, { open: number; count: number }>(),
            other: new Map<string, { open: number; count: number }>(),
        };
        let alacak = 0;
        let alacakOpen = 0;
        let alacakAlacakli = 0;
        let alacakAlacakliOpen = 0;
        let alacakBorclu = 0;
        let alacakBorcluOpen = 0;
        let bakiye = 0;
        let uyapLinked = 0;
        let openingDated = 0;
        const inventoryFreshness = emptyInventoryFreshness();
        for (const row of rows) {
            try {
            addInventoryFreshnessScore(
                inventoryFreshness,
                scoreInventoryCatalogFreshness({
                    status: row.status,
                    courtName: row.court_name,
                    birimAdi: row.birim_adi != null ? String(row.birim_adi) : null,
                    yargiBirimTablo: row.yargi_birim_tablo,
                    dosyaDurum: row.dosya_durum,
                    lastCatalogScanAt: row.last_catalog_scan_at,
                    lastCatalogAttemptAt: row.last_catalog_attempt_at,
                    evrakListed: row.evrak_listed,
                    evrakSkipped: row.evrak_skipped,
                    evrakUpdatedAt: row.evrak_updated_at,
                    evrakCount: row.evrak_count,
                    evrakItemsLength: row.evrak_items_length,
                    unscannableUntil: row.unscannable_until,
                }, now.getTime()),
            );
            const courtName =
                String(row.court_name || '').trim()
                || String(row.birim_adi || '').trim()
                || null;
            const courtHint = {
                yargiBirimTablo: row.yargi_birim_tablo != null ? String(row.yargi_birim_tablo) : null,
                courtName,
                birimAdi: row.birim_adi != null ? String(row.birim_adi) : null,
                dosyaTurKod: row.dosya_tur_kod,
                dosyaTur: row.dosya_tur != null ? String(row.dosya_tur) : null,
            };
            let bucket = asDosyaTurBucket(bucketDosyaTur(row.dosya_tur_kod, courtHint));
            if (bucket === 'other' && row.matter_type === 'ENFORCEMENT' && !isDigerYargiCourt(courtHint)) {
                bucket = 'icra';
            }
            counts[bucket] += 1;
            if (isOpenLikeStatus(row.status)) {
                statusByType[bucket].open += 1;
                counts.open += 1;
            } else if (isClosedLikeStatus(row.status)) {
                statusByType[bucket].closed += 1;
                counts.closed += 1;
            }
            let icraRole: ReturnType<typeof classifyIcraMuvekkilRole> | undefined;
            if (bucket === 'icra') {
                icraRole = classifyIcraMuvekkilRole(
                    row.party_process_roles,
                    muvekkilIdsByMatter.get(row.id) ?? [],
                    {
                        muvekkilProcessRoles: muvekkilProcessByMatter.get(row.id),
                        karsiProcessRoles: karsiProcessByMatter.get(row.id),
                    },
                );
                const fileOpen = isOpenLikeStatus(row.status);
                if (icraRole === 'alacakli') {
                    counts.icraAlacakli += 1;
                    if (fileOpen) counts.icraAlacakliOpen += 1;
                } else if (icraRole === 'borclu') {
                    counts.icraBorclu += 1;
                    if (fileOpen) counts.icraBorcluOpen += 1;
                } else if (icraRole === 'ucuncu') {
                    counts.icraUcuncu += 1;
                }
            }
            if (row.status === 'APPEAL') counts.appeal += 1;
            const hasBirim = row.birim_id != null && String(row.birim_id).trim() !== '';
            if (hasBirim || row.dosya_tur_kod != null) uyapLinked += 1;
            const subtypeLabel =
                bucket === 'icra'
                    ? icraSubtypeLabel({
                          takipYoluText: icraYoluByMatter.get(row.id) ?? null,
                          takipTuruText: icraTuruByMatter.get(row.id) ?? null,
                          takipYoluKod: row.icra_takip_yolu,
                          takipTuruKod: row.icra_takip_turu,
                      })
                    : courtTypeLabel(courtHint);
            incrementBreakdownPair(breakdownMaps[bucket], subtypeLabel, isOpenLikeStatus(row.status));
            const amount =
                bucket === 'icra'
                    ? icraAmountWithFallback(kesinlesenByMatter.get(row.id), bakiyeByMatter.get(row.id))
                    : 0;
            if (bucket === 'icra') {
                const durum = String(row.dosya_durum || durumByMatter.get(row.id) || '').trim();
                bakiye += bakiyeByMatter.get(row.id) || 0;
                if (amount > 0) {
                    alacak += amount;
                    const amountOpen = isIcraAlacakOpen({ status: row.status, dosyaDurum: durum });
                    if (amountOpen) alacakOpen += amount;
                    if (icraRole === 'alacakli') {
                        alacakAlacakli += amount;
                        if (amountOpen) alacakAlacakliOpen += amount;
                    } else if (icraRole === 'borclu') {
                        alacakBorclu += amount;
                        if (amountOpen) alacakBorcluOpen += amount;
                    }
                }
            }
            const month = coalesceOpeningMonth({
                opening_date: row.opening_date,
                dosya_acilis_tarihi: row.dosya_acilis_tarihi,
                attr_opening: openingByMatter.get(row.id) ?? null,
            });
            if (month) {
                openingDated += 1;
                addOpeningMonthFact(openingAccum, {
                    month,
                    bucket,
                    icraAlacak: bucket === 'icra' ? amount : undefined,
                    icraRole,
                    closure: classifyMatterClosure({
                        status: row.status,
                        closingDate: row.closing_date,
                    }),
                    label: subtypeLabel,
                });
            }
            if (isClosedLikeStatus(row.status)) {
                const closeMonth = openingMonthKey(row.closing_date);
                if (closeMonth) addClosingMonthCount(openingAccum, closeMonth);
            }
            if (
                isIdleOpenMatter({
                    status: row.status,
                    lastDocumentAt: lastDocByMatter.get(row.id) ?? null,
                    lastTaskAt: lastTaskByMatter.get(row.id) ?? null,
                    useTasks: idleUsesTasks,
                    asOf: now,
                })
            ) {
                idleOpenCandidates.push({
                    id: row.id,
                    file_number: row.file_number,
                    court_name: row.court_name ? toTurkishTitleCase(row.court_name) : row.court_name,
                });
                idleSnoozeUntilById.set(row.id, row.hareketsiz_snooze_until);
            }
            } catch {
                counts.other += 1;
                incrementBreakdownPair(
                    breakdownMaps.other,
                    toTurkishTitleCase(String(row.court_name || row.birim_adi || '').trim()) || 'Belirtilmemiş',
                    isOpenLikeStatus(row.status),
                );
            }
        }
        const evrakCards = db!
            .prepare(`SELECT COUNT(*) AS n FROM documents WHERE source_system = 'UYAP'`)
            .get() as { n: number };
        const incomingIso = sqlUyapPlausibleIncoming('d');
        const evrakLast14FromIncoming = db!
            .prepare(
                `SELECT COUNT(*) AS n
                 FROM documents d
                 WHERE d.source_system = 'UYAP'
                   AND ${sqlIncomingIsDateOnly('d')}
                   AND ${sqlIsoYearIsPlausible('d.incoming_date')}
                   AND d.incoming_date >= date('now', '-${EVRAK_RECENT_DAYS} days')`,
            )
            .get() as { n: number };
        const evrakLast14FromJson = db!
            .prepare(
                `SELECT COUNT(*) AS n
                 FROM documents d
                 WHERE d.source_system = 'UYAP'
                   AND NOT (${sqlIncomingIsDateOnly('d')})
                   AND ${incomingIso} IS NULL
                   AND date(${sqlUyapPortalDate('d')}) >= date('now', '-${EVRAK_RECENT_DAYS} days')`,
            )
            .get() as { n: number };
        const evrakLast14Days =
            (Number(evrakLast14FromIncoming?.n) || 0) + (Number(evrakLast14FromJson?.n) || 0);
        const evrakAddedLast24Hours = Number(
            (
                db!
                    .prepare(
                        `SELECT COUNT(*) AS n
                         FROM documents d
                         WHERE d.source_system = 'UYAP'
                           AND datetime(d.created_at) >= datetime('now', '-${EVRAK_ADDED_HOURS} hours')`,
                    )
                    .get() as { n: number }
            )?.n,
        ) || 0;
        const lastEvrakScanAt = getAppMeta(db!, KATIR_LAST_SCAN_META_KEY);
        const inventory = finalizeInventoryFreshness(inventoryFreshness);
        idleOpenCandidates.sort((a, b) => a.file_number.localeCompare(b.file_number, 'tr'));
        const idlePartition = partitionIdleOpenMatters(idleOpenCandidates, idleSnoozeUntilById, now);
        const idleOpenMatters = idlePartition.active;
        const idleSnoozedMatters = idlePartition.snoozed;
        const openingByMonth = serializeOpeningMonthWindow(openingAccum);
        const openingWindow = openingByMonth.slice(-12).reduce((sum, row) => sum + row.count, 0);
        const trailingOpenings = trailingOpeningTotals(openingAccum, now);
        const payload = {
            ...counts,
            statusByType,
            allMatters: Number(allMattersRow?.n) || 0,
            withFileNumber: rows.length,
            uyapLinked,
            openingDated,
            openingWindow,
            trailingOpenings,
            alacak,
            alacakOpen,
            alacakAlacakli,
            alacakAlacakliOpen,
            alacakBorclu,
            alacakBorcluOpen,
            bakiye,
            evrakCards: Number(evrakCards?.n) || 0,
            evrakLast14Days,
            evrakAddedLast24Hours,
            lastEvrakScanAt,
            inventoryCurrentPercent: inventory.percent,
            inventoryCurrentCount: inventory.current,
            inventoryEligibleCount: inventory.eligible,
            idleOpenCount: idleOpenMatters.length,
            idleSnoozedCount: idleSnoozedMatters.length,
            idleOpenMatters: idleOpenMatters.slice(0, 80),
            idleSnoozedMatters: idleSnoozedMatters.slice(0, 80),
            idleUsesTasks,
            openingByMonth,
            breakdowns: {
                icra: toBreakdownPairRows(breakdownMaps.icra),
                hukuk: toBreakdownPairRows(breakdownMaps.hukuk),
                ceza: toBreakdownPairRows(breakdownMaps.ceza),
                idare: toBreakdownPairRows(breakdownMaps.idare),
                other: toBreakdownPairRows(breakdownMaps.other),
            },
        };
        uyapDashboardCache = { fingerprint, payload };
        return payload;
    });

    registerIpcHandler('db-search-uyap-matters', (_, query?: string) => {
        const needle = String(query || '').trim();
        if (!needle) return [];
        // LIKE first — do not pre-limit by updated_at (catalog sprint ties drop most files).
        const courtNameSql = `COALESCE(
            NULLIF(TRIM(court_name), ''),
            json_extract(metadata, '$.uyap.birimAdi')
        )`;
        const like = turkishSqlLikeFilter(
            ['file_number', 'title', 'court_name'],
            needle,
        );
        const rows = db!
            .prepare(
                `SELECT id, title, file_number, ${courtNameSql} AS court_name, matter_type, status
                 FROM matters
                 WHERE file_number IS NOT NULL AND TRIM(file_number) != ''
                   AND (${like.clause})
                 LIMIT ?`,
            )
            .all(...like.params, 120) as Array<{
            id: string;
            title: string;
            file_number: string;
            court_name: string | null;
            matter_type: string | null;
            status: string;
        }>;
        return filterRowsByTurkishQuery(rows, needle, ['file_number', 'title', 'court_name'], 80);
    });

    registerIpcHandler('db-get-uyap-evrak-tree', (_, matterId: string) => {
        const folders = db!
            .prepare(`SELECT id, name, parent_id FROM folders WHERE matter_id = ? ORDER BY name`)
            .all(matterId);
        const docs = db!
            .prepare(
                `SELECT id, folder_id, title, file_path, barcode_no, incoming_date, metadata
                 FROM documents
                 WHERE matter_id = ? AND source_system = 'UYAP'
                 ORDER BY incoming_date DESC, title`,
            )
            .all(matterId) as Array<{
            id: string;
            file_path: string | null;
            metadata: string | null;
        }>;
        return {
            folders,
            docs: uniqueUyapEvrakRows(docs).map((row) => withPublicEvrakPath(row)),
        };
    });

    registerIpcHandler('db-list-recent-uyap-evrak', (_, limit?: number) => {
        const n = Math.min(100, Math.max(1, Number(limit) || 100));
        const fingerprint = `${uyapAggFingerprint(db!)}:${n}`;
        if (uyapRecentEvrakCache && uyapRecentEvrakCache.fingerprint === fingerprint) {
            return uyapRecentEvrakCache.payload;
        }
        const courtName = `COALESCE(
            NULLIF(TRIM(m.court_name), ''),
            json_extract(m.metadata, '$.uyap.birimAdi')
        )`;
        const fetchN = Math.min(400, n * 4);
        const leftoverN = Math.min(80, fetchN);
        const selectList = `d.id, d.matter_id, d.title, d.incoming_date, d.created_at, d.metadata, d.file_path,
                            m.file_number, ${courtName} AS court_name, ${courtName} AS birimAdi,
                            m.title AS matter_title, m.matter_type, m.status`;
        type RecentRow = {
            id: string;
            matter_id?: string | null;
            title?: string | null;
            incoming_date?: string | null;
            metadata?: string | null;
            file_path?: string | null;
            portal_date?: string | null;
        };
        const dated = db!
            .prepare(
                `SELECT ${selectList}
                 FROM documents d
                 JOIN matters m ON m.id = d.matter_id
                 WHERE d.source_system = 'UYAP'
                   AND ${sqlIncomingIsDateOnly('d')}
                   AND ${sqlIsoYearIsPlausible('d.incoming_date')}
                 ORDER BY d.incoming_date DESC, d.title
                 LIMIT ?`,
            )
            .all(fetchN) as RecentRow[];
        const leftovers = db!
            .prepare(
                `SELECT ${selectList}
                 FROM documents d
                 JOIN matters m ON m.id = d.matter_id
                 WHERE d.source_system = 'UYAP'
                   AND NOT (${sqlIncomingIsDateOnly('d')})
                   AND trim(COALESCE(d.incoming_date, '')) != ''
                 ORDER BY d.incoming_date DESC, d.title
                 LIMIT ?`,
            )
            .all(leftoverN) as RecentRow[];
        const merged = uniqueUyapEvrakRows(
            [...dated, ...leftovers].map((row) =>
                withPublicEvrakPath(row as { file_path: string | null; metadata: string | null; id: string }),
            ),
        ) as RecentRow[];
        const matterIds = [
            ...new Set(
                merged
                    .map((row) => String(row.matter_id || '').trim())
                    .filter(Boolean),
            ),
        ];
        const siblingMax = new Map<string, string>();
        if (matterIds.length > 0) {
            const placeholders = matterIds.map(() => '?').join(',');
            const siblingRows = db!
                .prepare(
                    `SELECT d.matter_id AS matter_id, MAX(${sqlUyapPlausibleIncoming('d')}) AS max_portal
                     FROM documents d
                     WHERE d.source_system = 'UYAP'
                       AND d.matter_id IN (${placeholders})
                     GROUP BY d.matter_id`,
                )
                .all(...matterIds) as Array<{ matter_id: string; max_portal: string | null }>;
            for (const row of siblingRows) {
                if (row.max_portal) siblingMax.set(row.matter_id, String(row.max_portal).slice(0, 10));
            }
        }
        const sanitized = merged.map((row) => {
            const uyap = parseUyapMeta(row.metadata);
            const matterId = String(row.matter_id || '').trim();
            return {
                ...row,
                portal_date: sanitizeUyapPortalDate(
                    {
                        tarih: uyap.tarih,
                        sistemeGonderildigiTarih: uyap.sistemeGonderildigiTarih,
                        onaylandigiTarih: uyap.onaylandigiTarih,
                        incomingDate: row.incoming_date,
                    },
                    siblingMax.get(matterId) ?? null,
                ),
            };
        });
        const payload = applyMatterHintFields(
            db!,
            sortBySanitizedPortalDate(
                sanitized,
                (row) => row.portal_date,
                (row) => String(row.title || ''),
            ).slice(0, n),
        );
        uyapRecentEvrakCache = { fingerprint, payload };
        return payload;
    });

    registerIpcHandler('db-clear-uyap-preview', (_, documentId: string) => {
        const id = String(documentId || '').trim();
        if (!id) return { ok: false, deleted: false };
        const row = db!
            .prepare(`SELECT id, file_path, metadata FROM documents WHERE id = ?`)
            .get(id) as { id: string; file_path: string | null; metadata: string | null } | undefined;
        if (!row) return { ok: true, deleted: false };
        let meta: Record<string, unknown> = {};
        let preview = false;
        try {
            meta = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
            const uyap =
                meta.uyap && typeof meta.uyap === 'object' ? (meta.uyap as Record<string, unknown>) : {};
            preview = uyap.previewCache === true;
        } catch {
            preview = false;
        }
        if (!preview) return { ok: true, deleted: false };
        const filePath = String(row.file_path || '').trim();
        if (filePath && !isPreviewTempPath(filePath) && !isAppOwnedEvrakPath(filePath)) {
            return { ok: true, deleted: false };
        }
        if (filePath) {
            try {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (err) {
                console.warn('UYAP preview unlink failed:', err);
            }
        }
        const uyap =
            meta.uyap && typeof meta.uyap === 'object' ? { ...(meta.uyap as Record<string, unknown>) } : {};
        delete uyap.previewCache;
        meta.uyap = uyap;
        db!.prepare(
            `UPDATE documents
             SET file_path = NULL, file_hash = NULL, metadata = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
        ).run(JSON.stringify(meta), id);
        return { ok: true, deleted: true };
    });

    registerIpcHandler('db-list-notifications', (_, opts?: { unreadOnly?: boolean; limit?: number }) => {
        const limit = Math.min(100, Math.max(1, Number(opts?.limit) || 40));
        const rows = opts?.unreadOnly
            ? (db!
                  .prepare(
                      `SELECT id, kind, title, body, matter_id, read_at, payload_json, created_at
                       FROM notifications
                       WHERE read_at IS NULL
                       ORDER BY created_at DESC
                       LIMIT ?`,
                  )
                  .all(limit) as NotificationListRow[])
            : (db!
                  .prepare(
                      `SELECT id, kind, title, body, matter_id, read_at, payload_json, created_at
                       FROM notifications
                       ORDER BY created_at DESC
                       LIMIT ?`,
                  )
                  .all(limit) as NotificationListRow[]);
        return decorateNotificationList(db!, rows);
    });

    registerIpcHandler('db-mark-notification-read', (_, id: string) => {
        db!.prepare(`UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND read_at IS NULL`).run(id);
        return { ok: true };
    });

    registerIpcHandler('db-mark-notifications-read-all', () => {
        const result = db!.prepare(`UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE read_at IS NULL`).run();
        return { ok: true, changes: result.changes };
    });

    registerIpcHandler('db-add-folder', (_, folder) => {
        const stmt = db!.prepare(`
            INSERT INTO folders (id, matter_id, name, parent_id)
            VALUES (@id, @matter_id, @name, @parent_id)
        `);
        const data = { parent_id: null, ...folder };
        return stmt.run(data);
    });

    registerIpcHandler('db-delete-folder', (_, id: string) => {
        return db!.prepare('DELETE FROM folders WHERE id = ?').run(id);
    });

    // --- KNOWLEDGE BASE ---

    registerIpcHandler(
        'db-get-knowledge-base',
        (
            _,
            filters?: {
                type?: string;
                linked_party_id?: string;
                linked_matter_id?: string;
                query?: string;
            }
        ) => {
            const knowledgeIds = knowledgeIdsForContextFilter(db!, filters);
            const q = String(filters?.query ?? '').trim();

            if (q) {
                let rows = searchKnowledgeForGlobalQuery(db!, q, 80);
                if (knowledgeIds !== null) {
                    if (knowledgeIds.length === 0) return [];
                    const allow = new Set(knowledgeIds);
                    rows = rows.filter((row) => allow.has(String(row.id ?? '')));
                }
                if (filters?.type) {
                    rows = rows.filter((row) => String(row.type ?? '') === filters.type);
                }
                return rows;
            }

            let query = KNOWLEDGE_LIST_SELECT;
            const params: unknown[] = [];
            const cond: string[] = [];

            if (filters?.type) {
                cond.push('kb.type = ?');
                params.push(filters.type);
            }

            if (knowledgeIds !== null) {
                if (knowledgeIds.length === 0) return [];
                const placeholders = knowledgeIds.map(() => '?').join(', ');
                cond.push(`kb.id IN (${placeholders})`);
                params.push(...knowledgeIds);
            }

            if (cond.length) query += ' WHERE ' + cond.join(' AND ');
            query += ' GROUP BY kb.id ORDER BY kb.created_at DESC';
            return db!.prepare(query).all(...params);
        }
    );

    registerIpcHandler('db-get-knowledge-item', (_, id: string) => {
        const rid = String(id || '').trim();
        if (!rid) return null;
        return (
            db!
                .prepare(
                    `
            ${KNOWLEDGE_SEARCH_SELECT}
            WHERE kb.id = ?
            GROUP BY kb.id
        `,
                )
                .get(rid) ?? null
        );
    });

    registerIpcHandler('db-add-knowledge-base', (_, item) => {
        const stmt = db!.prepare(`
            INSERT INTO knowledge_base (
                id, type, title, author, content, source_url, metadata, tags
            ) VALUES (
                @id, @type, @title, @author, @content, @source_url, @metadata, @tags
            )
        `);
        const data = {
            author: null, content: null, source_url: null, metadata: null, tags: null,
            ...item,
            type: coerceWritableKnowledgeType(item?.type),
        };
        return stmt.run(data);
    });

    registerIpcHandler('db-update-knowledge-base', (_, item: Record<string, unknown>) => {
        const id = String(item?.id ?? '').trim();
        if (!id) return { changes: 0 };
        const stmt = db!.prepare(`
            UPDATE knowledge_base SET
                type = COALESCE(@type, type),
                title = COALESCE(@title, title),
                author = COALESCE(@author, author),
                content = COALESCE(@content, content),
                source_url = COALESCE(@source_url, source_url),
                metadata = COALESCE(@metadata, metadata),
                tags = COALESCE(@tags, tags),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = @id
        `);
        return stmt.run({
            id,
            type: item.type == null ? null : coerceWritableKnowledgeType(item.type),
            title: item.title ?? null,
            author: item.author ?? null,
            content: item.content ?? null,
            source_url: item.source_url ?? null,
            metadata: item.metadata ?? null,
            tags: item.tags ?? null,
        });
    });

    registerIpcHandler(
        'db-get-merci-name-suggestions',
        (
            _,
            payload?: { merci?: string; query?: string; limit?: number },
        ): string[] => {
            const q = String(payload?.query ?? '').trim();
            const limit = Math.min(Math.max(Number(payload?.limit) || 15, 1), 50);
            let sql = `
                SELECT DISTINCT court_name AS name
                FROM matters
                WHERE court_name IS NOT NULL AND TRIM(court_name) != ''
            `;
            const params: unknown[] = [];
            const merci = String(payload?.merci ?? '').trim();
            if (merci) {
                sql += ` AND matter_category = ?`;
                params.push(merci);
            }
            if (q) {
                sql += ` AND court_name LIKE ? COLLATE NOCASE`;
                params.push(`%${q}%`);
            }
            sql += ` ORDER BY court_name COLLATE NOCASE ASC LIMIT ?`;
            params.push(limit);
            const rows = db!.prepare(sql).all(...params) as { name: string }[];
            return rows.map((r) => r.name).filter(Boolean);
        },
    );

    registerIpcHandler('db-delete-knowledge-base', (_, id: string) => {
        const tx = db!.transaction(() => {
            db!.prepare(`DELETE FROM knowledge_base WHERE id = ?`).run(id);
            db!.prepare(`DELETE FROM entity_attributes WHERE entity_type = 'KNOWLEDGE' AND entity_id = ?`).run(id);
            db!.prepare(`DELETE FROM entity_tags WHERE entity_type = 'KNOWLEDGE' AND entity_id = ?`).run(id);
            db!
                .prepare(
                    `DELETE FROM links
                     WHERE (source_id = ? AND source_type = 'KNOWLEDGE')
                        OR (target_id = ? AND target_type = 'KNOWLEDGE')`
                )
                .run(id, id);
        });
        tx();
        return { ok: true };
    });

    // --- DEADLINES ---

    registerIpcHandler(
        'db-get-deadlines',
        (
            _,
            filters?: {
                matterId?: string;
                partyId?: string;
                upcoming?: boolean;
                from?: string;
                to?: string;
            },
        ) => {
            let query = 'SELECT * FROM deadlines WHERE 1=1';
            const params: unknown[] = [];

            if (filters?.matterId) {
                query += ' AND matter_id = ?';
                params.push(filters.matterId);
            }
            if (filters?.partyId) {
                query += ' AND party_id = ?';
                params.push(filters.partyId);
            }
            if (filters?.upcoming) {
                query += ' AND event_date >= datetime("now") AND is_completed = 0';
            }
            if (filters?.from) {
                query += ' AND event_date >= ?';
                params.push(filters.from);
            }
            if (filters?.to) {
                query += ' AND event_date <= ?';
                params.push(filters.to);
            }

            query += ' ORDER BY event_date ASC';
            return db!.prepare(query).all(...params);
        },
    );

    registerIpcHandler('db-add-deadline', (_, deadline) => {
        const run = db!.transaction(() => {
            const id = deadline.id && String(deadline.id).trim() ? String(deadline.id).trim() : randomUUID();
            const eventType = String(deadline.event_type || 'DIGER');
            const isCompleted = deadline.is_completed ? 1 : 0;
            const matterId = deadline.matter_id || null;
            const partyId = deadline.party_id || null;
            const description = deadline.description ?? null;
            const eventDate = deadline.event_date;
            let taskId: string | null = deadline.task_id || null;

            if (eventType === 'GOREV' && !taskId) {
                const task = insertTaskRow(db!, {
                    title: String(description || '').trim() || 'Görev',
                    status: isCompleted ? 'done' : 'open',
                    due_date: eventDate,
                    matter_id: matterId,
                    party_id: partyId,
                });
                taskId = task.id;
                // insertTaskRow already mirrored; attach our preferred deadline id if needed
                const mirror = db!
                    .prepare(`SELECT id FROM deadlines WHERE task_id = ?`)
                    .get(taskId) as { id: string } | undefined;
                if (mirror?.id && mirror.id !== id) {
                    db!.prepare(`UPDATE deadlines SET id = ? WHERE id = ?`).run(id, mirror.id);
                }
                if (!mirror) {
                    db!
                        .prepare(
                            `INSERT INTO deadlines (
                                id, matter_id, party_id, task_id, event_type, event_date,
                                description, is_completed, reminder_date, calendar_metadata
                            ) VALUES (?, ?, ?, ?, 'GOREV', ?, ?, ?, ?, ?)`,
                        )
                        .run(
                            id,
                            matterId,
                            partyId,
                            taskId,
                            eventDate,
                            description,
                            isCompleted,
                            deadline.reminder_date ?? null,
                            deadline.calendar_metadata ?? null,
                        );
                } else {
                    db!
                        .prepare(
                            `UPDATE deadlines SET
                                reminder_date = ?, calendar_metadata = ?,
                                description = ?, matter_id = ?, party_id = ?,
                                is_completed = ?, event_date = ?
                             WHERE id = ?`,
                        )
                        .run(
                            deadline.reminder_date ?? null,
                            deadline.calendar_metadata ?? null,
                            description,
                            matterId,
                            partyId,
                            isCompleted,
                            eventDate,
                            id,
                        );
                }
                return { changes: 1, lastInsertRowid: 0 };
            }

            return db!
                .prepare(
                    `INSERT INTO deadlines (
                        id, matter_id, party_id, task_id, event_type, event_date, description,
                        is_completed, reminder_date, calendar_metadata
                    ) VALUES (
                        @id, @matter_id, @party_id, @task_id, @event_type, @event_date, @description,
                        @is_completed, @reminder_date, @calendar_metadata
                    )`,
                )
                .run({
                    id,
                    matter_id: matterId,
                    party_id: partyId,
                    task_id: taskId,
                    event_type: eventType,
                    event_date: eventDate,
                    description,
                    is_completed: isCompleted,
                    reminder_date: deadline.reminder_date ?? null,
                    calendar_metadata: deadline.calendar_metadata ?? null,
                });
        });
        return run();
    });

    registerIpcHandler('db-update-deadline', (_, deadline) => {
        const run = db!.transaction(() => {
            const id = String(deadline.id);
            const existing = db!.prepare(`SELECT * FROM deadlines WHERE id = ?`).get(id) as
                | {
                      id: string;
                      matter_id: string | null;
                      party_id: string | null;
                      task_id: string | null;
                      event_type: string | null;
                      event_date: string;
                      description: string | null;
                      is_completed: number;
                      reminder_date: string | null;
                      calendar_metadata: string | null;
                  }
                | undefined;
            if (!existing) return { changes: 0 };

            const eventType = String(deadline.event_type || existing.event_type || 'DIGER');
            const isCompleted =
                deadline.is_completed === undefined
                    ? existing.is_completed
                    : deadline.is_completed
                      ? 1
                      : 0;
            const matterId = deadline.matter_id !== undefined ? deadline.matter_id || null : existing.matter_id;
            const partyId = deadline.party_id !== undefined ? deadline.party_id || null : existing.party_id;
            const description =
                deadline.description !== undefined ? deadline.description ?? null : existing.description;
            const eventDate = deadline.event_date ?? existing.event_date;
            const reminderDate =
                deadline.reminder_date !== undefined
                    ? deadline.reminder_date ?? null
                    : existing.reminder_date;
            const calendarMetadata =
                deadline.calendar_metadata !== undefined
                    ? deadline.calendar_metadata ?? null
                    : existing.calendar_metadata;

            let taskId = existing.task_id;

            // Detach: was linked GOREV, now another type — unlink before clearing due
            // so sync does not DELETE this deadline row.
            if (taskId && eventType !== 'GOREV') {
                db!.prepare(`UPDATE deadlines SET task_id = NULL WHERE id = ?`).run(id);
                db!
                    .prepare(
                        `UPDATE tasks SET due_date = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    )
                    .run(taskId);
                taskId = null;
            }

            // Attach: became GOREV without task
            if (eventType === 'GOREV' && !taskId) {
                const task = insertTaskRow(db!, {
                    title: String(description || '').trim() || 'Görev',
                    status: isCompleted ? 'done' : 'open',
                    due_date: eventDate,
                    matter_id: matterId,
                    party_id: partyId,
                });
                taskId = task.id;
                const mirror = db!
                    .prepare(`SELECT id FROM deadlines WHERE task_id = ?`)
                    .get(taskId) as { id: string } | undefined;
                if (mirror?.id && mirror.id !== id) {
                    db!.prepare(`DELETE FROM deadlines WHERE id = ?`).run(mirror.id);
                }
            } else if (eventType === 'GOREV' && taskId) {
                // Update task fields without letting mirror recreate a second row:
                // temporarily point mirror at this id if needed, then update task.
                updateTaskRow(db!, {
                    id: taskId,
                    title: String(description || '').trim() || 'Görev',
                    status: isCompleted ? 'done' : 'open',
                    due_date: eventDate,
                    matter_id: matterId,
                    party_id: partyId,
                });
                const mirror = db!
                    .prepare(`SELECT id FROM deadlines WHERE task_id = ?`)
                    .get(taskId) as { id: string } | undefined;
                if (mirror?.id && mirror.id !== id) {
                    db!.prepare(`DELETE FROM deadlines WHERE id = ?`).run(mirror.id);
                }
            }

            return db!
                .prepare(
                    `UPDATE deadlines SET
                        matter_id = @matter_id,
                        party_id = @party_id,
                        task_id = @task_id,
                        event_type = @event_type,
                        event_date = @event_date,
                        description = @description,
                        is_completed = @is_completed,
                        reminder_date = @reminder_date,
                        calendar_metadata = @calendar_metadata
                     WHERE id = @id`,
                )
                .run({
                    id,
                    matter_id: matterId,
                    party_id: partyId,
                    task_id: taskId,
                    event_type: eventType,
                    event_date: eventDate,
                    description,
                    is_completed: isCompleted,
                    reminder_date: reminderDate,
                    calendar_metadata: calendarMetadata,
                });
        });
        return run();
    });

    registerIpcHandler('db-delete-deadline', (_, id: string) => {
        const run = db!.transaction(() => {
            const existing = db!.prepare(`SELECT task_id FROM deadlines WHERE id = ?`).get(id) as
                | { task_id: string | null }
                | undefined;
            if (!existing) return { changes: 0 };

            if (existing.task_id) {
                // Clear due date on task; CASCADE would delete task if we deleted via task —
                // here we only remove the calendar mirror and keep the task undated.
                db!.prepare(`DELETE FROM deadlines WHERE id = ?`).run(id);
                db!
                    .prepare(
                        `UPDATE tasks SET due_date = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    )
                    .run(existing.task_id);
                return { changes: 1 };
            }

            return db!.prepare('DELETE FROM deadlines WHERE id = ?').run(id);
        });
        return run();
    });

    // --- TASKS (Yapılacaklar) ---

    registerIpcHandler(
        'db-get-tasks',
        (
            _,
            filters?: {
                status?: 'open' | 'done' | 'all';
                matterId?: string;
                partyId?: string;
                hasDueDate?: boolean;
                from?: string;
                to?: string;
                includeDone?: boolean;
                sourceNoteId?: string;
            },
        ) => {
            let query = 'SELECT * FROM tasks WHERE 1=1';
            const params: unknown[] = [];

            const status = filters?.status;
            if (status === 'open' || status === 'done') {
                query += ' AND status = ?';
                params.push(status);
            } else if (filters?.includeDone === false) {
                query += ` AND status = 'open'`;
            }

            if (filters?.matterId) {
                query += ' AND matter_id = ?';
                params.push(filters.matterId);
            }
            if (filters?.partyId) {
                query += ' AND party_id = ?';
                params.push(filters.partyId);
            }
            if (filters?.hasDueDate === true) {
                query += ' AND due_date IS NOT NULL';
            } else if (filters?.hasDueDate === false) {
                query += ' AND due_date IS NULL';
            }
            if (filters?.from) {
                query += ' AND due_date >= ?';
                params.push(filters.from);
            }
            if (filters?.to) {
                query += ' AND due_date <= ?';
                params.push(filters.to);
            }
            if (filters?.sourceNoteId) {
                query += ' AND source_note_id = ?';
                params.push(filters.sourceNoteId);
            }

            query += ` ORDER BY
                CASE status WHEN 'open' THEN 0 ELSE 1 END,
                CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
                due_date ASC,
                updated_at DESC`;
            return db!.prepare(query).all(...params);
        },
    );

    registerIpcHandler('db-add-task', (_, task) => {
        const run = db!.transaction(() => insertTaskRow(db!, task));
        return run();
    });

    registerIpcHandler('db-update-task', (_, task) => {
        const run = db!.transaction(() => {
            if (!task?.id) return null;
            return updateTaskRow(db!, task);
        });
        return run();
    });

    registerIpcHandler('db-delete-task', (_, id: string) => {
        return db!.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    });

    // --- EDITOR TYPOGRAPHY (defaults + named presets) ---

    registerIpcHandler('db-get-editor-typography-defaults', () => {
        const row = db!
            .prepare(
                `SELECT payload, apply_on_open FROM editor_typography_defaults WHERE id = 1`
            )
            .get() as { payload: string; apply_on_open: number } | undefined;
        if (!row) return { payload: {}, applyOnOpen: false };
        try {
            return {
                payload: JSON.parse(row.payload || '{}'),
                applyOnOpen: Boolean(row.apply_on_open),
            };
        } catch {
            return { payload: {}, applyOnOpen: false };
        }
    });

    registerIpcHandler(
        'db-set-editor-typography-defaults',
        (_, data: { payload: Record<string, unknown>; applyOnOpen?: boolean }) => {
            const payloadJson = JSON.stringify(data.payload ?? {});
            const applyOn = data.applyOnOpen ? 1 : 0;
            db!.prepare(
                `UPDATE editor_typography_defaults SET payload = ?, apply_on_open = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`
            ).run(payloadJson, applyOn);
        }
    );

    registerIpcHandler('db-list-editor-typography-presets', () => {
        return db!
            .prepare(
                `SELECT id, name, payload, sort_order, created_at FROM editor_typography_presets ORDER BY sort_order ASC, name ASC`
            )
            .all();
    });

    registerIpcHandler('db-add-editor-typography-preset', (_, row: { name: string; payload: Record<string, unknown> }) => {
        const id = randomUUID();
        const payloadJson = JSON.stringify(row.payload ?? {});
        const maxSort =
            (db!.prepare(`SELECT COALESCE(MAX(sort_order), 0) as m FROM editor_typography_presets`).get() as {
                m: number;
            }).m + 1;
        db!.prepare(
            `INSERT INTO editor_typography_presets (id, name, payload, sort_order) VALUES (?, ?, ?, ?)`
        ).run(id, row.name.trim(), payloadJson, maxSort);
        return { id };
    });

    registerIpcHandler(
        'db-update-editor-typography-preset',
        (_, row: { id: string; name?: string; payload?: Record<string, unknown>; sort_order?: number }) => {
            const existing = db!.prepare(`SELECT * FROM editor_typography_presets WHERE id = ?`).get(row.id) as
                | { id: string; name: string; payload: string; sort_order: number }
                | undefined;
            if (!existing) return { ok: false };
            const name = row.name != null ? row.name.trim() : existing.name;
            const payloadJson =
                row.payload !== undefined ? JSON.stringify(row.payload) : existing.payload;
            const sortOrder = row.sort_order !== undefined ? row.sort_order : existing.sort_order;
            db!.prepare(
                `UPDATE editor_typography_presets SET name = ?, payload = ?, sort_order = ? WHERE id = ?`
            ).run(name, payloadJson, sortOrder, row.id);
            return { ok: true };
        }
    );

    registerIpcHandler('db-delete-editor-typography-preset', (_, id: string) => {
        db!.prepare(`DELETE FROM editor_typography_presets WHERE id = ?`).run(id);
    });

    registerIpcHandler('db-get-editor-block-style-defaults', () => {
        const row = db!
            .prepare(`SELECT payload FROM editor_block_style_defaults WHERE id = 1`)
            .get() as { payload: string } | undefined;
        if (!row?.payload) return {};
        try {
            return JSON.parse(row.payload) as Record<string, unknown>;
        } catch {
            return {};
        }
    });

    registerIpcHandler('db-set-editor-block-style-defaults', (_, payload: Record<string, unknown>) => {
        const json = JSON.stringify(payload ?? {});
        db!.prepare(
            `UPDATE editor_block_style_defaults SET payload = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`
        ).run(json);
    });

    registerIpcHandler('db-get-header-footer-library', () => {
        const row = db!
            .prepare(`SELECT presets_json, assets_json FROM header_footer_library WHERE id = 1`)
            .get() as { presets_json: string; assets_json: string } | undefined;
        let presets: unknown[] = [];
        let assets: Record<string, unknown> = {};
        try {
            const parsed = JSON.parse(row?.presets_json || '[]') as unknown;
            if (Array.isArray(parsed)) presets = parsed;
        } catch {
            presets = [];
        }
        try {
            const parsed = JSON.parse(row?.assets_json || '{}') as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                assets = parsed as Record<string, unknown>;
            }
        } catch {
            assets = {};
        }
        return { presets, assets };
    });

    registerIpcHandler(
        'db-set-header-footer-library',
        (
            _,
            data: {
                presets?: unknown[];
                assets?: unknown;
                allowEmpty?: boolean;
            },
        ) => {
            if (!Array.isArray(data?.presets)) return { ok: false as const };
            const existing = db!
                .prepare(`SELECT presets_json FROM header_footer_library WHERE id = 1`)
                .get() as { presets_json: string } | undefined;
            let existingCount = 0;
            try {
                const parsed = JSON.parse(existing?.presets_json || '[]') as unknown;
                if (Array.isArray(parsed)) existingCount = parsed.length;
            } catch {
                existingCount = 0;
            }
            if (data.presets.length === 0 && existingCount > 0 && !data.allowEmpty) {
                return { ok: true as const, skippedEmpty: true as const };
            }
            const assets =
                data.assets && typeof data.assets === 'object' && !Array.isArray(data.assets)
                    ? data.assets
                    : {};
            db!.prepare(
                `UPDATE header_footer_library SET presets_json = ?, assets_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
            ).run(JSON.stringify(data.presets), JSON.stringify(assets));
            return { ok: true as const, skippedEmpty: false as const };
        },
    );

    const isDocumentHfPayloadEmpty = (raw: unknown): boolean => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return true;
        const rec = raw as {
            differentFirstPage?: unknown;
            differentLastPage?: unknown;
            differentOddEvenPages?: unknown;
            sections?: unknown;
        };
        if (rec.differentFirstPage || rec.differentLastPage || rec.differentOddEvenPages) {
            return false;
        }
        const sections = rec.sections;
        if (!sections || typeof sections !== 'object' || Array.isArray(sections)) return true;
        for (const section of Object.values(sections as Record<string, unknown>)) {
            if (!section || typeof section !== 'object' || Array.isArray(section)) continue;
            for (const value of Object.values(section as Record<string, unknown>)) {
                if (typeof value === 'string' && value.trim().length > 0) return false;
            }
        }
        return true;
    };

    registerIpcHandler('db-get-document-hf', (_, documentIdRaw: string) => {
        const documentId = String(documentIdRaw || '').trim();
        if (!documentId) return null;
        const row = db!
            .prepare(`SELECT payload_json FROM document_header_footer WHERE document_id = ?`)
            .get(documentId) as { payload_json: string | null } | undefined;
        if (!row) return null;
        try {
            const parsed = JSON.parse(row.payload_json || 'null') as unknown;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
            return parsed;
        } catch {
            return null;
        }
    });

    registerIpcHandler(
        'db-set-document-hf',
        (
            _,
            data: {
                documentId?: string;
                payload?: unknown;
                allowEmpty?: boolean;
            },
        ) => {
            const documentId = String(data?.documentId || '').trim();
            if (!documentId) return { ok: false as const };
            if (!data?.payload || typeof data.payload !== 'object' || Array.isArray(data.payload)) {
                return { ok: false as const };
            }
            const existing = db!
                .prepare(`SELECT payload_json FROM document_header_footer WHERE document_id = ?`)
                .get(documentId) as { payload_json: string | null } | undefined;
            let existingPayload: unknown = null;
            if (existing?.payload_json) {
                try {
                    existingPayload = JSON.parse(existing.payload_json) as unknown;
                } catch {
                    existingPayload = null;
                }
            }
            const incomingEmpty = isDocumentHfPayloadEmpty(data.payload);
            const existingEmpty = isDocumentHfPayloadEmpty(existingPayload);
            if (incomingEmpty && !existingEmpty && !data.allowEmpty) {
                return { ok: true as const, skippedEmpty: true as const };
            }
            db!
                .prepare(
                    `INSERT INTO document_header_footer (document_id, payload_json, updated_at)
                     VALUES (?, ?, ?)
                     ON CONFLICT(document_id) DO UPDATE SET
                        payload_json = excluded.payload_json,
                        updated_at = excluded.updated_at`,
                )
                .run(documentId, JSON.stringify(data.payload), Date.now());
            return { ok: true as const, skippedEmpty: false as const };
        },
    );

    // --- GLOBAL SEARCH ---

    type SearchAllScope = 'all' | 'matters' | 'parties' | 'notes' | 'knowledge';

    const normalizeSearchAllScope = (value: unknown): SearchAllScope => {
        if (value === 'matters' || value === 'parties' || value === 'notes' || value === 'knowledge') {
            return value;
        }
        return 'all';
    };

    registerIpcHandler(
        'db-search-all',
        async (_, query: string, limit: number = 20, scopeRaw?: SearchAllScope) => {
            await new Promise<void>((resolve) => setImmediate(resolve));
            const q = String(query || '').trim();
            const safeLimit = Math.max(1, Math.min(40, limit));
            const scope = normalizeSearchAllScope(scopeRaw);
            const empty: {
                notes: unknown[];
                parties: unknown[];
                matters: unknown[];
                knowledge: unknown[];
            } = { notes: [], parties: [], matters: [], knowledge: [] };
            if (!q) return empty;

            const notes = scope === 'all' || scope === 'notes' ? searchNotesHybrid(db!, q, safeLimit) : [];
            const parties =
                scope === 'all' || scope === 'parties' || scope === 'matters'
                    ? searchPartiesForGlobalQuery(db!, q, safeLimit)
                    : [];
            const matters =
                scope === 'all' || scope === 'matters'
                    ? searchMattersForGlobalQuery(
                          db!,
                          q,
                          safeLimit,
                          parties.map((party) => String(party.id ?? '')).filter(Boolean),
                      )
                    : [];
            // Tümü skips knowledge: TAM_METIN / ictihat corpus stalls the main thread.
            const knowledge =
                scope === 'knowledge' ? searchKnowledgeForGlobalQuery(db!, q, safeLimit) : [];

            return { notes, parties, matters, knowledge };
        },
    );

    registerIpcHandler('db-get-uyap-full-taxonomy', () => {
        const snapshot = readUyapFullTaxonomySnapshot();
        if (!snapshot) {
            return {
                ok: false as const,
                error: 'taxonomy_file_not_found',
                hint: 'Set NOMAI_UYAP_TAXONOMY_PATH or place uyap_tam_taksonomi_verisi.json under Downloads.',
            };
        }
        return { ok: true as const, ...snapshot };
    });
}
