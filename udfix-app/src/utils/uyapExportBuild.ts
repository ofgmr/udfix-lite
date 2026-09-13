import type { JSONContent, TipTapMark } from '../types/tiptapContent';
import type { HeaderFooterSettings } from '../stores/useHeaderFooterStore';
import {
    EDITOR_PAGE_MARGIN_LEFT_PX,
    EDITOR_PAGE_MARGIN_RIGHT_PX,
    EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX,
} from './editorLayout';
import {
    cssMarginToUyapSpacePt,
    uyapHangingPtIsSchemaDefault,
} from './uyapImportUnits';
import {
    cssColorToUyapForeground,
    hfMarkToContentXmlAttrs,
    parseHfHtmlToLineSegmentRows,
    estimateMaxCharsForHfColumn,
    wrapHfLineSegmentRows,
    type HfExportSegment,
} from './udfHfExportSegments';
import { htmlStringToPlainText } from './htmlPlainText';
import type { UyapSignatureExportOptions } from './uyapSignature';
import type { UyapParagraphEnd } from './uyapParagraphText';

export type UyapHfLayoutPreset =
    | '1-col'
    | '2-col-70-30'
    | '2-col-30-70'
    | '2-col-80-20'
    | '2-col-20-80'
    | '3-col-equal';

export type UyapPageNumberZone = 'header' | 'footer';
export type UyapPageNumberAlignment = '0' | '1' | '2';

export interface UyapPageNumberPlacement {
    zone: UyapPageNumberZone;
    alignment: UyapPageNumberAlignment;
}

export interface UyapHfExportInput {
    /** `raster` (varsayılan): html2canvas PNG; `native`: TabSet metin (test/geri dönüş). */
    mode?: 'raster' | 'native';
    headerLayout: UyapHfLayoutPreset;
    footerLayout: UyapHfLayoutPreset;
    headerLeftHtml: string;
    headerCenterHtml: string;
    headerRightHtml: string;
    footerLeftHtml: string;
    footerCenterHtml: string;
    footerRightHtml: string;
    showHeaderSeparatorLine?: boolean;
    showFooterSeparatorLine?: boolean;
    headerRaster?: { base64: string; widthPt: string; heightPt: string } | null;
    footerRaster?: { base64: string; widthPt: string; heightPt: string } | null;
}

/** UYAP pageFormat defaults aligned with official UDF samples (~42.52 pt margins, A4 portrait). */
export const UYAP_DEFAULT_PAGE_FORMAT = {
    mediaSizeName: '1',
    leftMargin: '42.51968479156494',
    rightMargin: '42.51968479156494',
    topMargin: '42.51968479156494',
    bottomMargin: '42.51968479156494',
    paperOrientation: '1',
    headerFOffset: '20.0',
    footerFOffset: '20.0',
} as const;

export interface UyapPageFormatInput {
    mediaSizeName?: string;
    leftMargin?: string;
    rightMargin?: string;
    topMargin?: string;
    bottomMargin?: string;
    paperOrientation?: string;
    headerFOffset?: string;
    footerFOffset?: string;
    pageBorderType?: string;
    pageBorderColor?: string;
    pageBorderDisplayHorizontal?: string;
    pageBorderDisplayVertical?: string;
    pageBorderDisplayOnFirstPage?: string;
    pageBorderDistanceFrom?: string;
    pageColumns?: string;
    pageColumnSpacing?: string;
}

export interface UyapTemplateMetaInput {
    webID?: string;
    institutionID?: string;
    isTemplate?: boolean;
    description?: string;
}

export interface UyapBgImageInput {
    bgImageSource?: string;
    bgImageData?: string;
    bgImageAlign?: string;
    bgImageRepeat?: string;
    bgImageWatermark?: boolean;
    bgImageOpacity?: number;
    bgImageBottomMargin?: string;
    bgImageUpMargin?: string;
    bgImageRightMargin?: string;
    bgImageLeftMargin?: string;
}

export interface UyapPageImageInput {
    pageImageClassName?: string;
    pageImageGradientData?: string;
}

export interface UyapPropertiesInput {
    bgImage?: UyapBgImageInput;
    pageImage?: UyapPageImageInput;
    pageBorder?: Pick<
        UyapPageFormatInput,
        | 'pageBorderType'
        | 'pageBorderColor'
        | 'pageBorderDisplayHorizontal'
        | 'pageBorderDisplayVertical'
        | 'pageBorderDisplayOnFirstPage'
        | 'pageBorderDistanceFrom'
        | 'pageColumns'
        | 'pageColumnSpacing'
    >;
}

export interface UyapHeaderFooterAppearance {
    headerBackground?: string;
    headerForeground?: string;
    footerBackground?: string;
    footerForeground?: string;
}

export interface UyapPageNumberFontAttrs {
    spec?: string;
    color?: string;
    fontFace?: string;
    fontSize?: string;
    fontBold?: string;
    fontItalic?: string;
    foreStr?: string;
    afterStr?: string;
    seperator?: string;
}

export interface UyapExportBuildExtras {
    preserveOriginalContentXml?: string;
    headerHtml?: string;
    hfExport?: UyapHfExportInput;
    uyapPageNumber?: UyapPageNumberPlacement;
    /** Imported UYAP page-number attrs (e.g. `BSP32_2120`); overrides alignment-derived spec. */
    uyapPageNumberFont?: UyapPageNumberFontAttrs;
    /** `<header startPage="N">` — header band starts on page N (UYAP). */
    headerStartPage?: number;
    commentsForXml?: Array<{
        id: string;
        text: string;
        author?: string;
        resolved?: boolean;
        date?: string;
    }>;
    signature?: UyapSignatureExportOptions;
    pageFormat?: UyapPageFormatInput;
    templateMeta?: UyapTemplateMetaInput;
    properties?: UyapPropertiesInput;
    /** Raw inner XML placed inside `<data>...</data>` (without wrapper). */
    dataSectionXml?: string;
    pageNumberStart?: number;
    headerFooterAppearance?: UyapHeaderFooterAppearance;
    /** Additional ZIP entries (e.g. external image resources referenced by bgImageSource). */
    zipResources?: Record<string, Uint8Array>;
}

const UYAP_IMAGE_PLACEHOLDER_CHAR = '\u00b8';
const PX_TO_PT = 72 / 96;

const ALIGN_MAP: Record<string, string> = {
    left: '0',
    center: '1',
    right: '2',
    justify: '3',
};

const IMAGE_ALIGN_MAP: Record<string, string> = {
    left: '0',
    center: '1',
    right: '2',
};

const CELL_VALIGN_MAP: Record<string, string> = {
    top: 'top',
    middle: 'middle',
    bottom: 'bottom',
};

/** Minimal XML 1.0 attribute escaping. */
export function escapeXmlAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

export function pxToUyapPt(px: number): string {
    if (!Number.isFinite(px)) return '0';
    const pt = px * PX_TO_PT;
    if (Math.abs(pt - Math.round(pt)) < 1e-6) return String(Math.round(pt));
    return pt.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function cssSizeToPx(value: string | number | null | undefined): number | null {
    if (value == null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const raw = String(value).trim();
    if (!raw) return null;
    if (/^-?\d+(\.\d+)?$/.test(raw)) return Number.parseFloat(raw);
    const m = raw.match(/^(-?\d+(?:\.\d+)?)(px|pt|cm|mm)?$/i);
    if (!m) return null;
    const n = Number.parseFloat(m[1]);
    if (!Number.isFinite(n)) return null;
    const unit = (m[2] ?? 'px').toLowerCase();
    switch (unit) {
        case 'pt':
            return n * (96 / 72);
        case 'cm':
            return n * 37.7952755906;
        case 'mm':
            return n * 3.77952755906;
        default:
            return n;
    }
}

function cssSizeToUyapPt(value: string | number | null | undefined): string | null {
    const px = cssSizeToPx(value);
    return px == null ? null : pxToUyapPt(px);
}

function primaryFontFamilyForUyap(cssStack: string): string {
    const first = String(cssStack).split(',')[0].trim().replace(/^["']|["']$/g, '');
    return escapeXmlAttr(first);
}

function uyapTabSetAttr(attrs: JSONContent['attrs'] | undefined): string {
    const raw = attrs?.uyapTabSet;
    if (typeof raw !== 'string' || !raw.trim()) return '';
    return ` TabSet="${escapeXmlAttr(raw.trim())}"`;
}

function uyapPageNumberSpecForAlignment(alignment: '0' | '1' | '2'): string {
    switch (alignment) {
        case '0':
            return 'BSP32_08';
        case '1':
            return 'BSP32_40';
        case '2':
        default:
            return 'BSP32_72';
    }
}

function uyapPageNumberAttrsFor(
    placement: UyapPageNumberPlacement,
    pageStart?: number,
    font?: UyapPageNumberFontAttrs,
): string {
    const spec = font?.spec?.trim() || uyapPageNumberSpecForAlignment(placement.alignment);
    const color = font?.color?.trim() || '-16777216';
    const fontFace = font?.fontFace?.trim() || 'Arial';
    const fontSize = font?.fontSize?.trim() || '11';
    const foreStr = font?.foreStr != null ? font.foreStr : '';
    const afterStr = font?.afterStr != null ? font.afterStr : '';
    const fontBold = font?.fontBold != null ? ` pageNumber-fontBold="${escapeXmlAttr(font.fontBold)}"` : '';
    const fontItalic = font?.fontItalic != null ? ` pageNumber-fontItalic="${escapeXmlAttr(font.fontItalic)}"` : '';
    const seperator = font?.seperator != null ? ` pageNumber-seperator="${escapeXmlAttr(font.seperator)}"` : '';
    const start =
        pageStart != null && Number.isFinite(pageStart) && pageStart !== 1
            ? ` pageNumber-pageStartNumStr="${Math.max(1, Math.floor(pageStart))}"`
            : '';
    return ` pageNumber-spec="${escapeXmlAttr(spec)}" pageNumber-color="${escapeXmlAttr(color)}" pageNumber-fontFace="${escapeXmlAttr(fontFace)}" pageNumber-fontSize="${escapeXmlAttr(fontSize)}" pageNumber-foreStr="${escapeXmlAttr(foreStr)}" pageNumber-afterStr="${escapeXmlAttr(afterStr)}"${fontBold}${fontItalic}${seperator}${start}`;
}

export function buildPageFormatFromMargins(
    margins?: {
        marginTop: number;
        marginBottom: number;
        marginLeft: number;
        marginRight: number;
    } | null,
    hf?: Pick<HeaderFooterSettings, 'headerMarginTop' | 'footerMarginBottom'>,
): UyapPageFormatInput {
    const left = margins?.marginLeft ?? EDITOR_PAGE_MARGIN_LEFT_PX;
    const right = margins?.marginRight ?? EDITOR_PAGE_MARGIN_RIGHT_PX;
    const top = margins?.marginTop ?? EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX;
    const bottom = margins?.marginBottom ?? EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX;
    const headerOffset = hf?.headerMarginTop != null ? Math.max(0, hf.headerMarginTop) + 20 : 20;
    const footerOffset = hf?.footerMarginBottom != null ? Math.max(0, hf.footerMarginBottom) + 20 : 20;
    return {
        mediaSizeName: UYAP_DEFAULT_PAGE_FORMAT.mediaSizeName,
        leftMargin: pxToUyapPt(left),
        rightMargin: pxToUyapPt(right),
        topMargin: pxToUyapPt(top),
        bottomMargin: pxToUyapPt(bottom),
        paperOrientation: UYAP_DEFAULT_PAGE_FORMAT.paperOrientation,
        headerFOffset: pxToUyapPt(headerOffset),
        footerFOffset: pxToUyapPt(footerOffset),
    };
}

function collectFootnotesFromTipTapJson(doc: JSONContent): Array<{ id: string; number: number; plain: string }> {
    const byId = new Map<string, { id: string; number: number; plain: string }>();
    const walk = (node: JSONContent | undefined) => {
        if (!node) return;
        if (node.type === 'text' && node.marks?.length) {
            for (const m of node.marks as TipTapMark[]) {
                if (m.type === 'footnote' && m.attrs?.id) {
                    const id = String(m.attrs.id);
                    if (byId.has(id)) continue;
                    const html = String(m.attrs.content ?? '');
                    const plain = htmlStringToPlainText(html).replace(/\r\n/g, '\n').trim();
                    const number = Number(m.attrs.number);
                    byId.set(id, {
                        id,
                        number: Number.isFinite(number) ? number : byId.size + 1,
                        plain,
                    });
                }
            }
        }
        if (Array.isArray(node.content)) {
            node.content.forEach(walk);
        }
    };
    if (doc?.content) {
        doc.content.forEach(walk);
    }
    return Array.from(byId.values()).sort((a, b) => a.number - b.number);
}

function hfEmitPlan(
    layout: UyapHfLayoutPreset,
    left: string,
    center: string,
    right: string,
): Array<{ html: string; alignment: string }> {
    const L = (left || '').trim();
    const C = (center || '').trim();
    const R = (right || '').trim();
    switch (layout) {
        case '1-col':
            if (C) return [{ html: center || '', alignment: '1' }];
            if (L) return [{ html: left || '', alignment: '1' }];
            if (R) return [{ html: right || '', alignment: '1' }];
            return [];
        case '2-col-70-30':
        case '2-col-80-20':
        case '2-col-30-70':
        case '2-col-20-80':
            return [
                ...(L ? [{ html: left || '', alignment: '0' }] : []),
                ...(R ? [{ html: right || '', alignment: '2' }] : []),
            ];
        case '3-col-equal':
        default:
            return [
                ...(L ? [{ html: left || '', alignment: '0' }] : []),
                ...(C ? [{ html: center || '', alignment: '1' }] : []),
                ...(R ? [{ html: right || '', alignment: '2' }] : []),
            ];
    }
}

const A4_WIDTH_PT = 595.28;

export function uyapContentWidthPt(pageFormat: UyapPageFormatInput): number {
    const left = Number.parseFloat(pageFormat.leftMargin ?? UYAP_DEFAULT_PAGE_FORMAT.leftMargin);
    const right = Number.parseFloat(pageFormat.rightMargin ?? UYAP_DEFAULT_PAGE_FORMAT.rightMargin);
    return Math.max(180, A4_WIDTH_PT - left - right);
}

function uyapHfTabSetForLayout(layout: UyapHfLayoutPreset, contentWidthPt: number): string | null {
    switch (layout) {
        case '1-col':
            return null;
        case '2-col-70-30':
            return `${(contentWidthPt * 0.7).toFixed(1)}:2:0`;
        case '2-col-80-20':
            return `${(contentWidthPt * 0.8).toFixed(1)}:2:0`;
        case '2-col-30-70':
            return `${(contentWidthPt * 0.3).toFixed(1)}:2:0`;
        case '2-col-20-80':
            return `${(contentWidthPt * 0.2).toFixed(1)}:2:0`;
        case '3-col-equal':
        default: {
            const t1 = contentWidthPt / 3;
            const t2 = (2 * contentWidthPt) / 3;
            return `${t1.toFixed(1)}:0:0,${t2.toFixed(1)}:2:0`;
        }
    }
}

function hfColumnWidthPt(layout: UyapHfLayoutPreset, colIndex: number, contentWidthPt: number): number {
    switch (layout) {
        case '2-col-70-30':
            return colIndex === 0 ? contentWidthPt * 0.7 : contentWidthPt * 0.3;
        case '2-col-80-20':
            return colIndex === 0 ? contentWidthPt * 0.8 : contentWidthPt * 0.2;
        case '2-col-30-70':
            return colIndex === 0 ? contentWidthPt * 0.3 : contentWidthPt * 0.7;
        case '2-col-20-80':
            return colIndex === 0 ? contentWidthPt * 0.2 : contentWidthPt * 0.8;
        case '3-col-equal':
        default:
            return contentWidthPt / 3;
    }
}

const HF_PARAGRAPH_STYLE_ATTRS = 'name="hvl-default" description="Gövde"';

function appendHfLineSegments(acc: TextAccumulator, segments: HfExportSegment[]): string {
    let xml = '';
    for (const seg of segments) {
        if (seg.type === 'image') {
            const appended = acc.append(UYAP_IMAGE_PLACEHOLDER_CHAR);
            xml += `<image imageData="${seg.base64}" width="${seg.widthPt}" height="${seg.heightPt}" startOffset="${appended.start}" length="${appended.length}" />`;
        } else if (seg.text.length) {
            const styleAttrs = hfMarkToContentXmlAttrs(seg.mark);
            xml += emitTextWithTabsAndSpaces(acc, seg.text, ` name="hvl-default" description="Gövde"${styleAttrs}`);
        }
    }
    return xml;
}

/** Layout'a göre sabit sol/orta/sağ slot dizisi (boş sütunlar dahil). */
function hfLayoutColumnSlots(
    layout: UyapHfLayoutPreset,
    leftHtml: string,
    centerHtml: string,
    rightHtml: string,
): string[] {
    switch (layout) {
        case '1-col':
            return [(centerHtml || '').trim() || (leftHtml || '').trim() || (rightHtml || '').trim()];
        case '2-col-70-30':
        case '2-col-80-20':
        case '2-col-30-70':
        case '2-col-20-80':
            return [leftHtml, rightHtml];
        case '3-col-equal':
        default:
            return [leftHtml, centerHtml, rightHtml];
    }
}

function appendHfParagraphClose(acc: TextAccumulator): string {
    const appendedBreak = acc.append('\n');
    return `<content startOffset="${appendedBreak.start}" length="${appendedBreak.length}" />`;
}

/** Tek sütun: her satır ayrı paragraf (UYAP header çok satır modeli). */
function appendHfStackedLineParagraphs(
    acc: TextAccumulator,
    columnHtml: string,
    alignment: '0' | '1' | '2',
): string {
    const rows = parseHfHtmlToLineSegmentRows(columnHtml);
    if (!rows.length) return '';

    let xml = '';
    for (const lineSegs of rows) {
        xml += `<paragraph Alignment="${alignment}" ${HF_PARAGRAPH_STYLE_ATTRS}>`;
        xml += appendHfLineSegments(acc, lineSegs);
        xml += appendHfParagraphClose(acc);
        xml += '</paragraph>';
    }
    return xml;
}

/**
 * UYAP HF band: çok satırlı sütunlarda her satır ayrı TabSet paragrafı.
 * Tek paragrafta `\n` tab duraklarını sıfırlar (sütunlar kaybolur).
 */
function appendHfTabbedBandParagraph(
    acc: TextAccumulator,
    layout: UyapHfLayoutPreset,
    leftHtml: string,
    centerHtml: string,
    rightHtml: string,
    contentWidthPt: number,
): string {
    const slots = hfLayoutColumnSlots(layout, leftHtml, centerHtml, rightHtml);
    const hasContent = slots.some((html) => (html || '').trim());
    if (!hasContent) return '';

    if (layout === '1-col') {
        return appendHfStackedLineParagraphs(acc, slots[0], '1');
    }

    const rowSets = slots.map((html, colIdx) => {
        const rows = parseHfHtmlToLineSegmentRows(html);
        const colWidth = hfColumnWidthPt(layout, colIdx, contentWidthPt);
        const fontSizePt =
            rows.flat().find((s): s is Extract<HfExportSegment, { type: 'text' }> => s.type === 'text')?.mark
                .size ?? '11';
        const maxChars = estimateMaxCharsForHfColumn(colWidth, parseFloat(fontSizePt) || 11);
        return wrapHfLineSegmentRows(rows, maxChars);
    });
    const maxRows = Math.max(0, ...rowSets.map((rows) => rows.length));
    if (maxRows === 0) return '';

    const tabSet = uyapHfTabSetForLayout(layout, contentWidthPt);
    let xml = '';
    for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
        xml += `<paragraph Alignment="0" ${HF_PARAGRAPH_STYLE_ATTRS}`;
        if (tabSet) xml += ` TabSet="${escapeXmlAttr(tabSet)}"`;
        xml += '>';

        slots.forEach((_html, colIdx) => {
            if (colIdx > 0) xml += emitTabElement(acc);
            const lineSegs = rowSets[colIdx][rowIdx] ?? [];
            if (lineSegs.length) xml += appendHfLineSegments(acc, lineSegs);
        });
        xml += appendHfParagraphClose(acc);
        xml += '</paragraph>';
    }
    return xml;
}

function appendHfRasterImageParagraph(
    acc: TextAccumulator,
    raster: { base64: string; widthPt: string; heightPt: string },
    alignment: '0' | '1' | '2',
): string {
    let xml = `<paragraph Alignment="${alignment}" ${HF_PARAGRAPH_STYLE_ATTRS}>`;
    const appended = acc.append(UYAP_IMAGE_PLACEHOLDER_CHAR);
    xml += `<image imageData="${raster.base64}" width="${raster.widthPt}" height="${raster.heightPt}" startOffset="${appended.start}" length="${appended.length}" />`;
    xml += appendHfParagraphClose(acc);
    xml += '</paragraph>';
    return xml;
}

function hfExportUsesRaster(hf: UyapHfExportInput): boolean {
    return hf.mode !== 'native' && Boolean(hf.headerRaster || hf.footerRaster);
}

/** Header alt / footer üst ayırıcı çizgi (CSS border yerine underline kural). */
function appendHfSeparatorRuleParagraph(
    acc: TextAccumulator,
    contentWidthPt: number,
    isHeader: boolean,
): string {
    // ~61 karakter @520pt iç genişlik (UYAP elle düzenlenmiş örnek); /9.5 kısa, /4.2 çift satır.
    const charCount = Math.min(72, Math.max(40, Math.floor(contentWidthPt / 8.5)));
    const line = '\u2500'.repeat(charCount);
    const spaceAbove = '0.0';
    const spaceBelow = isHeader ? '2.0' : '1.0';
    const appendedLine = acc.append(line);
    const appendedBreak = acc.append('\n');
    return (
        `<paragraph Alignment="1" SpaceAbove="${spaceAbove}" SpaceBelow="${spaceBelow}" ${HF_PARAGRAPH_STYLE_ATTRS}>` +
        `<content startOffset="${appendedLine.start}" length="${appendedLine.length}" underline="true" name="hvl-default" description="Gövde" />` +
        `<content startOffset="${appendedBreak.start}" length="${appendedBreak.length}" />` +
        `</paragraph>`
    );
}

function parseCommentTimeMs(date?: string): number {
    if (!date) return Date.now();
    const t = Date.parse(date);
    return Number.isFinite(t) ? t : Date.now();
}

function buildCommentsXml(
    ordered: Array<{ id: string; text: string; author?: string; date?: string }>,
    ranges: Map<string, { start: number; endExclusive: number }>,
): string | null {
    let commentsCdata = '';
    let elementsInner = '';
    let indx = 0;
    for (const row of ordered) {
        const text = (row.text || '').replace(/\r\n/g, '\n');
        if (!text.trim()) continue;
        const range = ranges.get(row.id);
        if (!range || range.endExclusive <= range.start) continue;
        const startOff = commentsCdata.length;
        const len = text.length;
        commentsCdata += text;
        commentsCdata += '\n\n';
        const time = parseCommentTimeMs(row.date);
        const usr = escapeXmlAttr(row.author || '');
        elementsInner += `<comment time="${time}" usr="${usr}" type="1" strtOffs="${range.start}" endOffs="${range.endExclusive}" indx="${indx}"><paragraph resolver="nmr"><content startOffset="${startOff}" length="${len}"/></paragraph></comment>`;
        indx++;
    }
    if (!elementsInner) return null;
    const styles = `<styles><style name="default" description="Geçerli" family="Lucida Grande" size="13" bold="false" italic="false" FONT_ATTRIBUTE_KEY="com.apple.laf.AquaFonts$DerivedUIResourceFont[family=Lucida Grande,name=Lucida Grande,style=plain,size=13]" /><style name="hvl-default" family="Times New Roman" size="12" description="Gövde" /><style name="nmr" description="nmr" Alignment="3" family="Times New Roman" size="12" LeftIndent="8.503938" LineSpacing="0.14999998" SpaceAbove="8.503938" SpaceBelow="8.503938" foreground="-16777216" /></styles>`;
    return `<?xml version="1.0" encoding="UTF-8" ?> 

<template format_id="1.8" >
<content><![CDATA[${commentsCdata}]]></content>
<elements resolver="hvl-default" >
${elementsInner}
</elements>
${styles}
</template>`;
}

interface TextAccumulator {
    rawText: string;
    offset: number;
    append(text: string): { start: number; length: number };
}

function uyapParagraphEndForExport(node: JSONContent): UyapParagraphEnd {
    return node.attrs?.nomaiUyapParagraphEnd === '\n\n' ? '\n\n' : '\n';
}

function appendUyapParagraphEndContent(acc: TextAccumulator, node: JSONContent): string {
    if (node.attrs?.nomaiUyapSuppressParagraphEnd) return '';
    const end = uyapParagraphEndForExport(node);
    const appendedBreak = acc.append(end);
    return `<content startOffset="${appendedBreak.start}" length="${appendedBreak.length}" />`;
}

function createTextAccumulator(): TextAccumulator {
    const acc: TextAccumulator = {
        rawText: '',
        offset: 0,
        append(text: string) {
            const start = this.offset;
            this.rawText += text;
            this.offset += text.length;
            return { start, length: text.length };
        },
    };
    return acc;
}

function marksToContentAttrs(marks: TipTapMark[] | undefined, styleRef?: string): string {
    let attributes = styleRef ? ` style="${escapeXmlAttr(styleRef)}"` : '';
    if (!marks?.length) return attributes;

    for (const mark of marks) {
        if (mark.type === 'footnote') {
            attributes += ' superscript="true"';
            continue;
        }
        if (mark.type === 'bold') attributes += ' bold="true"';
        if (mark.type === 'italic') attributes += ' italic="true"';
        if (mark.type === 'underline') attributes += ' underline="true"';
        if (mark.type === 'strike') attributes += ' strikethrough="true"';
        if (mark.type === 'superscript') attributes += ' superscript="true"';
        if (mark.type === 'subscript') attributes += ' subscript="true"';
        if (mark.type === 'textStyle') {
            const attrs = mark.attrs;
            if (attrs?.fontFamily) {
                const fam = primaryFontFamilyForUyap(String(attrs.fontFamily));
                if (fam) attributes += ` family="${fam}"`;
            }
            if (attrs?.fontSize) {
                attributes += ` size="${escapeXmlAttr(String(attrs.fontSize).replace(/pt/gi, '').replace(/px/gi, ''))}"`;
            }
            if (attrs?.color) {
                const fg = cssColorToUyapForeground(String(attrs.color));
                if (fg) attributes += ` foreground="${fg}"`;
                else attributes += ` foreground="${escapeXmlAttr(String(attrs.color))}"`;
            }
        }
        if (mark.type === 'highlight') {
            const bg = cssColorToUyapForeground(String(mark.attrs?.color ?? '#ffff00'));
            attributes += bg ? ` background="${bg}"` : ' background="-256"';
        }
    }
    return attributes;
}

function emitTabElement(acc: TextAccumulator): string {
    const tabApp = acc.append('\t');
    return `<tab startOffset="${tabApp.start}" length="${tabApp.length}" />`;
}

function emitSpaceElement(acc: TextAccumulator): string {
    const spaceApp = acc.append(' ');
    return `<space startOffset="${spaceApp.start}" length="${spaceApp.length}" />`;
}

/**
 * UYAP: kelime içi boşluklar `<content>` içinde kalır; stiller/elemanlar arası tek boşluk
 * genelde `<space length="1" />` (CDATA’da yine `' '` karakteri).
 */
function emitTextSliceWithSpaces(
    acc: TextAccumulator,
    slice: string,
    markAttrs: string,
    onSegment?: (start: number, endExclusive: number) => void,
): string {
    if (!slice.length) return '';

    if (slice === ' ') {
        return emitSpaceElement(acc);
    }

    if (slice.trim() === '') {
        let xml = '';
        for (const ch of slice) {
            if (ch === ' ') {
                xml += emitSpaceElement(acc);
            } else {
                const appended = acc.append(ch);
                xml += `<content startOffset="${appended.start}" length="${appended.length}"${markAttrs} />`;
                onSegment?.(appended.start, appended.start + appended.length);
            }
        }
        return xml;
    }

    const appended = acc.append(slice);
    const xml = `<content startOffset="${appended.start}" length="${appended.length}"${markAttrs} />`;
    onSegment?.(appended.start, appended.start + appended.length);
    return xml;
}

function emitTextWithTabsAndSpaces(
    acc: TextAccumulator,
    text: string,
    markAttrs: string,
    onSegment?: (start: number, endExclusive: number) => void,
    useTabElements = false,
): string {
    if (!useTabElements) {
        return emitTextSliceWithSpaces(acc, text, markAttrs, onSegment);
    }
    let xml = '';
    let i = 0;
    while (i <= text.length) {
        const tabIdx = text.indexOf('\t', i);
        const nextBreak = tabIdx === -1 ? text.length : tabIdx;
        if (nextBreak > i) {
            const slice = text.slice(i, nextBreak);
            xml += emitTextSliceWithSpaces(acc, slice, markAttrs, onSegment);
        }
        if (tabIdx === -1) break;
        xml += emitTabElement(acc);
        i = tabIdx + 1;
    }
    return xml;
}

function resolveParagraphStyleRef(node: JSONContent): string | undefined {
    const blockStyle = node.attrs?.nomaiBlockStyle;
    if (blockStyle === 'title') return 'UDFIX-Title';
    if (blockStyle === 'subtitle') return 'UDFIX-Subtitle';
    if (node.type === 'heading') {
        const level = Number(node.attrs?.level ?? 1);
        if (level >= 1 && level <= 6) return `UDFIX-H${level}`;
    }
    return undefined;
}

function buildParagraphOpenTag(node: JSONContent, listLevel: number): string {
    const attrs = node.attrs ?? {};
    const align = attrs.textAlign ? ALIGN_MAP[String(attrs.textAlign)] ?? '0' : '0';
    const parts = [`Alignment="${align}"`];

    let leftIndentPt: number | null = null;
    if (listLevel >= 0) {
        leftIndentPt = (listLevel + 1) * 25;
    }
    const marginLeftPt = cssSizeToPx(attrs.marginLeft);
    if (marginLeftPt != null && marginLeftPt > 0) {
        leftIndentPt = (leftIndentPt ?? 0) + marginLeftPt * PX_TO_PT;
    }
    if (leftIndentPt != null && leftIndentPt > 0) {
        parts.push(`LeftIndent="${leftIndentPt.toFixed(4).replace(/\.?0+$/, (m) => (m.startsWith('.') ? '' : m))}"`);
    }

    const rightPt = cssSizeToUyapPt(attrs.marginRight);
    if (rightPt) parts.push(`RightIndent="${rightPt}"`);

    const textIndentPx = cssSizeToPx(attrs.textIndent);
    if (textIndentPx != null && textIndentPx !== 0) {
        if (textIndentPx >= 0) {
            parts.push(`FirstLineIndent="${pxToUyapPt(textIndentPx)}"`);
        } else {
            const hangingPt = Math.abs(textIndentPx) * PX_TO_PT;
            if (!uyapHangingPtIsSchemaDefault(hangingPt)) {
                parts.push(`Hanging="${pxToUyapPt(Math.abs(textIndentPx))}"`);
            }
        }
    }

    const spaceAbove = cssMarginToUyapSpacePt('above', attrs.marginTop);
    if (spaceAbove) parts.push(`SpaceAbove="${spaceAbove}"`);

    const spaceBelow = cssMarginToUyapSpacePt('below', attrs.marginBottom);
    if (spaceBelow) parts.push(`SpaceBelow="${spaceBelow}"`);

    const lineHeight = attrs.lineHeight != null ? String(attrs.lineHeight).trim() : '';
    if (lineHeight && lineHeight !== '1.5') {
        parts.push(`LineSpacing="${escapeXmlAttr(lineHeight)}"`);
    }

    if (attrs.keepWithNext) parts.push('KeepWithNext="true"');

    const styleRef = resolveParagraphStyleRef(node);
    if (styleRef) {
        parts.push(`name="${escapeXmlAttr(styleRef)}"`);
    }

    const tabSet = uyapTabSetAttr(attrs);
    return `<paragraph ${parts.join(' ')}${tabSet}>`;
}

function buildImageElement(attrs: Record<string, unknown> | undefined, acc: TextAccumulator): string {
    const src = attrs?.src;
    if (typeof src !== 'string' || !src.trim()) return '';
    let base64Data = '';
    if (src.startsWith('data:') && src.includes(',')) {
        base64Data = src.split(',')[1] ?? '';
    } else if (/^[A-Za-z0-9+/=\s]+$/.test(src.trim()) && src.trim().length > 64) {
        base64Data = src.trim().replace(/\s/g, '');
    }
    if (!base64Data) return '';

    const widthPx = cssSizeToPx(String(attrs?.width ?? '320px')) ?? 320;
    const heightPx = cssSizeToPx(String(attrs?.height ?? '')) ?? Math.round(widthPx * 0.75);
    const align = IMAGE_ALIGN_MAP[String(attrs?.align ?? 'center').toLowerCase()] ?? '1';
    const description =
        typeof attrs?.alt === 'string' && attrs.alt.trim()
            ? ` description="${escapeXmlAttr(attrs.alt.trim())}"`
            : typeof attrs?.title === 'string' && attrs.title.trim()
              ? ` description="${escapeXmlAttr(attrs.title.trim())}"`
              : '';

    const placeholder = acc.append(UYAP_IMAGE_PLACEHOLDER_CHAR);
    return `<image imageData="${base64Data}" width="${pxToUyapPt(widthPx)}" height="${pxToUyapPt(heightPx)}" alignment="${align}" startOffset="${placeholder.start}" length="${placeholder.length}"${description} />`;
}

function buildTableColumnSpans(firstRow: JSONContent | undefined, colCount: number): string {
    const cells =
        firstRow?.content?.filter((c) => c.type === 'tableCell' || c.type === 'tableHeader') ?? [];
    const colwidths = cells.map((cell) => {
        const cw = cell.attrs?.colwidth;
        if (Array.isArray(cw) && cw.length > 0 && Number.isFinite(Number(cw[0]))) {
            return Number(cw[0]);
        }
        return null;
    });
    if (colwidths.length === colCount && colwidths.every((w) => w != null && w > 0)) {
        return colwidths.map((w) => pxToUyapPt(w!)).join(',');
    }
    const span = Math.floor(100 / Math.max(1, colCount));
    return Array(colCount).fill(span).join(',');
}

function buildCellOpenTag(cell: JSONContent): string {
    const attrs = cell.attrs ?? {};
    const parts = ['<cell'];
    const colspan = Number(attrs.colspan ?? 1);
    const rowspan = Number(attrs.rowspan ?? 1);
    if (colspan > 1) parts.push(`colspan="${colspan}"`);
    if (rowspan > 1) parts.push(`rowspan="${rowspan}"`);

    const bg = cssColorToUyapForeground(String(attrs.backgroundColor ?? attrs.bgColor ?? ''));
    if (bg) parts.push(`bgColor="${bg}"`);

    const vAlign = CELL_VALIGN_MAP[String(attrs.verticalAlign ?? '').toLowerCase()];
    if (vAlign) parts.push(`vAlign="${vAlign}"`);

    const hAlign = ALIGN_MAP[String(attrs.textAlign ?? '').toLowerCase()];
    if (hAlign) parts.push(`hAlign="${hAlign}"`);

    return `${parts.join(' ')}>`;
}

function buildTableOpenTag(node: JSONContent, colCount: number, columnSpans: string): string {
    const attrs = node.attrs ?? {};
    const borderWidth = attrs.borderWidth != null ? String(attrs.borderWidth) : '1';
    const borderStyle = attrs.borderStyle != null ? String(attrs.borderStyle) : 'solid';
    const tableAlign = ALIGN_MAP[String(attrs.alignment ?? attrs.textAlign ?? '').toLowerCase()];
    const parts = [
        `<table tableName="${escapeXmlAttr(String(attrs.tableName ?? 'Tablo'))}"`,
        `columnCount="${colCount}"`,
        `columnSpans="${columnSpans}"`,
        `border="borderCell"`,
        `borderWidth="${escapeXmlAttr(borderWidth)}"`,
        `borderColor="-16777216"`,
    ];
    if (tableAlign) parts.push(`alignment="${tableAlign}"`);
    if (borderStyle !== 'solid') parts.push(`borderType="${escapeXmlAttr(borderStyle)}"`);
    return `${parts.join(' ')}>`;
}

function buildPropertiesXml(pageFormat: UyapPageFormatInput, properties?: UyapPropertiesInput): string {
    const pf = { ...UYAP_DEFAULT_PAGE_FORMAT, ...pageFormat, ...(properties?.pageBorder ?? {}) };
    const pfAttrs = [
        `mediaSizeName="${pf.mediaSizeName}"`,
        `leftMargin="${pf.leftMargin}"`,
        `rightMargin="${pf.rightMargin}"`,
        `topMargin="${pf.topMargin}"`,
        `bottomMargin="${pf.bottomMargin}"`,
        `paperOrientation="${pf.paperOrientation}"`,
        `headerFOffset="${pf.headerFOffset}"`,
        `footerFOffset="${pf.footerFOffset}"`,
    ];
    if (pf.pageBorderType) pfAttrs.push(`pageBorderType="${escapeXmlAttr(pf.pageBorderType)}"`);
    if (pf.pageBorderColor) pfAttrs.push(`pageBorderColor="${escapeXmlAttr(pf.pageBorderColor)}"`);
    if (pf.pageBorderDisplayHorizontal) {
        pfAttrs.push(`pageBorderDisplayHorizontal="${escapeXmlAttr(pf.pageBorderDisplayHorizontal)}"`);
    }
    if (pf.pageBorderDisplayVertical) {
        pfAttrs.push(`pageBorderDisplayVertical="${escapeXmlAttr(pf.pageBorderDisplayVertical)}"`);
    }
    if (pf.pageBorderDisplayOnFirstPage) {
        pfAttrs.push(`pageBorderDisplayOnFirstPage="${escapeXmlAttr(pf.pageBorderDisplayOnFirstPage)}"`);
    }
    if (pf.pageBorderDistanceFrom) {
        pfAttrs.push(`pageBorderDistanceFrom="${escapeXmlAttr(pf.pageBorderDistanceFrom)}"`);
    }
    if (pf.pageColumns) pfAttrs.push(`pageColumns="${escapeXmlAttr(pf.pageColumns)}"`);
    if (pf.pageColumnSpacing) pfAttrs.push(`pageColumnSpacing="${escapeXmlAttr(pf.pageColumnSpacing)}"`);

    let inner = `<pageFormat ${pfAttrs.join(' ')} />`;

    const bg = properties?.bgImage;
    if (bg?.bgImageData || bg?.bgImageSource) {
        const bgAttrs: string[] = [];
        if (bg.bgImageSource) bgAttrs.push(`bgImageSource="${escapeXmlAttr(bg.bgImageSource)}"`);
        if (bg.bgImageData) bgAttrs.push(`bgImageData="${bg.bgImageData}"`);
        if (bg.bgImageAlign) bgAttrs.push(`bgImageAlign="${escapeXmlAttr(bg.bgImageAlign)}"`);
        if (bg.bgImageRepeat) bgAttrs.push(`bgImageRepeat="${escapeXmlAttr(bg.bgImageRepeat)}"`);
        if (bg.bgImageWatermark != null) bgAttrs.push(`bgImageWatermark="${bg.bgImageWatermark ? 'true' : 'false'}"`);
        if (bg.bgImageOpacity != null) bgAttrs.push(`bgImageOpacity="${bg.bgImageOpacity}"`);
        if (bg.bgImageBottomMargin) bgAttrs.push(`bgImageBottomMargin="${escapeXmlAttr(bg.bgImageBottomMargin)}"`);
        if (bg.bgImageUpMargin) bgAttrs.push(`bgImageUpMargin="${escapeXmlAttr(bg.bgImageUpMargin)}"`);
        if (bg.bgImageRightMargin) bgAttrs.push(`bgImageRightMargin="${escapeXmlAttr(bg.bgImageRightMargin)}"`);
        if (bg.bgImageLeftMargin) bgAttrs.push(`bgImageLeftMargin="${escapeXmlAttr(bg.bgImageLeftMargin)}"`);
        inner += `\n    <bgImage ${bgAttrs.join(' ')} />`;
    }

    const pi = properties?.pageImage;
    if (pi?.pageImageClassName || pi?.pageImageGradientData) {
        const piAttrs: string[] = [];
        if (pi.pageImageClassName) piAttrs.push(`pageImageClassName="${escapeXmlAttr(pi.pageImageClassName)}"`);
        if (pi.pageImageGradientData) piAttrs.push(`pageImageGradientData="${escapeXmlAttr(pi.pageImageGradientData)}"`);
        inner += `\n    <pageImage ${piAttrs.join(' ')} />`;
    }

    return `<properties>\n    ${inner}\n</properties>`;
}

function buildStylesXml(usedStyles: Set<string>): string {
    const styles = [
        '<style name="default" description="Geçerli" family="Lucida Grande" size="13" bold="false" italic="false" FONT_ATTRIBUTE_KEY="com.apple.laf.AquaFonts$DerivedUIResourceFont[family=Lucida Grande,name=Lucida Grande,style=plain,size=13]" />',
        '<style name="hvl-default" parent="default" family="Times New Roman" size="12" description="Gövde" />',
    ];
    const catalog: Record<string, string> = {
        'UDFIX-Title': '<style name="UDFIX-Title" parent="hvl-default" size="16" bold="true" description="Başlık" />',
        'UDFIX-Subtitle': '<style name="UDFIX-Subtitle" parent="hvl-default" size="13" italic="true" description="Alt Başlık" />',
        'UDFIX-H1': '<style name="UDFIX-H1" parent="hvl-default" size="18" bold="true" description="Başlık 1" />',
        'UDFIX-H2': '<style name="UDFIX-H2" parent="hvl-default" size="16" bold="true" description="Başlık 2" />',
        'UDFIX-H3': '<style name="UDFIX-H3" parent="hvl-default" size="14" bold="true" description="Başlık 3" />',
        'UDFIX-H4': '<style name="UDFIX-H4" parent="hvl-default" size="13" bold="true" description="Başlık 4" />',
        'UDFIX-H5': '<style name="UDFIX-H5" parent="hvl-default" size="12" bold="true" description="Başlık 5" />',
        'UDFIX-H6': '<style name="UDFIX-H6" parent="hvl-default" size="11" bold="true" description="Başlık 6" />',
    };
    for (const key of usedStyles) {
        if (catalog[key]) styles.push(catalog[key]);
    }
    return `<styles>\n    ${styles.join('\n    ')}\n</styles>`;
}

function buildTemplateRootAttrs(meta?: UyapTemplateMetaInput): string {
    const parts = ['format_id="1.8"'];
    if (meta?.webID) parts.push(`webID="${escapeXmlAttr(meta.webID)}"`);
    if (meta?.institutionID) parts.push(`institutionID="${escapeXmlAttr(meta.institutionID)}"`);
    if (meta?.isTemplate != null) parts.push(`isTemplate="${meta.isTemplate ? 'true' : 'false'}"`);
    if (meta?.description) parts.push(`description="${escapeXmlAttr(meta.description)}"`);
    return parts.join(' ');
}

function toRoman(num: number): string {
    const lookup: Record<string, number> = {
        m: 1000,
        cm: 900,
        d: 500,
        cd: 400,
        c: 100,
        xc: 90,
        l: 50,
        xl: 40,
        x: 10,
        ix: 9,
        v: 5,
        iv: 4,
        i: 1,
    };
    let roman = '';
    for (const i in lookup) {
        while (num >= lookup[i]) {
            roman += i;
            num -= lookup[i];
        }
    }
    return roman;
}

function getListPrefix(level: number, index: number, isOrdered: boolean): string {
    if (!isOrdered) return '• ';
    const i = index + 1;
    switch (level % 5) {
        case 0:
            return `${i}. `;
        case 1:
            return `${String.fromCharCode(64 + i)}. `;
        case 2:
            return `${String.fromCharCode(96 + i)}. `;
        case 3:
            return `${toRoman(i)}. `;
        case 4:
            return `(${i}) `;
        default:
            return `${i}. `;
    }
}

export function buildUyapContentXml(
    json: JSONContent,
    headerText: string = '',
    footerText: string = '',
    extras?: UyapExportBuildExtras,
): { contentXml: string; commentsXml: string | null } {
    const acc = createTextAccumulator();
    const commentRanges = new Map<string, { start: number; endExclusive: number }>();
    const usedStyles = new Set<string>();

    const pnPlacement = extras?.uyapPageNumber;
    const pageNumberStart = extras?.pageNumberStart;
    const pnFont = extras?.uyapPageNumberFont;
    const headerStartPage =
        extras?.headerStartPage != null && extras.headerStartPage > 1
            ? ` startPage="${Math.floor(extras.headerStartPage)}"`
            : '';
    const headerPageNumberAttrs =
        pnPlacement?.zone === 'header' ? uyapPageNumberAttrsFor(pnPlacement, pageNumberStart, pnFont) : '';
    const footerPageNumberAttrs =
        pnPlacement?.zone === 'footer' ? uyapPageNumberAttrsFor(pnPlacement, pageNumberStart, pnFont) : '';

    const hfAppearance = extras?.headerFooterAppearance;
    const headerAppearanceAttrs = [
        hfAppearance?.headerBackground
            ? ` background="${cssColorToUyapForeground(hfAppearance.headerBackground) ?? hfAppearance.headerBackground}"`
            : '',
        hfAppearance?.headerForeground
            ? ` foreground="${cssColorToUyapForeground(hfAppearance.headerForeground) ?? hfAppearance.headerForeground}"`
            : '',
    ].join('');
    const footerAppearanceAttrs = [
        hfAppearance?.footerBackground
            ? ` background="${cssColorToUyapForeground(hfAppearance.footerBackground) ?? hfAppearance.footerBackground}"`
            : '',
        hfAppearance?.footerForeground
            ? ` foreground="${cssColorToUyapForeground(hfAppearance.footerForeground) ?? hfAppearance.footerForeground}"`
            : '',
    ].join('');

    const emitUyapPageBreak = (): string =>
        `<page-break><paragraph><content startOffset="${acc.offset}" length="0" /></paragraph></page-break>`;

    const trackCommentRange = (commentId: string, start: number, endExclusive: number) => {
        const prev = commentRanges.get(commentId);
        if (!prev) {
            commentRanges.set(commentId, { start, endExclusive });
        } else {
            prev.start = Math.min(prev.start, start);
            prev.endExclusive = Math.max(prev.endExclusive, endExclusive);
        }
    };

    const processNode = (node: JSONContent, listLevel = -1, listIndex = -1, isOrdered = false): string => {
        let nodeXml = '';

        if (node.type === 'paragraph' || node.type === 'heading') {
            const styleRef = resolveParagraphStyleRef(node);
            if (styleRef) usedStyles.add(styleRef);

            const needUyapPageBreak =
                Boolean(node.attrs?.pageBreakBefore) ||
                (node.type === 'paragraph' && node.attrs?.nomaiSectionStart === 'nextPage');
            if (needUyapPageBreak) nodeXml += emitUyapPageBreak();

            nodeXml += buildParagraphOpenTag(node, listLevel);

            if (listLevel >= 0 && listIndex >= 0) {
                const prefix = getListPrefix(listLevel, listIndex, isOrdered);
                const appended = acc.append(prefix);
                nodeXml += `<content startOffset="${appended.start}" length="${appended.length}" bold="true" />`;
            }

            if (node.content?.length) {
                const useTabElements = node.attrs?.nomaiUyapTabElements === true;
                for (const child of node.content) {
                    if (child.type === 'text') {
                        const footnoteMark = child.marks?.find((mark: TipTapMark) => mark.type === 'footnote');
                        let text = child.text as string;
                        if (footnoteMark?.attrs?.number != null) {
                            text = String(footnoteMark.attrs.number);
                        }
                        const markAttrs = marksToContentAttrs(child.marks as TipTapMark[] | undefined, styleRef);
                        nodeXml += emitTextWithTabsAndSpaces(acc, text, markAttrs, (start, endEx) => {
                            for (const mark of (child.marks ?? []) as TipTapMark[]) {
                                if (mark.type === 'comment' && mark.attrs?.commentId) {
                                    trackCommentRange(String(mark.attrs.commentId), start, endEx);
                                }
                            }
                        }, useTabElements);
                    } else if (child.type === 'image') {
                        nodeXml += buildImageElement(child.attrs, acc);
                    } else if (child.type === 'hardBreak') {
                        const appended = acc.append('\n');
                        nodeXml += `<content startOffset="${appended.start}" length="${appended.length}" />`;
                    }
                }
            }

            nodeXml += appendUyapParagraphEndContent(acc, node);
            nodeXml += '</paragraph>';
        } else if (node.type === 'pageBreak') {
            nodeXml += emitUyapPageBreak();
        } else if (node.type === 'image') {
            const imgXml = buildImageElement(node.attrs, acc);
            if (imgXml) {
                const align =
                    IMAGE_ALIGN_MAP[String(node.attrs?.align ?? 'center').toLowerCase()] ?? '1';
                nodeXml += `<paragraph Alignment="${align}">`;
                nodeXml += imgXml;
                const appendedBreak = acc.append('\n');
                nodeXml += `<content startOffset="${appendedBreak.start}" length="${appendedBreak.length}" />`;
                nodeXml += '</paragraph>';
            }
        } else if (node.type === 'bulletList' || node.type === 'orderedList') {
            const newLevel = listLevel + 1;
            const newIsOrdered = node.type === 'orderedList';
            node.content?.forEach((listItem: JSONContent, index: number) => {
                listItem.content?.forEach((child: JSONContent) => {
                    nodeXml += processNode(child, newLevel, index, newIsOrdered);
                });
            });
        } else if (node.type === 'listItem') {
            node.content?.forEach((child: JSONContent) => {
                nodeXml += processNode(child, listLevel, listIndex, isOrdered);
            });
        } else if (node.type === 'table') {
            const firstRow = node.content?.find((r) => r.type === 'tableRow');
            const colCount = firstRow?.content?.length ?? 1;
            const columnSpans = buildTableColumnSpans(firstRow, colCount);
            nodeXml += buildTableOpenTag(node, colCount, columnSpans);

            node.content?.forEach((row: JSONContent, rowIndex: number) => {
                if (row.type !== 'tableRow') return;
                const isHeaderRow = row.content?.every((c) => c.type === 'tableHeader') ?? false;
                const rowType = isHeaderRow ? 'headerRow' : 'dataRow';
                const rowHeight = cssSizeToUyapPt(row.attrs?.height);
                const rowAttrs = [
                    `rowName="row${rowIndex}"`,
                    `rowType="${rowType}"`,
                    rowHeight ? `height="${rowHeight}"` : '',
                    row.attrs?.cantSplit ? 'cantSplit="true"' : '',
                ]
                    .filter(Boolean)
                    .join(' ');
                nodeXml += `<row ${rowAttrs}>`;
                row.content?.forEach((cell: JSONContent) => {
                    if (cell.type !== 'tableCell' && cell.type !== 'tableHeader') return;
                    nodeXml += buildCellOpenTag(cell);
                    cell.content?.forEach((cellChild: JSONContent) => {
                        nodeXml += processNode(cellChild);
                    });
                    nodeXml += '</cell>';
                });
                nodeXml += '</row>';
            });
            nodeXml += '</table>';
        }

        return nodeXml;
    };

    let elementsXml = '';

    const mergedPageFormat = { ...UYAP_DEFAULT_PAGE_FORMAT, ...(extras?.pageFormat ?? {}) };
    const hfContentWidthPt = uyapContentWidthPt(mergedPageFormat);

    if (extras?.hfExport) {
        const hf = extras.hfExport;
        const useRaster = hfExportUsesRaster(hf);
        const headerBody = useRaster
            ? hf.headerRaster
                ? appendHfRasterImageParagraph(acc, hf.headerRaster, '1')
                : ''
            : appendHfTabbedBandParagraph(
                  acc,
                  hf.headerLayout,
                  hf.headerLeftHtml,
                  hf.headerCenterHtml,
                  hf.headerRightHtml,
                  hfContentWidthPt,
              );
        const wantHeader = Boolean(headerBody) || Boolean(headerPageNumberAttrs);
        if (wantHeader) {
            elementsXml += `<header${headerStartPage}${headerPageNumberAttrs}${headerAppearanceAttrs}>`;
            if (headerBody) elementsXml += headerBody;
            if (!useRaster && hf.showHeaderSeparatorLine && headerBody) {
                elementsXml += appendHfSeparatorRuleParagraph(acc, hfContentWidthPt, true);
            }
            elementsXml += '</header>';
        }
    } else if (headerText) {
        elementsXml += `<header${headerStartPage}${headerPageNumberAttrs}${headerAppearanceAttrs}><paragraph name="hvl-default" family="Times New Roman" size="12" description="Gövde">`;
        const appended = acc.append(headerText);
        elementsXml += `<content name="hvl-default" family="Times New Roman" size="12" description="Gövde" startOffset="${appended.start}" length="${appended.length}" />`;
        elementsXml += '</paragraph></header>';
        acc.append('\n');
    }

    json.content?.forEach((node: JSONContent) => {
        elementsXml += processNode(node);
    });

    const footnotes = collectFootnotesFromTipTapJson(json);
    if (footnotes.length > 0) {
        const blockTitle = '\n--- Dipnotlar ---\n';
        const appendedTitle = acc.append(blockTitle);
        elementsXml += `<paragraph Alignment="0"><content startOffset="${appendedTitle.start}" length="${appendedTitle.length}" bold="true" /></paragraph>`;
        for (const fn of footnotes) {
            const numPart = `${fn.number}. `;
            const body = (fn.plain || '').replace(/\r\n/g, '\n');
            elementsXml += `<paragraph Alignment="0">`;
            const appendedNum = acc.append(numPart);
            elementsXml += `<content startOffset="${appendedNum.start}" length="${appendedNum.length}" bold="true" />`;
            if (body.length > 0) {
                const appendedBody = acc.append(body);
                elementsXml += `<content startOffset="${appendedBody.start}" length="${appendedBody.length}" />`;
            }
            const appendedBreak = acc.append('\n');
            elementsXml += `<content startOffset="${appendedBreak.start}" length="${appendedBreak.length}" />`;
            elementsXml += '</paragraph>';
        }
    }

    const footerOpen = `<footer${footerPageNumberAttrs}${footerAppearanceAttrs}>`;
    if (extras?.hfExport) {
        const hf = extras.hfExport as UyapHfExportInput;
        const useRaster = hfExportUsesRaster(hf);
        const footerBody = useRaster
            ? hf.footerRaster
                ? appendHfRasterImageParagraph(acc, hf.footerRaster, '1')
                : ''
            : appendHfTabbedBandParagraph(
                  acc,
                  hf.footerLayout,
                  hf.footerLeftHtml,
                  hf.footerCenterHtml,
                  hf.footerRightHtml,
                  hfContentWidthPt,
              );
        const wantFooter = Boolean(footerBody) || Boolean(footerPageNumberAttrs);
        if (wantFooter) {
            elementsXml += footerOpen;
            if (!useRaster && hf.showFooterSeparatorLine && footerBody) {
                elementsXml += appendHfSeparatorRuleParagraph(acc, hfContentWidthPt, false);
            }
            if (footerBody) {
                elementsXml += footerBody;
            } else if (footerPageNumberAttrs) {
                elementsXml += `<paragraph name="hvl-default" family="Times New Roman" size="12" description="Gövde">`;
                const firstBreak = acc.append('\n');
                elementsXml += `<content name="hvl-default" family="Times New Roman" size="12" description="Gövde" startOffset="${firstBreak.start}" length="${firstBreak.length}" />`;
                const secondBreak = acc.append('\n');
                elementsXml += `<content startOffset="${secondBreak.start}" length="${secondBreak.length}" />`;
                elementsXml += '</paragraph>';
            }
            elementsXml += '</footer>';
        }
    } else {
        const wantFooter = Boolean(footerText?.trim()) || Boolean(footerPageNumberAttrs);
        if (wantFooter) {
            const footerBody = footerText?.trim() ? footerText : '\n';
            elementsXml += `${footerOpen}<paragraph name="hvl-default" family="Times New Roman" size="12" description="Gövde">`;
            const appended = acc.append(footerBody);
            elementsXml += `<content name="hvl-default" family="Times New Roman" size="12" description="Gövde" startOffset="${appended.start}" length="${appended.length}" />`;
            elementsXml += '</paragraph></footer>';
            acc.append('\n');
        }
    }

    const pageFormat = mergedPageFormat;
    const propertiesXml = buildPropertiesXml(pageFormat, extras?.properties);
    const templateAttrs = buildTemplateRootAttrs(extras?.templateMeta);
    const dataSection = extras?.dataSectionXml?.trim()
        ? `<data>\n${extras.dataSectionXml.trim()}\n</data>`
        : '';

    const contentXml = `<?xml version="1.0" encoding="UTF-8" ?>
<template ${templateAttrs}>
<content><![CDATA[${acc.rawText}]]></content>
${propertiesXml}
<elements resolver="hvl-default">
${elementsXml}
</elements>
${buildStylesXml(usedStyles)}
${dataSection}
</template>`;

    let commentsXml: string | null = null;
    if (extras?.commentsForXml?.length) {
        commentsXml = buildCommentsXml(extras.commentsForXml, commentRanges);
    }

    return { contentXml, commentsXml };
}
