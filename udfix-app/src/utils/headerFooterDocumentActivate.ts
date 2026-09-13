import type { Editor } from '@tiptap/react';
import { useLayoutStore } from '../stores/useLayoutStore';
import { useHeaderFooterStore } from '../stores/useHeaderFooterStore';
import { applyUyapImportMetaToHeaderFooterStore } from './uyapImportApply';
import { UYAP_IMPORT_META_STORAGE_PREFIX } from './uyapImportMeta';
import { flushSyncHfToEditor } from './headerFooterSyncScheduler';
import {
    getUdfixEditorForDocument,
    resolveUdfixEditorForDocument,
} from './udfixEditorDocumentRegistry';

function resetHeaderFooterPanelUi(): void {
    const store = useHeaderFooterStore.getState();
    if (
        !store.panelOpen &&
        !store.draftSections &&
        !store.isContextEditing
    ) {
        return;
    }
    useHeaderFooterStore.setState({
        panelOpen: false,
        panelAnchorRect: null,
        isContextEditing: false,
        contextEditSection: null,
        draftSections: null,
        draftSettings: null,
        draftDifferentFirstPage: null,
        draftDifferentLastPage: null,
        draftDifferentOddEvenPages: null,
    });
}

function applyUdfImportMetaToHeaderFooterStoreIfPresent(documentId: string): void {
    if (!documentId.startsWith('udf:')) return;
    const raw = localStorage.getItem(`${UYAP_IMPORT_META_STORAGE_PREFIX}${documentId}`);
    if (!raw) return;
    try {
        applyUyapImportMetaToHeaderFooterStore(JSON.parse(raw));
        useHeaderFooterStore.getState().save();
    } catch {
        /* ignore malformed import meta */
    }
}

/**
 * Bind HF store (and optionally PaginationPlus) to the given document.
 * Saves the previous document, loads persisted HF, and syncs when an editor is available.
 */
export async function activateHeaderFooterForDocument(
    documentId: string,
    options?: { syncToEditor?: boolean },
): Promise<void> {
    if (!documentId) return;

    const store = useHeaderFooterStore.getState();
    const syncToEditor = options?.syncToEditor !== false;

    if (store.currentDocumentId === documentId) {
        if (!syncToEditor) return;
        const editor = resolveUdfixEditorForDocument(documentId);
        if (editor) {
            useLayoutStore.getState().setEditor(editor);
        }
        return;
    }

    resetHeaderFooterPanelUi();
    if (store.currentDocumentId) {
        store.save();
    }

    store.load(documentId);
    applyUdfImportMetaToHeaderFooterStoreIfPresent(documentId);

    if (!syncToEditor) return;

    const editor = getUdfixEditorForDocument(documentId);
    if (editor && !editor.isDestroyed) {
        useLayoutStore.getState().setEditor(editor);
    }
    await flushSyncHfToEditor();
}
