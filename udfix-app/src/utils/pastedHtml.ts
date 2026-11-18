/**
 * Styles Word and browsers put on pasted HTML that the editor schema can use.
 * Everything else (mso-*, layout, urls) is dropped so paste cannot inject CSS.
 */
const SAFE_PASTE_STYLE_PROPS = new Set([
    'font-size',
    'font-family',
    'color',
    'background-color',
    'text-align',
    'font-weight',
    'font-style',
    'text-decoration',
    'text-decoration-line',
    'line-height',
    'margin-left',
    'text-indent',
    'vertical-align',
]);

function decodeBasicEntities(value: string): string {
    return value
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&');
}

function encodeStyleValue(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Split CSS declarations without breaking on semicolons inside quotes or `&quot;`. */
function styleDeclarations(style: string): Array<{ prop: string; value: string }> {
    const decoded = decodeBasicEntities(style);
    const chunks: string[] = [];
    let buf = '';
    let quote: '"' | "'" | null = null;
    for (const ch of decoded) {
        if (quote) {
            buf += ch;
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            buf += ch;
            continue;
        }
        if (ch === ';') {
            chunks.push(buf);
            buf = '';
            continue;
        }
        buf += ch;
    }
    if (buf.trim()) chunks.push(buf);

    const out: Array<{ prop: string; value: string }> = [];
    for (const chunk of chunks) {
        const separator = chunk.indexOf(':');
        if (separator <= 0) continue;
        const prop = chunk.slice(0, separator).trim().toLowerCase();
        const value = chunk.slice(separator + 1).trim();
        if (!prop || !value) continue;
        out.push({ prop, value });
    }
    return out;
}

function sanitizeStyleDeclaration(style: string): string {
    const kept: string[] = [];
    for (const { prop, value } of styleDeclarations(style)) {
        if (!SAFE_PASTE_STYLE_PROPS.has(prop)) continue;
        if (/url\s*\(|expression\s*\(|javascript:|@import/i.test(value)) continue;
        if (/[<>]/.test(value)) continue;
        kept.push(`${prop}: ${encodeStyleValue(value)}`);
    }
    return kept.join('; ');
}

/**
 * Keep legal-document formatting from Word/HTML paste and strip active content.
 * Replacing every `style="..."` attribute drops font size, family, and alignment.
 */
/** Word page-break breaks are not document text. Left in, pagination treats each one as a new sheet. */
function stripWordPageBreakBreaks(html: string): string {
    return html.replace(
        /<br\b[^>]*(?:page-break|mso-break|mso-special-character|clear\s*=\s*(?:"all"|'all'|all))[^>]*\/?>/gi,
        '',
    );
}

export function sanitizePastedEditorHtml(html: string): string {
    if (!html) return '';
    return stripWordPageBreakBreaks(html)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(
            /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
            (_match, doubleQuoted: string | undefined, singleQuoted: string | undefined) => {
                const clean = sanitizeStyleDeclaration(doubleQuoted ?? singleQuoted ?? '');
                return clean ? ` style="${clean}"` : '';
            },
        );
}
