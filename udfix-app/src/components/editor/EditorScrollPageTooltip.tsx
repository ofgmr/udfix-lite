import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import {
    EDITOR_SCROLL_PAGE_TIP_HIDE_MS,
    EDITOR_SCROLLBAR_HIT_PX,
    pageStartViewportY,
    scrollPageTipFromMetrics,
    type ScrollPageTip,
} from '../../utils/editorScrollPageTooltip';

type EditorScrollPageTooltipProps = {
    scrollRef: React.RefObject<HTMLDivElement | null>;
};

function editorZoom(root: HTMLElement): number {
    const shell = root.querySelector<HTMLElement>('.udfix-editor-zoom-shell');
    if (!shell) return 1;
    const zoom = Number.parseFloat(getComputedStyle(shell).zoom);
    return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

function readTip(el: HTMLElement): ScrollPageTip | null {
    const port = el.getBoundingClientRect();
    const zoom = editorZoom(el);
    const pages = el.querySelectorAll<HTMLElement>('[data-rm-pagination] .page');
    const pageTops: number[] = [];
    pages.forEach((page) => {
        const marginTop = Number.parseFloat(getComputedStyle(page).marginTop);
        pageTops.push(pageStartViewportY(page.getBoundingClientRect().top, marginTop, zoom));
    });
    return scrollPageTipFromMetrics({
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollportTop: port.top,
        pageTops,
    });
}

function sameTip(a: ScrollPageTip | null, b: ScrollPageTip | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.page === b.page && a.total === b.total && Math.abs(a.centerY - b.centerY) < 0.5;
}

/**
 * Glass label beside the editor canvas scrollbar.
 * Tracks the thumb while the canvas scrolls and while the pointer is over the gutter.
 */
const EditorScrollPageTooltip: React.FC<EditorScrollPageTooltipProps> = ({ scrollRef }) => {
    const [tip, setTip] = useState<ScrollPageTip | null>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        let hideTimer: number | null = null;
        let raf = 0;
        let hoveringGutter = false;
        let shown = false;
        let disposed = false;

        const clearHide = () => {
            if (hideTimer != null) {
                window.clearTimeout(hideTimer);
                hideTimer = null;
            }
        };

        const hide = () => {
            if (!shown) return;
            shown = false;
            setVisible(false);
        };

        const armHide = () => {
            clearHide();
            hideTimer = window.setTimeout(() => {
                hideTimer = null;
                if (!hoveringGutter) hide();
            }, EDITOR_SCROLL_PAGE_TIP_HIDE_MS);
        };

        const publish = () => {
            raf = 0;
            if (disposed) return;
            const next = readTip(el);
            if (!next) {
                hide();
                return;
            }
            setTip((prev) => (sameTip(prev, next) ? prev : next));
        };

        const schedule = () => {
            if (raf !== 0) return;
            raf = window.requestAnimationFrame(publish);
        };

        const reveal = () => {
            schedule();
            if (shown) return;
            shown = true;
            setVisible(true);
        };

        const onScroll = () => {
            reveal();
            if (!hoveringGutter) armHide();
        };

        const pointerInGutter = (event: PointerEvent) => {
            const rect = el.getBoundingClientRect();
            return (
                event.clientX >= rect.right - EDITOR_SCROLLBAR_HIT_PX &&
                event.clientX <= rect.right + 6 &&
                event.clientY >= rect.top &&
                event.clientY <= rect.bottom
            );
        };

        const onPointerMove = (event: PointerEvent) => {
            const inGutter = pointerInGutter(event);
            if (inGutter) {
                hoveringGutter = true;
                clearHide();
                reveal();
                return;
            }
            if (hoveringGutter) {
                hoveringGutter = false;
                armHide();
            }
        };

        const onPointerLeave = () => {
            if (!hoveringGutter) return;
            hoveringGutter = false;
            armHide();
        };

        el.addEventListener('scroll', onScroll, { passive: true });
        el.addEventListener('pointermove', onPointerMove);
        el.addEventListener('pointerleave', onPointerLeave);
        const resizeObserver = new ResizeObserver(() => {
            if (hoveringGutter) schedule();
        });
        resizeObserver.observe(el);

        return () => {
            disposed = true;
            clearHide();
            if (raf !== 0) window.cancelAnimationFrame(raf);
            el.removeEventListener('scroll', onScroll);
            el.removeEventListener('pointermove', onPointerMove);
            el.removeEventListener('pointerleave', onPointerLeave);
            resizeObserver.disconnect();
        };
    }, [scrollRef]);

    if (!tip) return null;

    return (
        <div
            className={cn(
                'glass-tooltip pointer-events-none absolute right-6 z-40 -translate-y-1/2 rounded-lg px-2.5 py-1 text-xs text-foreground transition-opacity duration-200',
                visible ? 'opacity-100' : 'opacity-0',
            )}
            style={{ top: tip.centerY }}
            role="status"
            aria-live="polite"
            aria-hidden={!visible}
        >
            <span className="font-medium">Sayfa {tip.page}</span>
            <span className="text-muted-foreground"> / {tip.total}</span>
        </div>
    );
};

export default EditorScrollPageTooltip;
