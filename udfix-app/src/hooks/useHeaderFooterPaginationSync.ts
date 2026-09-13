import { useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import { useHeaderFooterStore } from '../stores/useHeaderFooterStore';
import { runHeaderFooterEditorSyncForActiveDocument } from '../utils/headerFooterActiveDocumentSync';
import {
    flushSyncHfToEditor,
    setHeaderFooterSyncRunner,
} from '../utils/headerFooterSyncScheduler';
import {
    registerUdfixEditorForDocument,
    unregisterUdfixEditorForDocument,
} from '../utils/udfixEditorDocumentRegistry';

/**
 * Registers the document-scoped editor instance and a global HF sync runner keyed by
 * `useHeaderFooterStore.currentDocumentId` (not per-hook closure).
 */
export function useHeaderFooterPaginationSync(udfixEditor: Editor | null, documentId: string): void {
    useEffect(() => {
        if (!udfixEditor || udfixEditor.isDestroyed || !documentId) return;

        registerUdfixEditorForDocument(documentId, udfixEditor);
        setHeaderFooterSyncRunner(runHeaderFooterEditorSyncForActiveDocument);

        if (useHeaderFooterStore.getState().currentDocumentId === documentId) {
            void flushSyncHfToEditor();
        }

        return () => {
            unregisterUdfixEditorForDocument(documentId, udfixEditor);
        };
    }, [udfixEditor, documentId]);
}
