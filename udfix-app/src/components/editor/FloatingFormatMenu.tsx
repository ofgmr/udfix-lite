import React, { useEffect, useState } from 'react';
import {
    useFloating,
    offset,
    flip,
    shift,
    autoUpdate,
    FloatingPortal,
} from '@floating-ui/react';
import type { Editor } from '@tiptap/react';
import MaterialIcon from '../../components/ui/MaterialIcon';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../../components/ui/popover';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { getMarkerFormatActive, toggleMarkerFormatOrMark } from '../../utils/listFormatUtils';
import { startCommentDraftOnSelection } from '../../utils/startCommentDraft';
import { pushEditorPreferenceToggle } from '../../preferences/pushEditorPreferences';
import { toggleEditorHighlight } from '../../utils/editorHighlight';
import {
    isFloatingFormatMenuEnabled,
    setFloatingFormatMenuEnabled,
    subscribeToFloatingFormatMenuEnabled,
} from './floatingFormatMenuPreference';

interface FloatingFormatMenuProps {
    editor: Editor | null;
}

const FloatingFormatMenu: React.FC<FloatingFormatMenuProps> = ({ editor }) => {
    const [menuEnabled, setMenuEnabled] = useState(isFloatingFormatMenuEnabled);
    const [show, setShow] = useState(false);
    const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
    const [linkUrl, setLinkUrl] = useState('');
    const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);

    const { refs, floatingStyles } = useFloating({
        open: show,
        middleware: [offset(10), flip(), shift({ padding: 8 })],
        whileElementsMounted: autoUpdate,
        placement: 'top',
    });



    useEffect(() => subscribeToFloatingFormatMenuEnabled(setMenuEnabled), []);

    useEffect(() => {
        if (!editor || !menuEnabled) {
            setShow(false);
            return;
        }

        const updateMenu = () => {
            if (!isFloatingFormatMenuEnabled()) {
                setShow(false);
                return;
            }
            const { selection, doc } = editor.state;
            const { from, to } = selection;

            // Check if there's a selection
            if (from === to) {
                setShow(false);
                return;
            }

            // Get the selected text content
            const selectedText = doc.textBetween(from, to, ' ');
            if (!selectedText || selectedText.trim().length === 0) {
                setShow(false);
                return;
            }

            // Get the DOM selection to position the menu
            const domSelection = window.getSelection();
            if (!domSelection || domSelection.rangeCount === 0) {
                setShow(false);
                return;
            }

            const range = domSelection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            setSelectionRect(rect);
            setShow(true);
        };

        // Update on selection change
        editor.on('selectionUpdate', updateMenu);
        editor.on('update', updateMenu);

        return () => {
            editor.off('selectionUpdate', updateMenu);
            editor.off('update', updateMenu);
        };
    }, [editor, menuEnabled]);

    // Set reference position based on selection rect
    useEffect(() => {
        if (selectionRect) {
            refs.setPositionReference({
                getBoundingClientRect() {
                    return selectionRect;
                },
            });
        }
    }, [selectionRect, refs]);

    const disableFormatMenu = () => {
        setFloatingFormatMenuEnabled(false);
        void pushEditorPreferenceToggle({ floatingFormatMenuEnabled: false });
    };

    const setLink = () => {
        if (linkUrl && editor) {
            editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
            setLinkUrl('');
            setIsLinkPopoverOpen(false);
        }
    };

    if (!editor || !show || !menuEnabled) return null;

    const formatButtons = [
        {
            icon: <MaterialIcon icon="format_bold" size={18} />,
            isActive: getMarkerFormatActive(editor, 'bold'),
            onClick: () => toggleMarkerFormatOrMark(editor, 'bold'),
            title: 'Kalın (⌘+B)',
        },
        {
            icon: <MaterialIcon icon="format_italic" size={18} />,
            isActive: getMarkerFormatActive(editor, 'italic'),
            onClick: () => toggleMarkerFormatOrMark(editor, 'italic'),
            title: 'İtalik (⌘+I)',
        },
        {
            icon: <MaterialIcon icon="format_underlined" size={18} />,
            isActive: getMarkerFormatActive(editor, 'underline'),
            onClick: () => toggleMarkerFormatOrMark(editor, 'underline'),
            title: 'Altı çizili (⌘+U)',
        },
        {
            icon: <MaterialIcon icon="strikethrough_s" size={18} />,
            isActive: editor.isActive('strike'),
            onClick: () => editor.chain().focus().toggleStrike().run(),
            title: 'Üstü çizili',
        },
        {
            icon: <MaterialIcon icon="comment" size={18} />,
            isActive: editor.isActive('comment'),
            onClick: () => {
                startCommentDraftOnSelection(editor);
            },
            title: 'Yorum ekle',
        },
    ];

    return (
        <FloatingPortal>
            <div
                ref={refs.setFloating}
                style={floatingStyles}
                className="z-[var(--z-editor-floating)]"
            >
                <TooltipProvider delayDuration={200}>
                <div className="relative flex items-center flex-nowrap gap-1 p-1 rounded-lg glass-panel overflow-visible max-w-[calc(100vw-2rem)] shadow-2xl">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute -right-2 -top-2 z-10 h-6 w-6 rounded-full border border-white/10 bg-background/90 text-muted-foreground shadow-lg hover:bg-destructive/10 hover:text-destructive"
                                onClick={disableFormatMenu}
                                onMouseDown={(e) => e.preventDefault()}
                                aria-label="Açılır menüyü kapat"
                            >
                                <MaterialIcon icon="visibility_off" size={14} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="z-[var(--z-editor-floating)] px-2 py-1 text-xs">
                            Açılır menüyü kapat
                        </TooltipContent>
                    </Tooltip>
                    {formatButtons.map((button, index) => (
                        <Button
                            key={index}
                            variant="ghost"
                            size="icon"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={button.onClick}
                            title={button.title}
                            className={`h-8 w-8 ${button.isActive ? 'bg-accent text-accent-foreground' : ''}`}
                        >
                            {button.icon}
                        </Button>
                    ))}

                    <Popover open={isLinkPopoverOpen} onOpenChange={setIsLinkPopoverOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={`h-8 w-8 ${editor.isActive('link') ? 'bg-accent text-accent-foreground' : ''}`}
                                title="Bağlantı"
                            >
                                <MaterialIcon icon="link" size={18} />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-60 p-2 glass" align="center" side="top">
                            <div className="flex gap-2">
                                <Input
                                    placeholder="URL"
                                    value={linkUrl}
                                    onChange={(e) => setLinkUrl(e.target.value)}
                                    className="h-8 bg-background/50"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            setLink();
                                        }
                                    }}
                                />
                                <Button size="sm" onClick={setLink} className="h-8 px-2">
                                    <MaterialIcon icon="check" size={16} />
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>

                    <Button
                        variant="ghost"
                        size="icon"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => toggleEditorHighlight(editor)}
                        title="Vurgula"
                        className={`h-8 w-8 ${editor.isActive('highlight') ? 'bg-accent text-accent-foreground' : ''}`}
                    >
                        <MaterialIcon icon="highlight" size={18} />
                    </Button>
                </div>
                </TooltipProvider>
            </div>
        </FloatingPortal>
    );
};

export default FloatingFormatMenu;
