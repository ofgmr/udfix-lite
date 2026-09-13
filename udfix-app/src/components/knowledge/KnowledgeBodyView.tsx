import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '../../lib/utils';

const CHUNK_CHARS = 4000;

function chunkText(text: string): string[] {
    if (!text) return [];
    if (text.length <= CHUNK_CHARS) return [text];
    const out: string[] = [];
    for (let i = 0; i < text.length; i += CHUNK_CHARS) {
        out.push(text.slice(i, i + CHUNK_CHARS));
    }
    return out;
}

/** Renders long knowledge bodies without mounting the entire string in one layout. */
export function KnowledgeBodyView({
    text,
    className,
}: {
    text: string;
    className?: string;
}) {
    const chunks = useMemo(() => chunkText(text), [text]);
    const parentRef = useRef<HTMLDivElement>(null);
    const virtualizer = useVirtualizer({
        count: chunks.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 168,
        overscan: 2,
    });

    if (chunks.length <= 1) {
        return (
            <div
                className={cn(
                    'text-xs cursor-text bg-white/5 p-2 rounded-lg select-text border border-white/5 whitespace-pre-wrap leading-relaxed',
                    className,
                )}
            >
                {text}
            </div>
        );
    }

    return (
        <div
            ref={parentRef}
            className={cn(
                'max-h-[min(28rem,50vh)] overflow-y-auto custom-scrollbar rounded-lg border border-white/5 bg-white/5',
                className,
            )}
        >
            <div
                className="relative w-full"
                style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
                {virtualizer.getVirtualItems().map((row) => (
                    <div
                        key={row.key}
                        data-index={row.index}
                        ref={virtualizer.measureElement}
                        className="absolute left-0 top-0 w-full px-2 py-1 text-xs leading-relaxed whitespace-pre-wrap select-text cursor-text"
                        style={{ transform: `translateY(${row.start}px)` }}
                    >
                        {chunks[row.index]}
                    </div>
                ))}
            </div>
        </div>
    );
}
