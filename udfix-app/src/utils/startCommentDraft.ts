import type { Editor } from '@tiptap/core';
import { useDocumentCommentsStore } from '../stores/useDocumentCommentsStore';
import { useLayoutStore } from '../stores/useLayoutStore';

export const EDITOR_SCROLL_CONTAINER_ID = 'editor-scroll-container';

export function createCommentDraftId(): string {
    return `comment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function withPreservedEditorCanvasScroll(fn: () => void): void {
    const el = typeof document === 'undefined' ? null : document.getElementById(EDITOR_SCROLL_CONTAINER_ID);
    const top = el?.scrollTop ?? 0;
    const left = el?.scrollLeft ?? 0;
    fn();
    if (!el) return;
    el.scrollTop = top;
    el.scrollLeft = left;
    window.requestAnimationFrame(() => {
        el.scrollTop = top;
        el.scrollLeft = left;
    });
}

/** Focus a comment field without scrolling the UDF/editor canvas to the top. */
export function focusCommentFieldWithoutCanvasScroll(node: HTMLElement): void {
    withPreservedEditorCanvasScroll(() => {
        node.focus({ preventScroll: true });
    });
}

function isNodeFocused(node: HTMLElement): boolean {
    const active = typeof document === 'undefined' ? null : document.activeElement;
    return Boolean(active && (active === node || node.contains(active)));
}

/**
 * Keep the draft textarea focused until it actually holds the caret.
 * ProseMirror often steals focus back after setComment / highlight / mouseup.
 */
export function armCommentDraftFocus(
    getNode: () => HTMLElement | null,
    editor: Editor | null,
    maxMs = 650,
): () => void {
    let cancelled = false;
    let settled = false;
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const timers: number[] = [];
    let raf = 0;

    const editorDom = editor && !editor.isDestroyed ? editor.view.dom : null;

    const attempt = () => {
        if (cancelled || settled) return;
        const node = getNode();
        if (node && isNodeFocused(node)) {
            settled = true;
            return;
        }
        if (editorDom && typeof document !== 'undefined') {
            const active = document.activeElement;
            if (active === editorDom || (active && editorDom.contains(active))) {
                editorDom.blur();
            }
        }
        if (node) {
            focusCommentFieldWithoutCanvasScroll(node);
            if (isNodeFocused(node)) {
                settled = true;
                return;
            }
        }
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - started < maxMs && typeof window !== 'undefined') {
            raf = window.requestAnimationFrame(attempt);
        }
    };

    const onEditorFocus = () => {
        if (cancelled || settled) return;
        editorDom?.blur();
        const node = getNode();
        if (node) focusCommentFieldWithoutCanvasScroll(node);
    };

    editorDom?.addEventListener('focus', onEditorFocus, true);
    editor?.on('focus', onEditorFocus);

    const onKeyDown = (e: KeyboardEvent) => {
        if (cancelled) return;
        const node = getNode();
        if (!node || isNodeFocused(node)) {
            if (node && isNodeFocused(node)) settled = true;
            return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
        if (e.key.length !== 1 && e.key !== 'Backspace') return;
        e.preventDefault();
        e.stopPropagation();
        editorDom?.blur();
        focusCommentFieldWithoutCanvasScroll(node);
        if (e.key.length === 1) {
            const comments = useDocumentCommentsStore.getState();
            comments.setDraftCommentText(comments.draftCommentText + e.key);
        }
        settled = true;
    };
    if (typeof window !== 'undefined') {
        window.addEventListener('keydown', onKeyDown, true);
    }

    attempt();
    if (typeof window !== 'undefined') {
        for (const delay of [0, 32, 80, 160, 280, 420]) {
            timers.push(window.setTimeout(attempt, delay));
        }
    }

    return () => {
        cancelled = true;
        if (raf && typeof window !== 'undefined') window.cancelAnimationFrame(raf);
        if (typeof window !== 'undefined') {
            timers.forEach((id) => window.clearTimeout(id));
        }
        editorDom?.removeEventListener('focus', onEditorFocus, true);
        editor?.off('focus', onEditorFocus);
        if (typeof window !== 'undefined') {
            window.removeEventListener('keydown', onKeyDown, true);
        }
    };
}

/**
 * Marks the current selection as a comment and opens a draft.
 * Leaves the editor unfocused so the margin/panel textarea can take the caret.
 */
export function startCommentDraftOnSelection(editor: Editor): string | null {
    if (editor.isDestroyed || editor.state.selection.empty) return null;

    const id = createCommentDraftId();
    withPreservedEditorCanvasScroll(() => {
        editor.commands.setComment(id);
        editor.commands.blur();
    });

    const comments = useDocumentCommentsStore.getState();
    comments.setDocumentId(useLayoutStore.getState().activeDocument);
    comments.startDraft(id);
    return id;
}
