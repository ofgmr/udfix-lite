import type { Editor } from '@tiptap/react';
import { useHeaderFooterStore, syncHfToEditor } from '../stores/useHeaderFooterStore';
import { flushSyncHfToEditor } from './headerFooterSyncScheduler';
import { applyPaginationMargins } from './paginationMarginSync';
import type { UyapImportMeta } from './uyapImportMeta';

export function applyUyapImportMetaToHeaderFooterStore(meta: UyapImportMeta): void {
    const hf = meta.headerFooter;
    if (!hf) return;
    const store = useHeaderFooterStore.getState();
    store.updateSection('default', 'headerLeft', hf.sections.headerLeft);
    store.updateSection('default', 'headerCenter', hf.sections.headerCenter);
    store.updateSection('default', 'headerRight', hf.sections.headerRight);
    store.updateSection('default', 'footerLeft', hf.sections.footerLeft);
    store.updateSection('default', 'footerCenter', hf.sections.footerCenter);
    store.updateSection('default', 'footerRight', hf.sections.footerRight);
    store.updateSettings({
        ...hf.settings,
        headerLayout: hf.headerLayout,
        footerLayout: hf.footerLayout,
    });
}

export async function applyUyapImportMetaToEditor(editor: Editor, meta: UyapImportMeta): Promise<void> {
    applyUyapImportMetaToHeaderFooterStore(meta);

    // HF sync (header/footer HTML + vertical margins) runs chain.run() and can leave
    // stale --rm-margin-* on the DOM while storage already has UYAP page margins.
    await flushSyncHfToEditor();

    if (meta.pageMargins) {
        applyPaginationMargins(editor, meta.pageMargins);
    } else {
        syncHfToEditor();
    }
}
