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


interface Citation {
    title: string;
    court?: string;
    date?: string;
    excerpt?: string;
    url?: string;
}

interface CitationHoverProps {
    editor: Editor | null;
}

const CitationHover: React.FC<CitationHoverProps> = ({ editor }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [citation, setCitation] = useState<Citation | null>(null);
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
    const arrowRef = React.useRef(null);

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

    // Set reference element when anchor changes
    useEffect(() => {
        if (anchorElement) {
            refs.setReference(anchorElement);
        }
    }, [anchorElement, refs]);

    // Listen for hover events on citation elements
    useEffect(() => {
        if (!editor) return;

        const handleMouseEnter = (event: MouseEvent) => {
            const target = event.target as HTMLElement;

            // Check if the element is a citation (you can customize this selector)
            // For now, we'll look for elements with a data-citation attribute or .citation class
            const citationEl = target.closest('[data-citation], .citation');

            if (citationEl instanceof HTMLElement) {
                setAnchorElement(citationEl);

                // Extract citation data from attributes or parse from text
                const citationData: Citation = {
                    title: citationEl.getAttribute('data-citation-title') || citationEl.textContent || 'Citation',
                    court: citationEl.getAttribute('data-citation-court') || undefined,
                    date: citationEl.getAttribute('data-citation-date') || undefined,
                    excerpt: citationEl.getAttribute('data-citation-excerpt') || undefined,
                    url: citationEl.getAttribute('data-citation-url') || undefined,
                };

                setCitation(citationData);
                setIsOpen(true);
            }
        };

        const handleMouseLeave = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const citationEl = target.closest('[data-citation], .citation');

            if (citationEl) {
                // Delay closing to allow moving to the tooltip
                setTimeout(() => {
                    setIsOpen(false);
                }, 100);
            }
        };

        const editorElement = editor.view.dom;
        editorElement.addEventListener('mouseenter', handleMouseEnter, true);
        editorElement.addEventListener('mouseleave', handleMouseLeave, true);

        return () => {
            editorElement.removeEventListener('mouseenter', handleMouseEnter, true);
            editorElement.removeEventListener('mouseleave', handleMouseLeave, true);
        };
    }, [editor]);

    if (!isOpen || !citation) return null;

    return (
        <FloatingPortal>
            <div
                ref={refs.setFloating}
                style={floatingStyles}
                {...getFloatingProps()}
                className="z-[var(--z-editor-floating)]"
            >
                <div className="max-w-sm rounded-lg shadow-2xl border p-4 bg-popover border-border text-popover-foreground">
                    <FloatingArrow
                        ref={arrowRef}
                        context={context}
                        className="fill-popover stroke-border"
                        strokeWidth={1}
                    />

                    {/* Citation Title */}
                    <div className="flex items-start gap-2 mb-3">
                        <MaterialIcon icon="balance" size={18} className="mt-0.5 flex-shrink-0 text-primary" />
                        <h3 className="font-semibold text-sm leading-tight text-foreground">
                            {citation.title}
                        </h3>
                    </div>

                    {/* Citation Metadata */}
                    <div className="space-y-1.5 mb-3">
                        {citation.court && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <MaterialIcon icon="description" size={14} />
                                <span>{citation.court}</span>
                            </div>
                        )}
                        {citation.date && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <MaterialIcon icon="calendar_today" size={14} />
                                <span>{citation.date}</span>
                            </div>
                        )}
                    </div>

                    {/* Citation Excerpt */}
                    {citation.excerpt && (
                        <div className="text-xs leading-relaxed p-2 rounded border-l-2 bg-muted/50 border-primary text-muted-foreground">
                            {citation.excerpt}
                        </div>
                    )}

                    {/* View Full Citation Link */}
                    {citation.url && (
                        <a
                            href={citation.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs mt-3 inline-block hover:underline text-primary"
                        >
                            View full citation →
                        </a>
                    )}
                </div>
            </div>
        </FloatingPortal>
    );
};

export default CitationHover;
