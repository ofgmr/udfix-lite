/**
 * How many recovery rows the Belge Kurtarma list asks for.
 * This is a window over editor_documents, document_versions, and document_drafts.
 * Listing does not delete rows. Version retention stays pruneDocumentVersions (300 per document).
 */
export const DOCUMENT_RECOVERY_LIST_MAX = 100;

export function clampDocumentRecoveryListLimit(limit: unknown): number {
    if (limit == null || limit === '') return DOCUMENT_RECOVERY_LIST_MAX;
    const value = typeof limit === 'number' ? limit : Number(limit);
    if (!Number.isFinite(value)) return DOCUMENT_RECOVERY_LIST_MAX;
    return Math.max(1, Math.min(DOCUMENT_RECOVERY_LIST_MAX, Math.trunc(value)));
}
