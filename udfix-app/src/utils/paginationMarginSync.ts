import type { Editor } from '@tiptap/react';
import type { FooterOptions, HeaderOptions, PaginationPlusOptions } from 'tiptap-pagination-plus';
import {
    getCustomPages,
    getFooterHeight,
    getHeaderHeight,
    getHeight,
} from 'tiptap-pagination-plus/dist/utils.js';
import {
    EDITOR_PAGE_HEIGHT_PX,
    EDITOR_PAGE_WIDTH_PX,
    EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX,
    EDITOR_PAGINATION_CONTENT_MARGIN_BASE_PX,
    editorClampHorizontalPageMargins,
    editorClampVerticalPageMargins,
} from './editorLayout';

/** PaginationPlus `addStorage()` ile `editor.storage.PaginationPlus` üzerinde tutulan alanlar (TipTap v3’te gerçek mutable kaynak) */
export type PaginationPlusPageConfig = {
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    pageHeight: number;
    pageWidth: number;
    contentMarginTop: number;
    contentMarginBottom: number;
    pageGapBorderColor: string;
};

export type PaginationPlusPageSize = {
    pageWidth: number;
    pageHeight: number;
};

function getPaginationPlusStorage(editor: Editor | null): PaginationPlusPageConfig | null {
    if (!editor || editor.isDestroyed) return null;
    const pag = editor.storage?.PaginationPlus as PaginationPlusPageConfig | undefined;
    return pag ?? null;
}

/**
 * PaginationPlus gerçek sayfa sayısı: `[data-rm-pagination]` altındaki `.page` düğümleri.
 * `paginationEl.children.length` kullanma — doğrudan çocuklar yalnızca `.rm-page-break` widget’larıdır;
 * yanlış sayım `buildHeaderFooterVariantMaps` ve eklentiye fazla customHeader/Footer anahtarı basar,
 * eklentinin yapay sayfa üretmesine yol açabilir.
 */
export function countPaginationPlusLogicalPages(paginationEl: Element | null): number {
    if (!paginationEl) return 1;
    const n = paginationEl.querySelectorAll('.page').length;
    return Math.max(1, n);
}

/**
 * tiptap-pagination-plus `defaultOptions` bazen storage’da kalıyor (800×789).
 * Bu durumda dikey marj cetveli yanlış `editorClampVerticalPageMargins` kullanır ve
 * plugin `view.update` içindeki `--rm-page-content-*` yeniden hesapları sapar.
 */
export function normalizePaginationPlusDimensionsIfPluginDefaults(pag: PaginationPlusPageConfig): void {
    // A4-only mode: page dimensions are fixed and never vary by document/runtime.
    pag.pageHeight = EDITOR_PAGE_HEIGHT_PX;
    pag.pageWidth = EDITOR_PAGE_WIDTH_PX;
}

/**
 * Alt sayfa marjı — plugin bazen tabanın altı (ör. 20px) tutabiliyor; okurken en az gövde tabanı (40px).
 */
export function effectivePageMarginBottomPx(pag: PaginationPlusPageConfig): number {
    const v = Number(pag.marginBottom);
    if (!Number.isFinite(v) || v <= 0) return EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX;
    return Math.max(EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX, v);
}

/** Üst marj: plugin bazen 0/undefined veya 40px altı yazar; cetvel ile aynı taban */
export function effectivePageMarginTopPx(pag: PaginationPlusPageConfig): number {
    const v = Number(pag.marginTop);
    if (!Number.isFinite(v) || v <= 0) return EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX;
    return Math.max(EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX, v);
}

export function getPaginationMargins(editor: Editor | null): {
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
} | null {
    if (!editor || editor.isDestroyed) return null;
    const pag = getPaginationPlusStorage(editor);
    if (!pag) return null;
    /** Okuma yolu: storage’ı burada değiştirme — her çağrıda sync/DOM yan etkisi titreme yapıyordu */
    return {
        marginTop: effectivePageMarginTopPx(pag),
        marginBottom: effectivePageMarginBottomPx(pag),
        marginLeft: Number(pag.marginLeft) || 0,
        marginRight: Number(pag.marginRight) || 0,
    };
}

/** PaginationPlus storage’daki sayfa yüksekliği (A4 1123px); yoksa varsayılan. */
export function getPaginationPageHeight(editor: Editor | null): number {
    const pag = getPaginationPlusStorage(editor);
    const h = pag?.pageHeight;
    return h && h > 0 ? h : EDITOR_PAGE_HEIGHT_PX;
}

export function getPaginationPageSize(editor: Editor | null): PaginationPlusPageSize {
    const pag = getPaginationPlusStorage(editor);
    if (pag) {
        normalizePaginationPlusDimensionsIfPluginDefaults(pag);
    }
    return { pageWidth: EDITOR_PAGE_WIDTH_PX, pageHeight: EDITOR_PAGE_HEIGHT_PX };
}

/** tiptap-pagination-plus `utils.updateCssVariables` ile aynı (paket dışa export etmiyor) */
export function updateRmCssVariables(targetNode: HTMLElement, config: PaginationPlusPageConfig): void {
    const cssVariables: Record<string, string> = {
        'rm-page-height': `${config.pageHeight}px`,
        'rm-margin-top': `${config.marginTop}px`,
        'rm-margin-bottom': `${config.marginBottom}px`,
        'rm-margin-left': `${config.marginLeft}px`,
        'rm-margin-right': `${config.marginRight}px`,
        'rm-content-margin-top': `${config.contentMarginTop}px`,
        'rm-content-margin-bottom': `${config.contentMarginBottom}px`,
        'rm-page-gap-border-color': String(config.pageGapBorderColor),
        'rm-page-width': `${config.pageWidth}px`,
    };
    for (const [key, value] of Object.entries(cssVariables)) {
        targetNode.style.setProperty(`--${key}`, value);
    }
    // Plugin bazı durumlarda sadece CSS var güncellemesiyle genişlik/padding'i geç uyguluyor.
    // Doğrudan stil yazımı A3/Letter geçişlerinde deterministic sonuç verir.
    targetNode.style.width = `${config.pageWidth}px`;
    targetNode.style.paddingLeft = `${config.marginLeft}px`;
    targetNode.style.paddingRight = `${config.marginRight}px`;
}

/**
 * PaginationPlus, `.rm-pagination-gap` ve `.breaker` üzerinde **inline** `width: calc(100% + ...) !important` yazar;
 * stylesheet kuralları bunu geçemez. Sayfa arası şeridi her zaman sabit kağıt genişliğinde tutmak için
 * aynı özellikleri burada px + `!important` ile yeniden yazıyoruz (paragraf cetveli % tabanını bypass eder).
 */
export function applyPaginationFullBleedDomFix(editor: Editor | null): void {
    if (!editor || editor.isDestroyed || !editor.view?.dom) return;
    const root = editor.view.dom;
    if (!root.classList.contains('rm-with-pagination')) return;

    const pag = getPaginationPlusStorage(editor);
    const pageW =
        pag?.pageWidth && Number(pag.pageWidth) > 0 ? Math.round(Number(pag.pageWidth)) : EDITOR_PAGE_WIDTH_PX;
    const mL = pag != null && Number.isFinite(Number(pag.marginLeft)) ? Math.round(Number(pag.marginLeft)) : 0;
    const mR = pag != null && Number.isFinite(Number(pag.marginRight)) ? Math.round(Number(pag.marginRight)) : 0;

    const pagination = root.querySelector('[data-rm-pagination]');
    if (!pagination) return;

    const widthPx = `${pageW}px`;
    const gapWidthPx = `${pageW + 2}px`;
    const marginLeftPx = `${-mL}px`;
    const marginRightPx = `${-mR}px`;
    const breakers = pagination.querySelectorAll('.breaker');
    const gaps = pagination.querySelectorAll('.rm-pagination-gap');
    const firstHeader = root.querySelector('.rm-first-page-header') as HTMLElement | null;
    const firstBreaker = breakers[0] as HTMLElement | undefined;
    const firstGap = gaps[0] as HTMLElement | undefined;
    const alreadyApplied =
        firstBreaker != null &&
        firstBreaker.style.getPropertyValue('width') === widthPx &&
        firstBreaker.style.getPropertyPriority('width') === 'important' &&
        firstBreaker.style.getPropertyValue('margin-left') === marginLeftPx &&
        (!firstGap || firstGap.style.getPropertyValue('width') === gapWidthPx) &&
        (!firstHeader ||
            (firstHeader.style.getPropertyValue('width') === widthPx &&
                firstHeader.style.getPropertyPriority('width') === 'important'));
    if (alreadyApplied) return;

    breakers.forEach((node) => {
        const el = node as HTMLElement;
        el.style.setProperty('width', widthPx, 'important');
        el.style.setProperty('min-width', widthPx, 'important');
        el.style.setProperty('margin-left', marginLeftPx, 'important');
        el.style.setProperty('margin-right', marginRightPx, 'important');
        el.style.setProperty('box-sizing', 'border-box', 'important');
    });

    gaps.forEach((node) => {
        const el = node as HTMLElement;
        el.style.setProperty('width', gapWidthPx, 'important');
        el.style.setProperty('min-width', gapWidthPx, 'important');
        el.style.setProperty('left', '-1px', 'important');
        el.style.setProperty('margin-left', '0', 'important');
        el.style.setProperty('margin-right', '0', 'important');
        el.style.setProperty('float', 'none', 'important');
        el.style.setProperty('box-sizing', 'border-box', 'important');
    });

    // Page-1 header is emitted outside `[data-rm-pagination]` and needs the same
    // full-bleed geometry as `.breaker`. Page-1 footer (`.rm-page-footer-1`) is
    // already inside `.breaker` — do not apply a second negative margin there.
    if (firstHeader) {
        firstHeader.style.setProperty('width', widthPx, 'important');
        firstHeader.style.setProperty('min-width', widthPx, 'important');
        firstHeader.style.setProperty('max-width', widthPx, 'important');
        firstHeader.style.setProperty('margin-left', marginLeftPx, 'important');
        firstHeader.style.setProperty('margin-right', marginRightPx, 'important');
        firstHeader.style.setProperty('box-sizing', 'border-box', 'important');
    }
}

/**
 * Cumulative CSS `zoom` factor between `start` and the document root.
 *
 * `getBoundingClientRect()` returns visual (post-zoom) pixels, but inline
 * `style.marginBottom` declarations are interpreted in CSS pixels and then
 * re-zoomed by the engine. When the editor canvas sits inside
 * `.udfix-editor-zoom-shell { zoom: 0.75 }`, a measured 600 px gap must be
 * written as `800px` (= 600 / 0.75) so the engine produces 600 px visually.
 *
 * Returns 1 if no ancestor has zoom — safe to divide by.
 */
function getCumulativeCssZoom(start: Element | null): number {
    if (!start || typeof window === 'undefined') return 1;
    let factor = 1;
    let node: Element | null = start;
    while (node && node !== document.documentElement) {
        const zStr = window.getComputedStyle(node).zoom;
        if (zStr && zStr !== 'normal') {
            const z = Number.parseFloat(zStr);
            if (Number.isFinite(z) && z > 0) factor *= z;
        }
        node = node.parentElement;
    }
    return factor > 0 ? factor : 1;
}

/**
 * Bridge custom "section next page" markers with PaginationPlus' height-based model.
 *
 * Strategy:
 * - Find each forced break marker:
 *   `.page-break[data-break-kind="sectionNext"], .page-break[data-force-next-page="true"]`
 * - Measure distance to the next PaginationPlus `.breaker` line
 * - Apply that distance as `margin-bottom` on the marker (compensated for
 *   any ancestor CSS `zoom`, otherwise the engine double-applies the zoom
 *   and the gap under-shoots → cursor lands on the same visual page).
 *
 * This pushes following content to the next visual page without touching
 * PaginationPlus internals or page-count formulas.
 */
export function applySectionNextPageBridge(editor: Editor | null): void {
    if (!editor || editor.isDestroyed || !editor.view?.dom) return;
    const root = editor.view.dom;
    const manualBreaks = Array.from(
        root.querySelectorAll(
            '.page-break[data-break-kind="sectionNext"], .page-break[data-force-next-page="true"]',
        ),
    ) as HTMLElement[];
    if (manualBreaks.length === 0) return;

    const clearSpacing = (el: HTMLElement) => {
        el.style.removeProperty('margin-bottom');
        el.style.removeProperty('--nomai-section-next-gap');
    };

    const pagination = root.querySelector('[data-rm-pagination]');
    if (!pagination) {
        manualBreaks.forEach(clearSpacing);
        return;
    }

    const breakerElements = Array.from(
        pagination.querySelectorAll('.rm-page-break .breaker'),
    ) as HTMLElement[];
    if (breakerElements.length === 0) {
        manualBreaks.forEach(clearSpacing);
        return;
    }

    /**
     * Each `.breaker` is a [footer, gap, header] strip straddling a visual
     * page boundary. We must push following content past the entire strip
     * — including the next page's header — so it lands at the start of the
     * next page's content area. Using only `breakerTop` puts content on
     * the outgoing page's footer line and Chromium's A4 boundary then
     * pulls that first line back into the previous PDF page.
     */
    const breakerData = breakerElements
        .map((el) => {
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom };
        })
        .filter((d) => Number.isFinite(d.top))
        .sort((a, b) => a.top - b.top);
    if (breakerData.length === 0) {
        manualBreaks.forEach(clearSpacing);
        return;
    }

    const sortedManualBreaks = manualBreaks.sort(
        (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
    );

    const zoomFactor = getCumulativeCssZoom(root);

    let breakerIndex = 0;
    for (const manualBreak of sortedManualBreaks) {
        const rect = manualBreak.getBoundingClientRect();
        while (
            breakerIndex < breakerData.length &&
            breakerData[breakerIndex].top <= rect.bottom + 1
        ) {
            breakerIndex += 1;
        }
        if (breakerIndex >= breakerData.length) {
            clearSpacing(manualBreak);
            continue;
        }
        const visualGap = Math.max(0, breakerData[breakerIndex].bottom - rect.bottom);
        if (visualGap <= 1) {
            clearSpacing(manualBreak);
            continue;
        }
        const cssGap = Math.round(visualGap / zoomFactor);
        const nextValue = `${cssGap}px`;
        if (manualBreak.style.marginBottom !== nextValue) {
            manualBreak.style.marginBottom = nextValue;
        }
        if (manualBreak.style.getPropertyValue('--nomai-section-next-gap') !== nextValue) {
            manualBreak.style.setProperty('--nomai-section-next-gap', nextValue);
        }
    }
}

type PaginationPlusStorageWithCustom = PaginationPlusPageConfig & {
    customHeader?: Record<number, HeaderOptions>;
    customFooter?: Record<number, FooterOptions>;
};

/**
 * TipTap v3: PaginationPlus `view.update` içinde `getHeight(this.options, …)` çağrılır; `this.options`
 * güncel `marginBottom` ile her zaman senkron olmayabiliyor — logda `--rm-page-content-*` sabit kalıyordu.
 * Storage (`editor.storage.PaginationPlus`) kaynağıyla plugin `utils.getHeight` ile aynı değişkenleri yazıyoruz.
 */
export function syncRmPageContentCssVariablesFromStorage(editor: Editor): void {
    const pag = getPaginationPlusStorage(editor) as PaginationPlusStorageWithCustom | null;
    if (!pag || !editor.view?.dom) return;

    const dom = editor.view.dom;
    // Plugin rebuild (pageGap toggle) can reset --rm-margin-* to extension defaults (50px)
    // after applyPaginationMargins wrote UYAP values — re-apply from storage every sync.
    updateRmCssVariables(dom, pag);
    const cmt = Number(pag.contentMarginTop);
    const cmb = Number(pag.contentMarginBottom);
    const pageOptions = {
        pageHeight: pag.pageHeight,
        pageWidth: pag.pageWidth,
        marginTop: Number(pag.marginTop) || 0,
        marginBottom: Number(pag.marginBottom) || 0,
        marginLeft: Number(pag.marginLeft) || 0,
        marginRight: Number(pag.marginRight) || 0,
        contentMarginTop: Number.isFinite(cmt) ? cmt : EDITOR_PAGINATION_CONTENT_MARGIN_BASE_PX,
        contentMarginBottom: Number.isFinite(cmb) ? cmb : EDITOR_PAGINATION_CONTENT_MARGIN_BASE_PX,
    };

    const customHeader = pag.customHeader ?? {};
    const customFooter = pag.customFooter ?? {};

    const paginationElement = dom.querySelector('[data-rm-pagination]');
    const pageCount = countPaginationPlusLogicalPages(paginationElement);

    const headerHeight = getHeaderHeight(dom, getCustomPages(customHeader, {}), 'content');
    const footerHeight = getFooterHeight(dom, getCustomPages({}, customFooter), 'content');

    const footerHeightForCurrentPages = new Map<number, number>();
    for (let i = 0; i <= pageCount; i++) {
        if (footerHeight.has(i)) {
            footerHeightForCurrentPages.set(i, footerHeight.get(i) || 0);
        }
    }
    const headerHeightForCurrentPages = new Map<number, number>();
    for (let i = 0; i <= pageCount; i++) {
        if (headerHeight.has(i)) {
            headerHeightForCurrentPages.set(i, headerHeight.get(i) || 0);
        }
    }
    const pagesSetToCheck = new Set<number>([
        1,
        ...footerHeightForCurrentPages.keys(),
        ...headerHeightForCurrentPages.keys(),
    ]);
    let missingPageNumber: number | undefined;
    for (let i = 1; i <= pageCount; i++) {
        if (!pagesSetToCheck.has(i)) {
            missingPageNumber = i;
            break;
        }
    }
    if (missingPageNumber !== undefined) {
        pagesSetToCheck.add(missingPageNumber);
    }
    pagesSetToCheck.delete(0);

    const pageContentHeightVariable: Record<string, string> = {};
    let maxContentHeight: number | undefined;
    for (const page of pagesSetToCheck) {
        const hHdr = headerHeightForCurrentPages.has(page)
            ? headerHeightForCurrentPages.get(page) || 0
            : headerHeightForCurrentPages.get(0) || 0;
        const hFtr = footerHeightForCurrentPages.has(page)
            ? footerHeightForCurrentPages.get(page) || 0
            : footerHeightForCurrentPages.get(0) || 0;
        const { _pageHeaderHeight, _pageHeight } = getHeight(
            pageOptions as unknown as PaginationPlusOptions,
            hHdr,
            hFtr,
        );
        const contentHeight = page === 1 ? _pageHeight + _pageHeaderHeight : _pageHeight;
        if (page === 1) {
            pageContentHeightVariable['rm-page-content-first'] = `${contentHeight}px`;
        }
        if (page === missingPageNumber) {
            pageContentHeightVariable['rm-page-content-general'] = `${contentHeight}px`;
        } else {
            pageContentHeightVariable[`rm-page-content-${page}`] = `${contentHeight}px`;
        }
        if (maxContentHeight === undefined || contentHeight < maxContentHeight) {
            maxContentHeight = contentHeight;
        }
    }
    if (maxContentHeight !== undefined) {
        dom.style.setProperty('--rm-max-content-child-height', `${maxContentHeight - 10}px`);
    }
    Object.entries(pageContentHeightVariable).forEach(([key, value]) => {
        dom.style.setProperty(`--${key}`, value);
    });

    const lastPageBreak = paginationElement?.lastElementChild?.querySelector('.breaker') as HTMLElement | null;
    if (lastPageBreak) {
        const minHeight = lastPageBreak.offsetTop + lastPageBreak.offsetHeight;
        dom.style.minHeight = `calc(${minHeight}px + 2px)`;
    }

    applyPaginationFullBleedDomFix(editor);
    applySectionNextPageBridge(editor);
}

/**
 * PaginationPlus `calculatePageCount` / dekorasyonlar `extension.options` üzerinden okur.
 * Storage ile `extension.options` arasında margin + header/footer alanlarını senkronlar.
 */
export function syncPaginationPlusExtensionOptions(
    editor: Editor,
    pag: PaginationPlusPageConfig & {
        headerLeft?: string;
        headerRight?: string;
        footerLeft?: string;
        footerRight?: string;
        customHeader?: Record<number, unknown>;
        customFooter?: Record<number, unknown>;
    },
): void {
    const em = (
        editor as unknown as {
            extensionManager?: {
                extensions: Array<{ name: string; options?: PaginationPlusPageConfig & Record<string, unknown> }>;
            };
        }
    ).extensionManager;
    const ext = em?.extensions?.find((e) => e.name === 'PaginationPlus');
    if (!ext?.options) return;
    const o = ext.options as PaginationPlusPageConfig & {
        headerLeft?: string;
        headerRight?: string;
        footerLeft?: string;
        footerRight?: string;
        customHeader?: Record<number, unknown>;
        customFooter?: Record<number, unknown>;
    };
    o.marginTop = pag.marginTop;
    o.marginBottom = pag.marginBottom;
    o.marginLeft = pag.marginLeft;
    o.marginRight = pag.marginRight;
    o.pageHeight = pag.pageHeight;
    o.pageWidth = pag.pageWidth;
    o.contentMarginTop = pag.contentMarginTop;
    o.contentMarginBottom = pag.contentMarginBottom;
    o.pageGapBorderColor = pag.pageGapBorderColor;
    if (pag.headerLeft !== undefined) o.headerLeft = pag.headerLeft;
    if (pag.headerRight !== undefined) o.headerRight = pag.headerRight;
    if (pag.footerLeft !== undefined) o.footerLeft = pag.footerLeft;
    if (pag.footerRight !== undefined) o.footerRight = pag.footerRight;
    if (pag.customHeader !== undefined) o.customHeader = pag.customHeader;
    if (pag.customFooter !== undefined) o.customFooter = pag.customFooter;
}

function getPaginationPlusExtensionOptions(
    editor: Editor,
): (PaginationPlusPageConfig & { pageGap?: number } & Record<string, unknown>) | null {
    const em = (
        editor as unknown as {
            extensionManager?: {
                extensions: Array<{
                    name: string;
                    options?: PaginationPlusPageConfig & { pageGap?: number } & Record<string, unknown>;
                }>;
            };
        }
    ).extensionManager;
    const ext = em?.extensions?.find((e) => e.name === 'PaginationPlus');
    return ext?.options ?? null;
}

/**
 * PaginationPlus dekorasyonlarını kesin yeniden hesaplatır.
 * Bazı durumlarda storage/options senkron olduğunda plugin yeni ölçüyü yeniden çizmez;
 * küçük bir pageGap toggling ile deterministic rebuild tetiklenir.
 */
function forcePaginationPlusDecorationRebuild(editor: Editor): void {
    const o = getPaginationPlusExtensionOptions(editor);
    if (!o || !editor.view) return;
    const currentGap = Number(o.pageGap ?? 30) || 30;
    o.pageGap = currentGap + 1;
    editor.view.dispatch(editor.state.tr);
    o.pageGap = currentGap;
    editor.view.dispatch(editor.state.tr);
}

/**
 * PaginationPlus `view.update` bazı durumlarda kendi içinde `requestAnimationFrame` ile
 * ikinci bir dispatch tetikliyor (özellikle pageCount sınırlarında). Tek RAF ile yaptığımız
 * senkron, bu dispatch'ten önce çalışınca click/focus sonrası bir "atlama" görülüyor.
 * Bu yüzden içerik yüksekliği CSS'ini iki frame sonra yazıyoruz.
 */
function scheduleRmPageContentCssSync(editor: Editor): void {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (!editor.isDestroyed) {
                syncRmPageContentCssVariablesFromStorage(editor);
            }
        });
    });
}

/**
 * HF/cetvel sonrası storage/options/CSS tutarlılığı.
 * A4-only mode: sayfa boyutu her zaman sabitlenir.
 */
export function reconcilePaginationPlusLayout(
    editor: Editor | null,
    _size?: Partial<PaginationPlusPageSize>,
    opts?: { forceDecorationRebuild?: boolean },
): void {
    if (!editor || editor.isDestroyed) return;
    const pag = getPaginationPlusStorage(editor);
    if (!pag || !editor.view?.dom) return;
    normalizePaginationPlusDimensionsIfPluginDefaults(pag);
    pag.pageWidth = EDITOR_PAGE_WIDTH_PX;
    pag.pageHeight = EDITOR_PAGE_HEIGHT_PX;
    syncPaginationPlusExtensionOptions(editor, pag);
    updateRmCssVariables(editor.view.dom, pag);
    if (opts?.forceDecorationRebuild) {
        forcePaginationPlusDecorationRebuild(editor);
    }
    scheduleRmPageContentCssSync(editor);
}

/** Sayfa boyutunu (A4/Letter/A3 vb.) mevcut marjları koruyarak uygular. */
export function applyPaginationPageSize(
    editor: Editor,
    size: PaginationPlusPageSize,
): PaginationPlusPageSize | null {
    void size;
    const pag = getPaginationPlusStorage(editor);
    if (!pag || !editor.view?.dom) return null;
    normalizePaginationPlusDimensionsIfPluginDefaults(pag);
    pag.pageWidth = EDITOR_PAGE_WIDTH_PX;
    pag.pageHeight = EDITOR_PAGE_HEIGHT_PX;

    const clampedH = editorClampHorizontalPageMargins(pag.pageWidth, pag.marginLeft, pag.marginRight);
    const clampedV = editorClampVerticalPageMargins(pag.pageHeight, pag.marginTop, pag.marginBottom);
    pag.marginLeft = clampedH.left;
    pag.marginRight = clampedH.right;
    pag.marginTop = clampedV.top;
    pag.marginBottom = clampedV.bottom;

    syncPaginationPlusExtensionOptions(editor, pag);
    updateRmCssVariables(editor.view.dom, pag);
    forcePaginationPlusDecorationRebuild(editor);
    scheduleRmPageContentCssSync(editor);
    return { pageWidth: EDITOR_PAGE_WIDTH_PX, pageHeight: EDITOR_PAGE_HEIGHT_PX };
}

/**
 * Sürükleme sırasında: storage + CSS (görsel) — dekorasyon rebuild yok, dispatch yok.
 * Bırakınca `applyPaginationMargins` ile tam senkron.
 */
export function applyPaginationMarginsVisualOnly(
    editor: Editor,
    m: { top: number; bottom: number; left: number; right: number },
): { top: number; bottom: number; left: number; right: number } | null {
    const pag = getPaginationPlusStorage(editor);
    if (!pag || !editor.view?.dom) return null;
    normalizePaginationPlusDimensionsIfPluginDefaults(pag);
    const mRounded = {
        top: Math.round(m.top),
        bottom: Math.round(m.bottom),
        left: Math.round(m.left),
        right: Math.round(m.right),
    };
    const { left, right } = editorClampHorizontalPageMargins(pag.pageWidth, mRounded.left, mRounded.right);
    const { top, bottom } = editorClampVerticalPageMargins(pag.pageHeight, mRounded.top, mRounded.bottom);
    pag.marginTop = top;
    pag.marginBottom = bottom;
    pag.contentMarginBottom = EDITOR_PAGINATION_CONTENT_MARGIN_BASE_PX;
    pag.marginLeft = left;
    pag.marginRight = right;
    pag.pageHeight = EDITOR_PAGE_HEIGHT_PX;
    pag.pageWidth = EDITOR_PAGE_WIDTH_PX;
    // Drag sırasında extension options'a dokunma:
    // seçenekler değişince bir sonraki transaction/click anında plugin rebuild tetikleyip
    // görsel sıçrama üretebiliyor. Options sync + rebuild yalnızca mouseup'ta applyPaginationMargins ile yapılır.
    updateRmCssVariables(editor.view.dom, pag);
    applyPaginationFullBleedDomFix(editor);
    return { top, bottom, left, right };
}

/**
 * Sayfa marjlarını kalıcı storage + CSS değişkenlerine yazar.
 * TipTap v3’te `chain.updateMargins` `extension.options` getter’ına geçici nesneye yazar; metin/CSS güncellenmez; burada tam senkron.
 */
export function applyPaginationMargins(
    editor: Editor,
    m: { top: number; bottom: number; left: number; right: number },
): { top: number; bottom: number; left: number; right: number } | null {
    const mRounded = {
        top: Math.round(m.top),
        bottom: Math.round(m.bottom),
        left: Math.round(m.left),
        right: Math.round(m.right),
    };
    const pag = getPaginationPlusStorage(editor);
    if (!pag || !editor.view?.dom) return null;
    normalizePaginationPlusDimensionsIfPluginDefaults(pag);
    const { left, right } = editorClampHorizontalPageMargins(pag.pageWidth, mRounded.left, mRounded.right);
    const { top, bottom } = editorClampVerticalPageMargins(pag.pageHeight, mRounded.top, mRounded.bottom);
    pag.marginTop = top;
    /**
     * Endüstri standartlarına uygun model:
     * - Alt cetvel marjı footer SONRASI boşluğu artırır (`marginBottom`).
     * - Gövde-footer arası boşluk (`contentMarginBottom`) sabit tabanda kalır.
     */
    pag.marginBottom = bottom;
    pag.contentMarginBottom = EDITOR_PAGINATION_CONTENT_MARGIN_BASE_PX;
    pag.marginLeft = left;
    pag.marginRight = right;
    pag.pageHeight = EDITOR_PAGE_HEIGHT_PX;
    pag.pageWidth = EDITOR_PAGE_WIDTH_PX;
    syncPaginationPlusExtensionOptions(editor, pag);
    updateRmCssVariables(editor.view.dom, pag);
    // Tek `dispatch` yetmiyor: plugin `view.update` içindeki `--rm-page-content-*` stale kalıyor;
    // pageGap toggle ile tam rebuild şart; sürüklerken rebuild atlamak sayfa arası şeridi bozuyordu.
    forcePaginationPlusDecorationRebuild(editor);
    scheduleRmPageContentCssSync(editor);
    return { top, bottom, left, right };
}
