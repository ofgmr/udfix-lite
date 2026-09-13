import { Image } from '@tiptap/extension-image';
import { mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ImageNodeView } from '../components/editor/ImageNodeView';

export const ImageExtension = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            width: { default: '420px' },
            align: { default: 'center' }, // 'left', 'center', 'right'
            isUploading: { default: false },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-nomai-image-wrap="1"]',
                getAttrs: (el) => {
                    const root = el as HTMLElement;
                    const img = root.querySelector('img');
                    const src = img?.getAttribute('src');
                    if (!img || !src) return false;
                    const inner = root.querySelector(':scope > div') as HTMLElement | null;
                    const widthFromInner = inner?.style?.width?.trim();
                    const widthAttr = img.getAttribute('width');
                    const alignRaw = root.getAttribute('data-align')?.trim().toLowerCase();
                    const align =
                        alignRaw === 'left' || alignRaw === 'right' || alignRaw === 'center'
                            ? alignRaw
                            : 'center';
                    return {
                        src,
                        alt: img.getAttribute('alt') ?? undefined,
                        title: img.getAttribute('title') ?? undefined,
                        width: widthFromInner || (widthAttr ? `${widthAttr}px` : undefined) || '420px',
                        align,
                    };
                },
            },
            ...(this.parent?.() ?? []),
        ];
    },

    renderHTML({ node, HTMLAttributes }) {
        const align = ((node.attrs as { align?: string }).align || 'center').toLowerCase();
        const justify =
            align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
        const width = (node.attrs as { width?: string }).width;
        const innerBox = width
            ? `box-sizing:border-box;max-width:100%;width:${width};`
            : 'box-sizing:border-box;max-width:100%;';
        const merged = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes) as Record<string, unknown>;
        const { align: _align, isUploading: _up, ...imgRest } = merged;
        const imgAttrs = mergeAttributes(imgRest, {
            class: 'nomai-export-img',
            style: 'display:block;width:100%;height:auto;',
        });
        return [
            'div',
            {
                'data-nomai-image-wrap': '1',
                'data-align': align,
                style: `display:flex;width:100%;justify-content:${justify};margin:0.5rem 0;box-sizing:border-box;`,
            },
            ['div', { style: innerBox }, ['img', imgAttrs]],
        ];
    },

    addNodeView() {
        return ReactNodeViewRenderer(ImageNodeView);
    },
});
