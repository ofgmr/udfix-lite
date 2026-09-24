import React, { useEffect, useState } from 'react';
import { Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { createPortal } from 'react-dom';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { cn } from '../../lib/utils';
import { startCommentDraftOnSelection } from '../../utils/startCommentDraft';
import {
    copyEditorRange,
    copyEditorRangeAsMarkdown,
    cutEditorRange,
    pasteMarkdownFromClipboard,
    pastePlainMatchingDestination,
} from '../../utils/editorPaste';
import {
    isTableBubbleMenuEnabled,
    setTableBubbleMenuEnabled,
    subscribeToTableBubbleMenuEnabled,
} from './tableBubbleMenuPreference';
import {
    isFloatingFormatMenuEnabled,
    setFloatingFormatMenuEnabled,
    subscribeToFloatingFormatMenuEnabled,
} from './floatingFormatMenuPreference';
import { pushEditorPreferenceToggle } from '../../preferences/pushEditorPreferences';

function isMacLikePlatform(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /Mac|iPhone|iPad|iPod/i.test(ua) || (navigator.platform?.includes('Mac') ?? false);
}

interface ContextMenuProps {
    editor: Editor | null;
    onSaveSelectionAsTemplate?: () => void;
    onSaveDocumentAsTemplate?: () => void;
}

interface MenuPosition {
    x: number;
    y: number;
}

const EditorContextMenu: React.FC<ContextMenuProps> = ({
    editor,
    onSaveSelectionAsTemplate,
    onSaveDocumentAsTemplate,
}) => {
    const [visible, setVisible] = useState(false);
    const [position, setPosition] = useState<MenuPosition>({ x: 0, y: 0 });
    const [hasSelection, setHasSelection] = useState(false);
    const [isInList, setIsInList] = useState(false);
    const [isInTable, setIsInTable] = useState(false);
    const [clipboardRange, setClipboardRange] = useState<{ from: number; to: number } | null>(null);
    const [isTableBubbleEnabled, setIsTableBubbleEnabled] = useState(isTableBubbleMenuEnabled);
    const [isFormatMenuEnabled, setIsFormatMenuEnabled] = useState(isFloatingFormatMenuEnabled);
    const [showStyleSubmenu, setShowStyleSubmenu] = useState(false);

    useEffect(() => subscribeToTableBubbleMenuEnabled(setIsTableBubbleEnabled), []);
    useEffect(() => subscribeToFloatingFormatMenuEnabled(setIsFormatMenuEnabled), []);

    useEffect(() => {
        if (!editor) return;

        const handleMouseDown = (event: MouseEvent) => {
            if (event.button !== 2) return;
            const { selection } = editor.state;
            if (selection.empty) return;
            const hit = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (!hit) return;
            if (hit.pos >= selection.from && hit.pos <= selection.to) {
                event.preventDefault();
            }
        };

        const handleContextMenu = (event: MouseEvent) => {
            // Check if the click is within the editor
            const editorDom = editor.view.dom;
            if (!editorDom.contains(event.target as Node)) {
                return;
            }

            const { selection } = editor.state;
            const hit = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (hit) {
                const rightClickIsInsideSelection = !selection.empty && hit.pos >= selection.from && hit.pos <= selection.to;
                if (!rightClickIsInsideSelection) {
                    const $resolved = editor.state.doc.resolve(hit.pos);
                    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near($resolved)));
                }
            }

            // Check if there's a text selection
            const { from, to, empty } = editor.state.selection;
            setHasSelection(!empty);
            setClipboardRange(empty ? null : { from, to });

            // Check conditions
            const targetElement = event.target instanceof Element ? event.target : null;
            setIsInList(editor.isActive('orderedList'));
            setIsInTable(editor.isActive('table') || Boolean(targetElement?.closest('table')));
            setIsTableBubbleEnabled(isTableBubbleMenuEnabled());
            setIsFormatMenuEnabled(isFloatingFormatMenuEnabled());
            setShowStyleSubmenu(false);

            event.preventDefault();
            setPosition({ x: event.clientX + 2, y: event.clientY + 2 });
            setVisible(true);
        };

        const handleClick = () => {
            setVisible(false);
            setShowStyleSubmenu(false);
        };

        const handleScroll = () => {
            setVisible(false);
            setShowStyleSubmenu(false);
        };

        editor.view.dom.addEventListener('mousedown', handleMouseDown, true);
        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('click', handleClick);
        document.addEventListener('scroll', handleScroll, true);

        return () => {
            editor.view.dom.removeEventListener('mousedown', handleMouseDown, true);
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('click', handleClick);
            document.removeEventListener('scroll', handleScroll, true);
        };
    }, [editor, onSaveSelectionAsTemplate, onSaveDocumentAsTemplate]);

    if (!visible || !editor) return null;

    const handleAddComment = () => {
        if (!hasSelection) return;
        startCommentDraftOnSelection(editor);
        setVisible(false);
    };

    const handleCut = async () => {
        if (!clipboardRange) return;
        try {
            await cutEditorRange(editor, clipboardRange.from, clipboardRange.to);
        } catch (e) {
            console.error(e);
        }
        setVisible(false);
    };

    const handleCopy = async () => {
        if (!clipboardRange) return;
        try {
            await copyEditorRange(editor, clipboardRange.from, clipboardRange.to);
        } catch (e) {
            console.error(e);
        }
        setVisible(false);
    };

    const handleCopyMarkdown = async () => {
        if (!clipboardRange) return;
        try {
            await copyEditorRangeAsMarkdown(editor, clipboardRange.from, clipboardRange.to);
        } catch (e) {
            console.error(e);
        }
        setVisible(false);
    };

    const handlePaste = () => {
        document.execCommand('paste');
        setVisible(false);
    };

    const handlePasteMarkdown = async () => {
        try {
            await pasteMarkdownFromClipboard(editor);
        } catch (e) {
            console.error(e);
        }
        setVisible(false);
    };

    const handlePasteMatchStyle = async () => {
        try {
            await pastePlainMatchingDestination(editor);
        } catch (e) {
            console.error(e);
        }
        setVisible(false);
    };

    const handleRestartNumbering = () => {
        const chain = editor.chain().focus() as unknown as { restartNumbering: () => { run: () => boolean } }
        chain.restartNumbering().run();
        setVisible(false);
    };
    const handleContinueNumbering = () => {
        const chain = editor.chain().focus() as unknown as { continueNumbering: () => { run: () => boolean } }
        chain.continueNumbering().run();
        setVisible(false);
    };

    const handleSetListStyle = (style: string) => {
        const chain = editor.chain().focus() as unknown as { setListStyle: (s: string) => { run: () => boolean } }
        chain.setListStyle(style).run();
        setVisible(false);
        setShowStyleSubmenu(false);
    };

    const handleToggleTableBubbleMenu = () => {
        const next = !isTableBubbleEnabled;
        setTableBubbleMenuEnabled(next);
        setIsTableBubbleEnabled(next);
        void pushEditorPreferenceToggle({ tableBubbleEnabled: next });
        setVisible(false);
    };

    const handleToggleFormatMenu = () => {
        const next = !isFormatMenuEnabled;
        setFloatingFormatMenuEnabled(next);
        setIsFormatMenuEnabled(next);
        void pushEditorPreferenceToggle({ floatingFormatMenuEnabled: next });
        setVisible(false);
    };

    // Build menu items
    const menuItems: Array<{
        icon: string;
        label: string;
        action: () => void;
        shortcut?: string;
        highlight?: boolean;
        divider?: boolean;
        hasSubmenu?: boolean;
        tooltip?: string;
        disabled?: boolean;
    }> = [];

    const mod = isMacLikePlatform() ? '⌘' : 'Ctrl+';
    menuItems.push(
        { icon: 'content_cut', label: 'Kes', action: handleCut, shortcut: `${mod}X`, disabled: !hasSelection },
        { icon: 'content_copy', label: 'Kopyala', action: handleCopy, shortcut: `${mod}C`, disabled: !hasSelection },
        { icon: 'markdown', label: 'Markdown kopyala', action: handleCopyMarkdown, disabled: !hasSelection },
    );
    if (hasSelection) {
        menuItems.push({ icon: 'comment', label: 'Yorum Ekle', action: handleAddComment, highlight: true });
    }
    const pasteMatchShortcut = isMacLikePlatform() ? '⌘⇧V' : 'Ctrl+Shift+V';
    menuItems.push({ icon: 'content_paste', label: 'Yapıştır', action: handlePaste, shortcut: isMacLikePlatform() ? '⌘V' : 'Ctrl+V' });
    menuItems.push({
        icon: 'article',
        label: 'Markdown yapıştır',
        action: handlePasteMarkdown,
    });
    menuItems.push({
        icon: 'format_paint',
        label: 'Eşleştirerek yapıştır',
        action: handlePasteMatchStyle,
        shortcut: pasteMatchShortcut,
    });
    menuItems.push({
        icon: isFormatMenuEnabled ? 'visibility_off' : 'visibility',
        label: 'Biçimlendirme açılır menüsü',
        action: handleToggleFormatMenu,
        shortcut: isFormatMenuEnabled ? 'Açık' : 'Kapalı',
        divider: true,
    });

    if (onSaveSelectionAsTemplate) {
        menuItems.push({
            icon: 'stylus_note',
            label: 'Metni şablon olarak kaydet',
            action: () => {
                onSaveSelectionAsTemplate();
                setVisible(false);
            },
            divider: true,
        });
    }
    if (onSaveDocumentAsTemplate) {
        menuItems.push({
            icon: 'library_add',
            label: 'Belgeyi şablon olarak kaydet',
            action: () => {
                onSaveDocumentAsTemplate();
                setVisible(false);
            },
        });
    }

    // List-specific items
    if (isInList) {
        menuItems.push(
            { icon: 'restart_alt', label: 'Yeniden Başlat: 1', action: handleRestartNumbering, divider: true },
            { icon: 'link', label: 'Önceki numaradan devam et', action: handleContinueNumbering },
            { icon: 'format_list_numbered', label: 'Liste Stili', action: () => setShowStyleSubmenu(!showStyleSubmenu), hasSubmenu: true },
        );
    }

    // Table-specific items
    if (isInTable) {
        menuItems.push(
            {
                icon: isTableBubbleEnabled ? 'visibility_off' : 'visibility',
                label: isTableBubbleEnabled ? 'Açılır menü' : 'Açılır menü',
                action: handleToggleTableBubbleMenu,
                shortcut: isTableBubbleEnabled ? 'Açık' : 'Kapalı',
                divider: true,
            },
            { icon: 'arrow_upward', label: 'Üste Satır Ekle', tooltip: 'Üste Satır Ekle', action: () => { editor.chain().focus().addRowBefore().run(); setVisible(false); } },
            { icon: 'arrow_downward', label: 'Alta Satır Ekle', tooltip: 'Alta Satır Ekle', action: () => { editor.chain().focus().addRowAfter().run(); setVisible(false); } },
            { icon: 'arrow_back', label: 'Sola Sütun Ekle', tooltip: 'Sola Sütun Ekle', action: () => { editor.chain().focus().addColumnBefore().run(); setVisible(false); } },
            { icon: 'arrow_forward', label: 'Sağa Sütun Ekle', tooltip: 'Sağa Sütun Ekle', action: () => { editor.chain().focus().addColumnAfter().run(); setVisible(false); } },
            { icon: 'delete', label: 'Tabloyu sil', tooltip: 'Tabloyu sil', action: () => { editor.chain().focus().deleteTable().run(); setVisible(false); } }
        );
    }

    // Adjust position if menu would go off screen
    const adjustedPosition = { ...position };
    const menuWidth = 240;
    const menuItemHeight = 40;
    const dividerHeight = 9;
    const menuDividerCount = menuItems.filter((item, index) => index > 0 && item.divider).length;
    const menuHeight = menuItems.length * menuItemHeight + menuDividerCount * dividerHeight;

    if (position.x + menuWidth > window.innerWidth) {
        adjustedPosition.x = window.innerWidth - menuWidth - 10;
    }
    if (position.y + menuHeight > window.innerHeight) {
        adjustedPosition.y = window.innerHeight - menuHeight - 10;
    }

    const styleOptions = [
        { key: 'default', label: '1. a. i.', icon: 'format_list_numbered' },
        { key: 'roman', label: 'I. A. 1.', icon: 'format_list_numbered' },
        { key: 'paren', label: '1) a) i)', icon: 'format_list_numbered' },
        { key: 'outline', label: 'A. 1. a.', icon: 'format_list_numbered' },
        { key: 'legal', label: '1. 1.1. 1.1.1.', icon: 'format_list_numbered' },
    ];
    const styleMenuHeight = styleOptions.length * menuItemHeight;
    const styleMenuTop = Math.max(10, adjustedPosition.y + menuHeight - styleMenuHeight);

    return createPortal(
        <>
            <div
                role="menu"
                aria-label="Editör bağlam menüsü"
                className="fixed z-[var(--z-editor-floating)] glass-panel rounded-lg shadow-2xl border border-white/10 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200"
                style={{
                    left: `${adjustedPosition.x}px`,
                    top: `${adjustedPosition.y}px`,
                    minWidth: '240px',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {menuItems.map((item, index) => (
                    <React.Fragment key={index}>
                        {item.divider && index > 0 && (
                            <div className="h-px bg-white/10 mx-2 my-1" />
                        )}
                        <button
                            type="button"
                            role="menuitem"
                            disabled={item.disabled}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={item.action}
                            className={cn(
                                "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                                "hover:bg-white/10 text-foreground/90 hover:text-foreground",
                                "disabled:pointer-events-none disabled:opacity-40",
                                item.highlight && "text-amber-400 hover:bg-amber-500/10",
                            )}
                        >
                            <MaterialIcon
                                icon={item.icon}
                                size={18}
                                className={item.highlight ? "text-amber-400" : ""}
                            />
                            <span className="flex-1 text-left">{item.label}</span>
                            {item.shortcut && (
                                <span className="text-xs text-muted-foreground">
                                    {item.shortcut}
                                </span>
                            )}
                            {item.hasSubmenu && (
                                <MaterialIcon icon="chevron_right" size={16} className="text-muted-foreground" />
                            )}
                        </button>
                    </React.Fragment>
                ))}
            </div>

            {/* Style Submenu */}
            {showStyleSubmenu && isInList && (
                <div
                    role="menu"
                    aria-label="Liste stili menüsü"
                    className="fixed z-[var(--z-editor-floating)] glass-panel rounded-lg shadow-2xl border border-white/10 overflow-hidden animate-in fade-in-0 slide-in-from-left-2 duration-150"
                    style={{
                        left: `${adjustedPosition.x + 253}px`,
                        top: `${styleMenuTop}px`,
                        minWidth: '180px',
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {styleOptions.map((opt) => (
                        <button
                            key={opt.key}
                            type="button"
                            role="menuitem"
                            onClick={() => handleSetListStyle(opt.key)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-white/10 text-foreground/90 hover:text-foreground"
                        >
                            <MaterialIcon icon={opt.icon} size={18} />
                            <span className="flex-1 text-left">{opt.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </>
        ,
        document.body,
    );
};

export default EditorContextMenu;
