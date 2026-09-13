import type { Editor } from '@tiptap/react';
import { useLayoutStore } from '../stores/useLayoutStore';
import { findUdfixEditorByDom } from '../utils/udfixEditorDocumentRegistry';
import { isModalOpen } from './target';

function isSelectAllCombo(e: KeyboardEvent): boolean {
    return (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a';
}

export function selectAllInElement(el: HTMLElement): void {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = el.ownerDocument.defaultView?.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}

export function selectAllAcrossElements(elements: Element[]): void {
    if (elements.length === 0) return;
    const doc = elements[0]?.ownerDocument ?? document;
    const range = doc.createRange();
    range.setStartBefore(elements[0]!);
    range.setEndAfter(elements[elements.length - 1]!);
    const selection = doc.defaultView?.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}

function findTiptapEditorForDom(dom: HTMLElement): Editor | null {
    const layoutEd = useLayoutStore.getState().editor;
    if (layoutEd && !layoutEd.isDestroyed && layoutEd.view.dom === dom) {
        return layoutEd;
    }
    return findUdfixEditorByDom(dom);
}

export function executeSelectAllInScope(scope: HTMLElement): void {
    if (scope instanceof HTMLInputElement || scope instanceof HTMLTextAreaElement) {
        scope.select();
        return;
    }

    const tryProseMirror = (pm: HTMLElement) => {
        const editor = findTiptapEditorForDom(pm);
        if (editor) {
            editor.commands.selectAll();
            return true;
        }
        selectAllInElement(pm);
        return true;
    };

    if (scope.classList.contains('ProseMirror')) {
        tryProseMirror(scope);
        return;
    }

    const proseMirrors = scope.querySelectorAll('.ProseMirror');
    if (proseMirrors.length === 1 && proseMirrors[0] instanceof HTMLElement) {
        tryProseMirror(proseMirrors[0]);
        return;
    }

    const textLayers = scope.querySelectorAll('.textLayer');
    if (textLayers.length > 0) {
        selectAllAcrossElements(Array.from(textLayers));
        return;
    }

    const ocr = scope.querySelector('.ocr-overlay[data-select="true"]');
    if (ocr instanceof HTMLElement) {
        selectAllInElement(ocr);
        return;
    }

    selectAllInElement(scope);
}

/** Resolve the DOM subtree that Cmd+A should affect (active/focused panel content). */
export function resolveSelectAllScope(doc: Document): HTMLElement | null {
    const active = doc.activeElement;

    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        return active;
    }

    if (active instanceof Element) {
        const proseMirror = active.closest('.ProseMirror');
        if (proseMirror instanceof HTMLElement) return proseMirror;

        const textLayer = active.closest('.textLayer');
        if (textLayer instanceof HTMLElement) {
            const panelScope = textLayer.closest('[data-nomai-panel-scope]');
            if (panelScope instanceof HTMLElement) return panelScope;
            return textLayer;
        }

        const ocr = active.closest('.ocr-overlay[data-select="true"]');
        if (ocr instanceof HTMLElement) {
            const panelScope = ocr.closest('[data-nomai-panel-scope]');
            if (panelScope instanceof HTMLElement) return panelScope;
            return ocr;
        }

        const panelScope = active.closest('[data-nomai-panel-scope]');
        if (panelScope instanceof HTMLElement) return panelScope;

        const dockContent = active.closest('.dv-content-container');
        if (dockContent instanceof HTMLElement) return dockContent;
    }

    const panelId = useLayoutStore.getState().dockviewApi?.activePanel?.id;
    if (panelId) {
        const panelRoot = doc.querySelector(`[data-nomai-panel-id="${CSS.escape(panelId)}"]`);
        if (panelRoot instanceof HTMLElement) return panelRoot;
    }

    return null;
}

/** Returns true when the shortcut was handled. */
export function tryScopedSelectAllShortcut(e: KeyboardEvent): boolean {
    if (isModalOpen() || !isSelectAllCombo(e)) return false;

    const doc =
        e.target instanceof Node
            ? e.target.ownerDocument ?? document
            : (e.view?.document ?? document);
    const scope = resolveSelectAllScope(doc);

    e.preventDefault();
    e.stopPropagation();

    if (scope) executeSelectAllInScope(scope);
    return true;
}

export function registerScopedSelectAllShortcut(targetWindow: Window): () => void {
    const onKeyDown = (e: KeyboardEvent) => {
        tryScopedSelectAllShortcut(e);
    };
    targetWindow.addEventListener('keydown', onKeyDown, true);
    return () => targetWindow.removeEventListener('keydown', onKeyDown, true);
}
