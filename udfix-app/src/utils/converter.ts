import xml2js from 'xml2js';
import { XML2JS_SAFE_OPTIONS } from './xml2jsSafe';
import type {
    XmlCell,
    XmlParagraph,
    XmlParseResult,
    XmlRow,
    XmlTable,
} from '../types/uyapXml';
import {
    buildUyapDataRoot,
    findRepeatingTableRowInstances,
    paragraphHasVisibleContent,
    renderUyapParagraphSpans,
    type UyapTemplateContext,
} from './uyapFieldResolver';
import { appendUyapVerificationToHtml } from './uyapVerificationBlock';
import type { UyapVerificationMeta } from './uyapVerification';
import { extractUyapElementsInOrder } from './uyapElementsOrder';
import { escapeHtml, spansToHtml } from './uyapSpanRender';
import {
    uyapHeadingLevel,
    uyapParagraphAttrsToTipTap,
    uyapParagraphBlockKind,
    uyapParagraphHtmlAttrs,
    uyapParagraphStyleForHtml,
} from './uyapParagraphAttrs';
import { uyapArgbToCssColor } from './uyapColor';
import { finalizeUyapParagraphText, uyapParagraphHasTabCharacters } from './uyapParagraphText';
import {
    paragraphHasImages,
    uyapImagesToHtml,
    uyapImagesToTipTapNodes,
} from './uyapImageHtml';

/** xml2js child node when `explicitChildren` + `preserveChildrenOrder` are enabled. */
type XmlOrderedChild = { '#name'?: string } & Record<string, unknown>;

type OrderedCellChild =
    | { kind: 'paragraph'; node: XmlParagraph }
    | { kind: 'table'; node: XmlTable };

function getCellChildrenInOrder(cell: XmlCell & { $$?: XmlOrderedChild[] }): OrderedCellChild[] {
    const ordered = cell.$$;
    if (Array.isArray(ordered) && ordered.length > 0) {
        const out: OrderedCellChild[] = [];
        for (const child of ordered) {
            const name = child['#name'];
            if (name === 'paragraph') out.push({ kind: 'paragraph', node: child as unknown as XmlParagraph });
            else if (name === 'table') out.push({ kind: 'table', node: child as unknown as XmlTable });
        }
        if (out.length > 0) return out;
    }
    const fallback: OrderedCellChild[] = [];
    for (const p of cell.paragraph ?? []) fallback.push({ kind: 'paragraph', node: p });
    for (const t of cell.table ?? []) fallback.push({ kind: 'table', node: t });
    return fallback;
}

function collectRowFieldGroupNames(row: XmlRow & { $$?: XmlOrderedChild[] }): string[] {
    const names = new Set<string>();
    const considerParagraph = (p: XmlParagraph) => {
        const pg = p.$?.GroupName ? String(p.$.GroupName) : '';
        if (pg) names.add(pg);
        for (const field of p.field ?? []) {
            const g = field.$.fieldGroupName ? String(field.$.fieldGroupName) : '';
            if (g) names.add(g);
        }
    };
    for (const cell of row.cell ?? []) {
        for (const child of getCellChildrenInOrder(cell as XmlCell & { $$?: XmlOrderedChild[] })) {
            if (child.kind === 'paragraph') considerParagraph(child.node);
        }
        for (const p of cell.paragraph ?? []) considerParagraph(p);
    }
    return [...names];
}
function getRawText(template: XmlParseResult['template']): string {
    const raw = template.content?.[0];
    return typeof raw === 'string' ? raw : '';
}

function buildTemplateContext(template: XmlParseResult['template']): UyapTemplateContext {
    const { root, hasDataSection } = buildUyapDataRoot(template.data);
    return {
        rawText: getRawText(template),
        dataRoot: root,
        hasDataSection,
    };
}

function marksFromSpanAttrs(attrs: Record<string, string | undefined> | undefined): TiptapMark[] {
    if (!attrs) return [];
    const marks: TiptapMark[] = [];

    if (attrs.bold === 'true') marks.push({ type: 'bold' });
    if (attrs.italic === 'true') marks.push({ type: 'italic' });
    if (attrs.underline === 'true') marks.push({ type: 'underline' });
    if (attrs.strikethrough === 'true') marks.push({ type: 'strike' });
    if (attrs.superscript === 'true') marks.push({ type: 'superscript' });
    if (attrs.subscript === 'true') marks.push({ type: 'subscript' });

    if (attrs.family || attrs.size || attrs.foreground) {
        const textStyleAttrs: Record<string, string> = {};
        if (attrs.family) textStyleAttrs.fontFamily = attrs.family;
        if (attrs.size) textStyleAttrs.fontSize = attrs.size + 'pt';
        if (attrs.foreground) {
            const cssColor = uyapArgbToCssColor(attrs.foreground);
            textStyleAttrs.color = cssColor ?? attrs.foreground;
        }
        marks.push({ type: 'textStyle', attrs: textStyleAttrs });
    }

    if (attrs.background) {
        const cssBg = uyapArgbToCssColor(attrs.background);
        marks.push({
            type: 'highlight',
            attrs: { color: cssBg ?? (attrs.background === '-256' ? '#ffff00' : '#ffff00') },
        });
    }

    return marks;
}

function spansToTiptapNodes(spans: ReturnType<typeof renderUyapParagraphSpans>): TiptapNode[] {
    const nodes: TiptapNode[] = [];
    for (const span of spans) {
        if (!span.text) continue;
        const marks = marksFromSpanAttrs(span.attrs);
        nodes.push({
            type: 'text',
            text: span.text,
            ...(marks.length > 0 ? { marks } : {}),
        });
    }
    return nodes;
}

export interface TiptapMark {
    type: string;
    attrs?: Record<string, string>;
}

export interface TiptapNode {
    type: string;
    attrs?: Record<string, string | number | boolean | null | undefined>;
    content?: TiptapNode[];
    text?: string;
    marks?: TiptapMark[];
}

export interface TiptapDoc {
    type: 'doc';
    content: TiptapNode[];
}

/** True if UDF XML contains `<table>` elements. */
export function udfXmlContainsTable(xmlData: string): boolean {
    return /<table[\s>]/.test(xmlData);
}

function createUyapXmlParser(extra?: ConstructorParameters<typeof xml2js.Parser>[0]) {
    return new xml2js.Parser({ ...XML2JS_SAFE_OPTIONS, ...extra });
}

/** Nested `<table>` inside a cell forces HTML import path. */
export function udfXmlHasNestedTable(xmlData: string): boolean {
    return /<cell[\s>][\s\S]*?<table[\s>]/i.test(xmlData);
}

async function parseParagraphFragment(xml: string): Promise<XmlParagraph | null> {
    const wrapped = `<?xml version="1.0"?><root>${xml}</root>`;
    const parser = createUyapXmlParser({ explicitArray: true });
    try {
        const parsed = (await parser.parseStringPromise(wrapped)) as { root?: { paragraph?: XmlParagraph[] } };
        return parsed.root?.paragraph?.[0] ?? null;
    } catch {
        return null;
    }
}

async function parseTableFragment(xml: string): Promise<XmlTable | null> {
    const wrapped = `<?xml version="1.0"?><root>${xml}</root>`;
    const parser = createUyapXmlParser({
        explicitArray: true,
        explicitChildren: true,
        preserveChildrenOrder: true,
        childkey: '$$',
    });
    try {
        const parsed = (await parser.parseStringPromise(wrapped)) as { root?: { table?: XmlTable[] } };
        return parsed.root?.table?.[0] ?? null;
    } catch {
        return null;
    }
}

const TABLE_ALIGN_MAP: Record<string, string> = {
    '0': 'left',
    '1': 'center',
    '2': 'right',
    '3': 'justify',
};

function tableColumnWidthStyles(columnSpans: string | undefined, columnCount: number): string {
    if (!columnSpans?.trim() || columnCount <= 0) return '';
    const parts = columnSpans.split(',').map((s) => Number.parseFloat(s.trim()));
    if (parts.length !== columnCount || parts.some((n) => !Number.isFinite(n) || n <= 0)) return '';
    const total = parts.reduce((a, b) => a + b, 0);
    if (total <= 0) return '';
    // Prefer min-width over rigid % so amount columns (e.g. 3,5) can grow with "2.625.821,38".
    const cols = parts
        .map((n) => {
            const pct = ((n / total) * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
            return `<col style="width: ${pct}%; min-width: min-content;" />`;
        })
        .join('');
    return `<colgroup>${cols}</colgroup>`;
}

function renderTableHtml(table: XmlTable, ctx: UyapTemplateContext): string {
    const tAttrs = table.$ ?? {};
    const borderMode = tAttrs.border ?? 'borderCell';
    const borderNone = borderMode === 'borderNone';
    const columnCount = Number.parseInt(String(tAttrs.columnCount ?? '0'), 10) || 0;

    let tableStyle = 'border-collapse: collapse; width: 100%; margin: 0;';
    if (borderNone) {
        tableStyle += ' border: none;';
    } else {
        tableStyle += ' border: 1px solid #ccc; margin: 20px 0;';
    }
    if (tAttrs.alignment) {
        const align = TABLE_ALIGN_MAP[String(tAttrs.alignment)] ?? 'left';
        tableStyle += ` margin-left: ${align === 'center' ? 'auto' : align === 'right' ? 'auto' : '0'}; margin-right: ${align === 'center' ? 'auto' : align === 'left' ? 'auto' : '0'};`;
    }

    const tableClass = borderNone ? ' class="uyap-border-none"' : '';
    const styleValue = borderNone
        ? `--table-border-width: 0px; --table-border-style: none; ${tableStyle}`
        : tableStyle;
    const dataBorder = borderNone ? ' data-uyap-border="none"' : '';
    let html = `<table${tableClass}${dataBorder} style="${styleValue}">`;
    html += tableColumnWidthStyles(tAttrs.columnSpans, columnCount);

    const rows = table.row ?? [];
    const expandRows = expandTableRowsForRepeatingData(rows, ctx);

    for (const { row, rowCtx } of expandRows) {
        html += '<tr>';
        for (const c of row.cell ?? []) {
            const cAttrs = c.$ ?? {};
            const colspan = Number.parseInt(String(cAttrs.colspan ?? '1'), 10);
            const rowspan = Number.parseInt(String(cAttrs.rowspan ?? '1'), 10);
            let cellStyle = 'padding: 4px 6px; vertical-align: top;';
            if (!borderNone) cellStyle += ' border: 1px solid #ccc;';
            else cellStyle += ' border: none;';
            const bg = uyapArgbToCssColor(cAttrs.bgColor);
            if (bg) cellStyle += ` background-color: ${bg};`;
            if (cAttrs.vAlign) cellStyle += ` vertical-align: ${escapeHtml(String(cAttrs.vAlign))};`;
            if (cAttrs.hAlign) {
                cellStyle += ` text-align: ${TABLE_ALIGN_MAP[String(cAttrs.hAlign)] ?? 'left'};`;
            }
            const spanAttrs = [
                colspan > 1 ? ` colspan="${colspan}"` : '',
                rowspan > 1 ? ` rowspan="${rowspan}"` : '',
            ].join('');
            html += `<td style="${cellStyle}"${spanAttrs}>`;
            for (const child of getCellChildrenInOrder(c as XmlCell & { $$?: XmlOrderedChild[] })) {
                if (child.kind === 'paragraph') {
                    html += renderParagraphHtml(child.node, rowCtx);
                } else {
                    html += renderTableHtml(child.node, rowCtx);
                }
            }
            html += '</td>';
        }
        html += '</tr>';
    }
    html += '</table>';
    return html;
}

function expandTableRowsForRepeatingData(
    rows: XmlRow[],
    ctx: UyapTemplateContext,
): Array<{ row: XmlRow; rowCtx: UyapTemplateContext }> {
    if (rows.length === 0) return [];

    // Single template data-row → expand when <data> has N matching composite row instances
    // (e.g. amount+interest pairs). Single-group repetition (creditors/debtors) is handled by
    // paragraph field-group expansion instead — expanding the wrapper row would duplicate colons.
    if (rows.length === 1) {
        const fieldGroups = collectRowFieldGroupNames(rows[0]);
        const instances = findRepeatingTableRowInstances(ctx.dataRoot, fieldGroups);
        const compositeRows = instances.filter((inst) => {
            let hits = 0;
            for (const g of fieldGroups) {
                if (Object.prototype.hasOwnProperty.call(inst, g)) hits += 1;
            }
            return hits >= 2;
        });
        if (compositeRows.length > 1) {
            return compositeRows.map((instance) => ({
                row: rows[0],
                rowCtx: { ...ctx, scopedGroupRecord: instance },
            }));
        }
    }

    return rows.map((row) => ({ row, rowCtx: ctx }));
}

function renderTableTipTap(table: XmlTable, ctx: UyapTemplateContext): TiptapNode | null {
    const rows = table.row ?? [];
    if (rows.length === 0) return null;

    const tAttrs = table.$ ?? {};
    const tableNode: TiptapNode = {
        type: 'table',
        attrs: {
            ...(tAttrs.tableName ? { tableName: tAttrs.tableName } : {}),
            ...(tAttrs.border ? { border: tAttrs.border } : {}),
            ...(tAttrs.columnSpans ? { columnSpans: tAttrs.columnSpans } : {}),
            ...(tAttrs.columnCount ? { columnCount: tAttrs.columnCount } : {}),
            ...(tAttrs.border === 'borderNone'
                ? { borderWidth: '0', borderStyle: 'none' }
                : {}),
        },
        content: [],
    };

    for (const row of rows) {
        const rowNode: TiptapNode = { type: 'tableRow', content: [] };
        for (const cell of row.cell ?? []) {
            if (cell.table?.length) return null;

            const cAttrs = cell.$ ?? {};
            const cellContent: TiptapNode[] = [];
            for (const cp of cell.paragraph ?? []) {
                const pNode = renderParagraphTipTap(cp, ctx);
                if (pNode) cellContent.push(pNode);
            }
            if (cellContent.length === 0) {
                cellContent.push({ type: 'paragraph', content: [] });
            }

            const isHeader = cAttrs.rowType === 'headerRow' || cAttrs.header === 'true';
            rowNode.content!.push({
                type: isHeader ? 'tableHeader' : 'tableCell',
                attrs: {
                    ...(cAttrs.colspan ? { colspan: Number.parseInt(String(cAttrs.colspan), 10) || 1 } : {}),
                    ...(cAttrs.rowspan ? { rowspan: Number.parseInt(String(cAttrs.rowspan), 10) || 1 } : {}),
                    ...(cAttrs.bgColor ? { bgColor: cAttrs.bgColor } : {}),
                    ...(cAttrs.vAlign ? { verticalAlign: cAttrs.vAlign } : {}),
                    ...(cAttrs.hAlign ? { textAlign: TABLE_ALIGN_MAP[String(cAttrs.hAlign)] ?? 'left' } : {}),
                },
                content: cellContent,
            });
        }
        if (rowNode.content!.length > 0) tableNode.content!.push(rowNode);
    }

    return tableNode.content!.length > 0 ? tableNode : null;
}

function renderParagraphHtml(p: XmlParagraph, ctx: UyapTemplateContext): string {
    const { spans, blockGapAfter, paragraphEnd } = finalizeUyapParagraphText(renderUyapParagraphSpans(p, ctx));
    const hasImages = paragraphHasImages(p);
    if (!paragraphHasVisibleContent(spans) && !hasImages) {
        return '';
    }

    let pContent = spansToHtml(spans);
    if (hasImages) {
        pContent += uyapImagesToHtml(p.image);
    }

    const pStyle = uyapParagraphStyleForHtml(p, {
        hasTabCharacters: uyapParagraphHasTabCharacters(spans),
        blockGapAfter,
    });
    const extraAttrs = uyapParagraphHtmlAttrs(p, { blockGapAfter, paragraphEnd });
    const attrStr = Object.entries(extraAttrs)
        .map(([k, v]) => ` ${k}="${escapeHtml(v)}"`)
        .join('');
    const tag = uyapParagraphBlockKind(p) === 'heading' ? `h${uyapHeadingLevel(p)}` : 'p';

    return `<${tag} style="${pStyle}"${attrStr}>${pContent}</${tag}>`;
}

function renderParagraphTipTap(p: XmlParagraph, ctx: UyapTemplateContext): TiptapNode | null {
    const { spans, blockGapAfter, paragraphEnd } = finalizeUyapParagraphText(renderUyapParagraphSpans(p, ctx));
    const imageNodes = uyapImagesToTipTapNodes(p.image);
    if (!paragraphHasVisibleContent(spans) && imageNodes.length === 0) {
        return null;
    }

    const attrs = uyapParagraphAttrsToTipTap(p, {
        blockGapAfter,
        paragraphEnd,
        hasTabElements: (p.tab?.length ?? 0) > 0,
    });
    const isHeading = uyapParagraphBlockKind(p) === 'heading';
    const tiptapBlock: TiptapNode = {
        type: isHeading ? 'heading' : 'paragraph',
        attrs: isHeading ? { ...attrs, level: uyapHeadingLevel(p) } : attrs,
        content: [...spansToTiptapNodes(spans), ...imageNodes],
    };

    return tiptapBlock;
}

function pageBreakTipTapNode(): TiptapNode {
    return {
        type: 'pageBreak',
        attrs: { kind: 'page' },
    };
}

function pageBreakHtml(): string {
    return '<div class="page-break" contenteditable="false"><div class="nomai-break-visual" aria-hidden="true"><span class="nomai-break-line"></span><span class="nomai-break-label">Sayfa Sonu</span><span class="nomai-break-line"></span></div></div>';
}

async function parseParagraphsInBand(xml: string): Promise<XmlParagraph[]> {
    const inner = xml.replace(/^<(header|footer)\b[^>]*>/i, '').replace(/<\/(header|footer)>$/i, '');
    const wrapped = `<?xml version="1.0"?><band>${inner}</band>`;
    const parser = createUyapXmlParser({ explicitArray: true });
    try {
        const parsed = (await parser.parseStringPromise(wrapped)) as {
            band?: { paragraph?: XmlParagraph[] };
        };
        return parsed.band?.paragraph ?? [];
    } catch {
        return [];
    }
}

async function renderUyapBandToHtml(
    bandXml: string,
    bandTag: 'header' | 'footer',
    ctx: UyapTemplateContext,
    renderParagraph: (p: XmlParagraph) => string,
): Promise<string> {
    const paragraphs = await parseParagraphsInBand(bandXml);
    let inner = '';
    for (const p of paragraphs) {
        inner += renderParagraph(p);
    }
    if (!inner.trim()) return '';
    return `<${bandTag} class="udf-${bandTag}-band">${inner}</${bandTag}>`;
}

export async function parseUyapToTipTap(xmlData: string): Promise<TiptapDoc | null> {
    const parser = createUyapXmlParser();

    try {
        const result = (await parser.parseStringPromise(xmlData)) as XmlParseResult;

        if (!result.template || !result.template.content) {
            console.error('Geçersiz UYAP XML formatı');
            return null;
        }

        const ctx = buildTemplateContext(result.template);
        const tiptapDoc: TiptapDoc = {
            type: 'doc',
            content: [],
        };

        const ordered = extractUyapElementsInOrder(xmlData);
        for (const el of ordered) {
            if (el.tag === 'header' || el.tag === 'footer') continue;
            if (el.tag === 'page-break') {
                tiptapDoc.content.push(pageBreakTipTapNode());
                continue;
            }
            if (el.tag === 'table') {
                const t = await parseTableFragment(el.xml);
                if (t) {
                    const tableNode = renderTableTipTap(t, ctx);
                    if (tableNode) tiptapDoc.content.push(tableNode);
                }
                continue;
            }
            if (el.tag === 'paragraph') {
                const p = await parseParagraphFragment(el.xml);
                if (!p) continue;
                const node = renderParagraphTipTap(p, ctx);
                if (node) tiptapDoc.content.push(node);
            }
        }

        return tiptapDoc;
    } catch (error) {
        console.error('XML Parse Hatası:', error);
        return null;
    }
}

export interface ParseUyapToHtmlOptions {
    /** Viewer-only. Editor import must omit this — QR stays export overlay, not TipTap HTML. */
    verification?: UyapVerificationMeta | null;
}

export async function parseUyapToHtml(
    xmlData: string,
    options?: ParseUyapToHtmlOptions,
): Promise<string | null> {
    const parser = createUyapXmlParser();

    try {
        const result = (await parser.parseStringPromise(xmlData)) as XmlParseResult;

        if (!result.template || !result.template.content) {
            console.error('Geçersiz UYAP XML formatı');
            return null;
        }

        const ctx = buildTemplateContext(result.template);
        let html = '<div class="udf-content">';

        const renderParagraph = (p: XmlParagraph) => renderParagraphHtml(p, ctx);

        const ordered = extractUyapElementsInOrder(xmlData);
        for (const el of ordered) {
            if (el.tag === 'header') {
                html += await renderUyapBandToHtml(el.xml, 'header', ctx, renderParagraph);
                continue;
            }
            if (el.tag === 'footer') {
                html += await renderUyapBandToHtml(el.xml, 'footer', ctx, renderParagraph);
                continue;
            }
            if (el.tag === 'page-break') {
                html += pageBreakHtml();
                continue;
            }
            if (el.tag === 'paragraph') {
                const p = await parseParagraphFragment(el.xml);
                if (p) html += renderParagraph(p);
                continue;
            }
            if (el.tag === 'table') {
                const t = await parseTableFragment(el.xml);
                if (t) html += renderTableHtml(t, ctx);
            }
        }

        html += '</div>';
        // Viewer / print-preview only. Editor paths call parseUyapToHtml without
        // `verification` and strip leftovers via `stripUyapVerificationFromHtml`.
        return appendUyapVerificationToHtml(html, options?.verification);
    } catch (error) {
        console.error('XML Parse Hatası (HTML):', error);
        return null;
    }
}
