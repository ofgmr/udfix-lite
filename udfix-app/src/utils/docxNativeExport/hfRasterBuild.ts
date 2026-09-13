import { compileHfHtmlForDocx, type CompileHfOptions } from '../compileHfHtml';
import { pickExportHeaderFooterSection } from '../headerFooterExportPick';
import { resolveCssVarsInHtmlString } from '../resolveCssVarsForExport';
import { prepareHfSectionForRasterExport, rasterizeHfBandHtml, type UdfHfRasterBand } from '../udfHfRasterExport';
import { useHeaderFooterStore } from '../../stores/useHeaderFooterStore';
import { EDITOR_PAGE_WIDTH_PX } from '../editorLayout';

export type DocxHfMargins = {
    marginLeft?: number;
    marginRight?: number;
};

export function docxContentWidthPt(margins: DocxHfMargins | null | undefined): number {
    const mLeft = margins?.marginLeft ?? 50;
    const mRight = margins?.marginRight ?? 50;
    const contentWidthPx = Math.max(200, EDITOR_PAGE_WIDTH_PX - mLeft - mRight);
    return contentWidthPx * 0.75;
}

function buildCompileOptionsFromSection(
    isHeader: boolean,
    docTitle: string,
    section: ReturnType<typeof pickExportHeaderFooterSection>,
): CompileHfOptions {
    const s = useHeaderFooterStore.getState();
    return {
        left: isHeader ? section.headerLeft : section.footerLeft,
        center: isHeader ? section.headerCenter : section.footerCenter,
        right: isHeader ? section.headerRight : section.footerRight,
        layout: isHeader ? s.settings.headerLayout : s.settings.footerLayout,
        dateFormat: s.settings.dateFormat,
        docTitle,
        showSeparator: isHeader ? s.settings.showHeaderSeparatorLine : s.settings.showFooterSeparatorLine,
        separatorColor: resolveCssVarsInHtmlString(s.settings.separatorLineColor || ''),
        separatorWidth: s.settings.separatorLineWidth,
        indent: isHeader ? s.settings.headerIndent : s.settings.footerIndent,
        isHeader,
    };
}

export async function buildDocxHfRasterBands(
    docTitle: string,
    margins: DocxHfMargins | null | undefined,
): Promise<{ headerRaster: UdfHfRasterBand | null; footerRaster: UdfHfRasterBand | null; hasPageToken: boolean }> {
    const hfStore = useHeaderFooterStore.getState();
    const rawSection = pickExportHeaderFooterSection(hfStore);
    const hfCells = [
        rawSection.headerLeft,
        rawSection.headerCenter,
        rawSection.headerRight,
        rawSection.footerLeft,
        rawSection.footerCenter,
        rawSection.footerRight,
    ].join('');
    const hasPageToken = /\{page\}/i.test(hfCells);

    const processed = await prepareHfSectionForRasterExport(rawSection);
    const contentWidthPt = docxContentWidthPt(margins);

    const headerHtml = compileHfHtmlForDocx(buildCompileOptionsFromSection(true, docTitle, processed));
    const footerHtml = compileHfHtmlForDocx(buildCompileOptionsFromSection(false, docTitle, processed));

    const [headerRaster, footerRaster] = await Promise.all([
        rasterizeHfBandHtml(headerHtml, contentWidthPt),
        rasterizeHfBandHtml(footerHtml, contentWidthPt),
    ]);

    return { headerRaster, footerRaster, hasPageToken };
}
