import type { JSONContent } from '@tiptap/core';

/** DB'den gelen JSON'u `insertContent` ile uyumlu hale getirir. */
export function normaliseTemplateContentJson(raw: unknown): JSONContent {
    if (raw == null) {
        return { type: 'doc', content: [] };
    }
    if (Array.isArray(raw)) {
        return { type: 'doc', content: raw as JSONContent[] };
    }
    if (typeof raw === 'object' && 'type' in (raw as object)) {
        const o = raw as { type?: string; content?: JSONContent[] };
        if (o.type === 'doc' && Array.isArray(o.content)) {
            return raw as JSONContent;
        }
        return { type: 'doc', content: [raw as JSONContent] };
    }
    return { type: 'doc', content: [] };
}

/** String ya da zaten parse edilmiş içerik — şablon genişletmek için. */
export function normaliseTemplateContentString(contentJson: string | null | undefined): JSONContent {
    if (!contentJson) return { type: 'doc', content: [] };
    try {
        return normaliseTemplateContentJson(JSON.parse(contentJson));
    } catch {
        return { type: 'doc', content: [] };
    }
}
