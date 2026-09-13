import type Database from 'better-sqlite3';

/** Leftover SQLite ids from `import:mevzuat` (one full kanun per row). */
export const KB_MEVZUAT_ID_PREFIX = 'mevzuat-';
export const KB_MEVZUAT_IMPORT_SOURCE = 'mevzuat-gov-tr-import';

export type WritableKnowledgeType = 'PRECEDENT' | 'BOOK' | 'ARTICLE';

function tableExists(database: Database.Database, tableName: string): boolean {
    const row = database
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .get(tableName) as { name: string } | undefined;
    return Boolean(row?.name);
}

/** Kanun discovery lives in the bundled mevzuat corpus, not Bilgi Bankası. */
export function coerceWritableKnowledgeType(type: unknown): WritableKnowledgeType {
    if (type === 'BOOK' || type === 'ARTICLE' || type === 'PRECEDENT') return type;
    return 'PRECEDENT';
}

function kanunKnowledgeIds(database: Database.Database): string[] {
    const rows = database
        .prepare(
            `
            SELECT id FROM knowledge_base
            WHERE id LIKE ?
               OR json_extract(metadata, '$.source') = ?
        `,
        )
        .all(`${KB_MEVZUAT_ID_PREFIX}%`, KB_MEVZUAT_IMPORT_SOURCE) as Array<{ id: string }>;
    return rows.map((row) => row.id);
}

/**
 * Deletes imported kanun rows from `knowledge_base` and reclassifies leftover
 * `LEGISLATIVE` cards (e.g. ictihatlar `mevzuat:*` künye) as `PRECEDENT`.
 */
export function purgeKnowledgeBaseKanunRows(database: Database.Database): {
    deleted: number;
    reclassified: number;
} {
    if (!tableExists(database, 'knowledge_base')) {
        return { deleted: 0, reclassified: 0 };
    }

    const ids = kanunKnowledgeIds(database);
    const deleteAttrs = tableExists(database, 'entity_attributes')
        ? database.prepare(
              `DELETE FROM entity_attributes WHERE entity_type = 'KNOWLEDGE' AND entity_id = ?`,
          )
        : null;
    const deleteTags = tableExists(database, 'entity_tags')
        ? database.prepare(`DELETE FROM entity_tags WHERE entity_type = 'KNOWLEDGE' AND entity_id = ?`)
        : null;
    const deleteLinks = tableExists(database, 'links')
        ? database.prepare(
              `DELETE FROM links
               WHERE (source_id = ? AND source_type = 'KNOWLEDGE')
                  OR (target_id = ? AND target_type = 'KNOWLEDGE')`,
          )
        : null;
    const deleteRow = database.prepare(`DELETE FROM knowledge_base WHERE id = ?`);

    const tx = database.transaction(() => {
        for (const id of ids) {
            deleteAttrs?.run(id);
            deleteTags?.run(id);
            deleteLinks?.run(id, id);
            deleteRow.run(id);
        }
        const reclassified = database
            .prepare(`UPDATE knowledge_base SET type = 'PRECEDENT' WHERE type = 'LEGISLATIVE'`)
            .run().changes;
        return { deleted: ids.length, reclassified };
    });

    return tx();
}
