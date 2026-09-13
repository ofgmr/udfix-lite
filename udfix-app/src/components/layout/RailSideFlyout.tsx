import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

interface RailSideFlyoutProps {
    open: boolean;
    anchorRef: React.RefObject<HTMLElement | null>;
    children: React.ReactNode;
    className?: string;
    panelClassName?: string;
    panelBind?: {
        onMouseEnter?: () => void;
        onMouseLeave?: () => void;
        onFocus?: () => void;
        onBlur?: (event: React.FocusEvent<HTMLElement>) => void;
    };
}

/** Slides auxiliary rail actions out to the right (e.g. recovery, guidance toggle). */
export function RailSideFlyout({
    open,
    anchorRef,
    children,
    className,
    panelClassName,
    panelBind,
}: RailSideFlyoutProps) {
    const [position, setPosition] = useState<{ top: number; left: number; height: number } | null>(null);

    useLayoutEffect(() => {
        if (!open) {
            setPosition(null);
            return;
        }

        const updatePosition = () => {
            const anchor = anchorRef.current;
            if (!anchor) return;

            const rect = anchor.getBoundingClientRect();
            setPosition({
                top: rect.top,
                left: rect.right + 8,
                height: Math.max(rect.height, 40),
            });
        };

        updatePosition();

        const scrollParent = anchorRef.current?.closest('.guidance-rail-scroll');
        scrollParent?.addEventListener('scroll', updatePosition, { passive: true });
        window.addEventListener('resize', updatePosition, { passive: true });

        return () => {
            scrollParent?.removeEventListener('scroll', updatePosition);
            window.removeEventListener('resize', updatePosition);
        };
    }, [anchorRef, open]);

    if (!open || !position) return null;

    return createPortal(
        <div
            className={cn(
                'pointer-events-none fixed z-[var(--z-floating)]',
                'translate-x-1 opacity-0 transition-all duration-200',
                open && 'pointer-events-auto translate-x-0 opacity-100',
                className,
            )}
            style={{
                top: position.top,
                left: position.left,
                height: position.height,
            }}
            {...panelBind}
        >
            <div
                className={cn(
                    'relative flex h-full items-center rounded-xl border border-border/70 bg-background/90 p-1 pl-2 shadow-xl backdrop-blur-xl',
                    '-ml-2 before:absolute before:-left-2 before:top-0 before:h-full before:w-2',
                    panelClassName,
                )}
            >
                {children}
            </div>
        </div>,
        document.body,
    );
}
