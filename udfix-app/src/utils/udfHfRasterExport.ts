/**
 * UDF header/footer raster export — compileHfHtml bandını html2canvas ile PNG'ye çevirir.
 * PDF/pagination ile aynı düzen; UYAP TabSet kırılganlığından kaçınır.
 */

import html2canvas from 'html2canvas';
import { buildPdfFontFaceCss } from '../fonts/pdfFontFaces';
import { compileHfHtml } from './compileHfHtml';
import { buildCompileHfOptions } from './udfHfExportColumns';
import { preprocessHfExportImages } from './udfHfExportSegments';
import { pxToUyapPt } from './uyapExportBuild';
import { resolveCssVarsInHtmlString } from './resolveCssVarsForExport';
import { sanitizeModernColorsInDom } from './sanitizeColorsForHtml2canvas';
import { applyHfImageAlignStylesToDom } from './hfImageAlignExport';
import type { HeaderFooterSection, HeaderFooterSettings } from '../stores/useHeaderFooterStore';

export type UdfHfRasterBand = {
    base64: string;
    widthPt: string;
    heightPt: string;
};

const PT_TO_PX = 96 / 72;
const RASTER_SCALE = 2;
/** Descender + border + ayırıcı çizgi için ek alt/üst pay (px). */
const HF_RASTER_CAPTURE_SLACK_PX = 10;

const HF_RASTER_BASE_CSS = `
.udf-hf-raster-root {
  box-sizing: border-box;
  color: #1e293b !important;
  font-size: 11px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
  background: transparent !important;
}
.udf-hf-raster-root p { margin: 0; color: #1e293b !important; }
.udf-hf-raster-root strong, .udf-hf-raster-root b { color: #1e293b !important; font-weight: 600; }
.udf-hf-raster-root span { color: inherit !important; }
.udf-hf-raster-root img { max-width: 100%; height: auto; vertical-align: middle; }
.udf-hf-raster-root td, .udf-hf-raster-root table { color: #1e293b !important; font-size: 11px !important; background: transparent !important; }
.udf-hf-raster-root table { border-collapse: collapse; overflow: visible; }
.udf-hf-raster-root td { overflow: visible; vertical-align: top; }
.udf-hf-raster-root div[style*="text-align:center"],
.udf-hf-raster-root div[style*="text-align: center"],
.udf-hf-raster-root p[style*="text-align:center"],
.udf-hf-raster-root p[style*="text-align: center"] { text-align: center !important; }
.udf-hf-raster-root img[data-hf-align="center"],
.udf-hf-raster-root .hf-inline-image[data-hf-align="center"] {
  display: block !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
.udf-hf-raster-root img[data-hf-align="right"],
.udf-hf-raster-root .hf-inline-image[data-hf-align="right"] {
  display: block !important;
  margin-left: auto !important;
  margin-right: 0 !important;
}
`;

function stripDynamicHfTokens(html: string): string {
    return html
        .replace(/\{page\}/gi, '')
        .replace(/\{totalPages?\}/gi, '')
        .replace(/\{total\}/gi, '');
}

function resolveSectionHtml(section: HeaderFooterSection): HeaderFooterSection {
    return {
        headerLeft: resolveCssVarsInHtmlString(section.headerLeft),
        headerCenter: resolveCssVarsInHtmlString(section.headerCenter),
        headerRight: resolveCssVarsInHtmlString(section.headerRight),
        footerLeft: resolveCssVarsInHtmlString(section.footerLeft),
        footerCenter: resolveCssVarsInHtmlString(section.footerCenter),
        footerRight: resolveCssVarsInHtmlString(section.footerRight),
    };
}

/** Preprocess HF section (image scaling, CSS vars) and strip dynamic page tokens for raster export. */
export async function prepareHfSectionForRasterExport(section: HeaderFooterSection): Promise<HeaderFooterSection> {
    return sectionWithStrippedTokens(await preprocessSectionForRaster(section));
}

async function preprocessSectionForRaster(section: HeaderFooterSection): Promise<HeaderFooterSection> {
    const scaled = await preprocessHfExportImages({
        headerLeftHtml: section.headerLeft,
        headerCenterHtml: section.headerCenter,
        headerRightHtml: section.headerRight,
        footerLeftHtml: section.footerLeft,
        footerCenterHtml: section.footerCenter,
        footerRightHtml: section.footerRight,
    });
    return resolveSectionHtml({
        headerLeft: scaled.headerLeftHtml,
        headerCenter: scaled.headerCenterHtml,
        headerRight: scaled.headerRightHtml,
        footerLeft: scaled.footerLeftHtml,
        footerCenter: scaled.footerCenterHtml,
        footerRight: scaled.footerRightHtml,
    });
}

function sectionWithStrippedTokens(section: HeaderFooterSection): HeaderFooterSection {
    return {
        headerLeft: stripDynamicHfTokens(section.headerLeft),
        headerCenter: stripDynamicHfTokens(section.headerCenter),
        headerRight: stripDynamicHfTokens(section.headerRight),
        footerLeft: stripDynamicHfTokens(section.footerLeft),
        footerCenter: stripDynamicHfTokens(section.footerCenter),
        footerRight: stripDynamicHfTokens(section.footerRight),
    };
}

function forceVisibleTextStyles(root: HTMLElement): void {
    root.style.color = '#1e293b';
    root.style.background = 'transparent';
    root.style.opacity = '1';
    root.style.visibility = 'visible';
    root.style.overflow = 'visible';

    for (const el of root.querySelectorAll<HTMLElement>('*')) {
        el.style.setProperty('color', '#1e293b', 'important');
        el.style.setProperty('-webkit-text-fill-color', '#1e293b', 'important');
        el.style.opacity = '1';
        el.style.visibility = 'visible';
        el.style.overflow = 'visible';
        const display = el.style.display;
        if (display === 'none' && el.closest('td[style*="display:none"]')) {
            continue;
        }
    }
}

/** html2canvas offsetHeight çoğu zaman tablo satırının son satırını keser; hücre tabanını ölç. */
function measureCaptureHeightPx(el: HTMLElement): number {
    let maxBottom = 0;
    const rootTop = el.getBoundingClientRect().top;

    const consider = (node: HTMLElement) => {
        const rect = node.getBoundingClientRect();
        maxBottom = Math.max(maxBottom, rect.bottom - rootTop);
    };

    consider(el);
    for (const cell of el.querySelectorAll<HTMLElement>('td, th')) {
        consider(cell);
    }

    return Math.ceil(Math.max(el.scrollHeight, el.offsetHeight, maxBottom, el.getBoundingClientRect().height));
}

async function waitForBandAssets(bandEl: HTMLElement): Promise<void> {
    if (typeof document !== 'undefined' && document.fonts?.ready) {
        await document.fonts.ready;
    }
    const imgs = Array.from(bandEl.querySelectorAll('img'));
    await Promise.all(
        imgs.map(
            (img) =>
                new Promise<void>((resolve) => {
                    if (img.complete) {
                        resolve();
                        return;
                    }
                    img.onload = () => resolve();
                    img.onerror = () => resolve();
                }),
        ),
    );
    await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
}

function findBandElement(root: HTMLElement): HTMLElement {
    const table = root.querySelector(':scope > table[role="presentation"]');
    if (table instanceof HTMLElement) return table;
    const flex = root.querySelector(':scope > div[style*="display:flex"]');
    if (flex instanceof HTMLElement) return flex;
    return root;
}

function canvasToPngBase64(canvas: HTMLCanvasElement): string {
    return canvas.toDataURL('image/png').split(',')[1] ?? '';
}

/** Tek HF band HTML → PNG (base64) + UYAP pt boyutları. */
export async function rasterizeHfBandHtml(bandHtml: string, contentWidthPt: number): Promise<UdfHfRasterBand | null> {
    const trimmed = resolveCssVarsInHtmlString((bandHtml || '').trim());
    if (!trimmed || typeof document === 'undefined') return null;

    const widthPx = Math.max(200, Math.round(contentWidthPt * PT_TO_PX));
    const fontFaceCss = await buildPdfFontFaceCss(trimmed);

    const host = document.createElement('div');
    host.setAttribute('data-udf-hf-raster-host', 'true');
    Object.assign(host.style, {
        position: 'fixed',
        left: '-12000px',
        top: '0',
        width: `${widthPx}px`,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: '-1',
    });

    const root = document.createElement('div');
    root.className = 'udf-hf-raster-root';
    root.style.width = `${widthPx}px`;
    root.style.background = 'transparent';
    root.style.overflow = 'visible';
    root.innerHTML = `<style>${fontFaceCss}\n${HF_RASTER_BASE_CSS}</style>${trimmed}`;
    host.appendChild(root);
    document.body.appendChild(host);

    const captureTarget = findBandElement(root);
    captureTarget.style.width = `${widthPx}px`;
    captureTarget.style.maxWidth = `${widthPx}px`;
    captureTarget.style.overflow = 'visible';
    captureTarget.style.boxSizing = 'border-box';
    forceVisibleTextStyles(captureTarget);
    applyHfImageAlignStylesToDom(captureTarget);
    sanitizeModernColorsInDom(root);

    try {
        await waitForBandAssets(captureTarget);
        const contentHeightPx = measureCaptureHeightPx(captureTarget);
        const captureHeightPx = contentHeightPx + HF_RASTER_CAPTURE_SLACK_PX;
        captureTarget.style.minHeight = `${contentHeightPx}px`;

        let canvas: HTMLCanvasElement;
        try {
            canvas = await html2canvas(captureTarget, {
                scale: RASTER_SCALE,
                backgroundColor: null,
                logging: false,
                useCORS: true,
                allowTaint: true,
                width: widthPx,
                height: captureHeightPx,
                windowWidth: widthPx,
                windowHeight: captureHeightPx,
                foreignObjectRendering: false,
                onclone: (_doc, element) => {
                    if (element instanceof HTMLElement) {
                        forceVisibleTextStyles(element);
                        applyHfImageAlignStylesToDom(element);
                        sanitizeModernColorsInDom(element);
                        element.style.overflow = 'visible';
                        element.style.minHeight = `${contentHeightPx}px`;
                    }
                },
            });
        } catch (err) {
            console.warn('[udfHfRasterExport] html2canvas failed; falling back to plain-text HF', err);
            return null;
        }

        const base64 = canvasToPngBase64(canvas);
        if (!base64) return null;

        const heightPx = canvas.height / RASTER_SCALE;
        if (heightPx < 8) return null;

        return {
            base64,
            widthPt: pxToUyapPt(widthPx),
            heightPt: pxToUyapPt(captureHeightPx),
        };
    } finally {
        host.remove();
    }
}

export async function buildHfRasterBandsForUdfExport(input: {
    settings: HeaderFooterSettings;
    section: HeaderFooterSection;
    documentTitle: string;
    contentWidthPt: number;
}): Promise<{ headerRaster: UdfHfRasterBand | null; footerRaster: UdfHfRasterBand | null }> {
    const processed = sectionWithStrippedTokens(await preprocessSectionForRaster(input.section));
    const docTitle = (input.documentTitle || '').trim() || 'Belge';

    const headerHtml = compileHfHtml(
        buildCompileHfOptions(input.settings, processed, true, docTitle),
    );
    const footerHtml = compileHfHtml(
        buildCompileHfOptions(input.settings, processed, false, docTitle),
    );

    const [headerRaster, footerRaster] = await Promise.all([
        rasterizeHfBandHtml(headerHtml, input.contentWidthPt),
        rasterizeHfBandHtml(footerHtml, input.contentWidthPt),
    ]);

    return { headerRaster, footerRaster };
}
