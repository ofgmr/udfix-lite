import {
    AlignmentType,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    VerticalAlignTable,
    WidthType,
} from 'docx';
import { htmlStringToPlainText } from '../htmlPlainText';
import { htmlInlineToDocxRuns } from './inlineHtml';
import { DEFAULT_DOCX_FONT_HALF_POINTS } from './fontSizeHalfPoints';
import { pageNumberFooterParagraph } from './hfRasterParagraphs';

const HF_INLINE_OPTS = { pageFields: true } as const;

function cellParagraphsFromHtml(
    html: string,
    defaultFont: string,
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType],
): Paragraph[] {
    const trimmed = (html || '').trim();
    if (!trimmed) return [];
    const runs = htmlInlineToDocxRuns(trimmed, defaultFont, HF_INLINE_OPTS);
    if (runs.length === 0) return [];
    return [
        new Paragraph({
            alignment,
            children: runs,
        }),
    ];
}

function htmlTableToDocxTable(html: string, defaultFont: string): Table | null {
    if (typeof document === 'undefined') return null;
    const root = document.createElement('div');
    root.innerHTML = html;
    const tableEl = root.querySelector('table');
    if (!tableEl) return null;

    const rowEl = tableEl.querySelector('tr');
    if (!rowEl) return null;

    const cells = Array.from(rowEl.querySelectorAll('td'));
    if (cells.length === 0) return null;

    const visibleCells = cells.filter((cell) => {
        const style = cell.getAttribute('style') ?? '';
        return !/display\s*:\s*none/i.test(style);
    });
    if (visibleCells.length === 0) return null;

    const colWidth = Math.floor(100 / visibleCells.length);
    const rows: TableRow[] = [
        new TableRow({
            children: visibleCells.map((cell) => {
                const alignMatch = (cell.getAttribute('style') ?? '').match(/text-align\s*:\s*(left|center|right)/i);
                const alignment =
                    alignMatch?.[1] === 'center'
                        ? AlignmentType.CENTER
                        : alignMatch?.[1] === 'right'
                          ? AlignmentType.RIGHT
                          : AlignmentType.LEFT;
                const inner = cell.innerHTML.trim();
                const cellParagraphs = cellParagraphsFromHtml(inner, defaultFont, alignment);
                return new TableCell({
                    width: { size: colWidth, type: WidthType.PERCENTAGE },
                    children: cellParagraphs.length > 0 ? cellParagraphs : [new Paragraph('')],
                    verticalAlign: VerticalAlignTable.TOP,
                });
            }),
        }),
    ];

    return new Table({
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
    });
}

export type HfNativeBlock = Paragraph | Table;

/** Word-compatible native HF blocks from compileHfHtmlForDocx HTML (no raster). */
export function hfHtmlToNativeBlocks(html: string, defaultFont: string): HfNativeBlock[] {
    const trimmed = (html || '').trim();
    if (!trimmed) return [];

    const table = htmlTableToDocxTable(trimmed, defaultFont);
    if (table) return [table];

    const runs = htmlInlineToDocxRuns(trimmed, defaultFont, HF_INLINE_OPTS);
    if (runs.length > 0) {
        return [new Paragraph({ children: runs })];
    }

    const plain = htmlStringToPlainText(trimmed).trim();
    if (!plain) return [];
    return [
        new Paragraph({
            children: [new TextRun({ text: plain, font: defaultFont, size: DEFAULT_DOCX_FONT_HALF_POINTS })],
        }),
    ];
}

/** Fallback when compiled footer HTML is empty but `{page}` token exists in store cells. */
export function appendPageNumberParagraph(blocks: HfNativeBlock[], defaultFont: string): HfNativeBlock[] {
    return [...blocks, pageNumberFooterParagraph(defaultFont)];
}
