import { Editor } from '@tiptap/react';
import { toast } from 'sonner';
import { useLayoutStore } from '../stores/useLayoutStore';
import { buildPdfFontFaceCss } from '../fonts/pdfFontFaces';
import { getBundledFontByName } from '../fonts/offlineFontRegistry';
import { trackExportAction } from '../telemetry/trackEvent';
import {
    buildNativeBodyPdfHtml,
    buildPdfBodyCanvasInsetDeclsFromProseMirror,
    buildPdfBodyTypographyDeclsFromProseMirror,
    buildPdfDocumentHtml,
    collectThemeAndPaginationVars,
    getPaginationPlusPdfCss,
} from './pdfExportHtml';
import { buildDocxFromEditor } from './docxNativeExport';
import { resolveCssVarsInHtmlString } from './resolveCssVarsForExport';
import { flushSyncHfToEditor } from './headerFooterSyncScheduler';
import { sanitizeExportBaseName } from './sanitizeExportBaseName';
import {
    readPdfBandBudgetSnapshotFromStyles,
    resolveBandClampMaxHeightPx,
    shouldPreserveLiveBandFlowMetrics,
} from './pdfExportLayoutMath';
import {
    applyFrozenTotalPageTokens,
    countPdfExportPageBreaks,
    freezePaginationCounters,
    resolvePdfExportTotalPages,
} from './pdfExportPaginationCounters';
import {
    extractPinnedPrintChromeFromClone,
    removePrintOnlyPaginationChrome,
} from './pdfExportPaginationChrome';
import { getPaginationMargins, reconcilePaginationPlusLayout } from './paginationMarginSync';
import {
    EDITOR_PAGE_MARGIN_LEFT_PX,
    EDITOR_PAGE_MARGIN_RIGHT_PX,
    EDITOR_PAGE_WIDTH_PX,
    EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX,
    EDITOR_PAGINATION_CONTENT_MARGIN_BASE_PX,
} from './editorLayout';
import { getElectronInvoke } from './electronBridge';
import { warnHfPageVariantsOmittedFromNonPdfExport } from './hfPageVariantExportWarning';
import { buildHfOverlayPayload, type HfOverlaySlice } from './pdfOverlayExport';
import type { ExportPdfWithOverlayPayload } from '../../electron/pdfOverlayShared';
import { useHeaderFooterStore } from '../stores/useHeaderFooterStore';
import { flushAllHfEditors } from './hfEditorFlushRegistry';
import {
    countUyapVerificationNoticeOccurrences,
    readPersistedUyapVerificationMeta,
    stripUyapVerificationFromTipTapJson,
    type UyapVerificationMeta,
} from './uyapVerification';
import {
    appendUyapVerificationToHtml,
    buildUyapVerificationHtmlBlock,
    insertTemporaryUyapVerificationBlock,
    pauseProseMirrorDomObserver,
    pinTemporaryUyapVerificationBlock,
    removeTemporaryUyapVerificationBlock,
} from './uyapVerificationBlock';

const PDF_EXPORT_UNSETTLED_TOAST_ID = 'pdf-export-pagination-unsettled';

export class PdfExportCancelledError extends Error {
    constructor(message = 'PDF dışa aktarma iptal edildi') {
        super(message);
        this.name = 'PdfExportCancelledError';
    }
}

export { sanitizeExportBaseName };

const getInvoke = () => {
    try {
        return getElectronInvoke();
    } catch {
        return null;
    }
};

export type PdfExportIpcPayload = {
    documentHtml: string;
    suggestedBaseName?: string;
    printToPdfOptions?: Record<string, unknown>;
};

export type DocxExportIpcPayload = {
    /** Native OOXML buffer from renderer (`docx` package). */
    docxBuffer: number[];
    suggestedBaseName?: string;
};

function isScrollableEl(el: HTMLElement): boolean {
    const cs = getComputedStyle(el);
    const oy = cs.overflowY;
    const scrollableY = oy === 'auto' || oy === 'scroll' || oy === 'overlay';
    return scrollableY && el.scrollHeight > el.clientHeight + 2;
}

function findScrollableAncestor(start: HTMLElement | null): HTMLElement | null {
    let cur: HTMLElement | null = start;
    while (cur && cur !== document.body) {
        if (isScrollableEl(cur)) return cur;
        cur = cur.parentElement;
    }
    return null;
}

function waitTwoFrames(): Promise<void> {
    return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
}

function waitForImagesReady(root: HTMLElement): Promise<void> {
    const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
    if (imgs.length === 0) return Promise.resolve();
    const pending = imgs.filter((img) => !img.complete || img.naturalWidth === 0);
    if (pending.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
        let left = pending.length;
        const done = () => {
            left -= 1;
            if (left <= 0) resolve();
        };
        pending.forEach((img) => {
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
        });
        window.setTimeout(resolve, 2500);
    });
}

function waitForFontsReady(timeoutMs = 3000): Promise<void> {
    if (typeof document === 'undefined' || !('fonts' in document)) return Promise.resolve();
    const fonts = document.fonts;
    if (!fonts?.ready) return Promise.resolve();
    return Promise.race([
        fonts.ready.then(() => undefined).catch(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
    ]);
}

type PaginationLayoutSnapshot = {
    pageBreakCount: number;
    pageCount: number;
    scrollHeight: number;
    paginationMinHeight: string;
};

function readPaginationLayoutSnapshot(pmRoot: HTMLElement): PaginationLayoutSnapshot {
    const paginationRoot = pmRoot.querySelector<HTMLElement>('[data-rm-pagination]');
    return {
        pageBreakCount: paginationRoot?.querySelectorAll('.rm-page-break').length ?? 0,
        pageCount: paginationRoot?.querySelectorAll('.page').length ?? 0,
        scrollHeight: pmRoot.scrollHeight,
        paginationMinHeight: pmRoot.style.minHeight || '',
    };
}

function snapshotsEqual(a: PaginationLayoutSnapshot, b: PaginationLayoutSnapshot): boolean {
    return (
        a.pageBreakCount === b.pageBreakCount &&
        a.pageCount === b.pageCount &&
        Math.abs(a.scrollHeight - b.scrollHeight) <= 1 &&
        a.paginationMinHeight === b.paginationMinHeight
    );
}

function pinExportVerificationIfNeeded(pmRoot: HTMLElement, block: HTMLElement | null | undefined): void {
    if (block) pinTemporaryUyapVerificationBlock(pmRoot, block);
}

/**
 * Drop QR/notice nodes that ProseMirror adopted from a previous export pin.
 * Prefer JSON rewrite so autosave does not persist the cleanup as an edit.
 */
function stripAdoptedUyapVerificationFromEditor(editor: Editor): void {
    if (editor.isDestroyed) return;
    const json = editor.getJSON();
    const stripped = stripUyapVerificationFromTipTapJson(json);
    if (stripped !== json) {
        editor.commands.setContent(stripped, { emitUpdate: false });
        return;
    }
    const pmRoot = editor.view?.dom as HTMLElement | undefined;
    if (pmRoot) removeTemporaryUyapVerificationBlock(pmRoot);
}

async function waitForPaginationLayoutSettle(
    pmRoot: HTMLElement,
    maxPasses = 6,
    pinLastChild?: HTMLElement | null,
): Promise<boolean> {
    pinExportVerificationIfNeeded(pmRoot, pinLastChild);
    let previous = readPaginationLayoutSnapshot(pmRoot);
    for (let i = 0; i < maxPasses; i += 1) {
        await waitTwoFrames();
        pinExportVerificationIfNeeded(pmRoot, pinLastChild);
        const current = readPaginationLayoutSnapshot(pmRoot);
        if (snapshotsEqual(previous, current)) {
            return true;
        }
        previous = current;
    }
    console.warn('[PDF Export] pagination did not fully settle before snapshot', previous);
    return false;
}

function promptContinuePdfExportDespiteUnsettledLayout(): Promise<boolean> {
    if (typeof window === 'undefined') return Promise.resolve(true);
    return new Promise((resolve) => {
        let done = false;
        const finish = (value: boolean) => {
            if (done) return;
            done = true;
            toast.dismiss(PDF_EXPORT_UNSETTLED_TOAST_ID);
            resolve(value);
        };
        toast.warning('Sayfalama oturmadı', {
            id: PDF_EXPORT_UNSETTLED_TOAST_ID,
            description:
                'PDF için sayfa düzeni henüz sabitlenmedi. Devam ederseniz sayfa sayısı kayabilir.',
            duration: Infinity,
            closeButton: true,
            action: {
                label: 'Devam et',
                onClick: () => finish(true),
            },
            cancel: {
                label: 'İptal',
                onClick: () => finish(false),
            },
            onDismiss: () => finish(false),
        });
    });
}

async function stabilizePdfExportLayout(
    pmRoot: HTMLElement,
    pinLastChild?: HTMLElement | null,
    options?: { promptOnUnsettledLayout?: boolean },
): Promise<void> {
    await flushSyncHfToEditor();
    pinExportVerificationIfNeeded(pmRoot, pinLastChild);
    await waitTwoFrames();
    pinExportVerificationIfNeeded(pmRoot, pinLastChild);
    await warmupPaginationDomForPdf(pmRoot);
    pinExportVerificationIfNeeded(pmRoot, pinLastChild);
    await Promise.all([waitForImagesReady(pmRoot), waitForFontsReady()]);
    pinExportVerificationIfNeeded(pmRoot, pinLastChild);
    const settled = await waitForPaginationLayoutSettle(pmRoot, 6, pinLastChild);
    if (!settled) {
        const shouldPrompt = options?.promptOnUnsettledLayout !== false;
        if (shouldPrompt) {
            const shouldContinue = await promptContinuePdfExportDespiteUnsettledLayout();
            if (!shouldContinue) {
                throw new PdfExportCancelledError();
            }
        }
    }
    const after = readPaginationLayoutSnapshot(pmRoot);
    if (after.pageCount > 0 && after.pageBreakCount > 0 && after.pageBreakCount !== after.pageCount) {
        console.warn('[PDF Export] pagination diagnostics: page-break/page count mismatch', after);
    }
}

/**
 * PaginationPlus only renders custom header/footer heights for pages currently
 * inside the viewport. A scrollable editor that has never been scrolled keeps
 * the default 0 heights for late pages, leading to drift in the cloned PDF
 * snapshot. Bouncing the scroller through a few checkpoints forces the plugin
 * to materialize all per-page measurements before we capture.
 */
async function warmupPaginationDomForPdf(pmRoot: HTMLElement): Promise<void> {
    const scroller = findScrollableAncestor(pmRoot);
    if (!scroller) return;
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    if (maxScroll <= 0) return;

    const originalTop = scroller.scrollTop;
    const checkpoints = [0, Math.round(maxScroll * 0.33), Math.round(maxScroll * 0.66), maxScroll];
    for (const top of checkpoints) {
        scroller.scrollTop = top;
        await waitTwoFrames();
    }
    scroller.scrollTop = originalTop;
    await waitTwoFrames();
}

/**
 * Snapshot the live editor DOM for the PDF body:
 * - drop UI-only break markers,
 * - zero out forced section-break paragraph spacing,
 * - replace plugin counter spans with literal page/total numbers.
 *
 * `{total}` / `{totalPages}` may also appear as raw text (the plugin only
 * substitutes `{page}`); replace those literals on the serialized HTML.
 */
function sanitizePaginatedPdfSnapshotHtml(pmRoot: HTMLElement): string {
    const clone = pmRoot.cloneNode(true) as HTMLElement;
    // Editor runtime may set a large min-height to keep scroll continuity.
    // In print this can materialize as a trailing blank page.
    clone.style.removeProperty('min-height');
    clone.style.removeProperty('height');
    const paginationClone = clone.querySelector('[data-rm-pagination]') as HTMLElement | null;
    if (paginationClone) {
        paginationClone.style.removeProperty('min-height');
        paginationClone.style.removeProperty('height');
        paginationClone.style.setProperty('width', '100%', 'important');
        paginationClone.style.setProperty('min-width', '0', 'important');
        paginationClone.style.setProperty('max-width', '100%', 'important');
        paginationClone.style.setProperty('box-sizing', 'border-box', 'important');
    }
    clone.querySelectorAll('.nomai-break-visual').forEach((el) => el.remove());
    clone.querySelectorAll('.ProseMirror-trailingBreak, .ProseMirror-separator').forEach((el) => el.remove());
    // TablePlus edit-time decorations must never be exported.
    clone.querySelectorAll(
        '.table-plus-wrapper .handle, .table-plus-wrapper .slider, .column-resize-handle, [data-resize-handle], .grip-column, .grip-row, .grip-table, .handle, .slider',
    ).forEach((el) => el.remove());
    // Selection / resize artifacts are editor-only and can leak visual chrome to PDF.
    clone.querySelectorAll('.selectedCell, .resize-cursor, .is-resizing').forEach((el) => {
        el.classList.remove('selectedCell', 'resize-cursor', 'is-resizing');
    });
    clone.querySelectorAll<HTMLElement>('p[data-nomai-section-start="nextPage"]').forEach((el) => {
        el.style.setProperty('margin', '0', 'important');
        el.style.setProperty('padding', '0', 'important');
        el.style.setProperty('height', '0', 'important');
        el.style.setProperty('border', '0', 'important');
    });
    normalizeManualPageBreakSpacingForPdf(clone);
    pinPaginationRootGeometryFromLive(pmRoot, clone);
    pinHeaderFooterPaddingFromLive(pmRoot, clone);
    clampHeaderFooterBandsInClone(clone);

    freezePaginationCounters(clone);
    removePrintOnlyPaginationChrome(clone);
    // Hoist page-1 header/footer out of the float/ProseMirror tree so print
    // HTML can place them as direct body children (fixed chrome must not sit
    // inside a fragmented float context — that paints content then chrome).
    const { headerHtml, footerHtml } = extractPinnedPrintChromeFromClone(clone);

    const totalPages = resolvePdfExportTotalPages(countPdfExportPageBreaks(clone));
    const pmHtml = applyFrozenTotalPageTokens(clone.outerHTML, totalPages);
    return `${headerHtml}${footerHtml}${pmHtml}`;
}

function readPxFromInlineStyle(el: HTMLElement, prop: string): number | null {
    const raw = el.style.getPropertyValue(prop).trim();
    if (!raw) return null;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
}

function clampHeaderFooterBandsInClone(clone: HTMLElement): void {
    const budget = readPdfBandBudgetSnapshotFromStyles({
        getPropertyValue: (name: string) => clone.style.getPropertyValue(name),
    });

    clone
        .querySelectorAll<HTMLElement>('.rm-first-page-header, [data-rm-pagination] .rm-page-break .rm-page-header')
        .forEach((el) => {
            const liveHeight = readPxFromInlineStyle(el, '--nomai-live-band-height');
            el.style.setProperty(
                'max-height',
                `${resolveBandClampMaxHeightPx(budget.headerBudgetPx, liveHeight)}px`,
                'important',
            );
            el.style.setProperty('overflow', 'hidden', 'important');
            el.style.setProperty('box-sizing', 'border-box', 'important');
        });
    clone
        .querySelectorAll<HTMLElement>(
            '.rm-first-page-footer, .rm-page-footer-1, [data-rm-pagination] .rm-page-break .rm-page-footer',
        )
        .forEach((el) => {
            const liveHeight = readPxFromInlineStyle(el, '--nomai-live-band-height');
            el.style.setProperty(
                'max-height',
                `${resolveBandClampMaxHeightPx(budget.footerBudgetPx, liveHeight)}px`,
                'important',
            );
            el.style.setProperty('overflow', 'hidden', 'important');
            el.style.setProperty('box-sizing', 'border-box', 'important');
        });
}

function normalizeManualPageBreakSpacingForPdf(clone: HTMLElement): void {
    const gap = clone.querySelector<HTMLElement>('.rm-pagination-gap');
    const rawGapHeight = gap?.style.height || '0';
    const gapHeight = Number.parseFloat(rawGapHeight);
    const hiddenPrintGap = Number.isFinite(gapHeight) && gapHeight > 0 ? gapHeight : 0;

    clone.querySelectorAll<HTMLElement>('.page-break[data-break-kind="sectionNext"], .page-break[data-force-next-page="true"]').forEach((el) => {
        const rawMarginBottom = el.style.marginBottom || el.style.getPropertyValue('--nomai-section-next-gap') || '0';
        const marginBottom = Number.parseFloat(rawMarginBottom);
        if (!Number.isFinite(marginBottom) || marginBottom <= 0) return;

        const pdfMarginBottom = Math.max(0, Math.round(marginBottom - hiddenPrintGap));
        const nextValue = `${pdfMarginBottom}px`;
        el.style.setProperty('margin-top', '0', 'important');
        el.style.setProperty('margin-bottom', nextValue, 'important');
        el.style.setProperty('--nomai-section-next-gap', nextValue);
        el.style.setProperty('padding', '0', 'important');
        el.style.setProperty('height', '0', 'important');
        el.style.setProperty('border', '0', 'important');
    });
}

function pinPaginationRootGeometryFromLive(pmRoot: HTMLElement, clone: HTMLElement): void {
    const cs = getComputedStyle(pmRoot);
    const inline = pmRoot.style;
    const copy = (prop: string, value: string) => {
        if (!value) return;
        clone.style.setProperty(prop, value.trim(), 'important');
    };
    const readVar = (name: string) => {
        const iv = inline.getPropertyValue(name).trim();
        if (iv) return iv;
        return cs.getPropertyValue(name).trim();
    };
    const readBoxStyle = (
        inlineName: 'width' | 'paddingLeft' | 'paddingRight',
        computedName: 'width' | 'paddingLeft' | 'paddingRight',
    ) => {
        const iv = inline[inlineName]?.trim();
        if (iv) return iv;
        const cv = cs[computedName]?.trim();
        return cv || '';
    };

    // Prefer inline values: they carry the exact asymmetric margins set by ruler.
    copy('--rm-page-width', readVar('--rm-page-width'));
    copy('--rm-margin-left', readVar('--rm-margin-left'));
    copy('--rm-margin-right', readVar('--rm-margin-right'));
    copy('--rm-margin-top', readVar('--rm-margin-top'));
    copy('--rm-margin-bottom', readVar('--rm-margin-bottom'));
    copy('--rm-content-margin-top', readVar('--rm-content-margin-top'));
    copy('--rm-content-margin-bottom', readVar('--rm-content-margin-bottom'));

    // Pin the actual rendered root content box. If padding-right is left to the
    // print cascade, Chromium can solve full-bleed header margins against a
    // symmetric content box and visually turn right margin into left margin.
    copy('width', readBoxStyle('width', 'width'));
    copy('padding-left', readBoxStyle('paddingLeft', 'paddingLeft'));
    copy('padding-right', readBoxStyle('paddingRight', 'paddingRight'));
    copy('box-sizing', 'border-box');
}

/**
 * PaginationPlus mutates header/footer inline styles at runtime (overflow:hidden,
 * sometimes height/positioning). In the print window, our `!important` CSS can
 * still lose to ad-hoc inline rules / runtime ordering. To make WYSIWYG truly
 * deterministic, we read the computed padding/margin straight off each live
 * header/footer element and rewrite it as inline style on the corresponding
 * cloned node — print no longer depends on cascade.
 */
function pinHeaderFooterPaddingFromLive(pmRoot: HTMLElement, clone: HTMLElement): void {
    const shellSelector =
        '.rm-first-page-header, .rm-first-page-footer, .rm-page-footer-1, [data-rm-pagination] .rm-page-break .rm-page-header, [data-rm-pagination] .rm-page-break .rm-page-footer';
    const liveNodes = Array.from(pmRoot.querySelectorAll<HTMLElement>(shellSelector));
    const cloneNodes = Array.from(clone.querySelectorAll<HTMLElement>(shellSelector));
    const len = Math.min(liveNodes.length, cloneNodes.length);

    const copy = (target: HTMLElement, prop: string, value: string) => {
        target.style.setProperty(prop, value || '0px', 'important');
    };
    const copyIfConcrete = (target: HTMLElement, prop: string, value: string) => {
        const v = value?.trim();
        if (!v || v === 'auto') return;
        target.style.setProperty(prop, v, 'important');
    };

    for (let i = 0; i < len; i++) {
        const live = liveNodes[i];
        const target = cloneNodes[i];
        if (!live || !target) continue;
        const cs = getComputedStyle(live);
        const preserveLiveFlow = shouldPreserveLiveBandFlowMetrics(live.className);
        const classTokens = ` ${live.className || ''} `;
        const isFirstHeader = classTokens.includes(' rm-first-page-header ');
        const isFirstFooter =
            classTokens.includes(' rm-first-page-footer ') || classTokens.includes(' rm-page-footer-1 ');

        copy(target, 'padding-top', cs.paddingTop);
        copy(target, 'padding-bottom', cs.paddingBottom);
        if (preserveLiveFlow) {
            // In the ONE print model these first-page bands become `position: fixed`
            // (header pinned top, footer pinned bottom). Any live flow margin
            // pinned inline with !important would shift the fixed box, so zero
            // both margins on both pinned bands. Padding (band internal insets)
            // is still copied from live below and is the correct source.
            if (isFirstFooter || isFirstHeader) {
                target.style.setProperty('margin-top', '0px', 'important');
                target.style.setProperty('margin-bottom', '0px', 'important');
            } else {
                copy(target, 'margin-top', cs.marginTop);
                copy(target, 'margin-bottom', cs.marginBottom);
            }
        } else {
            target.style.setProperty('margin-top', '0px', 'important');
            target.style.setProperty('margin-bottom', '0px', 'important');
        }
        copyIfConcrete(target, 'width', cs.width);
        copyIfConcrete(target, 'min-width', cs.minWidth);
        copyIfConcrete(target, 'max-width', cs.maxWidth);
        copyIfConcrete(target, 'margin-left', cs.marginLeft);
        copyIfConcrete(target, 'margin-right', cs.marginRight);
        target.style.setProperty('box-sizing', 'border-box', 'important');
        const liveBoxHeight = Math.max(1, Math.round(live.getBoundingClientRect().height));
        target.style.setProperty('--nomai-live-band-height', `${liveBoxHeight}px`);

        // Freeze header/footer content-row horizontal paddings exactly as rendered.
        const liveContent = live.querySelector<HTMLElement>(
            ':scope > .rm-page-header-content, :scope > .rm-page-footer-content',
        );
        const targetContent = target.querySelector<HTMLElement>(
            ':scope > .rm-page-header-content, :scope > .rm-page-footer-content',
        );
        if (liveContent && targetContent) {
            const ccs = getComputedStyle(liveContent);
            copy(targetContent, 'padding-left', ccs.paddingLeft);
            copy(targetContent, 'padding-right', ccs.paddingRight);
            copy(targetContent, 'width', ccs.width);
            copy(targetContent, 'box-sizing', 'border-box');
        }
    }
}

/** TipTap `getHTML()` has no PaginationPlus decorations; export warmed live DOM snapshot for WYSIWYG PDF. */
function getPdfExportBodyHtml(editor: Editor): string {
    if (typeof document === 'undefined' || editor.isDestroyed || !editor.view?.dom) {
        return editor.getHTML();
    }
    // Never fall back to unsanitized outerHTML: that keeps `.rm-pagination-gap`
    // boxes in the print tree and reintroduces page-gap / footer drift.
    return sanitizePaginatedPdfSnapshotHtml(editor.view.dom as HTMLElement);
}

/**
 * Exports the current editor content to a .docx file using native Electron dialog.
 */
export const exportToDOCX = async (
    editor: Editor | null,
    suggestedBaseName?: string | null,
    documentIdOverride?: string | null,
) => {
    if (!editor) return;

    try {
        const invoke = getInvoke();
        if (!invoke) {
            throw new Error("Electron IPC not available");
        }

        await flushSyncHfToEditor();

        const docTitle =
            useLayoutStore.getState().documents.find((d) => d.id === useLayoutStore.getState().activeDocument)
                ?.title ?? 'Belge';
        const documentId = documentIdOverride?.trim() || useLayoutStore.getState().activeDocument;
        warnHfPageVariantsOmittedFromNonPdfExport(documentId);
        const { buffer } = await buildDocxFromEditor(editor, { docTitle, documentId });
        const base = sanitizeExportBaseName(suggestedBaseName);
        const docxPayload: DocxExportIpcPayload = {
            docxBuffer: Array.from(buffer),
            suggestedBaseName: base,
        };
        await invoke('export-docx', docxPayload);
        trackExportAction('docx');
    } catch (error) {
        console.error('DOCX Export failed:', error);
        throw error;
    }
};

export type PdfExportBuildOptions = {
    title: string;
    verificationMeta?: UyapVerificationMeta | null;
    /** Fallback when `verificationMeta` is omitted (editor tab id). */
    documentIdForVerification?: string | null;
    /**
     * Interactive PDF export prompts with a settle toast (Faz 2). Headless/batch
     * (`convert-html-to-pdf`) must not block — pass `false` to auto-continue.
     */
    promptOnUnsettledLayout?: boolean;
};

/** Extra data the overlay pipeline needs from the body payload builder. */
export type PdfExportPayloadExtras = {
    /** Reserved top/bottom band heights (px) inlined into the body @page. */
    pageMarginPx?: { top: number; bottom: number };
    /** Offline @font-face CSS (base64 woff2) shared with the HF overlay. */
    offlineFontFaceCss?: string;
    /** Theme + PaginationPlus CSS variables snapshot shared with the overlay. */
    themeVarsCss?: string;
};

/**
 * Builds the same HTML + print options as manual editor PDF export (PaginationPlus snapshot).
 */
export async function buildPdfExportPayloadFromEditor(
    editor: Editor,
    options: PdfExportBuildOptions,
): Promise<{ documentHtml: string; printToPdfOptions: Record<string, unknown> } & PdfExportPayloadExtras> {
    const warmupRoot = editor.view?.dom as HTMLElement | undefined;
    const zoomShell =
        warmupRoot?.closest('.udfix-editor-zoom-shell') as HTMLElement | null | undefined;
    const prevInlineZoom = zoomShell?.style.zoom ?? '';
    const computedZoom =
        zoomShell && typeof document !== 'undefined'
            ? Number.parseFloat(getComputedStyle(zoomShell).zoom || '1')
            : 1;
    const shouldNormalizeZoom =
        Number.isFinite(computedZoom) && computedZoom > 0 && Math.abs(computedZoom - 1) > 0.001;

    const verificationMeta =
        options.verificationMeta !== undefined
            ? options.verificationMeta
            : options.documentIdForVerification != null
              ? readPersistedUyapVerificationMeta(options.documentIdForVerification)
              : null;

    let bodyHtmlRaw = '';
    let verificationBlock: HTMLElement | null = null;
    let resumeObserver: () => void = () => {};
    try {
        if (typeof document !== 'undefined') {
            stripAdoptedUyapVerificationFromEditor(editor);
        }
        if (shouldNormalizeZoom && zoomShell) {
            zoomShell.style.zoom = '1';
            await waitTwoFrames();
        }
        if (typeof document !== 'undefined' && warmupRoot && verificationMeta?.accessToken?.trim()) {
            resumeObserver = pauseProseMirrorDomObserver(editor.view);
            const blockHtml = await buildUyapVerificationHtmlBlock(verificationMeta);
            verificationBlock = insertTemporaryUyapVerificationBlock(warmupRoot, blockHtml);
            if (verificationBlock) {
                reconcilePaginationPlusLayout(editor, { forceDecorationRebuild: true });
                pinTemporaryUyapVerificationBlock(warmupRoot, verificationBlock);
            }
        }
        if (typeof document !== 'undefined' && warmupRoot) {
            await stabilizePdfExportLayout(warmupRoot, verificationBlock, {
                promptOnUnsettledLayout: options.promptOnUnsettledLayout !== false,
            });
            pinExportVerificationIfNeeded(warmupRoot, verificationBlock);
        }
        bodyHtmlRaw = getPdfExportBodyHtml(editor);
    } finally {
        if (warmupRoot) removeTemporaryUyapVerificationBlock(warmupRoot);
        resumeObserver();
        if (typeof document !== 'undefined') {
            stripAdoptedUyapVerificationFromEditor(editor);
        }
        if (zoomShell) {
            if (prevInlineZoom) zoomShell.style.zoom = prevInlineZoom;
            else zoomShell.style.removeProperty('zoom');
        }
    }

    const pmRoot = editor.view?.dom;
    const themeAndPaginationVarsCss =
        typeof document !== 'undefined' && pmRoot ? collectThemeAndPaginationVars(pmRoot) : '';
    const paginationPlusPdfCss = getPaginationPlusPdfCss();
    const extraPdfStyles = `${themeAndPaginationVarsCss}${paginationPlusPdfCss}`;
    let bodyHtml = resolveCssVarsInHtmlString(bodyHtmlRaw, pmRoot ?? null);

    // Snapshot-only: never write this HTML back into TipTap. Collapse N copies or
    // fill a missing QR so the PDF has exactly one block at document end.
    if (verificationMeta && countUyapVerificationNoticeOccurrences(bodyHtml) !== 1) {
        if (countUyapVerificationNoticeOccurrences(bodyHtml) === 0) {
            console.warn('[PDF Export] verification block missing from snapshot; appending after freeze');
        }
        bodyHtml = await appendUyapVerificationToHtml(bodyHtml, verificationMeta);
    }

    const paginatedBodyTypographyDecls =
        pmRoot && typeof document !== 'undefined'
            ? buildPdfBodyTypographyDeclsFromProseMirror(pmRoot)
            : undefined;
    const paginatedBodyInsetDecls =
        pmRoot && typeof document !== 'undefined'
            ? buildPdfBodyCanvasInsetDeclsFromProseMirror(pmRoot)
            : undefined;
    // Header/footer band heights inlined into @page top/bottom margins so the
    // pinned `position: fixed` chrome never overlaps body text on any sheet.
    // CSS variables do not propagate to @page, so these must be literal px.
    const pageMarginPx =
        pmRoot && typeof document !== 'undefined'
            ? readPdfBandBudgetSnapshotFromStyles({
                  getPropertyValue: (name: string) => pmRoot.style.getPropertyValue(name),
              })
            : undefined;
    const extraPdfFamilies: string[] = [];
    if (pmRoot && typeof document !== 'undefined') {
        const primary = getComputedStyle(pmRoot).fontFamily.split(',')[0]?.trim().replace(/^["']|["']$/g, '');
        if (primary && getBundledFontByName(primary)) extraPdfFamilies.push(primary);
    }
    const offlineFontFaceCss = await buildPdfFontFaceCss(bodyHtml, {
        extraFamilies: extraPdfFamilies,
    });
    const documentHtml = buildPdfDocumentHtml(bodyHtml, options.title, extraPdfStyles, {
        paginatedDomPdf: true,
        paginatedBodyTypographyDecls,
        paginatedBodyInsetDecls,
        offlineFontFaceCss,
        pageMarginPx: pageMarginPx
            ? { top: pageMarginPx.headerBudgetPx, bottom: pageMarginPx.footerBudgetPx }
            : undefined,
    });
    const printToPdfOptions: Record<string, unknown> = {
        displayHeaderFooter: false,
        preferCSSPageSize: true,
        scale: 1,
    };
    return {
        documentHtml,
        printToPdfOptions,
        pageMarginPx: pageMarginPx
            ? { top: pageMarginPx.headerBudgetPx, bottom: pageMarginPx.footerBudgetPx }
            : undefined,
        offlineFontFaceCss,
        themeVarsCss: extraPdfStyles,
    };
}

function readNativePdfPageMargins(editor: Editor): {
    left: number;
    right: number;
    headerPadTop: number;
    headerPadBottom: number;
    footerPadTop: number;
    footerPadBottom: number;
} {
    const m = getPaginationMargins(editor);
    const pag = editor.storage?.PaginationPlus as
        | { contentMarginTop?: number; contentMarginBottom?: number }
        | undefined;
    const contentTop = Number(pag?.contentMarginTop);
    const contentBottom = Number(pag?.contentMarginBottom);
    return {
        left: m?.marginLeft ?? EDITOR_PAGE_MARGIN_LEFT_PX,
        right: m?.marginRight ?? EDITOR_PAGE_MARGIN_RIGHT_PX,
        headerPadTop: m?.marginTop ?? EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX,
        footerPadBottom: m?.marginBottom ?? EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX,
        headerPadBottom: Number.isFinite(contentTop) ? contentTop : EDITOR_PAGINATION_CONTENT_MARGIN_BASE_PX,
        footerPadTop: Number.isFinite(contentBottom) ? contentBottom : EDITOR_PAGINATION_CONTENT_MARGIN_BASE_PX,
    };
}

/** Panel HTML height at the text-column width, so the body band matches the ruler. */
async function measureHfBlockHeightPx(html: string, widthPx: number): Promise<number> {
    if (!html.trim() || typeof document === 'undefined') return 0;
    const host = document.createElement('div');
    host.style.cssText = `position:absolute;left:-10000px;top:0;width:${Math.max(1, widthPx)}px;visibility:hidden;pointer-events:none;font-size:10px;line-height:1.4;`;
    host.innerHTML = html;
    document.body.appendChild(host);
    const imgs = [...host.querySelectorAll('img')];
    await Promise.all(
        imgs.map((img) =>
            typeof img.decode === 'function' ? img.decode().catch(() => undefined) : Promise.resolve(),
        ),
    );
    const height = Math.ceil(host.getBoundingClientRect().height);
    host.remove();
    return Number.isFinite(height) ? height : 0;
}

/**
 * Native PDF parts: TipTap HTML + ruler @page margins + panel `compileHfHtml`.
 * Does not snapshot PaginationPlus DOM and does not read live `.rm-*` bands.
 * Shared by interactive export and headless UDF→PDF. Does not touch UDF/DOCX writers.
 */
export async function buildNativePdfOverlayRequest(
    editor: Editor,
    options: PdfExportBuildOptions,
): Promise<ExportPdfWithOverlayPayload> {
    flushAllHfEditors();
    await flushSyncHfToEditor();

    const verificationMeta =
        options.verificationMeta !== undefined
            ? options.verificationMeta
            : options.documentIdForVerification != null
              ? readPersistedUyapVerificationMeta(options.documentIdForVerification)
              : null;

    let bodyInner = editor.getHTML();
    if (verificationMeta) {
        bodyInner = await appendUyapVerificationToHtml(bodyInner, verificationMeta);
    }

    const pads = readNativePdfPageMargins(editor);
    const pmRoot = editor.view?.dom as HTMLElement | undefined;
    const typographyDecls =
        pmRoot && typeof document !== 'undefined'
            ? buildPdfBodyTypographyDeclsFromProseMirror(pmRoot)
            : undefined;
    const extraPdfFamilies: string[] = [];
    if (pmRoot && typeof document !== 'undefined') {
        const primary = getComputedStyle(pmRoot).fontFamily.split(',')[0]?.trim().replace(/^["']|["']$/g, '');
        if (primary && getBundledFontByName(primary)) extraPdfFamilies.push(primary);
    }
    const hfOverlay = buildHfOverlayPayload(readHfOverlaySliceFromStore(), {
        docTitle: options.title,
        pageMarginPx: { top: 0, bottom: 0 },
        offlineFontFaceCss: '',
        themeVarsCss: '',
    });
    const hfMarkup = Object.values(hfOverlay.variants)
        .map((variant) => `${variant.headerHtml}\n${variant.footerHtml}`)
        .join('\n');
    const offlineFontFaceCss = await buildPdfFontFaceCss(`${bodyInner}\n${hfMarkup}`, {
        extraFamilies: extraPdfFamilies,
    });
    const innerWidth = Math.max(1, EDITOR_PAGE_WIDTH_PX - pads.left - pads.right);
    const variantList = Object.values(hfOverlay.variants);
    const headerHeights = await Promise.all(
        variantList.map((variant) => measureHfBlockHeightPx(variant.headerHtml, innerWidth)),
    );
    const footerHeights = await Promise.all(
        variantList.map((variant) => measureHfBlockHeightPx(variant.footerHtml, innerWidth)),
    );
    const headerContent = Math.max(0, ...headerHeights);
    const footerContent = Math.max(0, ...footerHeights);
    const headerBand =
        pads.headerPadTop + headerContent + (headerContent > 0 ? pads.headerPadBottom : 0);
    const footerBand =
        pads.footerPadBottom + footerContent + (footerContent > 0 ? pads.footerPadTop : 0);
    const margins = {
        top: headerBand,
        right: pads.right,
        bottom: footerBand,
        left: pads.left,
    };
    const bodyHtml = buildNativeBodyPdfHtml({
        bodyInnerHtml: bodyInner,
        title: options.title,
        margins,
        offlineFontFaceCss,
        typographyDecls,
    });
    hfOverlay.offlineFontFaceCss = offlineFontFaceCss;
    hfOverlay.pageMarginPx = {
        top: headerBand,
        bottom: footerBand,
        left: pads.left,
        right: pads.right,
        headerPadTop: pads.headerPadTop,
        headerPadBottom: headerContent > 0 ? pads.headerPadBottom : 0,
        footerPadTop: footerContent > 0 ? pads.footerPadTop : 0,
        footerPadBottom: pads.footerPadBottom,
    };
    return {
        bodyHtml,
        hfOverlay,
        printToPdfOptions: {
            displayHeaderFooter: false,
            preferCSSPageSize: true,
            scale: 1,
        },
    };
}

/**
 * PDF export: native body (`getHTML` + ruler margins) and panel header/footer
 * stamped with pdf-lib. Screen pagination is not printed.
 */
export const exportToPDF = async (
    editor: Editor | null,
    suggestedBaseName?: string | null,
    /** UDF sekmesi: `udf:${encodeURIComponent(path)}` — yoksa `activeDocument` kullanılır. */
    documentIdOverride?: string | null,
) => {
    if (!editor) return;

    try {
        const invoke = getInvoke();
        if (!invoke) {
            throw new Error("Electron IPC not available");
        }

        const layout = useLayoutStore.getState();
        const targetDocumentId = documentIdOverride?.trim() || layout.activeDocument;
        const title =
            layout.documents.find((d) => d.id === targetDocumentId)?.title ??
            suggestedBaseName?.trim() ??
            'Belge';
        const built = await buildNativePdfOverlayRequest(editor, {
            title,
            documentIdForVerification: targetDocumentId,
        });
        const payload: ExportPdfWithOverlayPayload = {
            ...built,
            suggestedBaseName: sanitizeExportBaseName(suggestedBaseName),
        };
        await invoke('export-pdf-with-overlay', payload);
        trackExportAction('pdf');
    } catch (error) {
        if (error instanceof PdfExportCancelledError) {
            toast.message('PDF dışa aktarma iptal edildi');
            return;
        }
        console.error('PDF Export failed:', error);
        throw error;
    }
};

/**
 * Read the current HF store state into the overlay slice shape. Exported for
 * the headless batch path and tests.
 */
export function readHfOverlaySliceFromStore(): HfOverlaySlice {
    const s = useHeaderFooterStore.getState();
    return {
        sections: {
            default: { ...s.sections.default },
            firstPage: { ...s.sections.firstPage },
            lastPage: { ...s.sections.lastPage },
            oddPage: { ...s.sections.oddPage },
            evenPage: { ...s.sections.evenPage },
        },
        settings: { ...s.settings },
        differentFirstPage: s.differentFirstPage,
        differentLastPage: s.differentLastPage,
        differentOddEvenPages: s.differentOddEvenPages,
    };
}
