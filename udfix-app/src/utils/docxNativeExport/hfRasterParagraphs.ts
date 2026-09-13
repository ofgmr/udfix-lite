import { AlignmentType, ImageRun, PageNumber, Paragraph, TextRun } from 'docx';
import type { UdfHfRasterBand } from '../udfHfRasterExport';
import { DEFAULT_DOCX_FONT_HALF_POINTS } from './fontSizeHalfPoints';

const PT_TO_PX = 96 / 72;

function rasterBandToImageRun(band: UdfHfRasterBand): ImageRun {
    const widthPt = Number.parseFloat(band.widthPt);
    const heightPt = Number.parseFloat(band.heightPt);
    const widthPx = Math.max(1, Math.round(widthPt * PT_TO_PX));
    const heightPx = Math.max(1, Math.round(heightPt * PT_TO_PX));
    const binary = atob(band.base64);
    const data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) data[i] = binary.charCodeAt(i);

    return new ImageRun({
        type: 'png',
        data,
        transformation: { width: widthPx, height: heightPx },
    });
}

export function rasterBandParagraph(band: UdfHfRasterBand): Paragraph {
    return new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 0, after: 0 },
        children: [rasterBandToImageRun(band)],
    });
}

export function pageNumberFooterParagraph(defaultFont: string): Paragraph {
    return new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
            new TextRun({ text: 'Sayfa ', font: defaultFont, size: DEFAULT_DOCX_FONT_HALF_POINTS }),
            new TextRun({ children: [PageNumber.CURRENT], font: defaultFont, size: DEFAULT_DOCX_FONT_HALF_POINTS }),
            new TextRun({ text: ' / ', font: defaultFont, size: DEFAULT_DOCX_FONT_HALF_POINTS }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: defaultFont, size: DEFAULT_DOCX_FONT_HALF_POINTS }),
        ],
    });
}

export function hfRasterToParagraphs(
    headerRaster: UdfHfRasterBand | null,
    footerRaster: UdfHfRasterBand | null,
    hasPageToken: boolean,
    defaultFont: string,
): { headerParagraphs: Paragraph[]; footerParagraphs: Paragraph[] } {
    const headerParagraphs = headerRaster ? [rasterBandParagraph(headerRaster)] : [];
    const footerParagraphs: Paragraph[] = [];
    if (footerRaster) footerParagraphs.push(rasterBandParagraph(footerRaster));
    if (hasPageToken) footerParagraphs.push(pageNumberFooterParagraph(defaultFont));
    return { headerParagraphs, footerParagraphs };
}
