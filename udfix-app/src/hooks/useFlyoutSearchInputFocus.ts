import { useEffect, useRef } from 'react';
import { useLayoutStore } from '../stores/useLayoutStore';

function focusSearchInput(input: HTMLInputElement | null) {
    if (!input) return;

    input.focus({ preventScroll: true });

    const caret = input.value.length;
    try {
        input.setSelectionRange(caret, caret);
    } catch {
        // Some input modes do not support selection ranges; focus is enough.
    }
}

export function useFlyoutSearchInputFocus(panelId: string) {
    const inputRef = useRef<HTMLInputElement>(null);
    const focusPulse = useLayoutStore((state) => state.flyoutSearchFocusPulse);
    const focusPanel = useLayoutStore((state) => state.flyoutSearchFocusPanel);

    useEffect(() => {
        const frame = requestAnimationFrame(() => focusSearchInput(inputRef.current));
        return () => cancelAnimationFrame(frame);
    }, []);

    useEffect(() => {
        if (focusPulse === 0) return;
        if (focusPanel && focusPanel !== panelId) return;

        const frame = requestAnimationFrame(() => focusSearchInput(inputRef.current));
        return () => cancelAnimationFrame(frame);
    }, [focusPanel, focusPulse, panelId]);

    return inputRef;
}
