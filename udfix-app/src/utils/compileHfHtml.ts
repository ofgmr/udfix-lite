import { normalizeHfColumnHtmlForExport } from './normalizeHfColumnHtml';

/**
 * compileHfHtml.ts
 * 
 * Compiles Left + Center + Right content into a single HTML string
 * for the tiptap-pagination-plus `headerLeft` / `footerLeft` slot.
 * 
 * The plugin only has left/right slots, so we pack all three columns
 * into one flex-container pushed to `headerLeft`, leaving `headerRight` empty.
 *
 * Variable resolution:
 *   {date}       → resolved eagerly (JS side)
 *   {title}      → resolved eagerly from passed docTitle
 *   {page}       → passed through (plugin resolves to current page)
 *   {total}      → passed through (plugin resolves to total pages)
 *   {totalPages} → converted to {total} (plugin alias)
 */

export type DateFormatType = 'DD.MM.YYYY' | 'DD MMMM YYYY' | 'YYYY-MM-DD';

/** Horizontal gap between left/center/right column cells in compiled HF HTML. */
const HF_COLUMN_GAP_PX = 8;
/** Space between column content and separator border (header bottom / footer top). */
const HF_SEPARATOR_TEXT_GAP_PX = 14;

export interface CompileHfOptions {
    left: string;
    center: string;
    right: string;
    layout: '3-col-equal' | '2-col-70-30' | '2-col-30-70' | '2-col-80-20' | '2-col-20-80' | '1-col';
    dateFormat: DateFormatType;
    docTitle: string;
    /** CSS var string, e.g. 'rgba(100,116,139,0.3)' */
    separatorColor?: string;
    separatorWidth?: number;
    showSeparator?: boolean;
    indent?: number;
    isHeader?: boolean;
}

type ColumnTexts = { left: string; center: string; right: string };

const MONTHS = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function formatDate(format: DateFormatType): string {
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth();
    const year = now.getFullYear();
    const pad = (n: number) => String(n).padStart(2, '0');

    switch (format) {
        case 'DD.MM.YYYY': return `${pad(day)}.${pad(month + 1)}.${year}`;
        case 'DD MMMM YYYY': return `${day} ${MONTHS[month]} ${year}`;
        case 'YYYY-MM-DD': return `${year}-${pad(month + 1)}-${pad(day)}`;
        default: return `${pad(day)}.${pad(month + 1)}.${year}`;
    }
}

/**
 * Resolve custom variables in a content string.
 * {page} and {total} are left as-is for the plugin to replace.
 */
function resolveVars(text: string, dateStr: string, docTitle: string): string {
    if (!text) return '';
    let result = text;
    // Support multi-line: convert literal newlines to <br>
    result = result.replace(/\n/g, '<br>');
    // Resolve custom vars eagerly
    result = result.replace(/\{date\}/g, dateStr);
    result = result.replace(/\{title\}/g, docTitle);
    // Normalize totalPages → total (plugin alias)
    result = result.replace(/\{totalPages\}/g, '{total}');
    // VariableNode spans: resolve data-id="date", "title", "totalPages"
    result = result.replace(/<span[^>]*data-type="variable"[^>]*data-id="date"[^>]*>.*?<\/span>/g, dateStr);
    result = result.replace(/<span[^>]*data-type="variable"[^>]*data-id="title"[^>]*>.*?<\/span>/g, docTitle);
    result = result.replace(/<span[^>]*data-type="variable"[^>]*data-id="totalPages"[^>]*>.*?<\/span>/g, '{total}');
    // Keep {page} and data-id="page" VariableNode spans as-is (plugin resolves them)
    result = result.replace(/<span[^>]*data-type="variable"[^>]*data-id="page"[^>]*>.*?<\/span>/g, '{page}');
    return result;
}

function resolveColumnTexts(opts: CompileHfOptions): ColumnTexts {
    const dateStr = formatDate(opts.dateFormat);
    const normalize = (text: string) =>
        normalizeHfColumnHtmlForExport(resolveVars(text, dateStr, opts.docTitle));
    return {
        left: normalize(opts.left),
        center: normalize(opts.center),
        right: normalize(opts.right),
    };
}

const COL_BASE = `min-width:0;box-sizing:border-box;overflow:visible;padding:0 ${HF_COLUMN_GAP_PX / 2}px`;

/** Returns the flex styles for each layout */
function getColStyles(layout: CompileHfOptions['layout']): { left: string; center: string; right: string } {
    switch (layout) {
        case '1-col':
            return {
                left: 'display:none',
                center: `${COL_BASE};flex:1;text-align:center`,
                right: 'display:none',
            };
        case '2-col-70-30':
            return {
                left: `${COL_BASE};flex:0 0 70%;text-align:left`,
                center: 'display:none',
                right: `${COL_BASE};flex:0 0 30%;text-align:right`,
            };
        case '2-col-30-70':
            return {
                left: `${COL_BASE};flex:0 0 30%;text-align:left`,
                center: 'display:none',
                right: `${COL_BASE};flex:0 0 70%;text-align:right`,
            };
        case '2-col-80-20':
            return {
                left: `${COL_BASE};flex:0 0 80%;text-align:left`,
                center: 'display:none',
                right: `${COL_BASE};flex:0 0 20%;text-align:right`,
            };
        case '2-col-20-80':
            return {
                left: `${COL_BASE};flex:0 0 20%;text-align:left`,
                center: 'display:none',
                right: `${COL_BASE};flex:0 0 80%;text-align:right`,
            };
        case '3-col-equal':
        default:
            return {
                left: `${COL_BASE};flex:1;text-align:left`,
                center: `${COL_BASE};flex:1;text-align:center`,
                right: `${COL_BASE};flex:1;text-align:right`,
            };
    }
}

/**
 * Compiles three HF column strings into a single flex HTML string
 * ready to be passed to `headerLeft` / `footerLeft` of PaginationPlus.
 */
export function compileHfHtml(opts: CompileHfOptions): string {
    const {
        layout,
        separatorColor, separatorWidth, showSeparator, indent = 0, isHeader = true,
    } = opts;

    const { left: rLeft, center: rCenter, right: rRight } = resolveColumnTexts(opts);

    // If all three columns are empty, return empty string (don't render empty bar)
    if (!rLeft && !rCenter && !rRight) return '';

    const col = getColStyles(layout);

    // Separator border (color required for visible rule; theme may use empty or var())
    const sepColor =
        showSeparator && (separatorColor?.trim() || 'rgba(0, 0, 0, 0.3)');
    const borderStyle = sepColor
        ? isHeader
            ? `border-bottom:${separatorWidth ?? 0.5}px solid ${sepColor};padding-bottom:${HF_SEPARATOR_TEXT_GAP_PX}px`
            : `border-top:${separatorWidth ?? 0.5}px solid ${sepColor};padding-top:${HF_SEPARATOR_TEXT_GAP_PX}px`
        : '';

    // Indent
    const indentStyle = indent > 0 ? `padding-left:${indent}px;padding-right:${indent}px` : '';

    const containerStyle = [
        'display:flex',
        'justify-content:space-between',
        'align-items:flex-start',
        `gap:${HF_COLUMN_GAP_PX}px`,
        'width:100%',
        'box-sizing:border-box',
        'font-family:Inter,sans-serif',
        'font-size:10px',
        'line-height:1.4',
        borderStyle,
        indentStyle,
    ].filter(Boolean).join(';');

    return (
        `<div style="${containerStyle}">` +
        `<div style="${col.left}">${rLeft}</div>` +
        `<div style="${col.center}">${rCenter}</div>` +
        `<div style="${col.right}">${rRight}</div>` +
        `</div>`
    );
}

function getDocxColumnWidths(layout: CompileHfOptions['layout']): [number, number, number] {
    switch (layout) {
        case '1-col':
            return [0, 100, 0];
        case '2-col-70-30':
            return [70, 0, 30];
        case '2-col-30-70':
            return [30, 0, 70];
        case '2-col-80-20':
            return [80, 0, 20];
        case '2-col-20-80':
            return [20, 0, 80];
        case '3-col-equal':
        default:
            return [33.33, 33.34, 33.33];
    }
}

/**
 * DOCX/header-footer HTML renderer with table layout.
 * Word native DOCX export handles tables more reliably than flex in header/footer areas.
 */
export function compileHfHtmlForDocx(opts: CompileHfOptions): string {
    const { layout, separatorColor, separatorWidth, showSeparator, indent = 0, isHeader = true } = opts;
    const { left, center, right } = resolveColumnTexts(opts);
    if (!left && !center && !right) return '';

    const [wLeft, wCenter, wRight] = getDocxColumnWidths(layout);
    const sepColor = showSeparator && (separatorColor?.trim() || 'rgba(0, 0, 0, 0.3)');
    const borderStyle = sepColor
        ? isHeader
            ? `border-bottom:${separatorWidth ?? 0.5}px solid ${sepColor};padding-bottom:${HF_SEPARATOR_TEXT_GAP_PX}px`
            : `border-top:${separatorWidth ?? 0.5}px solid ${sepColor};padding-top:${HF_SEPARATOR_TEXT_GAP_PX}px`
        : '';
    const tableStyle = [
        'width:100%',
        'border-collapse:collapse',
        'table-layout:fixed',
        'font-family:Inter,sans-serif',
        'font-size:10px',
        'line-height:1.4',
        borderStyle,
    ]
        .filter(Boolean)
        .join(';');
    const cellPad = indent + HF_COLUMN_GAP_PX / 2;
    const cellBase = `vertical-align:top;padding-top:2px;padding-bottom:2px;padding-left:${cellPad}px;padding-right:${cellPad}px;`;
    // Do not put width:N% on <td> — some DOCX HTML parsers reject invalid OOXML width attrs.
    // "Invalid XML name: @w" with xmlbuilder2@2.1.2. Equal columns rely on three <td> without % widths.
    const leftStyle = `${cellBase}text-align:left;${wLeft <= 0 ? 'display:none;mso-hide:all;' : ''}`;
    const centerStyle = `${cellBase}text-align:center;${wCenter <= 0 ? 'display:none;mso-hide:all;' : ''}`;
    const rightStyle = `${cellBase}text-align:right;${wRight <= 0 ? 'display:none;mso-hide:all;' : ''}`;

    return (
        `<table role="presentation" style="${tableStyle}"><tbody><tr>` +
        `<td style="${leftStyle}">${left}</td>` +
        `<td style="${centerStyle}">${center}</td>` +
        `<td style="${rightStyle}">${right}</td>` +
        `</tr></tbody></table>`
    );
}
