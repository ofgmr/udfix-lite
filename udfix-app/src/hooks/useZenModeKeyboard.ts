import { useEffect } from 'react';
import { useLayoutStore } from '../stores/useLayoutStore';

function isModalOpen(): boolean {
    return Boolean(
        document.querySelector('[role="dialog"][data-state="open"], [data-radix-dialog-content]'),
    );
}

/** Escape ile zen’den çıkış; ⌘⇧M / Ctrl+Shift+M ile aç/kapa. */
export function useZenModeKeyboard() {
    const isZenMode = useLayoutStore((s) => s.isZenMode);
    const toggleZenMode = useLayoutStore((s) => s.toggleZenMode);
    const exitZenMode = useLayoutStore((s) => s.exitZenMode);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const mod = e.metaKey || e.ctrlKey;
            if (mod && e.shiftKey && e.key.toLowerCase() === 'm') {
                e.preventDefault();
                toggleZenMode();
                return;
            }
            if (e.key !== 'Escape' || !isZenMode) return;
            if (isModalOpen()) return;
            e.preventDefault();
            exitZenMode();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isZenMode, toggleZenMode, exitZenMode]);
}
