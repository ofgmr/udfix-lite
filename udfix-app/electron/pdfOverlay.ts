/**
 * pdf-lib overlay merge for the two-pass UDF→PDF export.
 *
 * Body PDF is printed natively by Chromium (continuous text flow, A4 @page with
 * reserved top/bottom band margins, no HF chrome). HF overlay PDF is an N-page
 * document where page i carries ONLY that page's header (top) and footer
 * (bottom) variant on a transparent body. `overlayHfOnBodyPdf` stamps HF page
 * i on top of body page i with pdf-lib.
 *
 * Pure (pdf-lib-free) types + variant selection + token resolution + overlay
 * HTML assembly live in `electron/pdfOverlayShared.ts` so the renderer can
 * import them without bundling pdf-lib. This module re-exports those and adds
 * the pdf-lib-dependent page-count reader and overlay merger (main only).
 */
import { PDFDocument } from 'pdf-lib';

export {
    resolveHfVariantKey,
    resolveHfPageTokens,
    resolveHfOverlayPageHtml,
    hfOverlayHtmlLooksEmpty,
    buildHfOverlayHtmlFromPayload,
} from './pdfOverlayShared';

export type {
    HfVariantCompiled,
    HfOverlayPayload,
    ExportPdfWithOverlayPayload,
} from './pdfOverlayShared';

/**
 * Read the page count of a PDF byte stream using pdf-lib.
 */
export async function readPdfPageCount(bytes: Uint8Array): Promise<number> {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return doc.getPageCount();
}

/**
 * Overlay HF PDF page i on top of body PDF page i with pdf-lib.
 *
 * The body PDF's page size is authoritative; each HF page is scaled to fit the
 * body page's media box (HF @page is the same A4, so this is a 1:1 stamp).
 * Extra body pages (beyond the HF page count) are kept without overlay; extra
 * HF pages are dropped. Returns the merged PDF bytes.
 */
export async function overlayHfOnBodyPdf(
    bodyBytes: Uint8Array,
    hfBytes: Uint8Array,
): Promise<Uint8Array> {
    const bodyDoc = await PDFDocument.load(bodyBytes, { ignoreEncryption: true });
    const hfDoc = await PDFDocument.load(hfBytes, { ignoreEncryption: true });
    const bodyPages = bodyDoc.getPages();
    const hfPageCount = hfDoc.getPageCount();
    const stampCount = Math.min(bodyPages.length, hfPageCount);
    // pdf-lib's embedPdf defaults to indices [0]. Omitting the list embeds
    // only the first HF sheet, so pages 2+ keep an empty band.
    const embeddedHfPages =
        stampCount > 0
            ? await bodyDoc.embedPdf(
                  hfDoc,
                  Array.from({ length: stampCount }, (_, i) => i),
              )
            : [];

    for (let i = 0; i < stampCount; i += 1) {
        const hfPage = embeddedHfPages[i];
        if (!hfPage) continue;
        const bodyPage = bodyPages[i];
        const { width, height } = bodyPage.getSize();
        bodyPage.drawPage(hfPage, { x: 0, y: 0, width, height });
    }
    return bodyDoc.save();
}
