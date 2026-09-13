import { turkishSearchFold } from './turkishSearch';

/**
 * Build an FTS5 MATCH expression with prefix tokens so partial input (e.g. "muk")
 * matches indexed tokens that start with the query (e.g. "mukavele").
 * Each word also emits an ASCII-folded Turkish variant (I/ı, ş/s, …).
 */
export function buildFtsMatchQuery(raw: string): string {
    const parts = raw
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    const groups = parts
        .map((part) => {
            const token = part.replace(/"/g, '""');
            const folded = turkishSearchFold(part).replace(/"/g, '""');
            const variants = new Set<string>([token]);
            if (folded) variants.add(folded);
            return `(${[...variants].map((v) => `"${v}"*`).join(' OR ')})`;
        })
        .filter(Boolean);

    return groups.length ? groups.join(' AND ') : '';
}
