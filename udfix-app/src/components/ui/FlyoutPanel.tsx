import React, { type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import MaterialIcon from '../../components/ui/MaterialIcon';

interface FlyoutPanelProps {
    title?: string;
    children: ReactNode;
    isOpen: boolean;
    onClose: () => void;
    className?: string;
    width?: string;
}

const FlyoutPanel: React.FC<FlyoutPanelProps> = ({
    title,
    children,
    isOpen,
    onClose,
    className,
    width = "w-[350px]",
}) => {
    if (!isOpen) return null;

    return (
        <div
            data-flyout-panel
            className={cn(
                "absolute top-4 right-0 flex flex-col glass-panel",
                "border-l border-border shadow-2xl z-[var(--z-floating)] rounded-l-2xl overflow-hidden",
                "animate-in fade-in-0 zoom-in-95 slide-in-from-right-2 duration-150 ease-out",
                "max-h-[calc(100vh-2rem)]",
                width,
                className
            )}
        >
            {/* Header */}
            {title && (
                <div className="h-10 flex items-center justify-between px-3 border-b border-border shrink-0 bg-background/40 backdrop-blur-md gap-1.5">
                    <span className="font-semibold text-xs tracking-wide text-foreground/90 truncate pl-1">{title}</span>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        title="Kapat"
                        aria-label="Kapat"
                        className="h-7 w-7 rounded-full hover:bg-white/10 transition-colors"
                    >
                        <MaterialIcon icon="close" size={16} />
                    </Button>
                </div>
            )}

            {/* Content */}
            <div className="overflow-y-auto overflow-x-hidden p-3 custom-scrollbar relative">
                <div>
                    {children}
                </div>
            </div>
        </div>
    );
};

export default FlyoutPanel;
