import { useEffect } from 'react';
import { useLayoutStore } from '../stores/useLayoutStore';

const OUTSIDE_CLOSE_IGNORE =
    '[data-flyout-panel],[data-right-activity-bar],[data-radix-popper-content-wrapper],[data-radix-select-viewport],[role="menu"],[role="listbox"],[role="dialog"],.dv-floating-group-container';

/**
 * Sağ flyout (arama satırı + liste) açıkken canvas / editör / sol şeride tıklanınca kapat.
 */
export function useCloseFlyoutOnOutsideClick(): void {
    const activeRightPanel = useLayoutStore((s) => s.activeRightPanel);
    const closeRightPanel = useLayoutStore((s) => s.closeRightPanel);

    useEffect(() => {
        if (!activeRightPanel) return;

        const onPointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (target.closest(OUTSIDE_CLOSE_IGNORE)) return;
            closeRightPanel();
        };

        document.addEventListener('pointerdown', onPointerDown, true);
        return () => document.removeEventListener('pointerdown', onPointerDown, true);
    }, [activeRightPanel, closeRightPanel]);
}
