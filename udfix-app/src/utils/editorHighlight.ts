import type { Editor } from '@tiptap/react';

export const HIGHLIGHT_LEMON_HEX = '#F6FEAA';

const HIGHLIGHT_DEFAULT_KEY = 'udfix-highlight-default-color';
const HIGHLIGHT_DEFAULT_EVENT = 'udfix-highlight-default-change';

const USABLE_HIGHLIGHT_COLORS = new Set([
    '#E9806E',
    '#C59B76',
    '#C0C781',
    '#78BC61',
    HIGHLIGHT_LEMON_HEX,
]);

type HighlightDefaultEvent = CustomEvent<{ color: string }>;

function normalizeHex(color: string): string {
    const trimmed = color.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
        return `#${trimmed.slice(1).toUpperCase()}`;
    }
    return trimmed;
}

export function isUsableHighlightColor(color: string | null | undefined): color is string {
    if (!color) return false;
    const n = normalizeHex(color);
    return USABLE_HIGHLIGHT_COLORS.has(n) || USABLE_HIGHLIGHT_COLORS.has(color);
}

export function getDefaultHighlightColor(): string {
    try {
        const raw = localStorage.getItem(HIGHLIGHT_DEFAULT_KEY);
        if (raw && isUsableHighlightColor(raw)) return normalizeHex(raw);
    } catch {
        /* private mode */
    }
    return HIGHLIGHT_LEMON_HEX;
}

export function setDefaultHighlightColor(color: string): void {
    if (!isUsableHighlightColor(color)) return;
    const next = normalizeHex(color);
    try {
        localStorage.setItem(HIGHLIGHT_DEFAULT_KEY, next);
    } catch {
        /* quota / private mode */
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(HIGHLIGHT_DEFAULT_EVENT, { detail: { color: next } }));
    }
}

export function subscribeToDefaultHighlightColor(handler: (color: string) => void): () => void {
    const listener = (event: Event) => {
        handler((event as HighlightDefaultEvent).detail.color);
    };
    window.addEventListener(HIGHLIGHT_DEFAULT_EVENT, listener);
    return () => window.removeEventListener(HIGHLIGHT_DEFAULT_EVENT, listener);
}

/** Icon click: toggle default color on the selection. */
export function toggleEditorHighlight(editor: Editor): void {
    const color = getDefaultHighlightColor();
    if (editor.isActive('highlight')) {
        const current = String(editor.getAttributes('highlight').color ?? '');
        if (!current || normalizeHex(current) === normalizeHex(color)) {
            editor.chain().focus().unsetHighlight().run();
            return;
        }
    }
    editor.chain().focus().setHighlight({ color }).run();
}

/** Palette pick: None clears; any other swatch becomes the default and is applied. */
export function applyEditorHighlight(editor: Editor, color: string): void {
    if (!color || color === '#ffffff') {
        editor.chain().focus().unsetHighlight().run();
        return;
    }
    setDefaultHighlightColor(color);
    editor.chain().focus().setHighlight({ color }).run();
}
