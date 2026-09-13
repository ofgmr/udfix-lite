import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Editor } from '@tiptap/react';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../../components/ui/popover';
import TableOfContents from '../sidebar/TableOfContents';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../components/ui/select';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { countPaginationPlusLogicalPages } from '../../utils/paginationMarginSync';

interface EditorFloatingToolbarProps {
    editor: Editor | null;
    onOpenSearch?: () => void;
    zoomMode: 'preset' | 'fit';
    zoomPreset: number;
    onZoomPreset: (scale: number) => void;
    onZoomFit: () => void;
}

const ZOOM_PRESETS: { label: string; value: number }[] = [
    { label: '%25', value: 0.25 },
    { label: '%50', value: 0.5 },
    { label: '%75', value: 0.75 },
    { label: '%90', value: 0.9 },
    { label: '%100', value: 1 },
    { label: '%125', value: 1.25 },
];

const EditorFloatingToolbar: React.FC<EditorFloatingToolbarProps> = ({
    editor,
    onOpenSearch,
    zoomMode,
    zoomPreset,
    onZoomPreset,
    onZoomFit,
}) => {
    void onOpenSearch;
    const [isHovered, setIsHovered] = useState(false);
    const [showInsertMenu, setShowInsertMenu] = useState(false);
    const [showStatsMenu, setShowStatsMenu] = useState(false);
    const [docStats, setDocStats] = useState({ paragraphs: 0, words: 0, chars: 0 });
    const [pageCount, setPageCount] = useState(1);
    const imageFileInputRef = useRef<HTMLInputElement>(null);
    const activeRightPanel = useLayoutStore((s) => s.activeRightPanel);
    const toggleRightPanel = useLayoutStore((s) => s.toggleRightPanel);

    const refreshDocStats = useCallback(() => {
        if (!editor || editor.isDestroyed) return;

        let paragraphsCount = 0;
        editor.state.doc.descendants((node) => {
            if (node.type.name === 'paragraph' || node.type.name === 'heading') {
                if (node.textContent.trim().length > 0) {
                    paragraphsCount++;
                }
            }
        });

        const text = editor.getText();
        const wordsCount =
            editor.storage.characterCount?.words() ?? text.split(/\s+/).filter((w: string) => w.length > 0).length;
        const charsCount = editor.storage.characterCount?.characters() ?? text.length;

        setDocStats({
            paragraphs: paragraphsCount,
            words: wordsCount,
            chars: charsCount,
        });
    }, [editor]);

    const readPageCount = useCallback(() => {
        if (!editor || editor.isDestroyed || !editor.view?.dom) return 1;
        const paginationEl = editor.view.dom.querySelector('[data-rm-pagination]');
        return countPaginationPlusLogicalPages(paginationEl);
    }, [editor]);

    useEffect(() => {
        if (!editor || editor.isDestroyed || !editor.view?.dom) {
            setPageCount(1);
            return;
        }

        let debounceId: ReturnType<typeof setTimeout> | null = null;
        const updatePageCount = () => {
            if (debounceId !== null) window.clearTimeout(debounceId);
            debounceId = window.setTimeout(() => {
                debounceId = null;
                setPageCount((current) => {
                    const next = readPageCount();
                    return current === next ? current : next;
                });
            }, 150);
        };

        updatePageCount();
        editor.on('update', updatePageCount);

        return () => {
            if (debounceId !== null) window.clearTimeout(debounceId);
            editor.off('update', updatePageCount);
        };
    }, [editor, readPageCount]);

    if (!editor) return null;

    const zoomSelectValue =
        zoomMode === 'fit' ? 'fit' : String(Math.round(zoomPreset * 100));

    const insertActions = [
        {
            id: 'table',
            icon: 'table_chart',
            label: 'Tablo',
            action: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
        },
        {
            id: 'image',
            icon: 'image',
            label: 'Görsel',
            action: () => imageFileInputRef.current?.click(),
        },
        {
            id: 'footnote',
            icon: 'sticky_note_2',
            label: 'Dipnot',
            action: () => editor.chain().focus().insertFootnote().run(),
        },
    ];

    return (
        <div
            className="absolute bottom-6 left-6 z-[var(--z-interface)] flex flex-col items-start gap-4 pointer-events-none"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div
                className={cn(
                    'rounded-2xl flex flex-col items-center p-2 gap-3 transition-all duration-300 pointer-events-auto border shadow-lg',
                    'bg-card/90 text-foreground border-border/60 backdrop-blur-xl',
                    'dark:bg-card/85 dark:border-border/50',
                    isHovered || showInsertMenu || showStatsMenu
                        ? 'opacity-100 translate-x-0'
                        : 'opacity-40 hover:opacity-100 -translate-x-2',
                )}
            >
                <TooltipProvider delayDuration={0}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    'h-9 w-9 rounded-full shrink-0 border-0 shadow-none hover:bg-muted',
                                    activeRightPanel === 'comments'
                                        ? 'bg-primary/15 text-primary'
                                        : 'text-foreground/80 hover:text-foreground',
                                )}
                                aria-label="Yorumlar"
                                onClick={() => toggleRightPanel('comments')}
                            >
                                <MaterialIcon icon="forum" size={20} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs font-semibold border-border bg-popover">
                            Yorumlar
                        </TooltipContent>
                    </Tooltip>

                <input
                    ref={imageFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file || !editor) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                            const src = reader.result;
                            if (typeof src === 'string') {
                                editor.chain().focus().setImage({ src }).run();
                            }
                        };
                        reader.readAsDataURL(file);
                    }}
                />
                {/* Yakınlaştırma */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="shrink-0">
                            <Select
                                value={zoomSelectValue}
                                onValueChange={(v) => {
                                    if (v === 'fit') {
                                        onZoomFit();
                                        return;
                                    }
                                    const n = parseInt(v, 10);
                                    if (!Number.isNaN(n)) onZoomPreset(n / 100);
                                }}
                            >
                                <SelectTrigger
                                    showChevron={false}
                                    className="h-9 w-9 shrink-0 justify-center border-0 bg-transparent px-0 shadow-none hover:bg-muted focus:ring-0 focus:ring-offset-0 [&>span]:line-clamp-none"
                                    aria-label="Yakınlaştırma"
                                >
                                    <MaterialIcon icon="zoom_in" size={20} />
                                </SelectTrigger>
                    <SelectContent className="min-w-[120px]" align="start" side="right">
                        {ZOOM_PRESETS.map((z) => (
                            <SelectItem key={z.value} value={String(Math.round(z.value * 100))}>
                                {z.label}
                            </SelectItem>
                        ))}
                        <SelectItem value="fit"> Sığdır</SelectItem>
                    </SelectContent>
                            </Select>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs font-semibold border-border bg-popover">
                        Yakınlaştırma
                    </TooltipContent>
                </Tooltip>

                <div className="relative group/fan">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                className={cn(
                                    'flex h-9 min-w-9 flex-col items-center justify-center rounded-full border border-border/50 bg-muted/40 px-2 text-foreground/80 shadow-none hover:bg-muted hover:text-foreground',
                                    showStatsMenu ? 'bg-muted text-foreground' : '',
                                )}
                                aria-label={`Toplam ${pageCount} sayfa, belge istatistikleri`}
                                aria-expanded={showStatsMenu}
                                onClick={() => {
                                    if (!showStatsMenu) refreshDocStats();
                                    setShowStatsMenu(!showStatsMenu);
                                }}
                            >
                                <span className="font-mono text-[13px] font-semibold leading-none">{pageCount}</span>
                                <span className="mt-0.5 text-[8px] font-bold uppercase leading-none tracking-[0.12em] text-muted-foreground">
                                    syf
                                </span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs font-semibold border-border bg-popover">
                            Toplam {pageCount} sayfa · Belge istatistikleri
                        </TooltipContent>
                    </Tooltip>

                    <div
                        className={cn(
                            'absolute left-0 top-0 flex flex-row items-center transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] origin-left',
                            showStatsMenu
                                ? 'ml-12 opacity-100 scale-100 translate-x-0'
                                : 'opacity-0 scale-50 -translate-x-10 pointer-events-none',
                        )}
                    >
                        <div className="flex h-10 items-center justify-center gap-3.5 rounded-[20px] border border-border/60 bg-background/90 px-4 shadow-sm backdrop-blur-md">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1.5 cursor-default hover:text-primary transition-colors">
                                        <MaterialIcon icon="segment" size={16} className="text-muted-foreground/80" />
                                        <span className="font-mono text-xs font-semibold mt-0.5">{docStats.paragraphs}</span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs font-semibold bg-popover border-border">Paragraf</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1.5 cursor-default hover:text-primary transition-colors">
                                        <MaterialIcon icon="text_fields" size={16} className="text-muted-foreground/80" />
                                        <span className="font-mono text-xs font-semibold mt-0.5">{docStats.words}</span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs font-semibold bg-popover border-border">Kelime</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1.5 cursor-default hover:text-primary transition-colors">
                                        <MaterialIcon icon="pin" size={16} className="text-muted-foreground/80" />
                                        <span className="font-mono text-xs font-semibold mt-0.5">{docStats.chars}</span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs font-semibold bg-popover border-border">Karakter</TooltipContent>
                            </Tooltip>
                        </div>
                    </div>
                </div>

                {/* İçindekiler */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 rounded-full hover:bg-muted text-foreground/80 hover:text-foreground"
                                >
                                    <MaterialIcon icon="toc" size={20} />
                                </Button>
                            </PopoverTrigger>
                    <PopoverContent side="right" align="start" className="w-64 p-0 border-border/60 bg-popover ml-4">
                        <div className="p-3 border-b border-border/50 font-semibold text-xs text-muted-foreground uppercase tracking-widest">
                            İçindekiler
                        </div>
                        <TableOfContents editor={editor} />
                    </PopoverContent>
                        </Popover>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs font-semibold border-border bg-popover">
                        İçindekiler
                    </TooltipContent>
                </Tooltip>

                <div className="relative group/fan">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    'h-9 w-9 rounded-full hover:bg-muted text-foreground/80 hover:text-foreground z-20 relative',
                                    showInsertMenu ? 'bg-muted text-foreground' : '',
                                )}
                                onClick={() => setShowInsertMenu(!showInsertMenu)}
                            >
                                <MaterialIcon
                                    icon="add_circle"
                                    size={20}
                                    className={cn('transition-transform duration-300', showInsertMenu ? 'rotate-45' : '')}
                                />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs font-semibold border-border bg-popover">
                            Ekle
                        </TooltipContent>
                    </Tooltip>

                    <div
                        className={cn(
                            'absolute left-0 top-0 flex flex-row items-center gap-2 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] origin-left',
                            showInsertMenu
                                ? 'ml-12 opacity-100 scale-100 translate-x-0'
                                : 'opacity-0 scale-50 -translate-x-10 pointer-events-none',
                        )}
                    >
                        {insertActions.map((action, index) => (
                                <Tooltip key={action.id}>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-10 w-10 rounded-full border border-border/60 bg-background/90 hover:bg-primary hover:text-primary-foreground hover:scale-110 transition-all"
                                            style={{ transitionDelay: showInsertMenu ? `${index * 40}ms` : '0ms' }}
                                            onClick={() => {
                                                action.action();
                                                setShowInsertMenu(false);
                                            }}
                                        >
                                            <MaterialIcon icon={action.icon} size={20} />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="text-xs font-semibold bg-popover border-border">
                                        {action.label}
                                    </TooltipContent>
                                </Tooltip>
                        ))}
                    </div>
                </div>
                </TooltipProvider>
            </div>
        </div>
    );
};

export default EditorFloatingToolbar;
