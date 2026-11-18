import type { JSONContent } from '@tiptap/core';
import { Fragment, Slice, type Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
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
            next.marks = sanitized.filter(
                (mark): mark is JSONContent & { type: string } => typeof mark.type === 'string',
            );
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

function mapSliceText(slice: Slice, mapText: (node: ProseMirrorNode) => ProseMirrorNode): Slice {
    const mapFragment = (fragment: Fragment): Fragment => {
        const children: ProseMirrorNode[] = [];
        fragment.forEach((node) => {
            if (node.isText) {
                children.push(mapText(node));
                return;
            }
            children.push(node.copy(mapFragment(node.content)));
        });
        return Fragment.from(children);
    };
    return new Slice(mapFragment(slice.content), slice.openStart, slice.openEnd);
}

/**
 * Plain text follows the caret, the same as typing or Paste and Match Style.
 * HTML keeps the source formatting and does not inherit the caret font.
 */
export function inheritDestinationFormattingOnPaste(slice: Slice, state: EditorState, plain: boolean): Slice {
    if (slice.content.size === 0 || !plain || !state.storedMarks) return slice;
    const marks = state.storedMarks;
    return mapSliceText(slice, (node) => node.mark(marks));
}

const PASTE_LINE_BREAK = /\r\n|\n|\r|\u2028|\u2029|\u000b/;

function schemaOf(slice: Slice): Schema | null {
    let schema: Schema | null = null;
    slice.content.forEach((node) => {
        schema = node.type.schema;
        return false;
    });
    return schema;
}

/**
 * A line separator inside a text node is painted as a new line and then dropped
 * by UYAP, which only breaks on a new paragraph. Turn those characters into hard breaks.
 */
export function splitPastedLineBreaks(slice: Slice): Slice {
    if (slice.content.size === 0) return slice;
    const schema = schemaOf(slice);
    const hardBreak = schema?.nodes.hardBreak;
    if (!schema || !hardBreak) return slice;

    const mapFragment = (fragment: Fragment): Fragment => {
        const children: ProseMirrorNode[] = [];
        fragment.forEach((node) => {
            if (node.isText && node.text && PASTE_LINE_BREAK.test(node.text)) {
                const pieces = node.text.split(/\r\n|\n|\r|\u2028|\u2029|\u000b/);
                pieces.forEach((piece, index) => {
                    if (piece) children.push(schema.text(piece, node.marks));
                    if (index < pieces.length - 1) children.push(hardBreak.create());
                });
                return;
            }
            if (node.isText) {
                children.push(node);
                return;
            }
            children.push(node.copy(mapFragment(node.content)));
        });
        return Fragment.from(children);
    };

    return new Slice(mapFragment(slice.content), slice.openStart, slice.openEnd);
}

function nodePreservesNewlines(element: Element, inherited: boolean): boolean {
    const style = element.getAttribute('style') ?? '';
    return inherited || /white-space\s*:\s*pre(?:-wrap|-line)?/i.test(style);
}

function replaceLineBreaksInText(textNode: Text, convertNewlines: boolean): void {
    const text = textNode.textContent ?? '';
    const pattern = convertNewlines ? /\r\n|\n|\r|\u2028|\u2029|\u000b/g : /\u2028|\u2029|\u000b/g;
    if (!pattern.test(text)) return;
    pattern.lastIndex = 0;
    const doc = textNode.ownerDocument;
    const fragment = doc.createDocumentFragment();
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
        if (match.index > last) fragment.append(text.slice(last, match.index));
        fragment.append(doc.createElement('br'));
        last = match.index + match[0].length;
    }
    if (last < text.length) fragment.append(text.slice(last));
    textNode.replaceWith(fragment);
}

const SKIP_LINE_BREAK_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'TITLE', 'NOSCRIPT']);

function walkPreservedBreaks(element: Element, preserve: boolean): void {
    if (SKIP_LINE_BREAK_TAGS.has(element.tagName)) return;
    const nextPreserve = nodePreservesNewlines(element, preserve);
    for (const child of [...element.childNodes]) {
        if (child.nodeType === 3) {
            replaceLineBreaksInText(child as Text, nextPreserve);
            continue;
        }
        if (child.nodeType === 1) walkPreservedBreaks(child as Element, nextPreserve);
    }
}

/**
 * A newline inside ordinary HTML is source wrapping, not a line break.
 * Soft returns are `<br>`, `white-space: pre-wrap`, U+2028, or Word's vertical tab.
 */
export function promotePreservedLineBreaks(html: string): string {
    if (!html || typeof DOMParser === 'undefined') return html;
    if (!/[\n\r\u2028\u2029\u000B]/.test(html)) return html;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    walkPreservedBreaks(doc.body, false);
    return doc.body.innerHTML;
}

/**
 * Pasting into an empty textblock merges with that block and keeps its attrs.
 * An empty caret has no real style, so take the pasted block's attrs first and
 * insert in the same transaction. Other block types already split out on their own.
 * Returns true when this function performed the paste.
 */
export function keepPastedAttrsOnEmptyTextblock(view: EditorView, slice: Slice): boolean {
    const { selection } = view.state;
    if (!selection.empty) return false;

    const { $from } = selection;
    if (!$from.parent.isTextblock || $from.parent.content.size > 0) return false;

    const first = slice.content.firstChild;
    if (!first || first.type !== $from.parent.type) return false;

    const nextAttrs: Record<string, unknown> = { ...$from.parent.attrs };
    let changed = false;
    for (const key of Object.keys(first.attrs)) {
        if (nextAttrs[key] !== first.attrs[key]) {
            nextAttrs[key] = first.attrs[key];
            changed = true;
        }
    }
    if (!changed) return false;

    const tr = view.state.tr
        .setNodeMarkup($from.before(), undefined, nextAttrs)
        .replaceSelection(slice)
        .scrollIntoView()
        .setMeta('paste', true)
        .setMeta('uiEvent', 'paste');
    view.dispatch(tr);
    return true;
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
