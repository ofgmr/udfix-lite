import type { JSONContent } from '@tiptap/core';
import type { Editor } from '@tiptap/react';

/**
 * TipTap markdown.parse() returns a full doc node; insertContent must receive
 * the inner block array, not `{ type: 'doc' }`, or the document structure breaks
 * and block splits (Enter) stop working.
 */
export function unwrapMarkdownParseResult(parsed: JSONContent): JSONContent | JSONContent[] {
    if (parsed?.type === 'doc' && Array.isArray(parsed.content)) {
        return parsed.content.length === 1 ? parsed.content[0] : parsed.content;
    }
    return parsed;
}

/** TipTap `code` mark excludes other inline marks; GFM parse can still emit bold+code. */
function sanitizeTextMarks(marks: JSONContent[] | undefined): JSONContent[] | undefined {
    if (!marks?.length) return marks;

    const types = marks.map((m) => m.type).filter((t): t is string => typeof t === 'string');
    if (types.includes('code')) {
        return marks.filter((m) => m.type === 'code');
    }

    const seen = new Set<string>();
    return marks.filter((m) => {
        if (!m.type || seen.has(m.type)) return false;
        seen.add(m.type);
        return true;
    });
}

/** Recursively normalize markdown JSON before insertContent so ProseMirror schema checks pass. */
export function sanitizeMarkdownPasteContent(
    node: JSONContent | JSONContent[],
): JSONContent | JSONContent[] {
    if (Array.isArray(node)) {
        return node.map((child) => sanitizeMarkdownPasteContent(child) as JSONContent);
    }

    const next: JSONContent = { ...node };

    if (next.type === 'text' && next.marks) {
        const sanitized = sanitizeTextMarks(next.marks);
        if (sanitized?.length) {
            next.marks = sanitized;
        } else {
            delete next.marks;
        }
    }

    if (Array.isArray(next.content)) {
        next.content = next.content.map((child) => sanitizeMarkdownPasteContent(child) as JSONContent);
    }

    return next;
}

function finishMarkdownPaste(editor: Editor): void {
    const { $from } = editor.state.selection;

    if (!$from.parent.isTextblock || $from.parent.type.spec.code) {
        return;
    }

    const blockDepth = $from.depth - 1;
    const blockIndex = $from.index(blockDepth);
    const blockParent = $from.node(blockDepth);
    const isLastBlock = blockIndex === blockParent.childCount - 1;
    const currentBlock = blockParent.child(blockIndex);

    const needsTrailingParagraph =
        isLastBlock &&
        currentBlock.type.name !== 'paragraph' &&
        currentBlock.type.name !== 'listItem';

    if (needsTrailingParagraph || !editor.can().splitBlock()) {
        editor
            .chain()
            .insertContentAt($from.after(blockDepth), { type: 'paragraph' })
            .focus('end')
            .run();
    }
}

/**
 * Paste plain text from the clipboard so it inherits the surrounding paragraph /
 * marks (same idea as “Paste and Match Style”).
 */
export async function pastePlainMatchingDestination(editor: Editor): Promise<boolean> {
    const text = await navigator.clipboard.readText();
    return editor.chain().focus().insertContent(text).run();
}

async function writeClipboardHtml(html: string, text: string): Promise<void> {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        try {
            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': new Blob([html], { type: 'text/html' }),
                    'text/plain': new Blob([text], { type: 'text/plain' }),
                }),
            ]);
            return;
        } catch {
            // Some runtimes reject text/html clipboard items; plain text still copies.
        }
    }
    await navigator.clipboard.writeText(text);
}

/** Copy a document range with the same HTML + plain text ProseMirror would put on the clipboard. */
export async function copyEditorRange(editor: Editor, from: number, to: number): Promise<boolean> {
    if (from === to) return false;
    const slice = editor.state.doc.slice(from, to);
    const { dom, text } = editor.view.serializeForClipboard(slice);
    await writeClipboardHtml(dom.innerHTML, text);
    return true;
}

/** Copy the range, then delete it. */
export async function cutEditorRange(editor: Editor, from: number, to: number): Promise<boolean> {
    const copied = await copyEditorRange(editor, from, to);
    if (!copied) return false;
    const deleted = editor.chain().focus().deleteRange({ from, to }).run();
    return deleted;
}

/** Serialize a document range to Markdown and write it as plain text. */
export async function copyEditorRangeAsMarkdown(editor: Editor, from: number, to: number): Promise<boolean> {
    if (from === to) return false;
    const fragment = editor.state.doc.cut(from, to);
    const markdown = editor.markdown
        ? editor.markdown.serialize(fragment.toJSON()).trim()
        : editor.state.doc.textBetween(from, to, '\n\n').trim();
    if (!markdown) return false;
    await navigator.clipboard.writeText(markdown);
    return true;
}

/**
 * Interpret clipboard text as Markdown and insert at the cursor via @tiptap/markdown.
 */
export async function pasteMarkdownFromClipboard(editor: Editor): Promise<boolean> {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) return false;
    if (!editor.markdown) {
        console.warn('Markdown extension is not loaded on this editor');
        return false;
    }

    const parsed = editor.markdown.parse(text);
    const unwrapped = unwrapMarkdownParseResult(parsed);
    const nodes = sanitizeMarkdownPasteContent(unwrapped);

    const inserted = editor.chain().focus().insertContent(nodes).run();
    if (!inserted) return false;

    finishMarkdownPaste(editor);
    return true;
}
