import { useCallback, useEffect, useRef, useState, type FocusEvent } from 'react';

export function useDelayedHoverReveal(showDelayMs = 450, hideDelayMs = 160) {
    const [visible, setVisible] = useState(false);
    const showTimerRef = useRef<number | null>(null);
    const hideTimerRef = useRef<number | null>(null);

    const clearShowTimer = useCallback(() => {
        if (showTimerRef.current != null) {
            window.clearTimeout(showTimerRef.current);
            showTimerRef.current = null;
        }
    }, []);

    const clearHideTimer = useCallback(() => {
        if (hideTimerRef.current != null) {
            window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
    }, []);

    const scheduleShow = useCallback(() => {
        clearShowTimer();
        showTimerRef.current = window.setTimeout(() => {
            setVisible(true);
            showTimerRef.current = null;
        }, showDelayMs);
    }, [clearShowTimer, showDelayMs]);

    const scheduleHide = useCallback(() => {
        clearShowTimer();
        clearHideTimer();
        hideTimerRef.current = window.setTimeout(() => {
            setVisible(false);
            hideTimerRef.current = null;
        }, hideDelayMs);
    }, [clearHideTimer, clearShowTimer, hideDelayMs]);

    const hide = useCallback(() => {
        clearShowTimer();
        clearHideTimer();
        setVisible(false);
    }, [clearHideTimer, clearShowTimer]);

    const keepOpen = useCallback(() => {
        clearHideTimer();
    }, [clearHideTimer]);

    useEffect(() => {
        return () => {
            clearShowTimer();
            clearHideTimer();
        };
    }, [clearHideTimer, clearShowTimer]);

    const bind = {
        onMouseEnter: () => {
            keepOpen();
            scheduleShow();
        },
        onMouseLeave: scheduleHide,
        onFocus: () => setVisible(true),
        onBlur: (event: FocusEvent<HTMLElement>) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                scheduleHide();
            }
        },
    };

    const panelBind = {
        onMouseEnter: keepOpen,
        onMouseLeave: scheduleHide,
        onFocus: keepOpen,
        onBlur: (event: FocusEvent<HTMLElement>) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                scheduleHide();
            }
        },
    };

    return { visible, bind, panelBind, hide, show: () => setVisible(true) };
}
