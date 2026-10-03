import type { Editor } from '@tiptap/core';
import type { JSONContent } from '../types/tiptapContent';
import type { CommentData } from './commentUtils';
import { getCommentIdsInDocumentOrder, getStoredComments, saveStoredComments } from './commentUtils';

export interface UyapImportedComment {
    id: string;
    text: string;
    author: string;
    date: string;
    resolved: boolean;
    start: number;
    endExclusive: number;
}

export interface CommentRangePiece {
    text: string;
    commentIds: string[];
}

const COMMENT_ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g;

function parseXmlAttrs(raw: string): Record<string, string> {
    const out: Record<string, string> = {};
    COMMENT_ATTR_RE.lastIndex = 0;
    let match: RegExpExecArray | null = COMMENT_ATTR_RE.exec(raw);
    while (match) {
        out[match[1]] = match[2];
        match = COMMENT_ATTR_RE.exec(raw);
    }
    return out;
}

function parseOffset(raw: string | undefined): number {
    const n = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(n) ? n : 0;
}

function isoFromUyapTime(raw: string | undefined): string {
    const n = Number.parseInt(raw ?? '', 10);
    if (Number.isFinite(n) && n > 0) {
        const ms = n < 1e12 ? n * 1000 : n;
        const date = new Date(ms);
        if (Number.isFinite(date.getTime())) return date.toISOString();
    }
    return new Date().toISOString();
}

function extractCommentsCdata(xml: string): string {
    const match = xml.match(/<content\b[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/content>/i);
    return match?.[1] ?? '';
}

function commentTextFromInner(innerXml: string, commentsCdata: string): string {
    const pieces: string[] = [];
    const re = /<content\b([^>]*)\/?\s*>/gi;
    let match: RegExpExecArray | null = re.exec(innerXml);
    while (match) {
        const attrs = parseXmlAttrs(match[1] ?? '');
        const start = parseOffset(attrs.startOffset);
        const length = parseOffset(attrs.length);
        if (length > 0) {
            pieces.push(commentsCdata.slice(start, start + length));
        }
        match = re.exec(innerXml);
    }
    return pieces.join('\n').replace(/\s+$/g, '').trim();
}

/** Parse UYAP `comments.xml` (document CDATA offsets live on `strtOffs` / `endOffs`). */
export function parseUyapCommentsXml(xml: string | null | undefined): UyapImportedComment[] {
    if (!xml || !xml.includes('<comment')) return [];
    const commentsCdata = extractCommentsCdata(xml);
    const out: UyapImportedComment[] = [];
    const re = /<comment\b([^>]*)>([\s\S]*?)<\/comment>/gi;
    let index = 0;
    let match: RegExpExecArray | null = re.exec(xml);
    while (match) {
        const attrs = parseXmlAttrs(match[1] ?? '');
        const start = parseOffset(attrs.strtOffs);
        const endExclusive = parseOffset(attrs.endOffs);
        const text = commentTextFromInner(match[2] ?? '', commentsCdata);
        if (text && endExclusive > start) {
            const indx = attrs.indx?.trim() || String(index);
            out.push({
                id: `udf-c-${indx}`,
                text,
                author: attrs.usr?.trim() || 'UDFIX',
                date: isoFromUyapTime(attrs.time),
                resolved: false,
                start,
                endExclusive,
            });
        }
        index += 1;
        match = re.exec(xml);
    }
    return out;
}

export function commentsToStoreMap(comments: UyapImportedComment[]): Record<string, CommentData> {
    const out: Record<string, CommentData> = {};
    for (const comment of comments) {
        out[comment.id] = {
            id: comment.id,
            text: comment.text,
            author: comment.author,
            date: comment.date,
            resolved: comment.resolved,
            replies: [],
        };
    }
    return out;
}

export function persistImportedComments(documentId: string, comments: UyapImportedComment[]): void {
    if (!documentId || comments.length === 0) return;
    const existing = getStoredComments(documentId);
    saveStoredComments(documentId, { ...existing, ...commentsToStoreMap(comments) });
}

export function encodeCommentPayload(data: CommentData): string {
    const payload = {
        id: data.id,
        text: data.text,
        author: data.author,
        date: data.date,
        updatedAt: data.updatedAt,
        resolved: data.resolved ?? false,
        replies: data.replies ?? [],
    };
    return encodeURIComponent(JSON.stringify(payload));
}

export function decodeCommentPayload(raw: string | null | undefined): CommentData | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<CommentData>;
        const id = typeof parsed.id === 'string' ? parsed.id : '';
        const text = typeof parsed.text === 'string' ? parsed.text : '';
        if (!id || !text.trim()) return null;
        return {
            id,
            text,
            author: typeof parsed.author === 'string' && parsed.author.trim() ? parsed.author : 'UDFIX',
            date: typeof parsed.date === 'string' && parsed.date ? parsed.date : new Date().toISOString(),
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
            resolved: Boolean(parsed.resolved),
            replies: Array.isArray(parsed.replies) ? parsed.replies : [],
        };
    } catch {
        return null;
    }
}

export function importedCommentPayload(comment: UyapImportedComment): string {
    return encodeCommentPayload({
        id: comment.id,
        text: comment.text,
        author: comment.author,
        date: comment.date,
        resolved: comment.resolved,
        replies: [],
    });
}

/**
 * Split a CDATA-backed text run so overlapping UYAP comment ranges become nested mark spans.
 * `cdataStart` is the offset of `text[0]` in `content.xml` CDATA.
 */
export function splitTextByCommentRanges(
    text: string,
    cdataStart: number | undefined,
    comments: UyapImportedComment[],
): CommentRangePiece[] {
    if (!text) return [];
    if (cdataStart == null || comments.length === 0) {
        return [{ text, commentIds: [] }];
    }
    const cdataEnd = cdataStart + text.length;
    const overlapping = comments.filter(
        (comment) => comment.start < cdataEnd && comment.endExclusive > cdataStart,
    );
    if (overlapping.length === 0) {
        return [{ text, commentIds: [] }];
    }

    const points = new Set<number>([0, text.length]);
    for (const comment of overlapping) {
        points.add(Math.max(0, comment.start - cdataStart));
        points.add(Math.min(text.length, comment.endExclusive - cdataStart));
    }
    const sorted = [...points].sort((a, b) => a - b);
    const parts: CommentRangePiece[] = [];
    for (let i = 0; i < sorted.length - 1; i += 1) {
        const from = sorted[i];
        const to = sorted[i + 1];
        if (from >= to) continue;
        const absFrom = cdataStart + from;
        const absTo = cdataStart + to;
        const commentIds = overlapping
            .filter((comment) => comment.start < absTo && comment.endExclusive > absFrom)
            .map((comment) => comment.id);
        parts.push({ text: text.slice(from, to), commentIds });
    }
    return parts.length > 0 ? parts : [{ text, commentIds: [] }];
}

function walkTipTapMarks(
    node: JSONContent | undefined,
    visit: (attrs: Record<string, unknown>) => void,
): void {
    if (!node) return;
    for (const mark of node.marks ?? []) {
        if (mark.type === 'comment' && mark.attrs && typeof mark.attrs === 'object') {
            visit(mark.attrs as Record<string, unknown>);
        }
    }
    for (const child of node.content ?? []) {
        walkTipTapMarks(child, visit);
    }
}

export function collectCommentsFromTipTapJson(doc: JSONContent | null | undefined): Record<string, CommentData> {
    const out: Record<string, CommentData> = {};
    if (!doc) return out;
    walkTipTapMarks(doc, (attrs) => {
        const id = typeof attrs.commentId === 'string' ? attrs.commentId : '';
        if (!id || out[id]) return;
        const fromPayload = decodeCommentPayload(
            typeof attrs.commentPayload === 'string' ? attrs.commentPayload : null,
        );
        if (fromPayload) {
            out[id] = { ...fromPayload, id };
        }
    });
    return out;
}

export function mergeCommentMaps(
    ...maps: Array<Record<string, CommentData> | undefined>
): Record<string, CommentData> {
    const out: Record<string, CommentData> = {};
    for (const map of maps) {
        if (!map) continue;
        for (const [id, comment] of Object.entries(map)) {
            if (!comment?.text?.trim()) continue;
            out[id] = comment;
        }
    }
    return out;
}

export function hydrateStoredComments(
    documentId: string,
    fromDocument: Record<string, CommentData>,
): Record<string, CommentData> {
    const merged = mergeCommentMaps(getStoredComments(documentId), fromDocument);
    saveStoredComments(documentId, merged);
    return merged;
}

export function decodeZipEntryUtf8(bytes: Uint8Array | undefined): string | null {
    if (!bytes || bytes.byteLength === 0) return null;
    try {
        return new TextDecoder('utf-8').decode(bytes);
    } catch {
        return null;
    }
}

export function patchCommentPayloadsOnEditor(
    editor: Editor,
    comments: Record<string, CommentData>,
): boolean {
    if (!editor || editor.isDestroyed) return false;
    const { tr, doc, schema } = editor.state;
    const commentType = schema.marks.comment;
    if (!commentType) return false;
    let changed = false;

    doc.descendants((node, pos) => {
        const mark = node.marks.find((item) => item.type === commentType);
        const commentId = typeof mark?.attrs?.commentId === 'string' ? mark.attrs.commentId : '';
        if (!mark || !commentId) return;
        const data = comments[commentId];
        if (!data?.text?.trim()) return;
        const encoded = encodeCommentPayload(data);
        if (mark.attrs.commentPayload === encoded) return;
        tr.removeMark(pos, pos + node.nodeSize, commentType);
        tr.addMark(
            pos,
            pos + node.nodeSize,
            commentType.create({
                ...mark.attrs,
                commentId,
                commentPayload: encoded,
            }),
        );
        changed = true;
    });

    if (changed) {
        tr.setMeta('addToHistory', false);
        editor.view.dispatch(tr);
    }
    return changed;
}

function flattenCommentThreadText(comment: CommentData): string {
    let body = comment.text.trim();
    for (const reply of comment.replies ?? []) {
        const replyText = (reply.text || '').trim();
        if (!replyText) continue;
        const author = reply.author?.trim() || 'UDFIX';
        body += `\n\n— Yanıt (${author}):\n${replyText}`;
    }
    return body;
}

function commentFromEditorMark(editor: Editor, commentId: string): CommentData | null {
    let found: CommentData | null = null;
    editor.state.doc.descendants((node) => {
        if (found) return false;
        const mark = node.marks.find(
            (item) => item.type.name === 'comment' && item.attrs?.commentId === commentId,
        );
        if (!mark) return;
        found = decodeCommentPayload(
            typeof mark.attrs?.commentPayload === 'string' ? mark.attrs.commentPayload : null,
        );
        return false;
    });
    return found;
}

/** UDF `comments.xml` rows in document order (replies flattened into the parent body). */
export function collectCommentsForUdfExport(
    editor: Editor,
    documentId: string | null | undefined,
): Array<{
    id: string;
    text: string;
    author?: string;
    resolved?: boolean;
    date?: string;
}> {
    const stored = documentId ? getStoredComments(documentId) : {};
    const out: Array<{
        id: string;
        text: string;
        author?: string;
        resolved?: boolean;
        date?: string;
    }> = [];
    for (const id of getCommentIdsInDocumentOrder(editor)) {
        const comment = stored[id] ?? commentFromEditorMark(editor, id);
        if (!comment?.text?.trim()) continue;
        const text = flattenCommentThreadText(comment);
        if (!text.trim()) continue;
        out.push({
            id,
            text,
            author: comment.author,
            resolved: comment.resolved,
            date: comment.date,
        });
    }
    return out;
}
