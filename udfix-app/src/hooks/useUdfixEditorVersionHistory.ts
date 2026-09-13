import { useCallback, useEffect, useRef, useState } from 'react';
import { DataService, type DocumentVersionRow } from '../services/dataService';

export function useUdfixEditorVersionHistory(options: {
    documentId: string;
    showHistory?: boolean;
    onCloseHistory?: () => void;
    isVersionHistoryOpen: boolean;
    showVersionHistory: boolean;
    setVersionHistoryForDocumentId: (id: string | null) => void;
    setVersionHistoryAnchorRect: (
        r: { top: number; left: number; width: number; height: number } | null,
    ) => void;
    setShowVersionHistory: (show: boolean) => void;
}): {
    versions: DocumentVersionRow[];
    versionsLoading: boolean;
    loadVersions: () => Promise<void>;
    closeVersionHistoryUi: () => void;
} {
    const {
        documentId,
        showHistory,
        onCloseHistory,
        isVersionHistoryOpen,
        showVersionHistory,
        setVersionHistoryForDocumentId,
        setVersionHistoryAnchorRect,
        setShowVersionHistory,
    } = options;

    const [versions, setVersions] = useState<DocumentVersionRow[]>([]);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const versionsReqSeq = useRef(0);

    const loadVersions = useCallback(async () => {
        if (!documentId) return;
        const seq = ++versionsReqSeq.current;
        setVersionsLoading(true);
        try {
            const rows = await DataService.listDocumentVersions(documentId, 80, 0);
            if (seq !== versionsReqSeq.current) return;
            setVersions(Array.isArray(rows) ? rows : []);
        } catch (err) {
            console.warn('Failed to load versions', err);
            if (seq !== versionsReqSeq.current) return;
            setVersions([]);
        } finally {
            if (seq === versionsReqSeq.current) {
                setVersionsLoading(false);
            }
        }
    }, [documentId]);

    const closeVersionHistoryUi = useCallback(() => {
        setShowVersionHistory(false);
        setVersionHistoryForDocumentId(null);
        setVersionHistoryAnchorRect(null);
    }, [setShowVersionHistory, setVersionHistoryAnchorRect, setVersionHistoryForDocumentId]);

    useEffect(() => {
        if (showHistory) {
            setVersionHistoryForDocumentId(documentId);
            setVersionHistoryAnchorRect(null);
            setShowVersionHistory(true);
        }
    }, [
        showHistory,
        documentId,
        setVersionHistoryForDocumentId,
        setVersionHistoryAnchorRect,
        setShowVersionHistory,
    ]);

    useEffect(() => {
        if (isVersionHistoryOpen) {
            void loadVersions();
        } else if (!showVersionHistory) {
            onCloseHistory?.();
        }
    }, [isVersionHistoryOpen, showVersionHistory, loadVersions, onCloseHistory]);

    return {
        versions,
        versionsLoading,
        loadVersions,
        closeVersionHistoryUi,
    };
}
