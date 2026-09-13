import fs from 'node:fs';
import { parseUyapToTipTap } from './converter';
import { Indent } from '../extensions/Indent';

const xml = fs.readFileSync('/tmp/udfdbg/content.xml', 'utf8');

// Replicate the textIndent renderHTML logic for inspection
function renderTextIndentStyle(textIndent: number | null | undefined): string {
    if (textIndent === null || textIndent === undefined) return '';
    const safeIndent = Number(textIndent);
    const markerWidth = Math.max(18, Math.abs(safeIndent) + 10);
    const styles = [`text-indent: ${safeIndent}px`, `--list-marker-width: ${markerWidth}px`];
    if (safeIndent < 0) {
        styles.push(`padding-left: ${Math.abs(safeIndent)}px`);
        styles.push('box-sizing: border-box');
    }
    return styles.join('; ');
}

void Indent; // ensure import used

(async () => {
    const doc = await parseUyapToTipTap(xml);
    if (!doc) {
        console.log('NO DOC');
        return;
    }
    doc.content.forEach((node, i) => {
        const attrs = (node.attrs ?? {}) as Record<string, unknown>;
        const text = (node.content ?? [])
            .map((c: any) => c.text ?? `[${c.type}]`)
            .join('')
            .slice(0, 48);
        const interesting = {
            ml: attrs.marginLeft,
            mr: attrs.marginRight,
            ti: attrs.textIndent,
            align: attrs.textAlign,
        };
        const tiStyle = renderTextIndentStyle(attrs.textIndent as number | null | undefined);
        console.log(
            `#${i} <${node.type}> ${JSON.stringify(interesting)} | ${tiStyle}\n      "${text}"`,
        );
    });
})();
