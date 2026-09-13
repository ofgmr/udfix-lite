import { create } from 'zustand';
import type { CommentData, Reply } from '../utils/commentUtils';
import { getStoredComments, saveStoredComments } from '../utils/commentUtils';

/**
 * Single source of truth for comment metadata (text, replies, resolved) per document.
 * Persists to localStorage (`nomai-comments-${documentId}`); can later be swapped for IPC/SQLite
 * without changing UI components.
 */
interface DocumentCommentsState {
    documentId: string;
    /** Full map for the active document */
    comments: Record<string, CommentData>;
    /** Bumps when comments change (for effects that don't deep-compare) */
    revision: number;
    /** Pending comment id waiting for text input in panel */
    draftCommentId: string | null;
    /** Shared draft body while the comment mark exists but is not saved yet (margin + panel stay in sync). */
    draftCommentText: string;

    setDocumentId: (id: string) => void;
    /** Reload from localStorage for current documentId (e.g. after orphan cleanup) */
    reloadFromStorage: () => void;
    /** Replace entire map (e.g. after cleanup) */
    replaceAll: (next: Record<string, CommentData>) => void;
    upsert: (comment: CommentData) => void;
    remove: (id: string) => void;
    toggleResolved: (id: string) => void;
    addReply: (commentId: string, reply: Reply) => void;
    updateCommentText: (id: string, text: string) => void;
    startDraft: (id: string) => void;
    clearDraft: () => void;
    setDraftCommentText: (text: string) => void;
}

export const useDocumentCommentsStore = create<DocumentCommentsState>((set, get) => ({
    documentId: 'default',
    comments: {},
    revision: 0,
    draftCommentId: null,
    draftCommentText: '',

    setDocumentId: (id: string) => {
        if (get().documentId === id) return;
        const loaded = getStoredComments(id);
        set((s) => ({
            documentId: id,
            comments: { ...loaded },
            revision: s.revision + 1,
            draftCommentId: null,
            draftCommentText: '',
        }));
    },

    reloadFromStorage: () => {
        const { documentId } = get();
        const loaded = getStoredComments(documentId);
        set((s) => ({ comments: { ...loaded }, revision: s.revision + 1 }));
    },

    replaceAll: (next: Record<string, CommentData>) => {
        const { documentId } = get();
        saveStoredComments(documentId, next);
        set((s) => ({ comments: { ...next }, revision: s.revision + 1 }));
    },

    upsert: (comment: CommentData) => {
        const { documentId, comments } = get();
        const next = { ...comments, [comment.id]: comment };
        saveStoredComments(documentId, next);
        set((s) => ({ comments: next, revision: s.revision + 1 }));
    },

    remove: (id: string) => {
        const { documentId, comments } = get();
        if (!comments[id]) return;
        const next = { ...comments };
        delete next[id];
        saveStoredComments(documentId, next);
        set((s) => ({ comments: next, revision: s.revision + 1 }));
    },

    toggleResolved: (id: string) => {
        const { documentId, comments } = get();
        const c = comments[id];
        if (!c) return;
        const next = {
            ...comments,
            [id]: { ...c, resolved: !c.resolved },
        };
        saveStoredComments(documentId, next);
        set((s) => ({ comments: next, revision: s.revision + 1 }));
    },

    addReply: (commentId: string, reply: Reply) => {
        const { documentId, comments } = get();
        const c = comments[commentId];
        if (!c) return;
        const next = {
            ...comments,
            [commentId]: {
                ...c,
                replies: [...(c.replies || []), reply],
            },
        };
        saveStoredComments(documentId, next);
        set((s) => ({ comments: next, revision: s.revision + 1 }));
    },

    updateCommentText: (id: string, text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const { documentId, comments } = get();
        const c = comments[id];
        if (!c) return;
        const next = {
            ...comments,
            [id]: {
                ...c,
                text: trimmed,
                updatedAt: new Date().toISOString(),
            },
        };
        saveStoredComments(documentId, next);
        set((s) => ({ comments: next, revision: s.revision + 1 }));
    },

    startDraft: (id: string) => {
        set((s) => ({
            draftCommentId: id,
            draftCommentText: '',
            revision: s.revision + 1,
        }));
    },

    clearDraft: () => {
        set((s) => ({
            draftCommentId: null,
            draftCommentText: '',
            revision: s.revision + 1,
        }));
    },

    setDraftCommentText: (text: string) => {
        set({ draftCommentText: text });
    },
}));
