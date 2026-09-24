import {
    AlignmentType,
    BorderStyle,
    CommentRangeEnd,
    CommentRangeStart,
    CommentReference,
    Document,
    Footer,
    FootnoteReferenceRun,
    Header,
    HeadingLevel,
    ImageRun,
    PageBreak,
    Packer,
    Paragraph,
    SectionType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    UnderlineType,
    VerticalAlignTable,
    WidthType,
} from 'docx';
import type { Editor } from '@tiptap/react';
import type { JSONContent, TipTapMark } from '../../types/tiptapContent';
import { getCommentIdsInDocumentOrder, getStoredComments, type Reply } from '../commentUtils';
import { compileHfHtmlForDocx, type CompileHfOptions } from '../compileHfHtml';
import { htmlStringToPlainText } from '../htmlPlainText';
import { getPaginationMargins } from '../paginationMarginSync';
import {
    EDITOR_PAGE_HEIGHT_PX,
    EDITOR_PAGE_MARGIN_LEFT_PX,
    EDITOR_PAGE_MARGIN_RIGHT_PX,
    EDITOR_PAGE_WIDTH_PX,
    EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX,
} from '../editorLayout';
import { useHeaderFooterStore } from '../../stores/useHeaderFooterStore';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { pickExportHeaderFooterSection } from '../headerFooterExportPick';
import { resolveCssVarsInHtmlString } from '../resolveCssVarsForExport';
import type { ListStyleType } from '../orderedListExportAnnotate';
import { buildDocxNumberingConfig, listLevelIndentTwips, numberingReferenceForList } from './listNumbering';
import { mapFontFamilyForDocx } from './fontMap';
import { fontSizeHalfPointsFromEditor, DEFAULT_DOCX_FONT_HALF_POINTS } from './fontSizeHalfPoints';
import { appendPageNumberParagraph, hfHtmlToNativeBlocks, type HfNativeBlock } from './hfNativeParagraphs';
import { rasterBandParagraph } from './hfRasterParagraphs';
import { htmlInlineToDocxRuns } from './inlineHtml';

export type DocxCommentForExport = {
    id: string;
    text: string;
    author?: string;
    resolved?: boolean;
    date?: string;
    replies?: Reply[];
};

export type DocxPageMargins = {
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
};

export type DocxNativeExportOptions = {
    docTitle?: string;
    documentId?: string | null;
    comments?: DocxCommentForExport[];
    defaultFont?: string;
    pageMargins?: DocxPageMargins | null;
};

export type DocxBuildResult = {
    buffer: Uint8Array;
};

const DEFAULT_FONT = 'Times New Roman';
const PX_TO_TWIP = 15;

function pxToTwip(px: number): number {
    return Math.round(px * PX_TO_TWIP);
}

function parseListType(attrs: Record<string, unknown> | undefined): ListStyleType {
    const t = attrs?.listTypeName;
    if (t === 'legal' || t === 'roman' || t === 'paren' || t === 'outline') return t;
    return 'default';
}

function parseListStart(attrs: Record<string, unknown> | undefined): number {
    const n = Number(attrs?.start ?? 1);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function alignmentFromTextAlign(value: unknown): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
    switch (value) {
        case 'left':
            return AlignmentType.LEFT;
        case 'center':
            return AlignmentType.CENTER;
        case 'right':
            return AlignmentType.RIGHT;
        case 'justify':
            return AlignmentType.JUSTIFIED;
        default:
            return undefined;
    }
}

function headingLevel(level: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined {
    switch (level) {
        case 1:
            return HeadingLevel.HEADING_1;
        case 2:
            return HeadingLevel.HEADING_2;
        case 3:
            return HeadingLevel.HEADING_3;
        case 4:
            return HeadingLevel.HEADING_4;
        case 5:
            return HeadingLevel.HEADING_5;
        case 6:
            return HeadingLevel.HEADING_6;
        default:
            return undefined;
    }
}

function mapTableBorderStyle(raw: string): (typeof BorderStyle)[keyof typeof BorderStyle] {
    switch (raw.toLowerCase()) {
        case 'dashed':
            return BorderStyle.DASHED;
        case 'dotted':
            return BorderStyle.DOTTED;
        case 'double':
            return BorderStyle.DOUBLE;
        case 'none':
            return BorderStyle.NONE;
        case 'solid':
        default:
            return BorderStyle.SINGLE;
    }
}

function tableBorderOptions(attrs: Record<string, unknown>) {
    if (attrs.border === false) {
        const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
        return {
            top: none,
            bottom: none,
            left: none,
            right: none,
            insideHorizontal: none,
            insideVertical: none,
        };
    }
    const width = Math.max(0.5, Number(attrs.borderWidth ?? 1));
    const size = Math.max(1, Math.round(width * 8));
    const style = mapTableBorderStyle(String(attrs.borderStyle ?? 'solid'));
    const side = { color: '000000', space: 1, style, size };
    return {
        top: side,
        bottom: side,
        left: side,
        right: side,
        insideHorizontal: side,
        insideVertical: side,
    };
}

function formatCommentReplyDate(raw: string | undefined): string {
    if (!raw) return '';
    const date = new Date(raw);
    if (!Number.isFinite(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function formatCommentBody(text: string, replies?: Reply[]): string {
    let body = text.trim();
    for (const reply of replies ?? []) {
        const replyText = (reply.text || '').trim();
        if (!replyText) continue;
        const author = reply.author?.trim() || 'UDFIX';
        const datePart = formatCommentReplyDate(reply.date);
        body += `\n\n— Yanıt (${author}${datePart ? `, ${datePart}` : ''}):\n${replyText}`;
    }
    return body;
}

function parseCommentDate(raw: string | undefined): Date {
    if (!raw) return new Date();
    const date = new Date(raw);
    return Number.isFinite(date.getTime()) ? date : new Date();
}

/** Strip XML-unsafe control chars; Word rejects comments with raw `<`/`&` in author. */
function sanitizeCommentAuthor(raw: string): string {
    const trimmed = raw.trim() || 'UDFIX';
    return trimmed
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        .replace(/[<>&]/g, '')
        .slice(0, 128);
}

function authorInitials(author: string): string {
    const parts = author.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'UD';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}


function commentTextToParagraphs(text: string): Paragraph[] {
    const trimmed = text.trim();
    if (!trimmed) return [new Paragraph({ children: [new TextRun('')] })];

    const blocks = trimmed.split(/\n\n+/).filter(Boolean);
    return blocks.map((block) => {
        const lines = block.split('\n');
        const children: TextRun[] = [];
        for (let i = 0; i < lines.length; i += 1) {
            if (i > 0) children.push(new TextRun({ break: 1 }));
            const line = lines[i] ?? '';
            if (line.length > 0) children.push(new TextRun(line));
        }
        return new Paragraph({
            children: children.length > 0 ? children : [new TextRun('')],
        });
    });
}

function hfBandHasImages(...parts: string[]): boolean {
    return parts.some((part) => /<img\b/i.test(part));
}

function sectionHasBandContent(sec: ReturnType<typeof pickExportHeaderFooterSection>, isHeader: boolean): boolean {
    if (isHeader) {
        return Boolean(sec.headerLeft.trim() || sec.headerCenter.trim() || sec.headerRight.trim());
    }
    return Boolean(sec.footerLeft.trim() || sec.footerCenter.trim() || sec.footerRight.trim());
}

function bandHasPageToken(...parts: string[]): boolean {
    return parts.some((part) => /\{page\}|\{totalPages?\}|\{total\}/i.test(part));
}

type FootnoteEntry = { id: string; number: number; html: string; plain: string };

function mapFontFamily(raw: string | undefined, fallback: string): string {
    return mapFontFamilyForDocx(raw, fallback);
}

function parseColor(raw: unknown): string | undefined {
    if (typeof raw !== 'string' || !raw.trim()) return undefined;
    const v = raw.trim();
    if (/^#[0-9a-f]{3,8}$/i.test(v)) return v.replace('#', '');
    const m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (m) {
        const hex = (n: string) => Number.parseInt(n, 10).toString(16).padStart(2, '0');
        return `${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
    }
    return undefined;
}

function collectFootnotes(doc: JSONContent): FootnoteEntry[] {
    const byId = new Map<string, FootnoteEntry>();
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
                        html,
                        plain,
                    });
                }
            }
        }
        node.content?.forEach(walk);
    };
    doc.content?.forEach(walk);
    return Array.from(byId.values()).sort((a, b) => a.number - b.number);
}

function parseImageData(src: string): { type: 'png' | 'jpg' | 'gif' | 'bmp'; data: Uint8Array } | null {
    const m = src.match(/^data:image\/(\w+);base64,(.+)$/i);
    if (!m) return null;
    const fmt = m[1].toLowerCase();
    const type =
        fmt === 'jpeg' || fmt === 'jpg'
            ? 'jpg'
            : fmt === 'png'
              ? 'png'
              : fmt === 'gif'
                ? 'gif'
                : fmt === 'bmp'
                  ? 'bmp'
                  : null;
    if (!type) return null;
    try {
        const binary = atob(m[2]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return { type, data: bytes };
    } catch {
        return null;
    }
}

function resolveVariableText(id: string | null, label: string | null, docTitle: string): string {
    const lid = (label || '').trim();
    if (lid) return lid;
    switch (id) {
        case 'date': {
            const d = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
        }
        case 'title':
            return docTitle || 'Belge';
        case 'page':
            return '1';
        case 'total':
        case 'totalPages':
            return '?';
        default:
            return id ? `{${id}}` : '';
    }
}

type RunContext = {
    docTitle: string;
    defaultFont: string;
    commentIdToNumeric: Map<string, number>;
    openComments: Set<number>;
    footnoteIdToNumber: Map<string, number>;
};

function marksToTextRun(text: string, marks: TipTapMark[] | undefined, ctx: RunContext): TextRun[] {
    const runs: TextRun[] = [];
    let bold = false;
    let italics = false;
    let underline: { type?: (typeof UnderlineType)[keyof typeof UnderlineType] } | undefined;
    let strike = false;
    let superScript = false;
    let subScript = false;
    let font: string | undefined;
    let size: number | undefined;
    let color: string | undefined;
    let shading: { fill?: string } | undefined;

    for (const mark of marks ?? []) {
        switch (mark.type) {
            case 'bold':
                bold = true;
                break;
            case 'italic':
                italics = true;
                break;
            case 'underline':
                underline = { type: UnderlineType.SINGLE };
                break;
            case 'strike':
                strike = true;
                break;
            case 'superscript':
                superScript = true;
                break;
            case 'subscript':
                subScript = true;
                break;
            case 'textStyle': {
                const attrs = mark.attrs ?? {};
                if (attrs.fontFamily) font = mapFontFamily(String(attrs.fontFamily), ctx.defaultFont);
                if (attrs.fontSize) size = fontSizeHalfPointsFromEditor(attrs.fontSize);
                if (attrs.color) color = parseColor(attrs.color);
                break;
            }
            case 'highlight': {
                const fill = parseColor(mark.attrs?.color ?? '#ffff00');
                if (fill) shading = { fill };
                break;
            }
            case 'link':
                break;
            default:
                break;
        }
    }

    const runOpts = {
        text,
        font: font ?? ctx.defaultFont,
        bold,
        italics,
        underline,
        strike,
        superScript,
        subScript,
        size: size ?? DEFAULT_DOCX_FONT_HALF_POINTS,
        color,
        shading,
    };

    runs.push(new TextRun(runOpts));
    return runs;
}

type BlockChild = Paragraph | Table;

type ListWalkContext = {
    listLevel: number;
    listRef: string | null;
    listInstance: number | null;
};

type WalkState = {
    ctx: RunContext;
    listInstanceCounter: number;
    extraListStarts: Array<{ reference: string; start: number }>;
    sectionParts: Array<{ children: BlockChild[]; sectionType?: (typeof SectionType)[keyof typeof SectionType] }>;
    currentChildren: BlockChild[];
};

function pushBlock(state: WalkState, block: BlockChild): void {
    state.currentChildren.push(block);
}

function startNextSection(state: WalkState, sectionType: (typeof SectionType)[keyof typeof SectionType]): void {
    state.sectionParts.push({ children: state.currentChildren, sectionType });
    state.currentChildren = [];
}

function emitParagraphFromInline(
    node: JSONContent,
    state: WalkState,
    listLevel: number | null,
    listRef: string | null,
    listInstance: number | null,
    listIndentLevel: number | null = null,
): void {
    const children: Array<TextRun | FootnoteReferenceRun | CommentRangeStart | CommentRangeEnd | CommentReference> = [];

    const flushOpenComments = () => {
        for (const cid of state.ctx.openComments) {
            children.push(new CommentRangeEnd(cid));
            children.push(new CommentReference(cid));
        }
        state.ctx.openComments.clear();
    };

    const walkInline = (n: JSONContent) => {
        if (n.type === 'text') {
            const text = n.text ?? '';
            const marks = (n.marks ?? []) as TipTapMark[];
            const footnoteMark = marks.find((m) => m.type === 'footnote');
            if (footnoteMark?.attrs?.id) {
                const fnId = String(footnoteMark.attrs.id);
                const num = state.ctx.footnoteIdToNumber.get(fnId);
                if (num != null) {
                    children.push(new FootnoteReferenceRun(num));
                    return;
                }
            }

            const commentMarks = marks.filter((m) => m.type === 'comment' && m.attrs?.commentId);
            const commentIds = commentMarks
                .map((m) => state.ctx.commentIdToNumeric.get(String(m.attrs?.commentId)))
                .filter((v): v is number => v != null);

            for (const cid of commentIds) {
                if (!state.ctx.openComments.has(cid)) {
                    children.push(new CommentRangeStart(cid));
                    state.ctx.openComments.add(cid);
                }
            }

            const nonFootnoteMarks = marks.filter((m) => m.type !== 'footnote' && m.type !== 'comment');
            if (text.length > 0) {
                children.push(...marksToTextRun(text, nonFootnoteMarks, state.ctx));
            }

            for (const cid of commentIds) {
                if (state.ctx.openComments.has(cid)) {
                    children.push(new CommentRangeEnd(cid));
                    children.push(new CommentReference(cid));
                    state.ctx.openComments.delete(cid);
                }
            }
        } else if (n.type === 'hardBreak') {
            flushOpenComments();
            children.push(new TextRun({ break: 1 }));
        } else if (n.type === 'mention') {
            const label = String(n.attrs?.label ?? n.attrs?.id ?? '@mention');
            children.push(new TextRun({ text: label, font: state.ctx.defaultFont, size: DEFAULT_DOCX_FONT_HALF_POINTS }));
        } else if (n.type === 'variable') {
            const id = n.attrs?.id != null ? String(n.attrs.id) : null;
            const label = n.attrs?.label != null ? String(n.attrs.label) : null;
            children.push(
                new TextRun({
                    text: resolveVariableText(id, label, state.ctx.docTitle),
                    font: state.ctx.defaultFont,
                    size: DEFAULT_DOCX_FONT_HALF_POINTS,
                }),
            );
        } else if (n.type === 'variableSlot') {
            const key = String(n.attrs?.key ?? 'variable');
            children.push(new TextRun({ text: `{${key}}`, font: state.ctx.defaultFont, size: DEFAULT_DOCX_FONT_HALF_POINTS }));
        } else if (n.type === 'image') {
            flushOpenComments();
            const src = String(n.attrs?.src ?? '');
            const parsed = parseImageData(src);
            if (parsed) {
                const w = Number(n.attrs?.width) || 200;
                const h = Number(n.attrs?.height) || 150;
                children.push(
                    new ImageRun({
                        type: parsed.type,
                        data: parsed.data,
                        transformation: { width: w, height: h },
                    }),
                );
            }
        } else if (n.content?.length) {
            n.content.forEach(walkInline);
        }
    };

    node.content?.forEach(walkInline);
    flushOpenComments();

    const attrs = node.attrs ?? {};
    const alignment = alignmentFromTextAlign(attrs.textAlign);
    const heading =
        node.type === 'heading' ? headingLevel(Number(attrs.level ?? 1)) : undefined;

    const numbering =
        listLevel != null && listRef
            ? {
                  reference: listRef,
                  level: listLevel,
                  instance: listInstance ?? undefined,
              }
            : undefined;

    const indent =
        numbering == null && listIndentLevel != null
            ? { left: listLevelIndentTwips(listIndentLevel) }
            : undefined;

    pushBlock(
        state,
        new Paragraph({
            children: children.length > 0 ? children : [new TextRun('')],
            alignment,
            heading,
            numbering,
            indent,
            spacing: attrs.nomaiSectionStart === 'nextPage' ? { before: 0, after: 0 } : undefined,
            pageBreakBefore: attrs.pageBreakBefore === true,
        }),
    );
}

function walkListItems(
    items: JSONContent[] | undefined,
    state: WalkState,
    listCtx: ListWalkContext,
    processItemBlock: (child: JSONContent, itemCtx: ListWalkContext, firstInItem: boolean) => void,
): void {
    for (const item of items ?? []) {
        if (item.type !== 'listItem') continue;
        let firstInItem = true;
        for (const child of item.content ?? []) {
            if (child.type === 'orderedList' || child.type === 'bulletList') {
                walkBlock(child, state, listCtx);
            } else {
                processItemBlock(child, listCtx, firstInItem);
                firstInItem = false;
            }
        }
    }
}

function walkBlock(node: JSONContent, state: WalkState, listCtx: ListWalkContext = { listLevel: -1, listRef: null, listInstance: null }): void {
    switch (node.type) {
        case 'paragraph':
        case 'heading':
            if (node.type === 'paragraph' && node.attrs?.nomaiSectionStart === 'nextPage') {
                pushBlock(state, new Paragraph({ children: [new PageBreak()] }));
            }
            emitParagraphFromInline(
                node,
                state,
                listCtx.listLevel >= 0 ? listCtx.listLevel : null,
                listCtx.listRef,
                listCtx.listInstance,
            );
            break;
        case 'bulletList': {
            const instance = state.listInstanceCounter++;
            const level = listCtx.listLevel + 1;
            const itemCtx: ListWalkContext = { listLevel: level, listRef: 'udfix-bullet', listInstance: instance };
            walkListItems(node.content, state, itemCtx, (child, ctx, firstInItem) => {
                if (child.type === 'paragraph' || child.type === 'heading') {
                    emitParagraphFromInline(
                        child,
                        state,
                        firstInItem ? ctx.listLevel : null,
                        firstInItem ? ctx.listRef : null,
                        firstInItem ? ctx.listInstance : null,
                        firstInItem ? null : ctx.listLevel,
                    );
                } else {
                    walkBlock(child, state, listCtx);
                }
            });
            break;
        }
        case 'orderedList': {
            const listType = parseListType(node.attrs);
            const start = parseListStart(node.attrs);
            const ref = numberingReferenceForList(listType, start);
            if (start > 1) state.extraListStarts.push({ reference: ref, start });
            const instance = state.listInstanceCounter++;
            const level = listCtx.listLevel + 1;
            const itemCtx: ListWalkContext = { listLevel: level, listRef: ref, listInstance: instance };
            walkListItems(node.content, state, itemCtx, (child, ctx, firstInItem) => {
                if (child.type === 'paragraph' || child.type === 'heading') {
                    emitParagraphFromInline(
                        child,
                        state,
                        firstInItem ? ctx.listLevel : null,
                        firstInItem ? ctx.listRef : null,
                        firstInItem ? ctx.listInstance : null,
                        firstInItem ? null : ctx.listLevel,
                    );
                } else {
                    walkBlock(child, state, listCtx);
                }
            });
            void listType;
            break;
        }
        case 'listItem':
            node.content?.forEach((child) => walkBlock(child, state, listCtx));
            break;
        case 'pageBreak': {
            const kind = node.attrs?.kind;
            if (kind === 'sectionNext') {
                startNextSection(state, SectionType.NEXT_PAGE);
            } else {
                pushBlock(state, new Paragraph({ children: [new PageBreak()] }));
            }
            break;
        }
        case 'table':
            pushBlock(state, buildTable(node, state));
            break;
        case 'blockquote':
            node.content?.forEach((child) => walkBlock(child, state, listCtx));
            break;
        case 'horizontalRule':
            pushBlock(
                state,
                new Paragraph({
                    border: {
                        bottom: { color: 'auto', space: 1, style: BorderStyle.SINGLE, size: 6 },
                    },
                }),
            );
            break;
        case 'codeBlock':
            pushBlock(
                state,
                new Paragraph({
                    children: [
                        new TextRun({
                            text: node.content?.map((c) => c.text ?? '').join('') ?? '',
                            font: 'Courier New',
                            size: DEFAULT_DOCX_FONT_HALF_POINTS,
                        }),
                    ],
                }),
            );
            break;
        case 'doc':
            node.content?.forEach((child) => walkBlock(child, state, listCtx));
            break;
        default:
            if (node.content?.length) node.content.forEach((child) => walkBlock(child, state, listCtx));
            break;
    }
}

function buildTable(node: JSONContent, state: WalkState): Table {
    const rows: TableRow[] = [];
    node.content?.forEach((rowNode) => {
        if (rowNode.type !== 'tableRow') return;
        const cells: TableCell[] = [];
        rowNode.content?.forEach((cellNode) => {
            if (cellNode.type !== 'tableCell' && cellNode.type !== 'tableHeader') return;
            const cellBlocks: BlockChild[] = [];
            const cellState: WalkState = {
                ...state,
                currentChildren: cellBlocks,
                sectionParts: [],
            };
            cellNode.content?.forEach((child) => walkBlock(child, cellState));
            if (cellBlocks.length === 0) cellBlocks.push(new Paragraph({ children: [new TextRun('')] }));

            const attrs = cellNode.attrs ?? {};
            const colspan = Math.max(1, Number(attrs.colspan ?? 1));
            const rowspan = Math.max(1, Number(attrs.rowspan ?? 1));
            const valignRaw = String(attrs.verticalAlign ?? 'top');
            const verticalAlign =
                valignRaw === 'middle'
                    ? VerticalAlignTable.CENTER
                    : valignRaw === 'bottom'
                      ? VerticalAlignTable.BOTTOM
                      : VerticalAlignTable.TOP;

            const bgRaw = attrs.background ?? attrs.backgroundColor ?? attrs.bgColor;
            cells.push(
                new TableCell({
                    children: cellBlocks,
                    columnSpan: colspan > 1 ? colspan : undefined,
                    rowSpan: rowspan > 1 ? rowspan : undefined,
                    verticalAlign,
                    shading: bgRaw
                        ? { fill: parseColor(String(bgRaw)) ?? String(bgRaw).replace('#', '') }
                        : undefined,
                }),
            );
        });
        rows.push(new TableRow({ children: cells, cantSplit: rowNode.attrs?.cantSplit === true }));
    });

    const tableAttrs = node.attrs ?? {};

    return new Table({
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorderOptions(tableAttrs),
    });
}

function buildHfCompileOptions(isHeader: boolean, docTitle: string): CompileHfOptions {
    const s = useHeaderFooterStore.getState();
    const sec = pickExportHeaderFooterSection(s);
    return {
        left: isHeader ? sec.headerLeft : sec.footerLeft,
        center: isHeader ? sec.headerCenter : sec.footerCenter,
        right: isHeader ? sec.headerRight : sec.footerRight,
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

async function buildHeaderFooterBands(
    docTitle: string,
    defaultFont: string,
    margins: DocxPageMargins | null | undefined,
): Promise<{ headerBlocks: HfNativeBlock[]; footerBlocks: HfNativeBlock[] }> {
    const hfStore = useHeaderFooterStore.getState();
    const sec = pickExportHeaderFooterSection(hfStore);

    const footerHasContent = sectionHasBandContent(sec, false);
    const footerHasPageToken = bandHasPageToken(sec.footerLeft, sec.footerCenter, sec.footerRight);
    const footerShouldExport = footerHasContent || footerHasPageToken;

    const headerHtml = compileHfHtmlForDocx(buildHfCompileOptions(true, docTitle)).trim();
    const footerHtml = compileHfHtmlForDocx(buildHfCompileOptions(false, docTitle)).trim();

    const headerHasImages = hfBandHasImages(sec.headerLeft, sec.headerCenter, sec.headerRight);
    const footerHasImages = hfBandHasImages(sec.footerLeft, sec.footerCenter, sec.footerRight);
    const useFooterRaster = footerHasImages && !footerHasPageToken;

    let headerBlocks: HfNativeBlock[] = [];
    let footerBlocks: HfNativeBlock[] = [];

    if (typeof document !== 'undefined' && (headerHasImages || useFooterRaster)) {
        const { buildDocxHfRasterBands } = await import('./hfRasterBuild');
        const { headerRaster, footerRaster } = await buildDocxHfRasterBands(docTitle, margins);
        if (headerRaster && headerHasImages) {
            headerBlocks = [rasterBandParagraph(headerRaster)];
        }
        if (footerRaster && useFooterRaster) {
            footerBlocks = [rasterBandParagraph(footerRaster)];
        }
    }

    if (headerBlocks.length === 0 && headerHtml) {
        headerBlocks = hfHtmlToNativeBlocks(headerHtml, defaultFont);
    }

    if (footerBlocks.length === 0 && footerShouldExport) {
        if (footerHtml) {
            footerBlocks = hfHtmlToNativeBlocks(footerHtml, defaultFont);
        } else if (footerHasPageToken) {
            footerBlocks = appendPageNumberParagraph([], defaultFont);
        }
    }

    return { headerBlocks, footerBlocks };
}

function buildCommentOptions(comments: DocxCommentForExport[], idMap: Map<string, number>) {
    const options: Array<{
        id: number;
        author: string;
        initials: string;
        date: Date;
        children: Paragraph[];
        resolved?: boolean;
    }> = [];

    for (const c of comments) {
        const id = idMap.get(c.id) ?? options.length;
        const author = sanitizeCommentAuthor(c.author?.trim() || 'UDFIX');
        const body = formatCommentBody(c.text, c.replies);
        const children = commentTextToParagraphs(body);

        options.push({
            id,
            author,
            initials: authorInitials(author),
            date: parseCommentDate(c.date),
            resolved: c.resolved,
            children: children.length > 0 ? children : [new Paragraph({ children: [new TextRun('')] })],
        });
    }

    return options;
}

function pagePropertiesFromMargins(margins: DocxPageMargins | null | undefined) {
    const mTop = margins?.marginTop ?? EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX;
    const mBottom = margins?.marginBottom ?? EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX;
    const mLeft = margins?.marginLeft ?? EDITOR_PAGE_MARGIN_LEFT_PX;
    const mRight = margins?.marginRight ?? EDITOR_PAGE_MARGIN_RIGHT_PX;
    return {
        page: {
            size: {
                width: pxToTwip(EDITOR_PAGE_WIDTH_PX),
                height: pxToTwip(EDITOR_PAGE_HEIGHT_PX),
            },
            margin: {
                top: pxToTwip(mTop),
                bottom: pxToTwip(mBottom),
                left: pxToTwip(mLeft),
                right: pxToTwip(mRight),
            },
        },
    };
}

export async function buildDocxDocumentFromJson(json: JSONContent, options: DocxNativeExportOptions = {}): Promise<Document> {
    const docTitle = options.docTitle ?? 'Belge';
    const defaultFont = options.defaultFont ?? DEFAULT_FONT;

    const commentsInput = options.comments ?? [];
    const commentIdToNumeric = new Map<string, number>();
    commentsInput.forEach((c, i) => commentIdToNumeric.set(c.id, i));

    const footnotes = collectFootnotes(json);
    const footnoteIdToNumber = new Map<string, number>();
    const footnotesRecord: Record<string, { children: Paragraph[] }> = {};
    for (const fn of footnotes) {
        footnoteIdToNumber.set(fn.id, fn.number);
        footnotesRecord[String(fn.number)] = {
            children: [
                new Paragraph({
                    children: htmlInlineToDocxRuns(fn.html || fn.plain, defaultFont),
                }),
            ],
        };
    }

    const state: WalkState = {
        ctx: {
            docTitle,
            defaultFont,
            commentIdToNumeric,
            openComments: new Set(),
            footnoteIdToNumber,
        },
        listInstanceCounter: 1,
        extraListStarts: [],
        sectionParts: [],
        currentChildren: [],
    };

    walkBlock(json, state);
    state.sectionParts.unshift({ children: state.currentChildren });

    const margins = options.pageMargins ?? null;
    const { headerBlocks, footerBlocks } = await buildHeaderFooterBands(docTitle, defaultFont, margins);

    const docSections = state.sectionParts.map((part, index) => ({
        properties: {
            ...pagePropertiesFromMargins(margins),
            type: index === 0 ? SectionType.CONTINUOUS : (part.sectionType ?? SectionType.NEXT_PAGE),
        },
        headers: headerBlocks.length > 0 ? { default: new Header({ children: headerBlocks }) } : undefined,
        footers: footerBlocks.length > 0 ? { default: new Footer({ children: footerBlocks }) } : undefined,
        children: part.children.length > 0 ? part.children : [new Paragraph('')],
    }));

    return new Document({
        styles: {
            default: {
                document: {
                    run: {
                        font: defaultFont,
                        size: DEFAULT_DOCX_FONT_HALF_POINTS,
                    },
                },
            },
        },
        numbering: buildDocxNumberingConfig(state.extraListStarts),
        comments:
            commentsInput.length > 0
                ? { children: buildCommentOptions(commentsInput, commentIdToNumeric) }
                : undefined,
        footnotes: Object.keys(footnotesRecord).length > 0 ? footnotesRecord : undefined,
        sections: docSections.length > 0 ? docSections : [{ children: [new Paragraph('')] }],
    });
}

export async function buildDocxBufferFromJson(
    json: JSONContent,
    options: DocxNativeExportOptions = {},
): Promise<Uint8Array> {
    const doc = await buildDocxDocumentFromJson(json, options);
    const blob = await Packer.toBlob(doc);
    return new Uint8Array(await blob.arrayBuffer());
}

export function collectCommentsForDocxExport(
    editor: Editor,
    documentId: string | null | undefined,
): DocxCommentForExport[] {
    if (!documentId) return [];
    const stored = getStoredComments(documentId);
    const out: DocxCommentForExport[] = [];
    for (const id of getCommentIdsInDocumentOrder(editor)) {
        const c = stored[id];
        if (c?.text?.trim()) {
            out.push({
                id,
                text: c.text.trim(),
                author: c.author,
                resolved: c.resolved,
                date: c.date,
                replies: c.replies,
            });
        }
    }
    return out;
}

export async function buildDocxFromEditor(
    editor: Editor,
    options: DocxNativeExportOptions = {},
): Promise<DocxBuildResult> {
    const json = editor.getJSON();
    const docTitle =
        options.docTitle ??
        useLayoutStore.getState().documents.find((d) => d.id === useLayoutStore.getState().activeDocument)?.title ??
        'Belge';
    const documentId = options.documentId ?? useLayoutStore.getState().activeDocument;
    const comments = options.comments ?? collectCommentsForDocxExport(editor, documentId);

    const pageMargins = options.pageMargins ?? getPaginationMargins(editor);
    const doc = await buildDocxDocumentFromJson(json, { ...options, docTitle, comments, pageMargins });

    const blob = await Packer.toBlob(doc);
    const buffer = new Uint8Array(await blob.arrayBuffer());
    return { buffer };
}

/** @internal test helpers */
export { collectFootnotes, parseListType, parseListStart, numberingReferenceForList, formatCommentBody };
