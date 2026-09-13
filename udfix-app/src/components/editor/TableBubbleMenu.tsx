import React, { useState, useEffect, useRef, useReducer } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/react';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../../components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { cn } from '../../lib/utils';
import {
    isTableBubbleMenuEnabled,
    setTableBubbleMenuEnabled,
    subscribeToTableBubbleMenuEnabled,
} from './tableBubbleMenuPreference';

const TABLE_NODE_NAMES = new Set(['table', 'tableRow', 'tableCell', 'tableHeader']);

const getTableElementFromSelection = (editor: Editor): HTMLTableElement | null => {
    const { view, state } = editor;
    const { selection } = state;
    const positions = [selection.from, Math.max(selection.from - 1, 0), selection.to];

    for (const pos of positions) {
        const node = view.domAtPos(pos).node;
        const element = node instanceof Element ? node : node.parentElement;
        const table = element?.closest('table');
        if (table instanceof HTMLTableElement) return table;
    }

    return null;
};

const getTableCellElementFromSelection = (editor: Editor): HTMLTableCellElement | null => {
    const { view, state } = editor;
    const { selection } = state;
    const positions = [selection.from, Math.max(selection.from - 1, 0), selection.to];

    for (const pos of positions) {
        const node = view.domAtPos(pos).node;
        const element = node instanceof Element ? node : node.parentElement;
        const cell = element?.closest('td, th');
        if (cell instanceof HTMLTableCellElement) return cell;
    }

    return null;
};

const getSelectionPointRect = (editor: Editor): DOMRect => {
    const { left, right, top, bottom } = editor.view.coordsAtPos(editor.state.selection.from);
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    return new DOMRect(x, y, 0, 0);
};

const isTableSelection = (editor: Editor): boolean => {
    const { selection } = editor.state;
    const positions = [selection.$from, selection.$to];

    for (const position of positions) {
        for (let depth = position.depth; depth > 0; depth -= 1) {
            const node = position.node(depth);
            if (TABLE_NODE_NAMES.has(node.type.name) || node.type.spec.tableRole === 'table') {
                return true;
            }
        }
    }

    return getTableElementFromSelection(editor) !== null;
};

interface MenuButtonProps {
    icon?: string;
    label: string;
    onClick: () => void;
    isActive?: boolean;
    isDisabled?: boolean;
    isDestructive?: boolean;
    customIcon?: React.ReactNode;
}

const MenuButton: React.FC<MenuButtonProps> = ({
    icon,
    label,
    onClick,
    isActive = false,
    isDisabled = false,
    isDestructive = false,
    customIcon
}) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <Button
                variant="ghost"
                size="icon"
                className={cn(
                    "h-8 w-8 shrink-0",
                    isActive && "bg-accent text-accent-foreground",
                    isDestructive && "hover:bg-destructive/10 hover:text-destructive group"
                )}
                onClick={onClick}
                onMouseDown={(e) => e.preventDefault()}
                disabled={isDisabled}
            >
                {customIcon || (icon && <MaterialIcon icon={icon} size={18} />)}
            </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="z-[var(--z-editor-floating)] px-2 py-1 text-xs">
            {label}
        </TooltipContent>
    </Tooltip>
);

interface TableBubbleMenuProps {
    editor: Editor | null;
}

const TableBubbleMenu: React.FC<TableBubbleMenuProps> = ({ editor }) => {
    const [isBorderPopoverOpen, setIsBorderPopoverOpen] = useState(false);
    const [isBubbleEnabled, setIsBubbleEnabled] = useState(isTableBubbleMenuEnabled);
    const lastTablePointerRef = useRef<{ x: number; y: number; table: HTMLTableElement } | null>(null);

    useEffect(() => subscribeToTableBubbleMenuEnabled(setIsBubbleEnabled), []);

    useEffect(() => {
        if (!editor) return;

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            const table = target?.closest('table');
            if (table instanceof HTMLTableElement && editor.view.dom.contains(table)) {
                lastTablePointerRef.current = { x: event.clientX, y: event.clientY, table };
                return;
            }
            lastTablePointerRef.current = null;
        };

        editor.view.dom.addEventListener('pointerdown', handlePointerDown);
        return () => editor.view.dom.removeEventListener('pointerdown', handlePointerDown);
    }, [editor]);

    /** Keep command availability reactive without forcing a render on every ProseMirror transaction. */
    const [, bump] = useReducer((n: number) => n + 1, 0);
    const tableToolbarKey = useRef('');
    useEffect(() => {
        if (!editor) return;
        let frame = 0;
        const sync = () => {
            const isTableActive = isTableSelection(editor);
            const ta = isTableActive ? editor.getAttributes('table') : {};
            const key = [
                isBubbleEnabled,
                isTableActive,
                isTableActive && editor.can().mergeCells(),
                isTableActive && editor.can().splitCell(),
                isTableActive ? `${ta.borderWidth ?? ''}|${ta.borderStyle ?? ''}` : '',
            ].join('\0');
            if (key === tableToolbarKey.current) return;
            tableToolbarKey.current = key;
            bump();
        };
        const scheduleSync = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(() => {
                frame = 0;
                sync();
            });
        };
        editor.on('selectionUpdate', scheduleSync);
        editor.on('transaction', scheduleSync);
        sync();
        return () => {
            if (frame) window.cancelAnimationFrame(frame);
            editor.off('selectionUpdate', scheduleSync);
            editor.off('transaction', scheduleSync);
        };
    }, [editor, isBubbleEnabled]);

    if (!editor) return null;

    const currentTableAttrs = editor.getAttributes('table');
    const tableBorderWidth = currentTableAttrs.borderWidth || null;
    const tableBorderStyle = currentTableAttrs.borderStyle || 'solid';

    const canMerge = editor.can().mergeCells();
    const canSplit = editor.can().splitCell();
    const disableBubbleMenu = () => {
        setIsBorderPopoverOpen(false);
        setTableBubbleMenuEnabled(false);
    };

    return (
        <TooltipProvider delayDuration={200}>
            <BubbleMenu
                editor={editor}
                updateDelay={100}
                shouldShow={({ editor }) => isBubbleEnabled && isTableSelection(editor)}
                getReferencedVirtualElement={() => {
                    const { view } = editor;
                    const table = getTableElementFromSelection(editor);
                    const pointer = lastTablePointerRef.current;
                    if (pointer && pointer.table === table) {
                        return {
                            getBoundingClientRect: () => new DOMRect(pointer.x, pointer.y, 0, 0),
                        };
                    }

                    const target = getTableCellElementFromSelection(editor) ?? table ?? view.dom;
                    return {
                        getBoundingClientRect: () =>
                            target === view.dom ? getSelectionPointRect(editor) : target.getBoundingClientRect(),
                    };
                }}
                options={{
                    placement: 'bottom-start',
                    offset: { mainAxis: 8, crossAxis: 8 },
                }}
                className="z-[var(--z-editor-floating)] relative grid grid-cols-4 gap-1 rounded-xl border border-white/10 bg-background/60 p-2 shadow-2xl backdrop-blur-xl transition-all duration-300 glass-panel hover:shadow-[0_0_15px_color-mix(in_srgb,var(--primary)_40%,transparent)]"
            >
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute -right-2 -top-2 h-6 w-6 rounded-full border border-white/10 bg-background/90 text-muted-foreground shadow-lg hover:bg-destructive/10 hover:text-destructive"
                            onClick={disableBubbleMenu}
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

                <MenuButton
                    icon="border_top"
                    label="Başlık Satırı"
                    onClick={() => editor.chain().focus().toggleHeaderRow().run()}
                    isActive={editor.isActive('tableHeader', { type: 'row' })}
                />
                <MenuButton
                    icon="border_left"
                    label="Başlık Sütunu"
                    onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
                    isActive={editor.isActive('tableHeader', { type: 'column' })}
                />
                <MenuButton icon="arrow_upward" label="Üste Satır Ekle" onClick={() => editor.chain().focus().addRowBefore().run()} />
                <MenuButton icon="arrow_downward" label="Alta Satır Ekle" onClick={() => editor.chain().focus().addRowAfter().run()} />

                <MenuButton icon="arrow_back" label="Sola Sütun Ekle" onClick={() => editor.chain().focus().addColumnBefore().run()} />
                <MenuButton icon="arrow_forward" label="Sağa Sütun Ekle" onClick={() => editor.chain().focus().addColumnAfter().run()} />
                <MenuButton
                    icon="merge"
                    label={canMerge ? "Birleştir" : "Birleştir (Birden fazla hücre seçin)"}
                    onClick={() => editor.chain().focus().mergeCells().run()}
                    isDisabled={!canMerge}
                />
                <MenuButton
                    icon="call_split"
                    label={canSplit ? "Böl" : "Böl (Birleşmiş bir hücre seçin)"}
                    onClick={() => editor.chain().focus().splitCell().run()}
                    isDisabled={!canSplit}
                />

                <Popover open={isBorderPopoverOpen} onOpenChange={setIsBorderPopoverOpen}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 transition-colors hover:bg-primary/20"
                                    onMouseDown={(e) => e.preventDefault()}
                                    aria-label="Kenarlık stili"
                                >
                                    <MaterialIcon icon="line_weight" size={18} />
                                </Button>
                            </PopoverTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="z-[var(--z-editor-floating)] px-2 py-1 text-xs">
                            Kenarlık stili
                        </TooltipContent>
                    </Tooltip>
                    <PopoverContent side="bottom" align="center" className="flex w-[180px] flex-row gap-2 p-2 shadow-2xl glass-panel" sideOffset={8}>
                        <div className="flex flex-1 flex-col gap-1 border-r border-border/50 pr-2">
                            <span className="mb-1 px-1 text-[10px] font-semibold uppercase text-muted-foreground">Kalınlık</span>
                            <div className="hidden-scrollbar h-40 w-full snap-y snap-mandatory overflow-y-auto">
                                <div className="flex flex-col gap-1">
                                    {[0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5].map((val) => (
                                        <button
                                            key={`width-${val}`}
                                            onClick={() => {
                                                editor.chain().focus().updateAttributes('table', { borderWidth: val.toString() }).run();
                                            }}
                                            className={cn(
                                                "w-full snap-center rounded-md py-1 text-center text-xs transition-colors",
                                                parseFloat(tableBorderWidth) === val
                                                    ? "bg-primary font-medium text-primary-foreground"
                                                    : "text-foreground/80 hover:bg-primary/20 hover:text-foreground"
                                            )}
                                        >
                                            {val}px
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-1 flex-col gap-1">
                            <span className="mb-1 px-1 text-[10px] font-semibold uppercase text-muted-foreground">Stil</span>
                            <div className="hidden-scrollbar h-40 w-full snap-y snap-mandatory overflow-y-auto">
                                <div className="flex flex-col gap-1">
                                    {['solid', 'dashed', 'dotted', 'double'].map((styleStr) => (
                                        <button
                                            key={`style-${styleStr}`}
                                            onClick={() => {
                                                editor.chain().focus().updateAttributes('table', { borderStyle: styleStr }).run();
                                            }}
                                            className={cn(
                                                "w-full snap-center rounded-md py-1 text-center text-xs capitalize transition-colors",
                                                tableBorderStyle === styleStr
                                                    ? "bg-primary font-medium text-primary-foreground"
                                                    : "text-foreground/80 hover:bg-primary/20 hover:text-foreground"
                                            )}
                                        >
                                            {styleStr === 'solid' ? 'Düz' : styleStr === 'dashed' ? 'Kesik' : styleStr === 'dotted' ? 'Nokta' : 'Çift'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>

                <MenuButton
                    label="Satırı Sil"
                    onClick={() => editor.chain().focus().deleteRow().run()}
                    isDestructive
                    customIcon={
                        <div className="relative flex items-center justify-center">
                            <MaterialIcon icon="table_rows" size={18} />
                            <span className="absolute -bottom-1 -right-1 text-[10px] font-bold leading-none text-destructive">×</span>
                        </div>
                    }
                />
                <MenuButton
                    label="Sütunu Sil"
                    onClick={() => editor.chain().focus().deleteColumn().run()}
                    isDestructive
                    customIcon={
                        <div className="relative flex items-center justify-center">
                            <MaterialIcon icon="view_column" size={18} />
                            <span className="absolute -bottom-1 -right-1 text-[10px] font-bold leading-none text-destructive">×</span>
                        </div>
                    }
                />
                <MenuButton
                    icon="delete"
                    label="Tabloyu sil"
                    onClick={() => editor.chain().focus().deleteTable().run()}
                    isDestructive
                />
            </BubbleMenu>
        </TooltipProvider>
    );
};

export default TableBubbleMenu;