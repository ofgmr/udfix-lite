import { useEffect, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';

export function useUdfixEditorSearchAndHistoryShortcuts(options: {
    showSearchPanel: boolean;
    setShowSearchPanel: (open: boolean) => void;
    documentId: string;
    setVersionHistoryForDocumentId: (id: string | null) => void;
    setVersionHistoryAnchorRect: (
        r: { top: number; left: number; width: number; height: number } | null,
    ) => void;
    setShowVersionHistory: (show: boolean) => void;
    editor: Editor | null;
    searchPanelContainerRef: RefObject<HTMLDivElement | null>;
}): void {
    const {
        showSearchPanel,
        setShowSearchPanel,
        documentId,
        setVersionHistoryForDocumentId,
        setVersionHistoryAnchorRect,
        setShowVersionHistory,
        editor,
        searchPanelContainerRef,
    } = options;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                setShowSearchPanel(true);
            } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
                e.preventDefault();
                setVersionHistoryForDocumentId(documentId);
                setVersionHistoryAnchorRect(null);
                setShowVersionHistory(true);
            } else if (e.key === 'Escape' && showSearchPanel) {
                setShowSearchPanel(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        showSearchPanel,
        documentId,
        setShowSearchPanel,
        setVersionHistoryForDocumentId,
        setVersionHistoryAnchorRect,
        setShowVersionHistory,
    ]);

    useEffect(() => {
        if (!showSearchPanel || !editor || editor.isDestroyed) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Enter') return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const target = e.target as Node | null;
            if (!target || !editor.view.dom.contains(target)) return;
            if (searchPanelContainerRef.current?.contains(target)) return;
            e.preventDefault();
            if (e.shiftKey) {
                editor.chain().focus().findPrevious().run();
            } else {
                editor.chain().focus().findNext().run();
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [showSearchPanel, editor, searchPanelContainerRef]);
}
