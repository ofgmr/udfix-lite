import { useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import { useHeaderFooterStore } from '../stores/useHeaderFooterStore';

/** dblclick on header/footer chrome opens the HF panel (does not change syncHfToEditor). */
export function useHeaderFooterPanelOnDoubleClick(editor: Editor | null): void {
    useEffect(() => {
        if (!editor || editor.isDestroyed) return;

        const handleDblClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const header = target.closest('.rm-page-header, .rm-first-page-header');
            const footer = target.closest('.rm-page-footer');
            if (!header && !footer) return;

            e.preventDefault();
            e.stopPropagation();

            const hf = useHeaderFooterStore.getState();

            const paginationEl = editor.view.dom.querySelector('[data-rm-pagination]');
            const pageBreaks = paginationEl
                ? Array.from(paginationEl.querySelectorAll('.rm-page-break'))
                : [];

            const pageBreakEl = target.closest('.rm-page-break');
            const pageIndex = pageBreakEl ? pageBreaks.indexOf(pageBreakEl as Element) : 0;
            const totalPagesHf = Math.max(1, pageBreaks.length);
            const sectionKey = hf.getSectionKeyForPage(pageIndex, totalPagesHf);

            const el = (header || footer) as HTMLElement;
            const r = el.getBoundingClientRect();
            hf.openPanel({
                top: r.top,
                left: r.left,
                width: r.width,
                bottom: r.bottom,
            });
            hf.setPanelActiveTab(sectionKey);
        };

        editor.view.dom.addEventListener('dblclick', handleDblClick);
        return () => editor.view.dom.removeEventListener('dblclick', handleDblClick);
    }, [editor]);
}
