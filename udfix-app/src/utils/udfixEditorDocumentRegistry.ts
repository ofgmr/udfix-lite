import type { Editor } from '@tiptap/react';
import { useLayoutStore } from '../stores/useLayoutStore';

const editorsByDocumentId = new Map<string, Editor>();

export function registerUdfixEditorForDocument(documentId: string, editor: Editor): void {
    if (!documentId) return;
    editorsByDocumentId.set(documentId, editor);
}

export function unregisterUdfixEditorForDocument(documentId: string, editor: Editor): void {
    if (editorsByDocumentId.get(documentId) === editor) {
        editorsByDocumentId.delete(documentId);
    }
}

export function getUdfixEditorForDocument(documentId: string): Editor | null {
    const editor = editorsByDocumentId.get(documentId);
    if (!editor || editor.isDestroyed) return null;
    return editor;
}

export function findUdfixEditorByDom(dom: HTMLElement): Editor | null {
    for (const editor of editorsByDocumentId.values()) {
        if (!editor.isDestroyed && editor.view.dom === dom) return editor;
    }
    return null;
}

/** Prefer document-scoped registry over layoutStore.editor (tab switch may not focus the body). */
export function resolveUdfixEditorForDocument(documentId: string): Editor | null {
    const registered = getUdfixEditorForDocument(documentId);
    if (registered?.view?.dom) {
        return registered;
    }
    const layoutEd = useLayoutStore.getState().editor;
    if (layoutEd && !layoutEd.isDestroyed && layoutEd.view?.dom) {
        return layoutEd;
    }
    return null;
}
