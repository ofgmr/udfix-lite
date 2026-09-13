/** Shared print/PDF styles for UYAP UDF HTML (viewer + batch export). */
export const UDF_CONTENT_PRINT_CSS = `
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
html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
.udf-print-page { max-width: 210mm; margin: 0 auto; padding: 20mm 18mm; box-sizing: border-box; }
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
