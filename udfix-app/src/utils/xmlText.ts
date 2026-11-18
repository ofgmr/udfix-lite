/** XML 1.0 Char production, excluding the controls we must drop. Tab, LF, and CR stay. */
const ILLEGAL_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

/** Drop characters XML 1.0 cannot encode. Offsets must be computed on this string. */
export function stripIllegalXmlChars(value: string): string {
    return value.replace(ILLEGAL_XML_CHARS, '');
}

/**
 * A CDATA section ends at the first `]]>`. Split that sequence so the decoded
 * text is unchanged: `a]]>b` becomes `a]]]]><![CDATA[>b`.
 */
export function escapeXmlCdata(value: string): string {
    return stripIllegalXmlChars(value).replace(/]]>/g, ']]]]><![CDATA[>');
}

export type UdfOfficialEditorLimits = {
    cdataDelimiters: number;
    supplementaryCodePoints: number;
};

/**
 * UYAP Doküman Editörü 5.4.20 stores the body in one JDOM 1.0b8 CDATA section.
 * That constructor rejects `]]>` and UTF-16 surrogates. Counting is not a rewrite.
 */
export function udfOfficialEditorLimits(value: string): UdfOfficialEditorLimits {
    const cdataDelimiters = value.match(/\]\]>/g)?.length ?? 0;
    let supplementaryCodePoints = 0;
    for (const char of value) {
        const codePoint = char.codePointAt(0) ?? 0;
        if (codePoint > 0xffff) supplementaryCodePoints += 1;
    }
    return { cdataDelimiters, supplementaryCodePoints };
}

/** Null when this text can go through the official editor's single CDATA constructor. */
export function udfOfficialEditorLimitMessage(value: string): string | null {
    const limits = udfOfficialEditorLimits(value);
    const parts: string[] = [];
    if (limits.cdataDelimiters > 0) parts.push(']]> dizisi');
    if (limits.supplementaryCodePoints > 0) parts.push('U+FFFF üstü karakter');
    if (parts.length === 0) return null;
    const joined = parts.length === 2 ? `${parts[0]} ve ${parts[1]}` : parts[0];
    return `Resmi UYAP Doküman Editörü 5.4.20 bu metindeki ${joined} kaydedemez. UDFIX karakteri silmez; dosya o editörde açılmayabilir.`;
}
