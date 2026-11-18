const ADJACENT_ATTR_ERROR =
    /No whitespace between attributes[\s\S]*?Line:\s*(\d+)[\s\S]*?Column:\s*(\d+)/i;

const MAX_ADJACENT_ATTR_REPAIRS = 8;

export function offsetFromLineColumn(text: string, line: number, column: number): number {
    let currentLine = 1;
    let index = 0;
    while (index < text.length && currentLine < line) {
        if (text.charCodeAt(index) === 10) currentLine += 1;
        index += 1;
    }
    return index + Math.max(0, column - 1);
}

export function parseAdjacentAttributeError(error: unknown): { line: number; column: number } | null {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(ADJACENT_ATTR_ERROR);
    if (!match) return null;
    const line = Number(match[1]);
    const column = Number(match[2]);
    if (!Number.isFinite(line) || !Number.isFinite(column)) return null;
    return { line, column };
}

/** Insert a space where sax reports `"foo"bar` (quote immediately followed by an attribute name). */
export function insertWhitespaceBetweenAdjacentAttributes(
    xml: string,
    line: number,
    column: number,
): string | null {
    const offset = offsetFromLineColumn(xml, line, column);
    if (offset <= 0 || offset >= xml.length) return null;
    const previous = xml[offset - 1];
    const current = xml[offset];
    if ((previous === '"' || previous === "'") && /[A-Za-z_:]/.test(current)) {
        return `${xml.slice(0, offset)} ${xml.slice(offset)}`;
    }
    const windowStart = Math.max(0, offset - 12);
    const nearby = xml.slice(windowStart, Math.min(xml.length, offset + 12));
    const local = nearby.search(/(["'])(?=[A-Za-z_:])/);
    if (local < 0) return null;
    const at = windowStart + local + 1;
    if (xml[at] === ' ') return null;
    return `${xml.slice(0, at)} ${xml.slice(at)}`;
}

export function repairAdjacentXmlAttributesOnce(xml: string, error: unknown): string | null {
    const loc = parseAdjacentAttributeError(error);
    if (!loc) return null;
    return insertWhitespaceBetweenAdjacentAttributes(xml, loc.line, loc.column);
}

export async function parseXmlRepairingAdjacentAttributes<T>(
    xml: string,
    parseOnce: (candidate: string) => Promise<T>,
    maxRepairs: number = MAX_ADJACENT_ATTR_REPAIRS,
): Promise<{ value: T; xml: string }> {
    let current = xml;
    for (let attempt = 0; attempt <= maxRepairs; attempt += 1) {
        try {
            return { value: await parseOnce(current), xml: current };
        } catch (error) {
            if (attempt === maxRepairs) throw error;
            const repaired = repairAdjacentXmlAttributesOnce(current, error);
            if (!repaired || repaired === current) throw error;
            current = repaired;
        }
    }
    throw new Error('XML adjacent-attribute repair exhausted');
}
