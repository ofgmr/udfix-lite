import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

type FlyoutVirtualListProps<T> = {
    items: T[];
    estimateSize: number;
    getKey: (item: T) => string;
    renderRow: (item: T) => React.ReactNode;
    empty: React.ReactNode;
};

export function FlyoutVirtualList<T>({
    items,
    estimateSize,
    getKey,
    renderRow,
    empty,
}: FlyoutVirtualListProps<T>) {
    const parentRef = useRef<HTMLDivElement>(null);
    const virtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => estimateSize,
        overscan: 6,
    });

    if (items.length === 0) {
        return <>{empty}</>;
    }

    return (
        <div
            ref={parentRef}
            className="pr-1 pb-2 max-h-[60vh] overflow-y-auto overflow-x-hidden custom-scrollbar"
        >
            <div
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                }}
            >
                {virtualizer.getVirtualItems().map((row) => {
                    const item = items[row.index];
                    if (!item) return null;
                    return (
                        <div
                            key={getKey(item)}
                            data-index={row.index}
                            ref={virtualizer.measureElement}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                transform: `translateY(${row.start}px)`,
                                paddingBottom: 8,
                            }}
                        >
                            {renderRow(item)}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
