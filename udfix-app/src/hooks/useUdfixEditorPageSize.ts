import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { EDITOR_PAGE_WIDTH_PX, EDITOR_PAGE_HEIGHT_PX } from '../utils/editorLayout';
import {
    applyPaginationFullBleedDomFix,
    applySectionNextPageBridge,
    getPaginationPageSize,
} from '../utils/paginationMarginSync';

export function useUdfixEditorPageSize(editor: Editor | null): {
    pageWidth: number;
    pageHeight: number;
} {
    const [pageSize, setPageSize] = useState(() => ({
        pageWidth: EDITOR_PAGE_WIDTH_PX,
        pageHeight: EDITOR_PAGE_HEIGHT_PX,
    }));

    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        let timeout = 0;
        const syncPageSize = () => {
            const next = getPaginationPageSize(editor);
            setPageSize((prev) =>
                prev.pageWidth === next.pageWidth && prev.pageHeight === next.pageHeight
                    ? prev
                    : next,
            );
        };
        syncPageSize();
        const onTransaction = () => {
            if (timeout) window.clearTimeout(timeout);
            timeout = window.setTimeout(() => {
                timeout = 0;
                syncPageSize();
                applyPaginationFullBleedDomFix(editor);
                window.requestAnimationFrame(() => {
                    if (!editor.isDestroyed) {
                        applySectionNextPageBridge(editor);
                    }
                });
            }, 80);
        };
        editor.on('transaction', onTransaction);
        return () => {
            if (timeout) window.clearTimeout(timeout);
            editor.off('transaction', onTransaction);
        };
    }, [editor]);

    return pageSize;
}
