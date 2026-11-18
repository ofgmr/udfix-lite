import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { clampDocumentRecoveryListLimit } from './shared/documentRecoveryLimits';

export { DOCUMENT_RECOVERY_LIST_MAX, clampDocumentRecoveryListLimit } from './shared/documentRecoveryLimits';

export type DocumentRecoveryListItem = {
    document_id: string;
    title: string;
    kind: 'editor' | 'udf';
    file_path: string | null;
    file_exists: boolean | null;
    created_at?: string | null;
    updated_at?: string | null;
    last_opened_at?: string | null;
    latest_version_at?: string | null;
    latest_version_no: number | null;
    version_count: number;
    latest_size_bytes: number | null;
    draft_updated_at?: string | null;
    has_draft: boolean;
    is_orphan: boolean;
    sort_at?: string | null;
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

export function titleForRecoveredDocument(
    documentId: string,
    title?: string | null,
    filePath?: string | null,
): string {
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

const LIST_SQL = `
WITH latest_version_no AS (
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
ORDER BY datetime(sort_at) DESC, ids.document_id ASC
LIMIT ?`;

export function listDocumentRecoveryItems(
    database: Database.Database,
    limit?: unknown,
    fileExists: (filePath: string) => boolean = (filePath) => fs.existsSync(filePath),
): DocumentRecoveryListItem[] {
    const safeLimit = clampDocumentRecoveryListLimit(limit);
    const rows = database.prepare(LIST_SQL).all(safeLimit) as DocumentRecoverySqlRow[];
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
        return {
            document_id: row.document_id,
            title: titleForRecoveredDocument(row.document_id, row.title, filePath),
            kind,
            file_path: filePath,
            file_exists: filePath ? fileExists(filePath) : null,
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
}

export function readDocumentRecoveryContent(
    database: Database.Database,
    documentId: string,
): { document_id: string; content: string; checksum: string; source: 'draft' | 'version'; updated_at: string } | null {
    const id = String(documentId || '').trim();
    if (!id) return null;
    const draft = database
        .prepare(
            `SELECT content, checksum, updated_at
             FROM document_drafts
             WHERE document_id = ?`,
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
    const latest = database
        .prepare(
            `SELECT content, checksum, created_at
             FROM document_versions
             WHERE document_id = ?
             ORDER BY version_no DESC
             LIMIT 1`,
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
}
