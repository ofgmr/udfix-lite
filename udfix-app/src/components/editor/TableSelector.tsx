import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

interface TableSelectorProps {
    onSelect: (rows: number, cols: number) => void;
    onClose: () => void;
    position: { x: number; y: number } | null;
}

const TableSelector: React.FC<TableSelectorProps> = ({ onSelect, onClose, position }) => {
    const [hoveredRow, setHoveredRow] = useState(0);
    const [hoveredCol, setHoveredCol] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const MAX_ROWS = 10;
    const MAX_COLS = 10;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (position) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [position, onClose]);

    if (!position) return null;

    const content = (
        <div
            className="fixed inset-0 z-[var(--z-editor-floating)] bg-transparent"
            style={{ pointerEvents: 'auto' }}
        >
            {/* Invisible backdrop handled by event listener, but consistent z-index helps */}
            <div
                ref={containerRef}
                className="fixed glass border-border/40 text-foreground shadow-2xl rounded-xl p-3 animate-in fade-in zoom-in-95 duration-200"
                style={{
                    left: position.x,
                    top: position.y,
                }}
                onMouseDown={(e) => e.preventDefault()} // Prevent focus loss
            >
                <div className="mb-3 text-center text-sm font-semibold text-foreground tracking-tight">
                    {hoveredRow + 1} × {hoveredCol + 1}
                </div>
                <div
                    className="grid gap-1"
                    style={{ gridTemplateColumns: `repeat(${MAX_COLS}, 18px)` }}
                    onMouseLeave={() => {
                        setHoveredRow(-1);
                        setHoveredCol(-1);
                    }}
                >
                    {Array.from({ length: MAX_ROWS }).map((_, rowIndex) => (
                        Array.from({ length: MAX_COLS }).map((_, colIndex) => (
                            <div
                                key={`${rowIndex}-${colIndex}`}
                                className={`w-[18px] h-[18px] border rounded-[2px] transition-all duration-150 ${rowIndex <= hoveredRow && colIndex <= hoveredCol
                                    ? 'bg-primary/80 border-primary shadow-sm scale-110 z-10'
                                    : 'bg-background/50 border-border hover:border-primary/60'
                                    } cursor-pointer`}
                                onMouseEnter={() => {
                                    setHoveredRow(rowIndex);
                                    setHoveredCol(colIndex);
                                }}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation(); // Stop propagation to avoid immediate close
                                    onSelect(rowIndex + 1, colIndex + 1);
                                    // Close handled by parent calling onSelect usually, but let's be safe
                                }}
                            />
                        ))
                    ))}
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(content, document.body);
};

export default TableSelector;

