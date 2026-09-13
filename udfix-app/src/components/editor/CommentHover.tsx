import React, { useState, useEffect } from 'react';
import {
    useFloating,
    offset,
    flip,
    shift,
    arrow,
    autoUpdate,
    useHover,
    useFocus,
    useDismiss,
    useRole,
    useInteractions,
    FloatingPortal,
    FloatingArrow,
} from '@floating-ui/react';
import type { Editor } from '@tiptap/react';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { useLayoutStore } from '../../stores/useLayoutStore';

interface CommentHoverProps {
    editor: Editor | null;
}

const CommentHover: React.FC<CommentHoverProps> = ({ editor }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [_commentId, setCommentId] = useState<string | null>(null);
    const [commentText, setCommentText] = useState<string | null>(null);
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
    const arrowRef = React.useRef(null);
    const openRightPanel = useLayoutStore((s) => s.openRightPanel);

    const { refs, floatingStyles, context } = useFloating({
        open: isOpen,
        onOpenChange: setIsOpen,
        middleware: [
            offset(10),
            flip(),
            shift({ padding: 8 }),
            arrow({ element: arrowRef }),
        ],
        whileElementsMounted: autoUpdate,
        placement: 'top',
    });

    const hover = useHover(context, {
        delay: { open: 300, close: 100 },
        move: false,
    });
    const focus = useFocus(context);
    const dismiss = useDismiss(context);
    const role = useRole(context, { role: 'tooltip' });

    const { getFloatingProps } = useInteractions([
        hover,
        focus,
        dismiss,
        role,
    ]);

    useEffect(() => {
        if (anchorElement) {
            refs.setReference(anchorElement);
        }
    }, [anchorElement, refs]);

    useEffect(() => {
        if (!editor) return;

        const handleMouseEnter = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            // The comment extension adds a 'comment' class to the mark
            const commentEl = target.closest('.comment');

            if (commentEl instanceof HTMLElement) {
                setAnchorElement(commentEl);

                // Get comment ID from data attribute (assuming extension sets it)
                // If not, we might need to find the comment in the editor state based on position
                // For now, let's assume the extension sets data-comment-id
                const id = commentEl.getAttribute('data-comment-id');

                // We need to fetch the comment content. 
                // Since we don't have direct access to the comment store here easily without prop drilling or context,
                // we might need to rely on the editor state or a global store.
                // For this implementation, let's assume we can get it from the extension storage or just show a generic message
                // asking to click to view.
                // BETTER: The user said "hover commentary pop-up window".
                // Let's try to find the comment in the editor's storage if available.

                const comments = editor.storage.comment?.comments || [];
                const comment = comments.find((c) => c.id === id);

                if (comment) {
                    setCommentId(id);
                    setCommentText(comment.content ?? comment.text ?? null);
                    setIsOpen(true);
                } else if (id) {
                    // Fallback if storage isn't accessible but we have an ID
                    setCommentId(id);
                    setCommentText("Click to view comment");
                    setIsOpen(true);
                }
            }
        };

        const handleMouseLeave = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const commentEl = target.closest('.comment');

            if (commentEl) {
                setTimeout(() => {
                    setIsOpen(false);
                }, 100);
            }
        };

        // Add click handler to open sidebar
        const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const commentEl = target.closest('.comment');
            if (commentEl) {
                openRightPanel('comments');
            }
        }

        const editorElement = editor.view.dom;
        editorElement.addEventListener('mouseenter', handleMouseEnter, true);
        editorElement.addEventListener('mouseleave', handleMouseLeave, true);
        editorElement.addEventListener('click', handleClick, true);

        return () => {
            editorElement.removeEventListener('mouseenter', handleMouseEnter, true);
            editorElement.removeEventListener('mouseleave', handleMouseLeave, true);
            editorElement.removeEventListener('click', handleClick, true);
        };
    }, [editor, refs, openRightPanel]);

    if (!isOpen || !commentText) return null;

    return (
        <FloatingPortal>
            <div
                ref={refs.setFloating}
                style={floatingStyles}
                {...getFloatingProps()}
                className="z-[var(--z-editor-floating)]"
                onClick={() => openRightPanel('comments')}
            >
                <div className="max-w-xs rounded-lg shadow-xl border p-3 bg-popover border-border text-popover-foreground cursor-pointer hover:bg-accent/50 transition-colors">
                    <FloatingArrow
                        ref={arrowRef}
                        context={context}
                        className="fill-popover stroke-border"
                        strokeWidth={1}
                    />

                    <div className="flex items-start gap-2">
                        <MaterialIcon icon="comment" size={16} className="mt-0.5 flex-shrink-0 text-primary" />
                        <div className="text-sm">
                            <p className="font-medium text-xs text-muted-foreground mb-1">Comment</p>
                            <p className="text-sm leading-snug">{commentText}</p>
                            <p className="text-[10px] text-primary mt-2 font-medium">Click to view in sidebar →</p>
                        </div>
                    </div>
                </div>
            </div>
        </FloatingPortal>
    );
};

export default CommentHover;
