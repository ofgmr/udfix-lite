import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';
interface EditorCanvasProps {
    children: React.ReactNode;
    className?: string;
}

const EditorCanvas: React.FC<EditorCanvasProps> = ({ children, className }) => {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    // Center content initially
    useEffect(() => {
        if (containerRef.current) {
            const { clientWidth } = containerRef.current;
            // Assuming A4 page width approx 800px + padding
            const contentWidth = 794;
            setPosition({
                x: (clientWidth - contentWidth) / 2,
                y: 0
            });
        }
    }, []);

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const zoomSensitivity = 0.001;
            const delta = -e.deltaY * zoomSensitivity;
            const newScale = Math.min(Math.max(0.25, scale + delta), 3);
            setScale(newScale);
        } else {
            // Normal scroll if not zooming
            // Standard behavior: Scroll pans vertically/horizontally
            setPosition(prev => ({
                x: prev.x - e.deltaX,
                y: prev.y - e.deltaY
            }));
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        // Allow dragging when clicking directly on the canvas container, middle mouse, or shift+click
        if (e.target === containerRef.current || (e.buttons === 4) || (e.buttons === 1 && e.shiftKey)) {
            setIsDragging(true);
            setLastMousePos({ x: e.clientX, y: e.clientY });
            e.preventDefault(); // Prevent text selection
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            const deltaX = e.clientX - lastMousePos.x;
            const deltaY = e.clientY - lastMousePos.y;

            setPosition(prev => ({
                x: prev.x + deltaX,
                y: prev.y + deltaY
            }));

            setLastMousePos({ x: e.clientX, y: e.clientY });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    return (
        <div
            ref={containerRef}
            className={cn(
                "w-full h-full overflow-hidden relative cursor-default bg-muted/30",
                className
            )}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
                cursor: isDragging ? 'grabbing' : 'default',
                // Dot pattern background
                backgroundImage: 'radial-gradient(hsl(var(--muted-foreground) / 0.1) 1px, transparent 1px)',
                backgroundSize: '20px 20px'
            }}
        >
            <div
                style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    transformOrigin: '0 0',
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                }}
            >
                {children}
            </div>

            {/* Zoom Indicator */}
            <div className="absolute bottom-4 right-4 bg-black/70 dark:bg-white/70 text-white dark:text-black px-3 py-1 rounded-full text-xs backdrop-blur-sm pointer-events-none">
                {Math.round(scale * 100)}%
            </div>
        </div>
    );
};

export default EditorCanvas;
