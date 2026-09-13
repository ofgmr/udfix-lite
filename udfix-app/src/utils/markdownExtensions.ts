import { Markdown } from '@tiptap/markdown';

/** Shared GFM markdown extension for TipTap editors and static export. */
export function createMarkdownExtension() {
    return Markdown.configure({
        markedOptions: { gfm: true },
    });
}
