import xml2js from 'xml2js';
import type { HeaderFooterSection, HeaderFooterSettings } from '../stores/useHeaderFooterStore';
import type { XmlParseResult, XmlParagraph } from '../types/uyapXml';
import {
    buildUyapDataRoot,
    renderUyapParagraphSpans,
    type UyapTemplateContext,
} from './uyapFieldResolver';
import { extractUyapElementsInOrder } from './uyapElementsOrder';
import { uyapHeaderFooterOffsetsToMarginPx, uyapPtStringToPx } from './uyapImportUnits';
import { spansToHtml } from './uyapSpanRender';
import type { UyapHfLayoutPreset, UyapPageNumberAlignment, UyapPageNumberZone } from './uyapIO';
import { paragraphHasImages, uyapImagesToHtml } from './uyapImageHtml';

export const UYAP_IMPORT_META_STORAGE_PREFIX = 'nomai-udf-import-meta-';

export interface UyapImportPageMargins {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

export interface UyapImportMeta {
    pageMargins?: UyapImportPageMargins;
    headerFooter?: {
        sections: HeaderFooterSection;
        settings: Partial<HeaderFooterSettings>;
        headerLayout: UyapHfLayoutPreset;
        footerLayout: UyapHfLayoutPreset;
        pageNumberPlacement?: { zone: UyapPageNumberZone; alignment: UyapPageNumberAlignment };
    };
}

function parsePageFormatAttrs(contentXml: string): Record<string, string> {
    const m = contentXml.match(/<pageFormat\s+([^/>]+)\/?>/i);
    if (!m) return {};
    const attrs: Record<string, string> = {};
    const re = /([\w-]+)="([^"]*)"/g;
    let hit: RegExpExecArray | null;
    while ((hit = re.exec(m[1])) !== null) {
        attrs[hit[1]] = hit[2];
    }
    return attrs;
}

function alignmentFromPageNumberSpec(spec: string | undefined): UyapPageNumberAlignment {
    const s = spec ?? '';
    if (s.includes('08') || /left/i.test(s)) return '0';
    if (s.includes('72') || /right/i.test(s)) return '2';
    return '1';
}

function parseBandAttrs(xml: string): Record<string, string> {
    const open = xml.match(/^<(header|footer)\s+([^>]*)>/i);
    if (!open) return {};
    const attrs: Record<string, string> = {};
    const re = /([\w-]+)="([^"]*)"/g;
    let hit: RegExpExecArray | null;
    while ((hit = re.exec(open[2])) !== null) {
        attrs[hit[1]] = hit[2];
    }
    return attrs;
}

async function parseParagraphsInBand(xml: string): Promise<XmlParagraph[]> {
    const inner = xml.replace(/^<(header|footer)\b[^>]*>/i, '').replace(/<\/(header|footer)>$/i, '');
    const wrapped = `<?xml version="1.0"?><band>${inner}</band>`;
    const parser = new xml2js.Parser({ explicitArray: true });
    const parsed = (await parser.parseStringPromise(wrapped)) as {
        band?: { paragraph?: XmlParagraph[] };
    };
    return parsed.band?.paragraph ?? [];
}

function paragraphBandHtml(p: XmlParagraph, ctx: UyapTemplateContext): string {
    const spans = renderUyapParagraphSpans(p, ctx);
    let inner = spansToHtml(spans);
    if (paragraphHasImages(p)) {
        inner += uyapImagesToHtml(p.image, { hfSized: true });
    }
    if (!inner.trim()) return '';
    return `<p>${inner}</p>`;
}

function hfColumnsFromParagraphs(
    paragraphs: XmlParagraph[],
    ctx: UyapTemplateContext,
): { left: string; center: string; right: string } {
    const left: string[] = [];
    const center: string[] = [];
    const right: string[] = [];
    for (const p of paragraphs) {
        const align = p.$?.Alignment ?? '1';
        const html = paragraphBandHtml(p, ctx);
        if (!html) continue;
        if (align === '0') left.push(html);
        else if (align === '2') right.push(html);
        else center.push(html);
    }
    return {
        left: left.join(''),
        center: center.join(''),
        right: right.join(''),
    };
}

function inferHfLayout(left: string, center: string, right: string): UyapHfLayoutPreset {
    const L = left.trim();
    const C = center.trim();
    const R = right.trim();
    if (C && !L && !R) return '1-col';
    if (L && R && !C) return '2-col-70-30';
    if (L || C || R) return '3-col-equal';
    return '3-col-equal';
}

function injectPageNumberToken(
    section: HeaderFooterSection,
    zone: UyapPageNumberZone,
    alignment: UyapPageNumberAlignment,
): void {
    const token = '{page}';
    const key =
        zone === 'header'
            ? alignment === '0'
                ? 'headerLeft'
                : alignment === '2'
                  ? 'headerRight'
                  : 'headerCenter'
            : alignment === '0'
              ? 'footerLeft'
              : alignment === '2'
                ? 'footerRight'
                : 'footerCenter';
    const cur = section[key];
    if (cur.includes(token)) return;
    section[key] = cur.trim() ? `${cur} ${token}` : token;
}

async function buildTemplateContext(contentXml: string): Promise<UyapTemplateContext | null> {
    const parser = new xml2js.Parser();
    try {
        const result = (await parser.parseStringPromise(contentXml)) as XmlParseResult;
        if (!result.template?.content) return null;
        const raw = result.template.content[0];
        const rawText = typeof raw === 'string' ? raw : '';
        const { root, hasDataSection } = buildUyapDataRoot(result.template.data);
        return { rawText, dataRoot: root, hasDataSection };
    } catch {
        return null;
    }
}

export async function parseUyapImportMeta(contentXml: string): Promise<UyapImportMeta> {
    const meta: UyapImportMeta = {};
    const pf = parsePageFormatAttrs(contentXml);
    const top = uyapPtStringToPx(pf.topMargin);
    const bottom = uyapPtStringToPx(pf.bottomMargin);
    const left = uyapPtStringToPx(pf.leftMargin);
    const right = uyapPtStringToPx(pf.rightMargin);
    if (top != null && bottom != null && left != null && right != null) {
        meta.pageMargins = {
            top: Math.round(top),
            bottom: Math.round(bottom),
            left: Math.round(left),
            right: Math.round(right),
        };
    }

    const ctx = await buildTemplateContext(contentXml);
    if (!ctx) return meta;

    const ordered = extractUyapElementsInOrder(contentXml);
    let headerXml: string | null = null;
    let footerXml: string | null = null;
    for (const el of ordered) {
        if (el.tag === 'header' && !headerXml) headerXml = el.xml;
        if (el.tag === 'footer' && !footerXml) footerXml = el.xml;
    }

    const hfOffsets = uyapHeaderFooterOffsetsToMarginPx(pf.headerFOffset, pf.footerFOffset);

    if (!headerXml && !footerXml) {
        if (hfOffsets.headerMarginTop > 0 || hfOffsets.footerMarginBottom > 0) {
            meta.headerFooter = {
                sections: {
                    headerLeft: '',
                    headerCenter: '',
                    headerRight: '',
                    footerLeft: '',
                    footerCenter: '',
                    footerRight: '',
                },
                settings: hfOffsets,
                headerLayout: '3-col-equal',
                footerLayout: '3-col-equal',
            };
        }
        return meta;
    }

    const headerParagraphs = headerXml ? await parseParagraphsInBand(headerXml) : [];
    const footerParagraphs = footerXml ? await parseParagraphsInBand(footerXml) : [];
    const hCols = hfColumnsFromParagraphs(headerParagraphs, ctx);
    const fCols = hfColumnsFromParagraphs(footerParagraphs, ctx);

    const sections: HeaderFooterSection = {
        headerLeft: hCols.left,
        headerCenter: hCols.center,
        headerRight: hCols.right,
        footerLeft: fCols.left,
        footerCenter: fCols.center,
        footerRight: fCols.right,
    };

    const headerAttrs = headerXml ? parseBandAttrs(headerXml) : {};
    const footerAttrs = footerXml ? parseBandAttrs(footerXml) : {};

    let pageNumberPlacement: NonNullable<UyapImportMeta['headerFooter']>['pageNumberPlacement'];
    if (footerAttrs['pageNumber-spec']) {
        pageNumberPlacement = {
            zone: 'footer',
            alignment: alignmentFromPageNumberSpec(footerAttrs['pageNumber-spec']),
        };
        injectPageNumberToken(sections, 'footer', pageNumberPlacement.alignment);
    } else if (headerAttrs['pageNumber-spec']) {
        pageNumberPlacement = {
            zone: 'header',
            alignment: alignmentFromPageNumberSpec(headerAttrs['pageNumber-spec']),
        };
        injectPageNumberToken(sections, 'header', pageNumberPlacement.alignment);
    }

    const pageStartRaw = footerAttrs['pageNumber-pageStartNumStr'] ?? headerAttrs['pageNumber-pageStartNumStr'];
    const pageNumberStart = pageStartRaw ? Math.max(1, Number.parseInt(pageStartRaw, 10) || 1) : 1;

    meta.headerFooter = {
        sections,
        settings: {
            ...hfOffsets,
            pageNumberStart,
        },
        headerLayout: inferHfLayout(hCols.left, hCols.center, hCols.right),
        footerLayout: inferHfLayout(fCols.left, fCols.center, fCols.right),
        pageNumberPlacement,
    };

    return meta;
}
