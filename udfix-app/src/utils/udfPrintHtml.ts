import {
    EDITOR_PAGE_HEIGHT_PX,
    EDITOR_PAGE_MARGIN_LEFT_PX,
    EDITOR_PAGE_MARGIN_RIGHT_PX,
    EDITOR_PAGE_WIDTH_PX,
    EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX,
} from './editorLayout';

/** Shared print/PDF styles for UYAP UDF HTML (viewer + batch export). */

/** Unspecified or missing document faces. Inline `font-family` on a run still wins. */
export const UDF_DEFAULT_FONT_FAMILY = '"Times New Roman", Times, serif';

/** A4 body + default editor `--rm-*` insets. One geometry with PaginationPlus (ADR-0020). */
export const UDF_PRINT_PAGE_CSS = `
.udf-print-page {
    --rm-page-width: ${EDITOR_PAGE_WIDTH_PX}px;
    --rm-page-height: ${EDITOR_PAGE_HEIGHT_PX}px;
    --rm-margin-left: ${EDITOR_PAGE_MARGIN_LEFT_PX}px;
    --rm-margin-right: ${EDITOR_PAGE_MARGIN_RIGHT_PX}px;
    --rm-margin-top: ${EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX}px;
    --rm-margin-bottom: ${EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX}px;
    width: var(--rm-page-width);
    max-width: var(--rm-page-width);
    min-height: var(--rm-page-height);
    margin: 0 auto;
    padding: var(--rm-margin-top) var(--rm-margin-right) var(--rm-margin-bottom) var(--rm-margin-left);
    box-sizing: border-box;
    background: #fff;
}
@media screen {
    .udf-print-page {
        margin-top: 24px;
        margin-bottom: 24px;
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.12);
    }
}
`;

export const UDF_CONTENT_PRINT_CSS = `
.udf-content {
    font-family: ${UDF_DEFAULT_FONT_FAMILY};
}
.udf-content p {
    margin-bottom: 1.25rem;
    line-height: 1.6;
    color: #000;
    white-space: pre-wrap;
    tab-size: 2.5cm;
}
.udf-content img {
    display: block;
    margin: 2rem auto;
    border-radius: 8px;
    max-width: 100%;
}
.udf-content h1, .udf-content h2 {
    margin-top: 1.5rem;
    margin-bottom: 1.5rem;
    font-weight: 700;
}
.udf-content table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
}
.udf-content td, .udf-content th {
    border: 1px solid #333;
    padding: 6px 8px;
    vertical-align: top;
}
.udf-content .uyap-verification-block {
    margin-top: 2rem;
    padding-top: 0.5rem;
}
.udf-content .udf-header-band {
    margin-bottom: 1.5rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #ccc;
    text-align: center;
}
.udf-content .udf-footer-band {
    margin-top: 2rem;
    padding-top: 0.75rem;
    border-top: 1px solid #ccc;
    font-size: 0.9em;
}
`;

export function buildUdfPrintDocumentHtml(bodyHtml: string, title = 'UDF'): string {
    const safeTitle = title.replace(/[<>&]/g, '');
    return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<title>${safeTitle}</title>
<style>
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: ${UDF_DEFAULT_FONT_FAMILY}; }
${UDF_PRINT_PAGE_CSS}
${UDF_CONTENT_PRINT_CSS}
</style>
</head>
<body>
<div class="udf-print-page">
<div class="udf-content">${bodyHtml}</div>
</div>
</body>
</html>`;
}
