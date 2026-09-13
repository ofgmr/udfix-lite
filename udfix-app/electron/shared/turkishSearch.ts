/**
 * Turkish-aware search utilities (renderer + main process).
 * Use turkishIncludes for in-memory filters; turkishSqlLikeFilter + filterRowsByTurkishQuery for SQLite.
 */

/** Arama için Türkçe harfleri ASCII'ye indirger (ı/i, ş/s, ğ/g …). */
export function turkishSearchFold(input: string): string {
    return String(input ?? '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c');
}

export function turkishIncludes(haystack: string, needle: string): boolean {
    const foldedNeedle = turkishSearchFold(needle).trim();
    if (!foldedNeedle) return true;
    return turkishSearchFold(haystack).includes(foldedNeedle);
}

/** Fold several fields once so list filters do not re-normalize on every keystroke. */
export function turkishHaystack(parts: ReadonlyArray<string | null | undefined>): string {
    return turkishSearchFold(parts.filter((part): part is string => Boolean(part)).join('\n'));
}

export function turkishHaystackIncludes(haystackFolded: string, needle: string): boolean {
    const foldedNeedle = turkishSearchFold(needle).trim();
    if (!foldedNeedle) return true;
    return haystackFolded.includes(foldedNeedle);
}

/**
 * SQLite expression matching `turkishSearchFold` closely enough for LIKE.
 * Use on short columns only — never on `content` / `metadata` blobs.
 */
export function sqlTurkishFoldExpr(columnSql: string): string {
    const src = `COALESCE(CAST(${columnSql} AS TEXT), '')`;
    const replacements: Array<[string, string]> = [
        ['ı', 'i'],
        ['İ', 'i'],
        ['I', 'i'],
        ['Ğ', 'g'],
        ['ğ', 'g'],
        ['Ü', 'u'],
        ['ü', 'u'],
        ['Ş', 's'],
        ['ş', 's'],
        ['Ö', 'o'],
        ['ö', 'o'],
        ['Ç', 'c'],
        ['ç', 'c'],
    ];
    const folded = replacements.reduce(
        (expr, [from, to]) => `replace(${expr}, '${from}', '${to}')`,
        src,
    );
    return `lower(${folded})`;
}

/**
 * A few whole-string spellings — not a per-character cartesian product.
 * (`zamanaşımı` used to explode into 64 LIKE patterns and freeze Electron.)
 */
export function turkishLikePatternVariants(query: string, maxVariants = 8): string[] {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const lower = trimmed.toLocaleLowerCase('tr-TR');
    const folded = turkishSearchFold(trimmed);
    return [...new Set([trimmed, lower, folded].filter(Boolean))].slice(0, maxVariants);
}

export function escapeLikePattern(raw: string): string {
    return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function turkishLikePatterns(query: string): string[] {
    const folded = turkishSearchFold(query).trim();
    return folded ? [`%${escapeLikePattern(folded)}%`] : [];
}

export function buildLikeOrClause(
    fields: readonly string[],
    patterns: readonly string[],
): { clause: string; params: string[] } {
    if (fields.length === 0 || patterns.length === 0) {
        return { clause: '0', params: [] };
    }
    const parts: string[] = [];
    const params: string[] = [];
    for (const field of fields) {
        for (const pattern of patterns) {
            parts.push(`${sqlTurkishFoldExpr(field)} LIKE ? ESCAPE '\\'`);
            params.push(pattern);
        }
    }
    return { clause: parts.join(' OR '), params };
}

/** SQLite WHERE fragment: folded (col LIKE …) — one pattern per field, no cartesian explosion. */
export function turkishSqlLikeFilter(
    fields: readonly string[],
    query: string,
): { clause: string; params: string[] } {
    const q = query.trim();
    if (!q) return { clause: '1', params: [] };
    return buildLikeOrClause(fields, turkishLikePatterns(q));
}

export function buildFoldedLikeOrClause(
    fields: readonly string[],
    query: string,
): { clause: string; params: string[] } {
    return turkishSqlLikeFilter(fields, query);
}

export function filterRowsByTurkishQuery<T extends Record<string, unknown>>(
    rows: T[],
    query: string,
    fields: ReadonlyArray<keyof T>,
    limit: number,
): T[] {
    const q = query.trim();
    if (!q) return rows.slice(0, limit);
    return rows
        .filter((row) =>
            fields.some((field) => {
                const value = row[field];
                return typeof value === 'string' && turkishIncludes(value, q);
            }),
        )
        .slice(0, limit);
}
