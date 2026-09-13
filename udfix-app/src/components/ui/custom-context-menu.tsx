import React, { useEffect, useRef } from 'react';
import {
    useFloating,
    offset,
    flip,
    shift,
    autoUpdate,
    useClick,
    useDismiss,
    useRole,
    useInteractions,
    FloatingPortal,
} from '@floating-ui/react';
import { cn } from '../../lib/utils';

export interface ContextMenuItem {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    divider?: boolean;
    danger?: boolean;
}

interface ContextMenuProps {
    open: boolean;
    anchorPoint: { x: number; y: number } | null;
    onClose: () => void;
    items: ContextMenuItem[];
}

const ContextMenu: React.FC<ContextMenuProps> = ({ open, anchorPoint, onClose, items }) => {
    const listRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = React.useState<number | null>(null);

    const { refs, floatingStyles, context } = useFloating({
        open,
        onOpenChange: (newOpen) => {
            if (!newOpen) onClose();
        },
        middleware: [offset(5), flip(), shift({ padding: 8 })],
        whileElementsMounted: autoUpdate,
        placement: 'bottom-start',
    });

    const click = useClick(context);
    const dismiss = useDismiss(context);
    const role = useRole(context);

    const { getFloatingProps } = useInteractions([
        click,
        dismiss,
        role,
    ]);

    // Set reference position based on anchor point
    useEffect(() => {
        if (anchorPoint) {
            refs.setPositionReference({
                getBoundingClientRect() {
                    return {
                        width: 0,
                        height: 0,
                        x: anchorPoint.x,
                        y: anchorPoint.y,
                        top: anchorPoint.y,
                        left: anchorPoint.x,
                        right: anchorPoint.x,
                        bottom: anchorPoint.y,
                    };
                },
            });
        }
    }, [anchorPoint, refs]);

    // Keyboard navigation
    useEffect(() => {
        if (!open) {
            setActiveIndex(null);
            return;
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            const enabledItems = items.filter(item => !item.disabled && !item.divider);

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex(prev => {
                    if (prev === null) return 0;
                    return (prev + 1) % enabledItems.length;
                });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex(prev => {
                    if (prev === null) return enabledItems.length - 1;
                    return (prev - 1 + enabledItems.length) % enabledItems.length;
                });
            } else if (e.key === 'Enter' && activeIndex !== null) {
                e.preventDefault();
                enabledItems[activeIndex]?.onClick();
                onClose();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, items, activeIndex, onClose]);

    if (!open) return null;

    return (
        <FloatingPortal>
            <div
                ref={refs.setFloating}
                style={floatingStyles}
                {...getFloatingProps()}
                className="z-[var(--z-floating)]"
            >
                <div
                    ref={listRef}
                    className="min-w-[200px] rounded-lg shadow-xl border overflow-hidden bg-popover text-popover-foreground glass border-white/10"
                >
                    {items.map((item, index) => {
                        if (item.divider) {
                            return (
                                <div
                                    key={`divider-${index}`}
                                    className="h-px my-1 bg-border"
                                />
                            );
                        }

                        const enabledIndex = items
                            .slice(0, index)
                            .filter(i => !i.disabled && !i.divider).length;
                        const isActive = activeIndex === enabledIndex;

                        return (
                            <button
                                key={index}
                                onClick={() => {
                                    if (!item.disabled) {
                                        item.onClick();
                                        onClose();
                                    }
                                }}
                                disabled={item.disabled}
                                className={cn(
                                    "w-full px-3 py-2 text-sm flex items-center gap-3 transition-colors text-left",
                                    item.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-accent hover:text-accent-foreground",
                                    isActive && !item.disabled && "bg-accent text-accent-foreground",
                                    item.danger && "text-destructive hover:text-destructive"
                                )}
                                onMouseEnter={() => !item.disabled && setActiveIndex(enabledIndex)}
                            >
                                {item.icon && (
                                    <span className="w-4 h-4 flex items-center justify-center">
                                        {item.icon}
                                    </span>
                                )}
                                <span className="flex-1">{item.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </FloatingPortal>
    );
};

export default ContextMenu;
