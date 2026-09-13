import { isLikelyNoteUuid } from './wikiLinks';

export const DEFAULT_EDITOR_DOCUMENT_ID = 'doc-1';

/** Primary dockview id or extra editor tabs from launcher (`editor-<timestamp>`). */
export function isEditorPanelId(panelId: string): boolean {
    return panelId === 'editor' || panelId.startsWith('editor-');
}

/** UDF dosyası editör sekmesi (`udf-editor:${absolutePath}`). */
export function isUdfEditorPanelId(panelId: string): boolean {
    return panelId.startsWith('udf-editor:');
}

/** Inverse of `getUdfixDocumentIdForPanel` for UDF file editor tabs. */
export function getUdfEditorPanelIdFromDocumentId(documentId: string): string | null {
    if (!documentId.startsWith('udf:')) return null;
    const path = decodeURIComponent(documentId.slice('udf:'.length));
    return path ? `udf-editor:${path}` : null;
}

/** Sekmede UdfixEditor kullanan paneller: ana belge editörü veya UDF editörü. */
export function isUdfixEditorTabPanelId(panelId: string): boolean {
    return isEditorPanelId(panelId) || isUdfEditorPanelId(panelId);
}

/**
 * Dockview panel id → UdfixEditor `documentId` (versiyon geçmişi / taslak anahtarı).
 * Ana editör sabit belgeye, ek editör sekmeleri ise kendi params/id kimliğine bağlı kalır.
 * Bu eşleme sekme başlıklarının global `activeDocument` değişiminden etkilenmesini önler.
 */
export function getUdfixDocumentIdForPanel(
    panelId: string,
    activeDocumentId: string,
    params?: Record<string, unknown>,
): string | null {
    if (isEditorPanelId(panelId)) {
        if (typeof params?.documentId === 'string' && params.documentId) return params.documentId;
        if (panelId === 'editor') return DEFAULT_EDITOR_DOCUMENT_ID;
        const idFromPanel = panelId.slice('editor-'.length);
        return idFromPanel || activeDocumentId || null;
    }
    if (isUdfEditorPanelId(panelId)) {
        const path = panelId.slice('udf-editor:'.length);
        return path ? `udf:${encodeURIComponent(path)}` : null;
    }
    return null;
}

/** Panel id is either the note UUID or `noteview:{uuid}:{suffix}`. */
export function getNoteIdFromPanelId(panelId: string): string | null {
    if (isEditorPanelId(panelId) || panelId === 'viewer') return null;
    if (panelId === 'notes-root' || panelId === 'notes-placeholder') return null;
    if (panelId.startsWith('note:')) {
        const idPart = panelId.slice('note:'.length);
        return isLikelyNoteUuid(idPart) ? idPart : null;
    }
    if (panelId.startsWith('noteview:')) {
        const rest = panelId.slice('noteview:'.length);
        const idx = rest.lastIndexOf(':');
        const idPart = idx === -1 ? rest : rest.slice(0, idx);
        return isLikelyNoteUuid(idPart) ? idPart : null;
    }
    return isLikelyNoteUuid(panelId) ? panelId : null;
}
