import { Editor } from '@tiptap/react';
import { useLayoutStore } from '../stores/useLayoutStore';
import { buildPdfFontFaceCss } from '../fonts/pdfFontFaces';
import { getBundledFontByName } from '../fonts/offlineFontRegistry';
import {
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
import { getElectronInvoke } from './electronBridge';
import { trackExportAction } from '../telemetry/trackEvent';
import { readPersistedUyapVerificationMeta, type UyapVerificationMeta } from './uyapVerification';
import { appendUyapVerificationToHtml } from './uyapVerificationBlock';

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

async function waitForPaginationLayoutSettle(pmRoot: HTMLElement, maxPasses = 6): Promise<void> {
    let previous = readPaginationLayoutSnapshot(pmRoot);
    for (let i = 0; i < maxPasses; i += 1) {
        await waitTwoFrames();
        const current = readPaginationLayoutSnapshot(pmRoot);
        if (snapshotsEqual(previous, current)) {
            return;
        }
        previous = current;
    }
    console.warn('[PDF Export] pagination did not fully settle before snapshot', previous);
}

async function stabilizePdfExportLayout(pmRoot: HTMLElement): Promise<void> {
    await flushSyncHfToEditor();
    await waitTwoFrames();
    await warmupPaginationDomForPdf(pmRoot);
    await Promise.all([waitForImagesReady(pmRoot), waitForFontsReady()]);
    await waitForPaginationLayoutSettle(pmRoot);
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
 * PaginationPlus DOM layout for `[data-rm-pagination] > .rm-page-break[i]`:
 *   .page                              → page (i+1) content
 *   .breaker > .rm-page-footer         → footer of page (i+1)
 *   .breaker > .rm-pagination-gap
 *   .breaker > .rm-page-header         → header of page (i+2) (next page)
 *
 * The page-1 header lives outside the wrapper as `.rm-first-page-header`.
 *
 * Page numbers come from a CSS counter in plugin head styles; the print window
 * does not load those styles, so we freeze numbers to text so footer of pb[i]
 * gets `i+1` and the header inside pb[i] (which belongs to the next page) gets
 * `i+2`. Treating both bands the same way prints `i+1` everywhere → every
 * header shows the previous page's number.
 */
function freezePaginationCounters(clone: HTMLElement): void {
    const pageBreaks = Array.from(clone.querySelectorAll<HTMLElement>('[data-rm-pagination] > .rm-page-break'));
    const totalPages = Math.max(1, pageBreaks.length);
    const totalPagesStr = String(totalPages);

    pageBreaks.forEach((pb, i) => {
        const footerPageNo = String(i + 1);
        const headerPageNo = String(i + 2);

        pb.querySelectorAll<HTMLElement>(
            '.rm-page-footer .rm-page-number, .rm-page-footer .rm-page-number-plus, .rm-page-footer-1 .rm-page-number, .rm-page-footer-1 .rm-page-number-plus',
        ).forEach((el) => {
            el.textContent = footerPageNo;
        });
        pb.querySelectorAll<HTMLElement>('.rm-page-header .rm-page-number, .rm-page-header .rm-page-number-plus').forEach((el) => {
            el.textContent = headerPageNo;
        });
        pb.querySelectorAll<HTMLElement>('[data-type="variable"][data-id="totalPages"], [data-type="variable"][data-id="total"]').forEach((el) => {
            el.textContent = totalPagesStr;
        });
    });

    clone.querySelectorAll<HTMLElement>('.rm-first-page-header .rm-page-number, .rm-first-page-header .rm-page-number-plus').forEach((el) => {
        el.textContent = '1';
    });
    clone.querySelectorAll<HTMLElement>('.rm-first-page-header [data-type="variable"][data-id="totalPages"], .rm-first-page-header [data-type="variable"][data-id="total"]').forEach((el) => {
        el.textContent = totalPagesStr;
    });
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

    const totalPages = Math.max(1, clone.querySelectorAll('[data-rm-pagination] > .rm-page-break').length);
    return clone.outerHTML
        .replace(/\{totalPages\}/g, String(totalPages))
        .replace(/\{total\}/g, String(totalPages));
}

function removePrintOnlyPaginationChrome(clone: HTMLElement): void {
    // Gaps and the final "next page" header are screen pagination chrome.
    // CSS hiding is not enough for Chromium print in some float layouts: the
    // physical nodes can still push an exact A4 snapshot into a blank last page.
    clone.querySelectorAll('.rm-pagination-gap').forEach((el) => el.remove());
    const pageBreaks = Array.from(clone.querySelectorAll<HTMLElement>('[data-rm-pagination] > .rm-page-break'));
    const lastBreak = pageBreaks.at(-1);
    lastBreak?.querySelector<HTMLElement>(':scope > .breaker > .rm-page-header')?.remove();
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
            // First-page footer anchor lives on margin-top; keep only anchor margin
            // and clear the opposite edge to avoid pushing body flow in print.
            if (isFirstFooter) {
                copy(target, 'margin-top', cs.marginTop);
                target.style.setProperty('margin-bottom', '0px', 'important');
            } else if (isFirstHeader) {
                target.style.setProperty('margin-top', '0px', 'important');
                copy(target, 'margin-bottom', cs.marginBottom);
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
    const pmRoot = editor.view.dom as HTMLElement;
    try {
        return sanitizePaginatedPdfSnapshotHtml(pmRoot);
    } catch {
        return pmRoot.outerHTML;
    }
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
};

/**
 * Builds the same HTML + print options as manual editor PDF export (PaginationPlus snapshot).
 */
export async function buildPdfExportPayloadFromEditor(
    editor: Editor,
    options: PdfExportBuildOptions,
): Promise<{ documentHtml: string; printToPdfOptions: Record<string, unknown> }> {
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

    let bodyHtmlRaw = '';
    try {
        if (shouldNormalizeZoom && zoomShell) {
            zoomShell.style.zoom = '1';
            await waitTwoFrames();
        }
        if (typeof document !== 'undefined' && warmupRoot) {
            await stabilizePdfExportLayout(warmupRoot);
        }
        bodyHtmlRaw = getPdfExportBodyHtml(editor);
    } finally {
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

    const verificationMeta =
        options.verificationMeta !== undefined
            ? options.verificationMeta
            : options.documentIdForVerification != null
              ? readPersistedUyapVerificationMeta(options.documentIdForVerification)
              : null;
    if (verificationMeta) {
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
    });
    const printToPdfOptions: Record<string, unknown> = {
        displayHeaderFooter: false,
        preferCSSPageSize: true,
        scale: 1,
    };
    return { documentHtml, printToPdfOptions };
}

/**
 * Exports the current editor content to PDF using Electron's native print-to-pdf.
 * Sends a full HTML document (list styles, breaks, optional dipnot/üst-alt şablonu).
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

        const title =
            useLayoutStore.getState().documents.find((d) => d.id === useLayoutStore.getState().activeDocument)
                ?.title ?? 'Belge';
        const { documentHtml, printToPdfOptions } = await buildPdfExportPayloadFromEditor(editor, {
            title,
            documentIdForVerification: documentIdOverride?.trim() || useLayoutStore.getState().activeDocument,
        });
        const base = sanitizeExportBaseName(suggestedBaseName);
        const payload: PdfExportIpcPayload = {
            documentHtml,
            suggestedBaseName: base,
            printToPdfOptions,
        };
        await invoke('export-pdf-from-html', payload);
        trackExportAction('pdf');
    } catch (error) {
        console.error('PDF Export failed:', error);
        throw error;
    }
};
