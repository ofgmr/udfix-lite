import { useLayoutStore } from '../stores/useLayoutStore';

/** Radix/cmdk dialog or palette open — global shortcuts should usually yield. */
export function isModalOpen(): boolean {
    return Boolean(
        document.querySelector(
            '[role="dialog"][data-state="open"], [data-radix-dialog-content], [cmdk-root][data-state="open"]',
        ),
    );
}

function isContentEditableElement(el: Element | null): boolean {
    if (!el) return false;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        return true;
    }
    if (el instanceof HTMLElement && el.isContentEditable) return true;
    return Boolean(el.closest('[contenteditable="true"]'));
}

/** True when focus is inside the main UdfixEditor surface (Tiptap), not HF mini editors. */
export function isMainUdfixEditorFocused(): boolean {
    const editor = useLayoutStore.getState().editor;
    if (!editor || editor.isDestroyed) return false;
    const active = document.activeElement;
    if (!active) return false;
    return editor.view.dom.contains(active);
}

/**
 * Layout chrome shortcuts (sidebar, panels) defer when the main document editor has focus,
 * so Mod+B / Mod+I stay available as bold/italic inside Tiptap.
 */
export function shouldDeferLayoutShortcutToEditor(): boolean {
    return isMainUdfixEditorFocused();
}

export function isBlockingFormTarget(e: KeyboardEvent): boolean {
    const target = e.target;
    if (!(target instanceof Element)) return false;
    if (isContentEditableElement(target)) return true;
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}
