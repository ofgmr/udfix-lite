import { Editor } from '@tiptap/core';
import '../extensions/CommentHighlight'; // Import for command type augmentation

export interface Reply {
    id: string;
    text: string;
    author: string;
    date: string;
}

export interface CommentData {
    id: string;
    text: string;
    author: string;
    date: string;
    /** ISO time when body text was last edited (optional) */
    updatedAt?: string;
    resolved?: boolean;
    replies?: Reply[];
}

/**
 * Get all comment IDs currently in the document by scanning it
 */
export function getAllCommentIds(editor: Editor): string[] {
    const ids = new Set<string>();
    editor.state.doc.descendants((node) => {
        node.marks.forEach((mark) => {
            if (mark.type.name === 'comment' && mark.attrs.commentId) {
                ids.add(mark.attrs.commentId);
            }
        });
    });
    return Array.from(ids);
}

/** Comment ids in first-seen document order (top-to-bottom) for navigation lists. */
export function getCommentIdsInDocumentOrder(editor: Editor): string[] {
    const ordered: string[] = [];
    const seen = new Set<string>();
    editor.state.doc.descendants((node) => {
        node.marks.forEach((mark) => {
            if (mark.type.name === 'comment' && mark.attrs.commentId) {
                const id = mark.attrs.commentId as string;
                if (!seen.has(id)) {
                    seen.add(id);
                    ordered.push(id);
                }
            }
        });
    });
    return ordered;
}

/**
 * Get comment data from localStorage with simple memoization
 */
export function getStoredComments(documentId: string = 'default'): Record<string, CommentData> {
    const key = `nomai-comments-${documentId}`;
    try {
        return JSON.parse(localStorage.getItem(key) || '{}');
    } catch {
        return {};
    }
}

export function saveStoredComments(documentId: string = 'default', comments: Record<string, CommentData>) {
    const key = `nomai-comments-${documentId}`;
    localStorage.setItem(key, JSON.stringify(comments));
}

/**
 * Get comment data for a specific ID
 */
export function getCommentData(documentId: string = 'default', commentId: string): CommentData | null {
    const comments = getStoredComments(documentId);
    return comments[commentId] || null;
}

/**
 * Get all comments with their data
 */
export function getAllComments(editor: Editor, documentId: string = 'default'): CommentData[] {
    const ids = getAllCommentIds(editor);
    const comments = getStoredComments(documentId);
    return ids
        .map((id) => comments[id])
        .filter((comment): comment is CommentData => comment !== undefined);
}

/**
 * Get only active (unresolved) comments
 */
export function getActiveComments(editor: Editor, documentId: string = 'default'): CommentData[] {
    return getAllComments(editor, documentId).filter((comment) => !comment.resolved);
}

/**
 * Get only resolved comments
 */
export function getResolvedComments(editor: Editor, documentId: string = 'default'): CommentData[] {
    return getAllComments(editor, documentId).filter((comment) => comment.resolved);
}

/**
 * Highlight a comment in the editor using Decorations (via command)
 * Falls back to DOM manipulation if command not available
 */
export function highlightComment(editor: Editor, commentId: string | null) {
    const commands = editor.commands as typeof editor.commands & {
        setCommentHighlight?: (commentId: string | null) => boolean;
    };
    if (commands.setCommentHighlight) {
        commands.setCommentHighlight(commentId);
    } else {
        // Fallback for older extension or if command missing
        document.querySelectorAll('.comment-highlight[data-comment-selected="true"]').forEach((el) => {
            el.setAttribute('data-comment-selected', 'false');
        });

        if (commentId) {
            document.querySelectorAll(`[data-comment-id="${commentId}"]`).forEach((el) => {
                el.setAttribute('data-comment-selected', 'true');
            });
        }
    }
}

/**
 * Find and select a comment in the editor with improved range handling
 */
export function selectAndScrollToComment(editor: Editor, commentId: string): boolean {
    let from = -1;
    let to = -1;

    editor.state.doc.descendants((node, pos) => {
        const mark = node.marks.find(
            (m) => m.type.name === 'comment' && m.attrs.commentId === commentId
        );
        if (mark) {
            if (from === -1) from = pos;
            to = pos + node.nodeSize;
        }
    });

    if (from !== -1 && to !== -1) {
        editor.chain().focus().setTextSelection({ from, to }).run();

        // Scroll the editor canvas (not the window) when UdfixEditor uses #editor-scroll-container
        const start = editor.view.coordsAtPos(from);
        const scrollEl = document.getElementById('editor-scroll-container');
        if (scrollEl) {
            const rect = scrollEl.getBoundingClientRect();
            const relTop = start.top - rect.top + scrollEl.scrollTop;
            scrollEl.scrollTo({
                top: Math.max(0, relTop - rect.height / 2),
                behavior: 'smooth',
            });
        } else {
            const { visualViewport } = window;
            let scrollY = window.scrollY;
            if (visualViewport) {
                scrollY += start.top - visualViewport.height / 2;
            } else {
                scrollY += start.top - window.innerHeight / 2;
            }
            window.scrollTo({ top: scrollY, behavior: 'smooth' });
        }

        // Use new decoration highlighter
        highlightComment(editor, commentId);

        return true;
    }
    return false;
}

/**
 * Cleanup orphaned comments from localStorage
 * Should be called on save or periodically
 */
export function cleanupComments(editor: Editor, documentId: string = 'default') {
    const existingIds = new Set(getAllCommentIds(editor));
    const storedComments = getStoredComments(documentId);
    let changed = false;

    Object.keys(storedComments).forEach((id) => {
        if (!existingIds.has(id)) {
            delete storedComments[id];
            changed = true;
        }
    });

    if (changed) {
        saveStoredComments(documentId, storedComments);
        console.log('Cleaned up orphaned comments');
    }
}

/* Extension içinde:
addStorage() {
return {
    commentIds: new Set<string>(),
}
},
onUpdate() {
// Döküman her değiştiğinde ID'leri güncelle
const ids = new Set<string>()
this.editor.state.doc.descendants(node => {
    node.marks.forEach(mark => {
    if (mark.type.name === 'comment') ids.add(mark.attrs.commentId)
    })
})
this.storage.commentIds = ids
}
*/