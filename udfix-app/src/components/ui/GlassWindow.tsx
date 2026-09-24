import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface GlassWindowProps {
    children: ReactNode;
    className?: string;
    title?: string;
    showControls?: boolean;
    onClose?: () => void;
    onMinimize?: () => void;
    headerClassName?: string;
}

const GlassWindow: React.FC<GlassWindowProps> = ({
    children,
    className,
    title,
    showControls = true,
    onClose,
    onMinimize,
    headerClassName
}) => {
    return (
        <div className={cn("glass overflow-hidden flex flex-col", className)}>
            {/* Translucent Drag Header */}
            <div className={cn(
                "h-10 shrink-0 flex items-center justify-between px-4 border-b border-border select-none",
                headerClassName
            )}>
                {/* Traffic Lights (Window Controls) */}
                <div className="flex items-center gap-2 group">
                    {showControls && (
                        <>
                            <button
                                onClick={onClose}
                                className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors shadow-sm flex items-center justify-center"
                            >
                                <span className="opacity-0 group-hover:opacity-100 text-[8px] text-black font-bold">✕</span>
                            </button>
                            <button
                                onClick={onMinimize}
                                className="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 transition-colors shadow-sm flex items-center justify-center"
                            >
                                <span className="opacity-0 group-hover:opacity-100 text-[8px] text-black font-bold">−</span>
                            </button>
                            <button className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 transition-colors shadow-sm flex items-center justify-center" />
                        </>
                    )}
                </div>

                {/* Window Title */}
                <span className="text-foreground/80 text-sm font-medium tracking-wide">
                    {title}
                </span>

                {/* Right Spacer for balance (or extra tools) */}
                <div className="w-16 flex justify-end">
                    {/* Placeholder for potential window tools */}
                </div>
            </div>

            {/* Window Content */}
            <div className="flex-1 relative overflow-hidden">
                {children}
            </div>
        </div>
    );
};

export default GlassWindow;
