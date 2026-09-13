import type { JSONContent } from '@tiptap/core';
import { resolveTemplateBuiltin } from './templateBuiltinVars';

const VAR_RE = /\{\{([^}]+)\}\}/g;

function splitTextNodeToSegments(textNode: JSONContent, expandBuiltins: boolean): JSONContent[] {
    const text = typeof textNode.text === 'string' ? textNode.text : '';
    if (!text.includes('{{')) return [textNode];
    const marks = textNode.marks;
    const out: JSONContent[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    VAR_RE.lastIndex = 0;
    while ((m = VAR_RE.exec(text)) !== null) {
        if (m.index > last) {
            const slice = text.slice(last, m.index);
            out.push(marks?.length ? { type: 'text', text: slice, marks } : { type: 'text', text: slice });
        }
        const key = (m[1] ?? '').trim();
        if (key) {
            const resolved = expandBuiltins ? resolveTemplateBuiltin(key) : null;
            if (resolved != null) {
                out.push(marks?.length ? { type: 'text', text: resolved, marks } : { type: 'text', text: resolved });
            } else {
                out.push({ type: 'variableSlot', attrs: { key } });
            }
        }
        last = m.index + m[0].length;
    }
    if (last < text.length) {
        const slice = text.slice(last);
        out.push(marks?.length ? { type: 'text', text: slice, marks } : { type: 'text', text: slice });
    }
    return out.length ? out : [{ type: 'text', text }];
}

/** Metin içindeki `{{x}}` ifadelerini `variableSlot` düğümlerine çevirir (Tiptap JSON). */
export function injectVariableSlotsInDocJson(root: JSONContent, expandBuiltins = false): JSONContent {
    if (!root || typeof root !== 'object') return root;
    const walk = (n: JSONContent): JSONContent => {
        if (!n || typeof n !== 'object') return n;
        if (Array.isArray(n.content)) {
            const next: JSONContent[] = [];
            for (const child of n.content) {
                if (child?.type === 'text' && typeof child.text === 'string' && child.text.includes('{{')) {
                    next.push(...splitTextNodeToSegments(child, expandBuiltins).map(walk));
                } else {
                    next.push(walk(child));
                }
            }
            return { ...n, content: next };
        }
        return n;
    };
    return walk(JSON.parse(JSON.stringify(root)) as JSONContent);
}
