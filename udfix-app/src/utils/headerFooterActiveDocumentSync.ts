import { useHeaderFooterStore } from '../stores/useHeaderFooterStore';
import { runHeaderFooterEditorSync } from './headerFooterEditorSync';
import { resolveUdfixEditorForDocument } from './udfixEditorDocumentRegistry';

/** Sync runner target: HF store's current document → layout or registered editor. */
export function runHeaderFooterEditorSyncForActiveDocument(): void {
    const hf = useHeaderFooterStore.getState();
    const documentId = hf.currentDocumentId;
    if (!documentId) return;

    const editor = resolveUdfixEditorForDocument(documentId);
    if (!editor) return;

    runHeaderFooterEditorSync(
        editor,
        {
            sections: hf.sections,
            settings: hf.settings,
            differentFirstPage: hf.differentFirstPage,
            differentLastPage: hf.differentLastPage,
            differentOddEvenPages: hf.differentOddEvenPages,
        },
        {
            onClampSettings: (patch) => {
                useHeaderFooterStore.getState().updateSettings(patch);
            },
        },
    );
}
