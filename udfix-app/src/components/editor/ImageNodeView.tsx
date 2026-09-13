import { NodeViewWrapper } from '@tiptap/react';
import React, { useRef } from 'react';
import { cn } from '../../lib/utils';
import type { Node } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';

interface ImageNodeViewProps {
    node: Node;
    updateAttributes: (attributes: Record<string, string | number | boolean | null | undefined>) => void;
    selected: boolean;
    editor: Editor;
}

export const ImageNodeView: React.FC<ImageNodeViewProps> = ({ node, updateAttributes, selected }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const handleResize = (direction: 'left' | 'right', event: React.MouseEvent) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = containerRef.current?.offsetWidth || 0;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const newWidth = direction === 'right' ? startWidth + deltaX : startWidth - deltaX;
            // Keep image usable and avoid jumping to full width.
            const finalWidth = Math.max(120, newWidth);
            updateAttributes({ width: `${finalWidth}px` });
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const align = (node.attrs.align as string) || 'center';
    const justify =
        align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';

    return (
        <NodeViewWrapper
            className={cn('image-resizer-wrapper my-2 flex w-full')}
            data-align={align}
            style={{
                display: 'flex',
                width: '100%',
                justifyContent: justify,
                boxSizing: 'border-box',
            }}
        >
            <div
                ref={containerRef}
                className={cn(
                    "relative group transition-all",
                    selected ? "ring-2 ring-blue-500 shadow-lg" : "hover:ring-1 hover:ring-gray-300"
                )}
                style={{ width: node.attrs.width || 'auto', maxWidth: '100%' }}
            >
                <img
                    src={node.attrs.src}
                    className="w-full h-auto block rounded-sm"
                />

                {/* Resize Handles - Only visible when selected */}
                {selected && !node.attrs.isUploading && (
                    <>
                        <div
                            onMouseDown={(e) => handleResize('left', e)}
                            className="absolute top-1/2 left-0 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500/95 shadow cursor-ew-resize z-20"
                        />
                        <div
                            onMouseDown={(e) => handleResize('right', e)}
                            className="absolute top-1/2 right-0 h-5 w-5 translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500/95 shadow cursor-ew-resize z-20"
                        />
                    </>
                )}

                {/* Loading Overlay */}
                {node.attrs.isUploading && (
                    <div className="absolute inset-0 bg-white/50 flex items-center justify-center backdrop-blur-sm">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                    </div>
                )}
            </div>
        </NodeViewWrapper>
    );
};