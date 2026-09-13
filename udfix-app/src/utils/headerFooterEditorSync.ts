import type { Editor } from '@tiptap/react';
import {
    countPaginationPlusLogicalPages,
    normalizePaginationPlusDimensionsIfPluginDefaults,
    reconcilePaginationPlusLayout,
    syncPaginationPlusExtensionOptions,
    type PaginationPlusPageConfig,
} from './paginationMarginSync';
import {
    EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX,
    EDITOR_PAGINATION_CONTENT_MARGIN_BASE_PX,
    editorClampVerticalPageMargins,
} from './editorLayout';
import type { HeaderFooterSettings } from '../stores/useHeaderFooterStore';
import {
    buildHeaderFooterVariantMaps,
    headerFooterSliceHasVisibleContent,
    type HeaderFooterVariantSlice,
} from './headerFooterVariantMaps';

export type HeaderFooterSyncStoreSlice = HeaderFooterVariantSlice;

export type HeaderFooterSyncPayload = {
    defaultHeader: string;
    defaultFooter: string;
    customHeader: Record<number, { headerLeft: string; headerRight: string }>;
    customFooter: Record<number, { footerLeft: string; footerRight: string }>;
    marginTop: number;
    marginBottom: number;
    contentMarginTop: number;
    contentMarginBottom: number;
    clampedHeaderMarginTop: number | null;
    clampedFooterMarginBottom: number | null;
};

type PaginationPlusHfStorage = PaginationPlusPageConfig & {
    headerLeft?: string;
    headerRight?: string;
    footerLeft?: string;
    footerRight?: string;
    customHeader?: Record<number, { headerLeft: string; headerRight: string }>;
    customFooter?: Record<number, { footerLeft: string; footerRight: string }>;
};

const lastHfPayloadFingerprint = new WeakMap<Editor, string>();

function fingerprintHfPayload(payload: HeaderFooterSyncPayload): string {
    return JSON.stringify({
        h: payload.defaultHeader,
        f: payload.defaultFooter,
        ch: payload.customHeader,
        cf: payload.customFooter,
        mt: payload.marginTop,
        mb: payload.marginBottom,
        cmt: payload.contentMarginTop,
        cmb: payload.contentMarginBottom,
    });
}

function payloadHasVisibleHtml(payload: HeaderFooterSyncPayload): boolean {
    if (payload.defaultHeader || payload.defaultFooter) return true;
    return Object.keys(payload.customHeader).length > 0 || Object.keys(payload.customFooter).length > 0;
}

function buildHfMarginFields(
    editor: Editor,
    s: HeaderFooterSyncStoreSlice,
): Pick<
    HeaderFooterSyncPayload,
    | 'marginTop'
    | 'marginBottom'
    | 'contentMarginTop'
    | 'contentMarginBottom'
    | 'clampedHeaderMarginTop'
    | 'clampedFooterMarginBottom'
> | null {
    const pag = editor.storage?.PaginationPlus as PaginationPlusHfStorage | undefined;
    if (!pag) return null;
    normalizePaginationPlusDimensionsIfPluginDefaults(pag);
    const mt = EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX + (Number(s.settings.headerMarginTop) || 0);
    const mbEff = EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX + (Number(s.settings.footerMarginBottom) || 0);
    const { top: vTop, bottom: vBottom } = editorClampVerticalPageMargins(pag.pageHeight, mt, mbEff);
    const hdrOff = Math.max(0, Math.round(vTop - EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX));
    const ftrOff = Math.max(0, Math.round(vBottom - EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX));
    return {
        marginTop: vTop,
        marginBottom: vBottom,
        contentMarginTop: EDITOR_PAGINATION_CONTENT_MARGIN_BASE_PX,
        contentMarginBottom: EDITOR_PAGINATION_CONTENT_MARGIN_BASE_PX,
        clampedHeaderMarginTop:
            hdrOff !== (Number(s.settings.headerMarginTop) || 0) ? hdrOff : null,
        clampedFooterMarginBottom:
            ftrOff !== (Number(s.settings.footerMarginBottom) || 0) ? ftrOff : null,
    };
}

export function buildHeaderFooterSyncPayload(
    editor: Editor,
    s: HeaderFooterSyncStoreSlice,
): HeaderFooterSyncPayload | null {
    if (!editor.view?.dom) return null;
    const margins = buildHfMarginFields(editor, s);
    if (!margins) return null;

    if (!headerFooterSliceHasVisibleContent(s)) {
        return {
            defaultHeader: '',
            defaultFooter: '',
            customHeader: {},
            customFooter: {},
            ...margins,
        };
    }

    const editorDom = editor.view.dom;
    const docTitle = editorDom.querySelector('h1')?.textContent || 'Untitled Document';
    const paginationEl = editorDom.querySelector('[data-rm-pagination]');
    const totalPages = countPaginationPlusLogicalPages(paginationEl);
    const { defaultHeader, defaultFooter, customHeader, customFooter } = buildHeaderFooterVariantMaps(
        totalPages,
        docTitle,
        s,
    );

    return {
        defaultHeader,
        defaultFooter,
        customHeader,
        customFooter,
        ...margins,
    };
}

const resolvePageVarHeader = (html: string) =>
    html.replace(/\{page\}/g, '<span class="rm-page-number-plus"></span>');
const resolvePageVarFooter = (html: string) =>
    html.replace(/\{page\}/g, '<span class="rm-page-number"></span>');

/**
 * Applies HF payload: margins on PaginationPlus storage, clears custom maps, then uses
 * native PaginationPlus chain commands (no innerHTML).
 */
export function applyHeaderFooterSyncPayload(
    editor: Editor,
    payload: HeaderFooterSyncPayload,
    opts?: { onClampSettings?: (patch: Partial<HeaderFooterSettings>) => void },
): void {
    if (editor.isDestroyed || !editor.view?.dom) return;

    const fp = fingerprintHfPayload(payload);
    if (lastHfPayloadFingerprint.get(editor) === fp) return;

    const onClamp = opts?.onClampSettings;
    if (payload.clampedHeaderMarginTop != null || payload.clampedFooterMarginBottom != null) {
        onClamp?.({
            ...(payload.clampedHeaderMarginTop != null
                ? { headerMarginTop: payload.clampedHeaderMarginTop }
                : {}),
            ...(payload.clampedFooterMarginBottom != null
                ? { footerMarginBottom: payload.clampedFooterMarginBottom }
                : {}),
        });
    }

    const pag = editor.storage?.PaginationPlus as PaginationPlusHfStorage | undefined;
    if (!pag) return;

    normalizePaginationPlusDimensionsIfPluginDefaults(pag);
    pag.marginTop = payload.marginTop;
    pag.marginBottom = payload.marginBottom;
    pag.contentMarginTop = payload.contentMarginTop;
    pag.contentMarginBottom = payload.contentMarginBottom;
    if (pag.contentMarginTop == null || Number.isNaN(Number(pag.contentMarginTop))) {
        pag.contentMarginTop = EDITOR_PAGINATION_CONTENT_MARGIN_BASE_PX;
    }

    pag.customHeader = {};
    pag.customFooter = {};
    syncPaginationPlusExtensionOptions(editor, pag);

    const hasHtml = payloadHasVisibleHtml(payload);
    const defH = resolvePageVarHeader(payload.defaultHeader);
    const defF = resolvePageVarFooter(payload.defaultFooter);
    let chain = editor.chain().updateHeaderContent(defH, '').updateFooterContent(defF, '');

    if (hasHtml) {
        const headerPages = Object.keys(payload.customHeader)
            .map(Number)
            .filter((n) => Number.isFinite(n) && n > 0)
            .sort((a, b) => a - b);
        for (const pg of headerPages) {
            const row = payload.customHeader[pg];
            chain = chain.updateHeaderContent(resolvePageVarHeader(row.headerLeft), row.headerRight ?? '', pg);
        }

        const footerPages = Object.keys(payload.customFooter)
            .map(Number)
            .filter((n) => Number.isFinite(n) && n > 0)
            .sort((a, b) => a - b);
        for (const pg of footerPages) {
            const row = payload.customFooter[pg];
            chain = chain.updateFooterContent(resolvePageVarFooter(row.footerLeft), row.footerRight ?? '', pg);
        }
    }

    chain.run();
    lastHfPayloadFingerprint.set(editor, fp);

    if (!hasHtml) {
        // Empty bands: do not toggle pageGap / rebuild decorations on every flush.
        return;
    }

    reconcilePaginationPlusLayout(editor, undefined, { forceDecorationRebuild: true });
}

export function runHeaderFooterEditorSync(
    editor: Editor,
    s: HeaderFooterSyncStoreSlice,
    opts?: { onClampSettings?: (patch: Partial<HeaderFooterSettings>) => void },
): void {
    const payload = buildHeaderFooterSyncPayload(editor, s);
    if (!payload) return;
    applyHeaderFooterSyncPayload(editor, payload, opts);
}
