import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Editor } from '@tiptap/react';
import { Textarea } from '../../components/ui/textarea';
import { cn } from '../../lib/utils';

interface FootnoteInspectorProps {
    editor: Editor | null;
}

type BubbleState = {
    id: string;
    number: number;
    content: string;
    rect: DOMRect;
    mode: 'preview' | 'edit';
};

const FootnoteInspector: React.FC<FootnoteInspectorProps> = ({ editor }) => {
    const [bubble, setBubble] = useState<BubbleState | null>(null);
    const [editContent, setEditContent] = useState('');
    const popoverRef = useRef<HTMLDivElement>(null);
    const hoverTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const saveAndClose = useCallback(() => {
        if (editor && bubble?.mode === 'edit') {
            editor.commands.updateFootnote(bubble.id, editContent);
        }
        setBubble(null);
        editor?.commands.focus();
    }, [editor, bubble, editContent]);

    // 1. Handle Native DOM Events for Hover & Click
    useEffect(() => {
        if (!editor?.view?.dom) return;
        const dom = editor.view.dom;

        const getFootnoteData = (target: HTMLElement) => {
            const ref = target.closest('.footnote-ref') as HTMLElement;
            if (!ref) return null;
            return {
                ref,
                id: ref.getAttribute('data-footnote-id') || '',
                number: parseInt(ref.getAttribute('data-footnote-number') || '1'),
                content: ref.getAttribute('data-content') || '',
                rect: ref.getBoundingClientRect(),
            };
        };

        const handleMouseOver = (e: MouseEvent) => {
            if (bubble?.mode === 'edit') return; // Don't interrupt if already editing

            const data = getFootnoteData(e.target as HTMLElement);
            if (!data) return;

            clearTimeout(hoverTimeout.current);
            setBubble({ ...data, mode: 'preview' });
        };

        const handleMouseOut = (_e: MouseEvent) => {
            if (bubble?.mode === 'edit') return;

            // Add a small delay so the user has time to move their mouse into the bubble
            hoverTimeout.current = setTimeout(() => {
                setBubble(null);
            }, 250);
        };

        const handleClick = (e: MouseEvent) => {
            const data = getFootnoteData(e.target as HTMLElement);
            if (!data) return;

            e.preventDefault();
            clearTimeout(hoverTimeout.current);
            setEditContent(data.content);
            setBubble({ ...data, mode: 'edit' });
        };

        dom.addEventListener('mouseover', handleMouseOver);
        dom.addEventListener('mouseout', handleMouseOut);
        dom.addEventListener('click', handleClick);

        // Hide bubble if the user scrolls the editor to prevent floating detachment
        const handleScroll = () => {
            if (bubble?.mode === 'preview') setBubble(null);
        };
        window.addEventListener('scroll', handleScroll, true);

        return () => {
            dom.removeEventListener('mouseover', handleMouseOver);
            dom.removeEventListener('mouseout', handleMouseOut);
            dom.removeEventListener('click', handleClick);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [editor, bubble?.mode]);

    // 2. Handle Click Outside to Save & Close
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!bubble || bubble.mode !== 'edit') return;

            // If the click is outside our popover, trigger save
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                saveAndClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [bubble, saveAndClose]);

    // Prevent rendering if there's no active bubble
    if (!bubble) return null;

    // Calculate smart positioning
    // We use absolute positioning relative to the document body to survive scrolling
    const top = bubble.rect.bottom + window.scrollY + 8;
    // Keep it from bleeding off the right side of the screen
    const left = Math.min(bubble.rect.left + window.scrollX - 16, window.innerWidth - 320);

    return ReactDOM.createPortal(
        <div
            ref={popoverRef}
            style={{ position: 'absolute', top, left, zIndex: 99999 }}
            className="w-[300px] shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            onMouseEnter={() => {
                if (bubble.mode === 'preview') clearTimeout(hoverTimeout.current);
            }}
            onMouseLeave={() => {
                if (bubble.mode === 'preview') {
                    hoverTimeout.current = setTimeout(() => setBubble(null), 250);
                }
            }}
        >
            <div className={cn(
                "rounded-xl overflow-hidden border shadow-xl transition-all",
                "bg-background/95 backdrop-blur-xl ring-1 ring-white/10",
                bubble.mode === 'edit' ? "border-primary/50" : "border-border cursor-pointer hover:border-primary/30"
            )}
                onClick={() => {
                    if (bubble.mode === 'preview') {
                        setEditContent(bubble.content);
                        setBubble({ ...bubble, mode: 'edit' });
                    }
                }}>
                {/* Content Area */}
                {bubble.mode === 'preview' ? (
                    <div className="p-3 text-sm text-foreground/90 leading-relaxed min-h-[60px] max-h-[150px] overflow-hidden text-ellipsis line-clamp-4">
                        {bubble.content || <span className="text-muted-foreground italic">(Düzenlemek için tıklayın)</span>}
                    </div>
                ) : (
                    <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        placeholder="Dipnot içeriğini buraya yazın..."
                        className="w-full min-h-[100px] max-h-[250px] border-0 focus-visible:ring-0 resize-none p-3 text-sm text-foreground leading-relaxed bg-transparent"
                        autoFocus
                        onKeyDown={(e) => {
                            // Optional: Press Escape to save and close immediately
                            if (e.key === 'Escape') saveAndClose();
                        }}
                    />
                )}
            </div>
        </div>,
        document.body
    );
};

export default FootnoteInspector;