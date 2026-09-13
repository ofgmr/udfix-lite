import { Image } from '@tiptap/extension-image';
import { mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { HfImageNodeView } from '../components/editor/HfImageNodeView';

/** Marker class: user-sized HF logos keep stored width; unsized imgs follow ruler max-height. */
export const HF_SIZED_IMAGE_CLASS = 'hf-sized-img';

/** Compact resizable image for header/footer mini editors. */
export const HfImageExtension = Image.extend({
    name: 'image',

    inline: true,
    group: 'inline',
    atom: true,

    addAttributes() {
        return {
            ...this.parent?.(),
            width: { default: '64px' },
            hfSized: { default: false, rendered: false },
            align: {
                default: null as string | null,
                parseHTML: (el) => {
                    const img = el as HTMLElement;
                    return img.getAttribute('data-hf-align')?.trim().toLowerCase() || null;
                },
                renderHTML: (attrs) => {
                    const align = (attrs.align as string | null | undefined)?.trim().toLowerCase();
                    if (!align || align === 'left' || align === 'start') return {};
                    return { 'data-hf-align': align === 'end' ? 'right' : align };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'img[src]',
                getAttrs: (el) => {
                    const img = el as HTMLImageElement;
                    const src = img.getAttribute('src');
                    if (!src) return false;
                    const styleWidth = img.style?.width?.trim();
                    const widthAttr = img.getAttribute('width');
                    const dataWidth = img.getAttribute('data-hf-img-width')?.trim();
                    const isSized =
                        img.classList.contains(HF_SIZED_IMAGE_CLASS) ||
                        Boolean(styleWidth || widthAttr || dataWidth);
                    return {
                        src,
                        alt: img.getAttribute('alt') ?? undefined,
                        title: img.getAttribute('title') ?? undefined,
                        width:
                            styleWidth ||
                            dataWidth ||
                            (widthAttr ? `${widthAttr}px` : undefined) ||
                            '64px',
                        hfSized: isSized,
                    };
                },
            },
            ...(this.parent?.() ?? []),
        ];
    },

    renderHTML({ node, HTMLAttributes }) {
        const attrs = node.attrs as { width?: string; hfSized?: boolean };
        const width = attrs.width || '64px';
        const sized = Boolean(attrs.hfSized);
        const merged = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes) as Record<string, unknown>;
        const { width: _w, hfSized: _s, ...imgRest } = merged;
        const imgAttrs: Record<string, string> = {
            style: sized
                ? `width:${width};max-width:100%;height:auto;vertical-align:middle;display:inline-block;`
                : 'max-width:100%;height:auto;vertical-align:middle;display:inline-block;',
        };
        if (sized) {
            imgAttrs.class = HF_SIZED_IMAGE_CLASS;
            imgAttrs['data-hf-img-width'] = width;
            const widthPx = parseInt(width, 10);
            if (Number.isFinite(widthPx) && widthPx > 0) {
                imgAttrs.width = String(widthPx);
            }
        }
        return ['img', mergeAttributes(imgRest, imgAttrs)];
    },

    addNodeView() {
        return ReactNodeViewRenderer(HfImageNodeView, { inline: true });
    },
});
