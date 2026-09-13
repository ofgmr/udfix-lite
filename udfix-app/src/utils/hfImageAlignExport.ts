import type { Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';

/** HF logo/image horizontal alignment for UDF raster + normalize (html2canvas ignores text-align). */

const LEFT_ALIGNS = new Set(['left', 'start']);

export type HfTextAlign = 'left' | 'center' | 'right' | 'justify';

/** Map paragraph text-align to persisted `data-hf-align` on HF images (justify → none). */
export function paragraphAlignToImageAlign(raw: string | null | undefined): string | null {
    const a = raw?.trim().toLowerCase();
    if (!a || LEFT_ALIGNS.has(a) || a === 'justify') return null;
    if (a === 'end') return 'right';
    if (a === 'center' || a === 'right') return a;
    return null;
}

function normalizeAlign(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const a = raw.trim().toLowerCase();
    if (!a || LEFT_ALIGNS.has(a)) return null;
    if (a === 'end') return 'right';
    return a;
}

function readInlineTextAlign(el: Element): string | null {
    if (!(el instanceof HTMLElement)) return null;
    const style = el.getAttribute('style') ?? '';
    const m = style.match(/(?:^|;)\s*text-align\s*:\s*([^;]+)/i);
    return normalizeAlign(m?.[1] ?? null);
}

function readImgWidthPx(img: HTMLImageElement): number | null {
    const dataW = img.getAttribute('data-hf-img-width');
    if (dataW) {
        const n = parseFloat(dataW);
        if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
    const styleW = img.style.width || img.getAttribute('style')?.match(/width:\s*([\d.]+)px/i)?.[1];
    if (styleW) {
        const n = parseFloat(String(styleW));
        if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
    const attrW = img.getAttribute('width');
    if (attrW) {
        const n = parseFloat(attrW);
        if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
    return null;
}

/** Resolve effective horizontal align for an HF image (data attr → ancestor text-align). */
export function resolveHfImageAlign(img: HTMLImageElement): string | null {
    const fromData = normalizeAlign(img.getAttribute('data-hf-align'));
    if (fromData) return fromData;

    let node: Element | null = img.parentElement;
    while (node) {
        const ta = readInlineTextAlign(node);
        if (ta) return ta;
        node = node.parentElement;
    }
    return null;
}

function applyAlignBlockStyles(host: HTMLElement, align: string, widthPx: number | null): void {
    host.style.setProperty('display', 'block', 'important');
    host.style.setProperty('max-width', '100%', 'important');
    if (widthPx != null && widthPx > 0) {
        host.style.setProperty('width', `${widthPx}px`, 'important');
    }
    if (align === 'center') {
        host.style.setProperty('margin-left', 'auto', 'important');
        host.style.setProperty('margin-right', 'auto', 'important');
    } else if (align === 'right') {
        host.style.setProperty('margin-left', 'auto', 'important');
        host.style.setProperty('margin-right', '0', 'important');
    }
}

/** Apply block+margin alignment on img / .hf-inline-image host (live DOM, pre-html2canvas). */
export function applyHfImageAlignStylesToDom(root: ParentNode): void {
    for (const img of root.querySelectorAll<HTMLImageElement>('img')) {
        const align = resolveHfImageAlign(img);
        if (!align) continue;

        img.setAttribute('data-hf-align', align);
        const widthPx = readImgWidthPx(img);
        const host = (img.closest('.hf-inline-image') as HTMLElement | null) ?? img;
        host.setAttribute('data-hf-align', align);
        applyAlignBlockStyles(host, align, widthPx);
        if (host !== img) {
            img.style.setProperty('display', 'block', 'important');
            img.style.setProperty('width', '100%', 'important');
            img.style.setProperty('max-width', '100%', 'important');
            img.style.setProperty('height', 'auto', 'important');
        }
    }
}

/** Serialize alignment into inline styles on img / wrapper (store + compile HTML). */
export function applyHfImageAlignStylesInHtml(html: string): string {
    const trimmed = (html || '').trim();
    if (!trimmed || !/<img\b/i.test(trimmed) || typeof document === 'undefined') return html;

    const wrap = document.createElement('div');
    wrap.innerHTML = trimmed;
    applyHfImageAlignStylesToDom(wrap);
    return wrap.innerHTML;
}

/** Copy paragraph `textAlign` onto HF image nodes before HTML serialize (UDF export flush). */
export function syncHfImageAlignFromParagraphInEditor(editor: {
    isDestroyed: boolean;
    state: import('@tiptap/pm/state').EditorState;
    view: import('@tiptap/pm/view').EditorView;
}): void {
    if (editor.isDestroyed) return;
    const { tr } = editor.state;
    let changed = false;

    editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'image') return;
        const parent = editor.state.doc.resolve(pos).parent;
        const align = paragraphAlignToImageAlign(parent.attrs.textAlign as string | undefined);
        if (node.attrs.align === align) return;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, align });
        changed = true;
    });

    if (changed) editor.view.dispatch(tr);
}

/** Toolbar active state: paragraph text-align, else selected image `align` attr. */
export function resolveHfMiniEditorActiveAlign(editor: Editor): HfTextAlign {
    if (editor.isActive({ textAlign: 'center' })) return 'center';
    if (editor.isActive({ textAlign: 'right' })) return 'right';
    if (editor.isActive({ textAlign: 'justify' })) return 'justify';
    if (editor.isActive({ textAlign: 'left' })) return 'left';
    if (editor.isActive('image')) {
        const imgAlign = (editor.getAttributes('image').align as string | null | undefined)?.toLowerCase();
        if (imgAlign === 'center') return 'center';
        if (imgAlign === 'right' || imgAlign === 'end') return 'right';
    }
    return 'left';
}

/**
 * Apply horizontal alignment in the HF mini editor.
 * Image node selections update parent paragraph + image attrs together.
 */
export function applyHfMiniEditorTextAlign(editor: Editor, alignment: HfTextAlign): void {
    const { selection } = editor.state;
    if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
        const $pos = selection.$from;
        const paraPos = $pos.before($pos.depth);
        const para = $pos.parent;
        if (para.type.name === 'paragraph') {
            const imgAlign = paragraphAlignToImageAlign(alignment);
            const nextParaAlign = alignment === 'left' ? null : alignment;
            editor
                .chain()
                .focus()
                .command(({ tr }) => {
                    tr.setNodeMarkup(paraPos, undefined, {
                        ...para.attrs,
                        textAlign: nextParaAlign,
                    });
                    tr.setNodeMarkup(selection.from, undefined, {
                        ...selection.node.attrs,
                        align: imgAlign,
                    });
                    return true;
                })
                .run();
            return;
        }
    }
    editor.chain().focus().setTextAlign(alignment).run();
    syncHfImageAlignFromParagraphInEditor(editor);
}

/** When store HTML has `data-hf-align` on img but no paragraph text-align, restore for TipTap round-trip. */
export function ensureParagraphAlignFromImgDataAlignInHtml(html: string): string {
    const trimmed = (html || '').trim();
    if (!trimmed || !/<img\b/i.test(trimmed) || typeof document === 'undefined') return html;

    const wrap = document.createElement('div');
    wrap.innerHTML = trimmed;
    for (const img of wrap.querySelectorAll<HTMLImageElement>('img')) {
        const fromData = normalizeAlign(img.getAttribute('data-hf-align'));
        if (!fromData) continue;
        const p = img.closest('p');
        if (p instanceof HTMLElement && !readInlineTextAlign(p)) {
            p.style.textAlign = fromData;
        }
    }
    return wrap.innerHTML;
}
