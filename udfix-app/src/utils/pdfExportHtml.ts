import { getPdfFontFaceStyleBlock } from '../fonts/pdfFontFaceHtml';
import { getListStylesCSS } from './listStylesExport';
import { compileHfHtml, type CompileHfOptions } from './compileHfHtml';
import { EDITOR_PAGE_WIDTH_PX } from './editorLayout';
import { hoistPinnedPrintChromeFromHtml } from './pdfExportPaginationChrome';
import { stripNestedStyleTagTokens } from './stripHtmlTags';

/** Page / section breaks + optional continuous section marker */
export function getUdfixBreakAndSectionCss(): string {
    return `
      .page-break {
        break-after: page;
        page-break-after: always;
        height: 0;
        margin: 0;
        padding: 0;
        border: 0;
        clear: both;
      }
      .page-break[data-break-kind="sectionNext"] {
        break-after: page;
        page-break-after: always;
      }
      p[data-nomai-section-start="continuous"] {
        border-top: 1px dashed rgba(120, 120, 120, 0.55);
        margin-top: 0.75em;
        padding-top: 0.5em;
      }
      p[data-nomai-section-start="nextPage"] {
        break-before: page;
        page-break-before: always;
      }
    `;
}

/**
 * Paginated-canvas PDF: PaginationPlus already splits content into screen pages.
 * Generic `.page-break { break-after: page }` stacks with `.rm-page-break` / gap rules
 * and inflates PDF page count (e.g. 6 canvas pages → 9 PDF pages).
 */
export function getUdfixBreakAndSectionCssForPaginatedDomPdf(): string {
    return `
      .page-break {
        break-after: auto;
        page-break-after: auto;
      }
      .page-break[data-break-kind="sectionNext"],
      .page-break[data-force-next-page="true"] {
        break-after: auto;
        page-break-after: auto;
        margin-top: 0;
        padding: 0;
        height: 0;
        border: 0;
      }
      p[data-nomai-section-start="continuous"] {
        border-top: 1px dashed rgba(120, 120, 120, 0.55);
        margin-top: 0.75em;
        padding-top: 0.5em;
      }
      p[data-nomai-section-start="nextPage"] {
        break-before: auto;
        page-break-before: auto;
      }
    `;
}

/** Unordered lists (export): mirrors editor bullet nesting without .ProseMirror scope */
export function getExportBulletListCss(): string {
    return `
      ul:not([data-type="taskList"]) {
        list-style-type: disc;
        margin: 0.25em 0;
        padding-left: 1.5em;
      }
      ul:not([data-type="taskList"]) ul:not([data-type="taskList"]) { list-style-type: circle; }
      ul:not([data-type="taskList"]) ul:not([data-type="taskList"]) ul:not([data-type="taskList"]) { list-style-type: square; }
    `;
}

/**
 * Snapshot --rm-* vars from the live ProseMirror root + theme tokens needed for HF chrome in print.
 * Call only from the renderer (export runs in the browser window).
 */
export function collectThemeAndPaginationVars(proseMirrorRoot: HTMLElement): string {
    const docEl = document.documentElement;
    const docCs = getComputedStyle(docEl);
    const pmCs = getComputedStyle(proseMirrorRoot);
    const parts: string[] = [];
    const seen = new Set<string>();

    // Carry all live PaginationPlus variables, including dynamic per-page heights.
    for (let i = 0; i < proseMirrorRoot.style.length; i++) {
        const key = proseMirrorRoot.style[i];
        if (!key.startsWith('--rm-')) continue;
        const value = proseMirrorRoot.style.getPropertyValue(key).trim();
        if (!value) continue;
        parts.push(`${key}: ${value}`);
        seen.add(key);
    }

    // Fallback for keys that may exist only in computed style.
    const fallbackKeys = [
        '--rm-page-width',
        '--rm-page-height',
        '--rm-margin-left',
        '--rm-margin-right',
        '--rm-margin-top',
        '--rm-margin-bottom',
        '--rm-content-margin-top',
        '--rm-content-margin-bottom',
        '--rm-max-content-child-height',
        '--rm-page-gap-border-color',
    ];
    for (const key of fallbackKeys) {
        if (seen.has(key)) continue;
        const value = pmCs.getPropertyValue(key).trim();
        if (!value) continue;
        parts.push(`${key}: ${value}`);
        seen.add(key);
    }
    const muted = docCs.getPropertyValue('--muted-foreground').trim();
    if (muted) parts.push(`--muted-foreground: ${muted}`);
    const fg = docCs.getPropertyValue('--foreground').trim();
    if (fg) parts.push(`--foreground: ${fg}`);

    if (parts.length === 0) return '';
    return `:root { ${parts.join('; ')} }`;
}

/**
 * Paginated DOM PDF: `body` must match the editor ProseMirror computed typography.
 * Hard-coded `11pt` reflows text vs PaginationPlus `--rm-page-content-*` (px) → late-page drift + extra PDF sheets (log: pdfPageCount > rmPbInBody).
 *
 * Beyond the obvious size/family/leading we also pin the kerning + feature
 * settings + text-rendering knobs that change Chromium's measured glyph width
 * (without these the print window can ship with `text-rendering: auto` while
 * the editor uses `optimizeLegibility`, drifting line wrap by a few pixels).
 */
export function buildPdfBodyTypographyDeclsFromProseMirror(pmRoot: HTMLElement): string {
    const cs = getComputedStyle(pmRoot);
    const ffSafe = stripNestedStyleTagTokens(cs.fontFamily || 'system-ui, sans-serif');
    const rows = [
        `font-family: ${ffSafe}`,
        `font-size: ${cs.fontSize}`,
        `line-height: ${cs.lineHeight}`,
        `font-weight: ${cs.fontWeight}`,
        `font-style: ${cs.fontStyle}`,
        `letter-spacing: ${cs.letterSpacing}`,
    ];
    const optionalProps: Array<{ value: string | undefined; decl: (v: string) => string }> = [
        { value: cs.fontVariantNumeric, decl: (v) => `font-variant-numeric: ${v}` },
        { value: cs.fontVariantLigatures, decl: (v) => `font-variant-ligatures: ${v}` },
        { value: cs.fontFeatureSettings, decl: (v) => `font-feature-settings: ${v}` },
        { value: cs.fontKerning, decl: (v) => `font-kerning: ${v}` },
        { value: cs.fontOpticalSizing, decl: (v) => `font-optical-sizing: ${v}` },
        { value: cs.textRendering, decl: (v) => `text-rendering: ${v}` },
        { value: cs.wordSpacing, decl: (v) => `word-spacing: ${v}` },
        { value: cs.tabSize, decl: (v) => `tab-size: ${v}` },
        // `font-synthesis` is read-only on some platforms; guarding to a string
        // keeps the snapshot defensive across Electron versions.
        { value: (cs as unknown as { fontSynthesis?: string }).fontSynthesis, decl: (v) => `font-synthesis: ${v}` },
    ];
    for (const { value, decl } of optionalProps) {
        const trimmed = value?.toString().trim();
        if (!trimmed || trimmed === 'normal' || trimmed === 'auto') continue;
        rows.push(decl(trimmed));
    }
    return rows.join('; ');
}

/** Keep minimum top/bottom inset used by editor canvas/ruler geometry. */
export function buildPdfBodyCanvasInsetDeclsFromProseMirror(pmRoot: HTMLElement): string {
    const cs = getComputedStyle(pmRoot);
    const pt = Number.parseFloat(cs.paddingTop || '0');
    const pb = Number.parseFloat(cs.paddingBottom || '0');
    const topPx = Number.isFinite(pt) ? Math.max(0, Math.round(pt)) : 0;
    const bottomPx = Number.isFinite(pb) ? Math.max(0, Math.round(pb)) : 0;
    return `padding-top: ${topPx}px !important; padding-bottom: ${bottomPx}px !important;`;
}

/** PaginationPlus + Udfix editor layout for print/PDF (bundled; does not rely on plugin styles in document head). */
export function getPaginationPlusPdfCss(): string {
    return `
    .ProseMirror {
      outline: none;
      white-space: pre-wrap;
      word-wrap: break-word;
      /* Match index.css — print window does not load app stylesheet; tabs collapse without this. */
      tab-size: 2.5cm;
    }
    .ProseMirror.rm-with-pagination {
      box-sizing: border-box !important;
      width: var(--rm-page-width, 794px) !important;
      min-width: var(--rm-page-width, 794px) !important;
      max-width: var(--rm-page-width, 794px) !important;
    }
    .ProseMirror.rm-with-pagination [data-rm-pagination] {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }
    .ProseMirror .page {
      background: #fff;
    }
    @media print {
      *, *::before, *::after {
        box-sizing: border-box !important;
      }
      /*
       * -- THE ONE PRINT MODEL: native paged media + pinned chrome --
       * PaginationPlus simulates pages on screen with EMPTY float spacers
       * (.page, margin-top: var(--rm-page-content-N)) and floated
       * .breaker strips holding [footer][gap][header]. The real editor
       * text is NOT inside .page — it flows as a sibling of
       * [data-rm-pagination] (see index.css note). That float geometry is
       * a screen-only illusion; it does not map to paged media. Every prior
       * patch tried to make the float geometry drive print breaks and all
       * failed: footers landed mid-sheet, body bled under footers, huge
       * gaps appeared (926-test).
       *
       * The coherent model: let Chromium paginate the continuous text flow
       * natively across A4 sheets; pin ONE header and ONE footer with
       * position: fixed so they repeat on every sheet; reserve the band
       * height on every sheet via @page top/bottom margins (inlined as
       * literal px in buildPaginatedAtPageRule — CSS vars do not reach
       * @page). Neutralize the screen-only float spacers/bands in print:
       *   - .page (empty): display: none — nothing stacks (it is empty).
       *   - .breaker: collapse to zero height, hide every child (footer-1
       *     is hoisted out of the breaker before print).
       *   - .rm-first-page-header / .rm-page-footer-1: hoisted to direct
       *     body children, then pinned fixed top/bottom.
       *   - all continued-page footers/headers: display: none.
       * Tables must split inside the content box (break-inside: auto) —
       * avoid-page on a tall table/wrapper explodes into blank sheets.
       * No float defloat / band-break restructure. Per-page custom
       * header/footer is intentionally NOT supported by this model —
       * breaker bands cannot be aligned to printed pages because the body
       * text is a single continuous flow. Same HF on all pages is the
       * supported contract.
       */
      /* Fixed chrome must not sit under a transform/filter/contain ancestor. */
      html,
      body,
      .ProseMirror,
      .ProseMirror.rm-with-pagination,
      [data-rm-pagination],
      .rm-pages-wrapper {
        transform: none !important;
        filter: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        contain: none !important;
        will-change: auto !important;
        perspective: none !important;
        isolation: auto !important;
      }
      .rm-pagination-gap,
      .ProseMirror.rm-with-pagination .rm-pagination-gap {
        display: none !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
      }
      .rm-pages-wrapper,
      #pages.rm-pages-wrapper,
      [data-rm-pagination] {
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      /* Empty float spacers that simulate page slots on screen — gone in print. */
      .ProseMirror .page,
      .ProseMirror.rm-with-pagination .page,
      [data-rm-pagination] .page {
        display: none !important;
        float: none !important;
        margin: 0 !important;
        height: 0 !important;
        outline: none !important;
        box-shadow: none !important;
        border: none !important;
      }
      /* Breaker strips: collapse; page-1 footer is hoisted out before print. */
      .rm-with-pagination [data-rm-pagination] .rm-page-break .breaker {
        float: none !important;
        height: 0 !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        overflow: visible !important;
        visibility: hidden !important;
        break-inside: auto !important;
        page-break-inside: auto !important;
      }
      .rm-with-pagination [data-rm-pagination] .rm-page-break .breaker > * {
        display: none !important;
      }
      /* All continued-page footers/headers are screen-only. */
      .rm-with-pagination [data-rm-pagination] .rm-page-break .rm-page-header,
      .rm-with-pagination [data-rm-pagination] .rm-page-break .rm-page-footer {
        display: none !important;
      }
      /*
       * Pinned repeating header — hoisted to a direct body child so
       * position:fixed is not defeated by ProseMirror float fragmentation.
       * Sits inside the @page top margin band from buildPaginatedAtPageRule.
       */
      body > .rm-first-page-header,
      .rm-first-page-header {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        z-index: 10 !important;
        float: none !important;
        margin: 0 !important;
        margin-left: calc(-1 * var(--rm-margin-left, 0px)) !important;
        margin-right: calc(-1 * var(--rm-margin-right, 0px)) !important;
        width: var(--rm-page-width, 794px) !important;
        min-width: var(--rm-page-width, 794px) !important;
        max-width: var(--rm-page-width, 794px) !important;
        padding-top: var(--rm-margin-top, 40px) !important;
        padding-bottom: var(--rm-content-margin-top, 10px) !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        visibility: visible !important;
      }
      /*
       * Pinned repeating footer — hoisted to a direct body child. Sits inside
       * the @page bottom margin band on every sheet.
       */
      body > .rm-page-footer-1,
      body > .rm-first-page-footer,
      .rm-page-footer-1,
      .rm-first-page-footer {
        position: fixed !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        z-index: 10 !important;
        float: none !important;
        margin: 0 !important;
        margin-left: calc(-1 * var(--rm-margin-left, 0px)) !important;
        margin-right: calc(-1 * var(--rm-margin-right, 0px)) !important;
        width: var(--rm-page-width, 794px) !important;
        min-width: var(--rm-page-width, 794px) !important;
        max-width: var(--rm-page-width, 794px) !important;
        padding-top: var(--rm-content-margin-bottom, 10px) !important;
        padding-bottom: var(--rm-margin-bottom, 40px) !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        visibility: visible !important;
      }
      /*
       * Long tables must paginate inside the content box between pinned
       * chrome. break-inside:avoid on table/tr/wrapper forces Chromium to
       * shove the whole block onto new sheets (extra blank/short pages).
       * Editor table.css overflow:hidden + backdrop-filter also fight
       * fragmentation — neutralize them in print.
       */
      table,
      table.table-plus,
      .table-plus-wrapper,
      .ProseMirror table,
      .ProseMirror table.table-plus,
      .ProseMirror .table-plus-wrapper {
        break-inside: auto !important;
        page-break-inside: auto !important;
        overflow: visible !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        filter: none !important;
      }
      table tr,
      table.table-plus tr,
      .ProseMirror table tr,
      .table-plus-wrapper tr {
        break-inside: auto !important;
        page-break-inside: auto !important;
      }
      table thead,
      table.table-plus thead {
        display: table-header-group !important;
      }
      table tbody,
      table.table-plus tbody {
        display: table-row-group !important;
      }
      .rm-page-header-content,
      .rm-first-page-header .rm-page-header-content,
      .rm-first-page-footer .rm-page-footer-content,
      .rm-page-footer-1 .rm-page-footer-content,
      .rm-page-footer-content,
      .rm-with-pagination .rm-page-header-content,
      .rm-with-pagination .rm-first-page-footer .rm-page-footer-content,
      .rm-with-pagination .rm-page-footer-1 .rm-page-footer-content,
      .rm-with-pagination .rm-page-footer-content {
        display: flex !important;
        flex-direction: row !important;
        align-items: flex-start !important;
        width: 100% !important;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        padding-left: var(--rm-margin-left, 0px) !important;
        padding-right: var(--rm-margin-right, 0px) !important;
        margin: 0 !important;
        box-sizing: border-box !important;
      }
      .rm-page-header-left,
      .rm-first-page-footer .rm-page-footer-left,
      .rm-page-footer-1 .rm-page-footer-left,
      .rm-page-footer-left,
      .rm-with-pagination .rm-page-header-left,
      .rm-with-pagination .rm-first-page-footer .rm-page-footer-left,
      .rm-with-pagination .rm-page-footer-1 .rm-page-footer-left,
      .rm-with-pagination .rm-page-footer-left {
        flex: 1 1 100% !important;
        min-width: 0 !important;
        float: none !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .rm-page-header-right,
      .rm-first-page-footer .rm-page-footer-right,
      .rm-page-footer-1 .rm-page-footer-right,
      .rm-page-footer-right,
      .rm-with-pagination .rm-page-header-right,
      .rm-with-pagination .rm-first-page-footer .rm-page-footer-right,
      .rm-with-pagination .rm-page-footer-1 .rm-page-footer-right,
      .rm-with-pagination .rm-page-footer-right {
        display: none !important;
      }
      /* Match plugin runtime style: do not print synthetic header after last page break. */
      .rm-with-pagination .rm-page-break:last-child .rm-page-header,
      [data-rm-pagination] > .rm-page-break:last-child .rm-page-header {
        display: none !important;
      }
      /*
       * Header/footer images — unsized logos cap to ruler band height (PDF-safe).
       * hf-sized-img keeps stored width from the HF editor.
       */
      .rm-page-header img,
      .rm-first-page-header img,
      .rm-page-footer img,
      .rm-first-page-footer img,
      .rm-page-footer-1 img,
      .rm-with-pagination .rm-page-header img,
      .rm-with-pagination .rm-first-page-header img,
      .rm-with-pagination .rm-page-footer img,
      .rm-with-pagination .rm-first-page-footer img,
      .rm-with-pagination .rm-page-footer-1 img,
      [data-rm-pagination] .rm-page-header img,
      [data-rm-pagination] .rm-page-footer img {
        display: inline-block !important;
        max-width: 100% !important;
        height: auto !important;
        object-fit: contain !important;
        vertical-align: middle !important;
      }
      .rm-page-header img:not(.hf-sized-img):not([data-hf-img-width]):not([style*="width:"]),
      .rm-first-page-header img:not(.hf-sized-img):not([data-hf-img-width]):not([style*="width:"]),
      .rm-with-pagination .rm-page-header img:not(.hf-sized-img):not([data-hf-img-width]):not([style*="width:"]),
      .rm-with-pagination .rm-first-page-header img:not(.hf-sized-img):not([data-hf-img-width]):not([style*="width:"]),
      [data-rm-pagination] .rm-page-header img:not(.hf-sized-img):not([data-hf-img-width]):not([style*="width:"]) {
        max-height: var(--rm-margin-top, 32px) !important;
        width: auto !important;
      }
      .rm-page-footer img:not(.hf-sized-img):not([data-hf-img-width]):not([style*="width:"]),
      .rm-first-page-footer img:not(.hf-sized-img):not([data-hf-img-width]):not([style*="width:"]),
      .rm-page-footer-1 img:not(.hf-sized-img):not([data-hf-img-width]):not([style*="width:"]),
      .rm-with-pagination .rm-page-footer img:not(.hf-sized-img):not([data-hf-img-width]):not([style*="width:"]),
      .rm-with-pagination .rm-first-page-footer img:not(.hf-sized-img):not([data-hf-img-width]):not([style*="width:"]),
      .rm-with-pagination .rm-page-footer-1 img:not(.hf-sized-img):not([data-hf-img-width]):not([style*="width:"]),
      [data-rm-pagination] .rm-page-footer img:not(.hf-sized-img):not([data-hf-img-width]):not([style*="width:"]) {
        max-height: var(--rm-margin-bottom, 32px) !important;
        width: auto !important;
      }
      /* Son aralık: plugin display:none; :last-child bazen eşleşmez — last-of-type + doğrudan çocuk. */
      [data-rm-pagination] > .rm-page-break:last-of-type .rm-pagination-gap,
      [data-rm-pagination] > .rm-page-break:last-child .rm-pagination-gap,
      .rm-with-pagination .rm-page-break:last-of-type .rm-pagination-gap,
      .rm-with-pagination .rm-page-break:last-child .rm-pagination-gap {
        display: none !important;
      }
      /*
       * Page/section break markers are only UI in the editor; for paginated
       * print we let PaginationPlus' geometry decide where pages break.
       * Forcing extra page breaks here stacks Chromium breaks on top of
       * PaginationPlus' float-driven boundaries → empty PDF pages.
       */
      [data-rm-pagination] .page-break {
        break-after: auto !important;
        page-break-after: auto !important;
      }
      [data-rm-pagination] p[data-nomai-section-start="nextPage"] {
        break-before: auto !important;
        page-break-before: auto !important;
      }
      /* Never print table resize/edit controls. */
      .table-plus-wrapper .handle,
      .table-plus-wrapper .slider,
      .ProseMirror .handle,
      .ProseMirror .slider,
      .column-resize-handle,
      [data-resize-handle],
      .grip-column,
      .grip-row,
      .grip-table {
        display: none !important;
        visibility: hidden !important;
      }
      .ProseMirror .selectedCell::after {
        display: none !important;
        border: 0 !important;
        background: transparent !important;
      }
      /*
       * Export clones live NodeViews (not Tailwind-rendered HTML), so image
       * utility classes like w-full/h-auto are unavailable in print window.
       * Force deterministic sizing to avoid image pages eating extra lines.
       */
      .image-resizer-wrapper {
        width: 100% !important;
        box-sizing: border-box !important;
      }
      .image-resizer-wrapper > div {
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
      .image-resizer-wrapper img {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
      }
      .uyap-verification-block {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        margin-top: 1.5rem !important;
      }
      .uyap-verification-block table {
        width: 100% !important;
        border: none !important;
      }
      .uyap-verification-block img {
        width: 120px !important;
        height: 120px !important;
        max-width: 120px !important;
      }
    }
    `;
}

/**
 * Paginated print `@page` rule.
 *
 * True A4 = 210mm × 297mm = 595.276pt × 841.890pt. The CSS keyword `A4` and
 * Electron's `pageSize: 'A4'` both resolve to a slightly-off value on this
 * Skia build (595.92 × 842.88pt). Writing the dimensions explicitly as
 * `210mm 297mm` produces exact A4 (`pdfinfo` reports 595.28 × 841.89).
 *
 * The top/bottom margins reserve the header/footer band height on EVERY
 * printed sheet so `position: fixed` chrome (pinned header/footer) never
 * overlaps body text. Horizontal page margins are handled by the ProseMirror
 * root padding, so left/right @page margins stay 0. CSS variables do not
 * propagate to `@page`, so the band heights must be inlined as literal px.
 */
function buildPaginatedAtPageRule(
    pageMarginPx?: { top: number; bottom: number },
): string {
    const top = Math.max(0, Math.round(pageMarginPx?.top ?? 0));
    const bottom = Math.max(0, Math.round(pageMarginPx?.bottom ?? 0));
    return `@page { size: 210mm 297mm; margin: ${top}px 0 ${bottom}px 0; }`;
}

export type NativePdfPageMarginsPx = {
    top: number;
    right: number;
    bottom: number;
    left: number;
};

/**
 * Body document for the overlay pipeline. Content is TipTap HTML (no PaginationPlus
 * widgets). `@page` margins are the ruler box so Chromium paginates inside it.
 * Header/footer are not in this document; they are stamped later.
 */
export function buildNativeBodyPdfHtml(input: {
    bodyInnerHtml: string;
    title?: string;
    margins: NativePdfPageMarginsPx;
    offlineFontFaceCss?: string;
    typographyDecls?: string;
}): string {
    const top = Math.max(0, Math.round(input.margins.top));
    const right = Math.max(0, Math.round(input.margins.right));
    const bottom = Math.max(0, Math.round(input.margins.bottom));
    const left = Math.max(0, Math.round(input.margins.left));
    const title = input.title ?? 'Belge';
    const typography =
        input.typographyDecls ??
        `font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.45; color: #111`;
    return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)}</title>
  ${input.offlineFontFaceCss ? getPdfFontFaceStyleBlock(input.offlineFontFaceCss) : ''}
  <style>
    @page { size: 210mm 297mm; margin: ${top}px ${right}px ${bottom}px ${left}px; }
    html, body { margin: 0 !important; padding: 0 !important; box-sizing: border-box !important; }
    body {
      ${typography};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .udf-pdf-body p { margin: 0; white-space: pre-wrap; word-wrap: break-word; }
    table, .table-plus, .table-plus-wrapper, tr, td, th {
      break-inside: auto;
      page-break-inside: auto;
    }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #000; padding: 6px 8px; vertical-align: top; }
    ${getListStylesCSS()}
    ${getExportBulletListCss()}
    ${getUdfixBreakAndSectionCss()}
  </style>
</head>
<body>
  <div class="udf-pdf-body">${input.bodyInnerHtml}</div>
</body>
</html>`;
}

export function buildPdfDocumentHtml(
    bodyHtml: string,
    title = 'Belge',
    extraHeadStyles?: string,
    opts?: {
        paginatedDomPdf?: boolean;
        paginatedBodyTypographyDecls?: string;
        paginatedBodyInsetDecls?: string;
        /** Inline @font-face (base64 woff2) for bundled families — no network */
        offlineFontFaceCss?: string;
        /** Header/footer band heights (px) inlined into the @page top/bottom margins. */
        pageMarginPx?: { top: number; bottom: number };
    },
): string {
    const listCss = getListStylesCSS();
    const breakCss = opts?.paginatedDomPdf ? getUdfixBreakAndSectionCssForPaginatedDomPdf() : getUdfixBreakAndSectionCss();
    const ulCss = getExportBulletListCss();

    const pageRule = opts?.paginatedDomPdf
        ? buildPaginatedAtPageRule(opts?.pageMarginPx)
        : '@page { size: 210mm 297mm; margin: 18mm 16mm 20mm 16mm; }';
    const paginatedShellCss = opts?.paginatedDomPdf
        ? `
    /* Keep live editor geometry (padding/margins) from ProseMirror inline styles. */
    .ProseMirror.rm-with-pagination {
      margin: 0 !important;
      outline: none !important;
      box-shadow: none !important;
      border: none !important;
    }
    [data-rm-pagination] {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      outline: none !important;
      box-shadow: none !important;
      border: none !important;
    }
    `
        : '';
    const bodyTypographyDecls =
        opts?.paginatedDomPdf && opts.paginatedBodyTypographyDecls
            ? opts.paginatedBodyTypographyDecls
            : `font-family: "Inter", "Segoe UI", system-ui, sans-serif;
      font-size: 11pt;
      line-height: 1.45;
      color: #111`;
    const bodyPaddingDecl =
        opts?.paginatedDomPdf
            ? 'padding-top: 0 !important; padding-bottom: 0 !important;'
            : '';
    const paginatedBodyGeometryDecl =
        opts?.paginatedDomPdf
            ? `width: ${EDITOR_PAGE_WIDTH_PX}px; min-width: ${EDITOR_PAGE_WIDTH_PX}px; max-width: ${EDITOR_PAGE_WIDTH_PX}px; margin: 0 auto !important;`
            : '';
    let pinnedHeaderHtml = '';
    let pinnedFooterHtml = '';
    let mainBodyHtml = bodyHtml;
    if (opts?.paginatedDomPdf) {
        const hoisted = hoistPinnedPrintChromeFromHtml(bodyHtml);
        pinnedHeaderHtml = hoisted.headerHtml;
        pinnedFooterHtml = hoisted.footerHtml;
        mainBodyHtml = hoisted.bodyHtml;
    }
    return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)}</title>
  ${opts?.offlineFontFaceCss ? getPdfFontFaceStyleBlock(opts.offlineFontFaceCss) : ''}
  <style>
    ${pageRule}
    html, body { margin: 0 !important; padding: 0 !important; box-sizing: border-box !important; }
    ${paginatedShellCss}
    body {
      ${bodyTypographyDecls};
      ${bodyPaddingDecl}
      ${paginatedBodyGeometryDecl}
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    /* Tailwind preflight is absent in the print window: reset default paragraph margins. */
    .ProseMirror p {
      margin: 0;
      line-height: inherit;
      white-space: pre-wrap;
      word-wrap: break-word;
      box-sizing: border-box;
    }
    .ProseMirror a {
      color: inherit;
      text-decoration: none;
    }
    .ProseMirror .mention,
    .ProseMirror [data-type="mention"] {
      color: inherit;
      text-decoration: none;
      display: inline;
      line-height: inherit;
      vertical-align: baseline;
      border: 0;
      background: transparent;
      padding: 0;
      font-weight: inherit;
    }
    .ProseMirror img.ProseMirror-separator {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }
    .ProseMirror :where(h1, h2, h3, h4, h5, h6) {
      line-height: 1.28;
      margin-top: 0.45em;
      margin-bottom: 0.35em;
    }
    /* Table borders come from Udfix table attrs; export color is fixed black. */
    table,
    table.table-plus {
      border-collapse: collapse;
      table-layout: fixed;
      width: 100%;
      max-width: 100%;
      border-spacing: 0;
      box-sizing: border-box;
      border: 0;
      break-inside: auto;
      page-break-inside: auto;
      overflow: visible;
    }
    .table-plus-wrapper {
      width: 100%;
      box-sizing: border-box;
      position: relative;
      break-inside: auto;
      page-break-inside: auto;
      overflow: visible;
    }
    table tr,
    table.table-plus tr {
      break-inside: auto;
      page-break-inside: auto;
    }
    table thead,
    table.table-plus thead {
      display: table-header-group;
    }
    td,
    th {
      border: var(--table-border-width, 1px) var(--table-border-style, solid)
        #000 !important;
      padding: 6px 8px;
      vertical-align: top;
      box-sizing: border-box;
    }
    th {
      font-weight: 600;
      text-align: left;
    }
    img { max-width: 100%; height: auto; }
    ${listCss}
    ${ulCss}
    ${breakCss}
    ${extraHeadStyles ?? ''}
  </style>
</head>
<body>
  ${pinnedHeaderHtml}${pinnedFooterHtml}${mainBodyHtml}
</body>
</html>`;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Map {page}/{total} to Chromium print header/footer template tokens */
export function compileHfToChromePdfSlot(html: string): string {
    let out = html;
    out = out.replace(/\{page\}/gi, '<span class="pageNumber"></span>');
    out = out.replace(/\{total\}/gi, '<span class="totalPages"></span>');
    out = out.replace(/\{totalPages\}/gi, '<span class="totalPages"></span>');
    return out;
}

export function buildPdfHeaderFooterTemplates(opts: {
    header: CompileHfOptions;
    footer: CompileHfOptions;
}): { displayHeaderFooter: boolean; headerTemplate: string; footerTemplate: string } {
    const headerInner = compileHfHtml(opts.header).trim();
    const footerInner = compileHfHtml(opts.footer).trim();
    const hasHeader = Boolean(headerInner);
    const hasFooter = Boolean(footerInner);
    const wrap = (inner: string, align: 'flex-start' | 'center' | 'flex-end') =>
        `<div style="font-size:9px;width:100%;box-sizing:border-box;padding:0 12px;display:flex;justify-content:${align};align-items:center;font-family:Inter,Segoe UI,sans-serif;color:#333;">${inner}</div>`;

    return {
        displayHeaderFooter: hasHeader || hasFooter,
        headerTemplate: hasHeader ? wrap(compileHfToChromePdfSlot(headerInner), 'flex-start') : '<span></span>',
        footerTemplate: hasFooter ? wrap(compileHfToChromePdfSlot(footerInner), 'center') : '<span></span>',
    };
}
