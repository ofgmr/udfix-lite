import { NodeViewWrapper } from '@tiptap/react';
import React, { useRef } from 'react';
import { cn } from '../../lib/utils';
import type { Node } from '@tiptap/pm/model';

interface HfImageNodeViewProps {
    node: Node;
    updateAttributes: (attributes: Record<string, string | number | boolean | null | undefined>) => void;
    selected: boolean;
}

export const HfImageNodeView: React.FC<HfImageNodeViewProps> = ({ node, updateAttributes, selected }) => {
    const containerRef = useRef<HTMLSpanElement>(null);

    const handleResize = (direction: 'left' | 'right', event: React.MouseEvent) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = containerRef.current?.offsetWidth || 0;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const newWidth = direction === 'right' ? startWidth + deltaX : startWidth - deltaX;
            const finalWidth = Math.max(16, Math.min(240, newWidth));
            updateAttributes({ width: `${finalWidth}px`, hfSized: true });
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const width = (node.attrs.width as string) || '64px';
    const align = ((node.attrs.align as string | null | undefined) ?? '').trim().toLowerCase();
    const isBlockAligned = align === 'center' || align === 'right';
    const hostStyle: React.CSSProperties = {
        width,
        maxWidth: '100%',
        ...(align === 'center'
            ? { display: 'block', marginLeft: 'auto', marginRight: 'auto' }
            : align === 'right'
              ? { display: 'block', marginLeft: 'auto', marginRight: 0 }
              : {}),
    };

    return (
        <NodeViewWrapper
            as="span"
            className={cn('hf-inline-image align-middle', isBlockAligned ? 'block w-full' : 'inline-block')}
            data-hf-align={align || undefined}
        >
            <span
                ref={containerRef}
                className={cn(
                    'relative align-middle',
                    isBlockAligned ? 'block' : 'inline-block',
                    selected ? 'ring-1 ring-primary/60 rounded-sm' : 'hover:ring-1 hover:ring-border',
                )}
                style={hostStyle}
            >
                <img
                    src={node.attrs.src as string}
                    alt={(node.attrs.alt as string) || ''}
                    className="block w-full h-auto rounded-sm"
                    draggable={false}
                />
                {selected && (
                    <>
                        <span
                            role="presentation"
                            onMouseDown={(e) => handleResize('left', e)}
                            className="absolute top-1/2 left-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background bg-primary shadow cursor-ew-resize z-10"
                        />
                        <span
                            role="presentation"
                            onMouseDown={(e) => handleResize('right', e)}
                            className="absolute top-1/2 right-0 h-2.5 w-2.5 translate-x-1/2 -translate-y-1/2 rounded-full border border-background bg-primary shadow cursor-ew-resize z-10"
                        />
                    </>
                )}
            </span>
        </NodeViewWrapper>
    );
};
