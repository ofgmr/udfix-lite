import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuCheckboxItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Separator } from '../../components/ui/separator';
import {
    Select,
    SelectContent,
    SelectTrigger,
    SelectValue,
} from '../../components/ui/select';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../../components/ui/popover';
import ColorPicker from '../../components/ui/ColorPicker';
import {
    applyFontFamilyOrMarker,
    getMarkerFontFamily,
    getMarkerFormatActive,
    toggleMarkerFormatOrMark,
} from '../../utils/listFormatUtils';
import {
    getActiveLayoutBlock,
    captureTypographyPayload,
    applyTypographyPayload,
    captureFormatPainterSnapshot,
    applyFormatPainterSnapshot,
    applyOrderedListStyle,
    hasPositiveMargin,
    isStandardParagraphGapPt,
    lineHeightPresetRadioValue,
    type FormatPainterSnapshot,
} from '../../utils/editorTypography';
import {
    getParagraphStyleSpecLine,
    firstFontNameFromSpecLine,
    formatBlockStyleCompactTag,
    hasBlockStylePayload,
    type BlockStyleKey,
} from '../../utils/blockStyleFormat';
import {
    applyParagraphStyleSelectValue,
    getHeadingSelectValue,
    asBlockStyleKey,
} from '../../utils/blockStyleApply';
import '../../extensions/SectionBreakInsert';
import { propagateBlockStyleDefaultsToDocument } from '../../utils/blockStylePropagate';
import { promptSetLink } from '../../utils/editorLink';
import { applyEditorTextColor } from '../../utils/editorTextColor';
import { applyTurkishCaseToSelection } from '../../utils/editorTextCaseApply';
import { useEditorStyleStore } from '../../stores/useEditorStyleStore';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import * as SelectPrimitive from '@radix-ui/react-select';

import TableSelector from './TableSelector';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { ALL_FONTS, FONT_GROUPS } from '../../fonts/offlineFontRegistry';
import { preloadAllBundledFonts } from '../../fonts/loadBundledFont';
import {
    EDITOR_FONT_SIZES_PT,
    getSelectionFontSizeState,
} from '../../utils/fontSizeStep';

const ToolbarTooltip = ({ label, children }: { label: React.ReactNode, children: React.ReactNode }) => {
    if (!label) return <>{children}</>;
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                {children}
            </TooltipTrigger>
            <TooltipContent side="top" className="px-2 py-1 text-xs">
                {label}
            </TooltipContent>
        </Tooltip>
    );
};

const LINE_HEIGHT_MAX = 8;
const LINE_HEIGHT_SEGMENT_PRESETS = ['1', '1.15', '1.5'] as const;

function tryApplyCustomLineHeight(editor: Editor, raw: string): boolean {
    const normalized = raw.replace(',', '.').trim();
    if (!normalized) return false;
    const n = parseFloat(normalized);
    if (Number.isNaN(n) || n <= 0) return false;
    if (n > LINE_HEIGHT_MAX) {
        toast('Daha küçük bir değer girin!');
        return false;
    }
    editor.chain().focus().setLineHeight(String(n)).run();
    return true;
}

function userAgentDataPlatform(): string {
    if (typeof navigator === 'undefined') return '';
    const ud = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
    return typeof ud?.platform === 'string' ? ud.platform : '';
}

function isMacPlatform(): boolean {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const plat = typeof navigator !== 'undefined' && typeof navigator.platform === 'string' ? navigator.platform : '';
    const uaDataPlat = userAgentDataPlatform();
    return (
        /Mac|iPhone|iPad|iPod/i.test(ua) ||
        /Mac OS|Macintosh/i.test(ua) ||
        plat.toUpperCase().includes('MAC') ||
        /mac/i.test(uaDataPlat)
    );
}

function pageBreakEnterShortcutLabel(): string {
    return isMacPlatform() ? '⌘↵' : 'Ctrl+Enter';
}

function shortcutHintFor(styleKey: BlockStyleKey): string {
    const IS_MAC = isMacPlatform();
    const mod = IS_MAC ? '⌘⌥' : 'Ctrl+Alt+';
    const map: Record<BlockStyleKey, string> = {
        p: `${mod}0`,
        title: `${mod}7`,
        subtitle: `${mod}8`,
        h1: `${mod}1`,
        h2: `${mod}2`,
        h3: `${mod}3`,
        h4: `${mod}4`,
        h5: `${mod}5`,
        h6: `${mod}6`,
    };
    return map[styleKey] ?? '';
}

const BLOCK_STYLE_META: Record<BlockStyleKey, { abbrev: string; shortName: string; fullName: string; textValue: string; preview: React.CSSProperties }> = {
    p: { abbrev: 'N', shortName: ' ', fullName: 'Normal Metin', textValue: ' ', preview: { fontSize: '14px', fontWeight: 400, fontFamily: 'inherit', color: 'hsl(var(--muted-foreground))', lineHeight: 1 } },
    title: { abbrev: 'B/T', shortName: ' ', fullName: 'Başlık / Title', textValue: ' ', preview: { fontSize: '22px', fontWeight: 700, fontFamily: 'inherit', color: 'hsl(var(--foreground))', lineHeight: 1, letterSpacing: '-0.02em' } },
    subtitle: { abbrev: 'A/S', shortName: ' ', fullName: 'Alt Başlık / Subtitle', textValue: ' ', preview: { fontSize: '14px', fontWeight: 400, fontFamily: 'inherit', color: 'hsl(var(--muted-foreground))', lineHeight: 1 } },
    h1: { abbrev: 'H1', shortName: ' ', fullName: 'Başlık 1 (H1)', textValue: ' ', preview: { fontSize: '22px', fontWeight: 700, fontFamily: 'inherit', color: 'hsl(var(--foreground))', lineHeight: 1 } },
    h2: { abbrev: 'H2', shortName: ' ', fullName: 'Başlık 2 (H2)', textValue: ' ', preview: { fontSize: '18px', fontWeight: 700, fontFamily: 'inherit', color: 'hsl(var(--foreground))', lineHeight: 1 } },
    h3: { abbrev: 'H3', shortName: ' ', fullName: 'Başlık 3 (H3)', textValue: ' ', preview: { fontSize: '15px', fontWeight: 600, fontFamily: 'inherit', color: 'hsl(var(--foreground))', lineHeight: 1 } },
    h4: { abbrev: 'H4', shortName: ' ', fullName: 'Başlık 4 (H4)', textValue: ' ', preview: { fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', color: 'hsl(var(--foreground))', lineHeight: 1 } },
    h5: { abbrev: 'H5', shortName: ' ', fullName: 'Başlık 5 (H5)', textValue: ' ', preview: { fontSize: '13px', fontWeight: 600, fontFamily: 'inherit', color: 'hsl(var(--foreground))', lineHeight: 1 } },
    h6: { abbrev: 'H6', shortName: ' ', fullName: 'Başlık 6 (H6)', textValue: ' ', preview: { fontSize: '12px', fontWeight: 600, fontFamily: 'inherit', color: 'hsl(var(--foreground))', lineHeight: 1 } },
};

const ParagraphStyleSelectItem = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Item>, Omit<React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>, 'children'> & { styleKey: BlockStyleKey; editor: Editor; shortcutLabel: string; }>(({ className, styleKey, editor, value, textValue, shortcutLabel, ...props }, ref) => {
    const meta = BLOCK_STYLE_META[styleKey];
    const saveBlockDefault = useEditorStyleStore((s) => s.saveBlockDefault);
    const def = useEditorStyleStore((s) => s.blockDefaults[styleKey]);
    const specLine = getParagraphStyleSpecLine(styleKey, def);
    const hasSaved = hasBlockStylePayload(def);
    const previewStyle = (hasSaved && def)
        ? {
            ...meta.preview,
            fontSize: def.fontSize || meta.preview.fontSize,
            fontFamily: def.fontFamily || meta.preview.fontFamily,
            fontWeight: def.bold === true ? 700 : def.bold === false ? 400 : meta.preview.fontWeight,
            fontStyle: def.italic === true ? 'italic' : def.italic === false ? 'normal' : meta.preview.fontStyle,
            textDecoration: def.underline === true ? 'underline' : def.underline === false ? 'none' : undefined,
        }
        : meta.preview;
    return (
        <SelectPrimitive.Item ref={ref} value={value} textValue={textValue} className={cn('group relative flex flex-col items-center justify-center rounded-md p-1.5 outline-none transition-all cursor-pointer select-none border border-transparent', 'data-[highlighted]:bg-accent/45 data-[highlighted]:border-border/30', 'data-[state=checked]:bg-primary/10 data-[state=checked]:border-primary/20', className)} {...props}>
            <SelectPrimitive.ItemText className="sr-only">{textValue}</SelectPrimitive.ItemText>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex flex-col items-center justify-center w-[48px] gap-2">
                        <div className="relative flex h-[20px] w-[36px] shrink-0 items-center justify-center overflow-visible rounded border border-border/50 bg-background group-data-[state=checked]:border-primary/40 group-data-[state=checked]:bg-primary/5 transition-colors group-data-[state=checked]:shadow-[0_0_8px_hsl(var(--primary)/0.2)]">
                            <span className={cn("pointer-events-none select-none leading-none", value === getHeadingSelectValue(editor) ? "blur-[0.5px]" : "")} style={{ ...previewStyle, whiteSpace: 'nowrap' }}>Aa</span>
                        </div>
                        <div className="flex w-full items-center justify-center gap-1 relative overflow-visible">
                            <span className="font-mono text-[11px] font-bold text-muted-foreground group-data-[state=checked]:text-primary leading-none">{meta.abbrev}</span>
                            <button
                                type="button"
                                aria-label={`${meta.fullName} varsayılanını kaydet`}
                                className={cn('absolute -right-1.5 flex h-5 w-5 items-center justify-center rounded-sm transition-all focus-visible:outline-none bg-background/80 shadow-sm border border-border/50', hasSaved ? 'text-primary opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted/80 hover:text-primary z-50')}
                                onPointerDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                                onPointerUp={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const cap = captureTypographyPayload(editor);
                                    void (async () => {
                                        try {
                                            await saveBlockDefault(styleKey, cap);
                                            const n = propagateBlockStyleDefaultsToDocument(editor, styleKey, cap);
                                            toast.success(
                                                n > 0
                                                    ? `'${meta.abbrev}' kaydedildi · ${n} blok güncellendi`
                                                    : `'${meta.abbrev}' kaydedildi`,
                                            );
                                        } catch (err) {
                                            console.error(err);
                                            toast.error('Stil kaydedilemedi');
                                        }
                                    })();
                                }}
                            >
                                <MaterialIcon icon="save" size={12} />
                            </button>
                        </div>
                    </div>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={12} className="flex flex-col gap-1 px-3 py-2 max-w-[240px]">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                        <p className="font-semibold text-[13px] text-foreground tracking-tight min-w-0 truncate">{meta.fullName}</p>
                        <span className="shrink-0 text-[11px] text-muted-foreground/90 font-mono tabular-nums whitespace-nowrap">{shortcutLabel}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono break-words leading-snug">{specLine}</p>
                </TooltipContent>
            </Tooltip>
        </SelectPrimitive.Item>
    );
});
ParagraphStyleSelectItem.displayName = 'ParagraphStyleSelectItem';

// ─── Font Size Input ─────────────────────────────────────────────────────────

interface FontSizeInputProps {
    editor: Editor;
}

const FontSizeInput: React.FC<FontSizeInputProps> = ({ editor }) => {
    const { mixed, displayValue } = getSelectionFontSizeState(editor);
    const [inputVal, setInputVal] = useState(displayValue);
    const [open, setOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const comboRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (document.activeElement !== inputRef.current) {
            setInputVal(displayValue);
        }
    }, [displayValue, mixed]);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            if (!comboRef.current?.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    const applySize = (val: string) => {
        const n = parseFloat(val);
        if (!isNaN(n) && n > 0) {
            editor.chain().focus().setFontSize(`${n}pt`).run();
        }
    };

    const stepSize = (direction: 1 | -1) => {
        editor.chain().focus().stepFontSize(direction).run();
    };

    const commitInput = (val: string) => {
        const trimmed = val.trim();
        if (trimmed === '') {
            setInputVal(displayValue);
            return;
        }
        applySize(trimmed);
    };

    const sizeTooltip = mixed ? 'Karışık yazı boyutu (pt)' : 'Font Boyutu (pt)';

    return (
        <div className="relative flex items-center gap-0.5">
            <ToolbarTooltip label="Yazı boyutunu küçült">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-6 p-0 hover:bg-muted/60"
                    aria-label="Yazı boyutunu küçült"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => stepSize(-1)}
                >
                    <MaterialIcon icon="remove" size={14} />
                </Button>
            </ToolbarTooltip>

            <ToolbarTooltip label={sizeTooltip}>
                <div
                    ref={comboRef}
                    title={sizeTooltip}
                    className="relative flex h-8 w-14 items-center rounded-md border border-transparent hover:border-border focus-within:border-primary transition-colors"
                >
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputVal}
                        placeholder={mixed ? '—' : undefined}
                        aria-label="Font boyutu (pt)"
                        aria-expanded={open}
                        aria-haspopup="listbox"
                        className="h-full w-full bg-transparent pl-1.5 pr-5 text-center text-sm focus:outline-none placeholder:text-muted-foreground"
                        onChange={(e) => setInputVal(e.target.value)}
                        onMouseDown={() => setOpen(true)}
                        onFocus={() => {
                            if (mixed) setInputVal('');
                            setOpen(true);
                        }}
                        onBlur={(e) => {
                            if (comboRef.current?.contains(e.relatedTarget as Node | null)) return;
                            commitInput(e.target.value);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                commitInput(inputVal);
                                setOpen(false);
                                inputRef.current?.blur();
                            }
                            if (e.key === 'Escape') {
                                setInputVal(displayValue);
                                setOpen(false);
                                inputRef.current?.blur();
                            }
                            if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                stepSize(1);
                            }
                            if (e.key === 'ArrowDown' && !open) {
                                e.preventDefault();
                                stepSize(-1);
                            }
                        }}
                    />
                    <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-0 flex h-full w-5 items-center justify-center text-muted-foreground hover:text-foreground"
                        aria-label="Önceden tanımlı boyutlar"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            setOpen((prev) => !prev);
                            inputRef.current?.focus();
                        }}
                    >
                        <MaterialIcon icon="arrow_drop_down" size={14} />
                    </button>

                    {open && (
                        <div
                            className="absolute left-0 top-[calc(100%+4px)] z-[var(--z-floating)] flex max-h-52 w-20 flex-col overflow-y-auto rounded-md border border-white/10 bg-popover p-1 text-popover-foreground shadow-md glass-bg"
                            role="listbox"
                            aria-label="Önceden tanımlı yazı boyutları"
                            onMouseDown={(e) => e.preventDefault()}
                        >
                            {EDITOR_FONT_SIZES_PT.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    role="option"
                                    aria-selected={!mixed && inputVal === String(s)}
                                    className={`text-sm px-2 py-0.5 rounded hover:bg-muted text-left transition-colors ${!mixed && inputVal === String(s) ? 'bg-muted font-semibold' : ''}`}
                                    onClick={() => {
                                        setInputVal(String(s));
                                        applySize(String(s));
                                        setOpen(false);
                                        inputRef.current?.blur();
                                    }}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </ToolbarTooltip>

            <ToolbarTooltip label="Yazı boyutunu büyüt">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-6 p-0 hover:bg-muted/60"
                    aria-label="Yazı boyutunu büyüt"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => stepSize(1)}
                >
                    <MaterialIcon icon="add" size={14} />
                </Button>
            </ToolbarTooltip>
        </div>
    );
};

// ─── Font Family Picker ──────────────────────────────────────────────────────
interface FontFamilyPickerProps {
    editor: Editor;
    /** Bu stil yuvası için kayıtlı varsayılan font varsa gösterim önceliği (Arial = Arial). */
    preferredFontStack?: string | null;
}

const FontFamilyPicker: React.FC<FontFamilyPickerProps> = ({ editor, preferredFontStack }) => {
    const markerFont = getMarkerFontFamily(editor);
    const fromSelection = markerFont ?? editor.getAttributes('textStyle').fontFamily;
    const trimmedSel = typeof fromSelection === 'string' ? fromSelection.trim() : '';
    const currentStack =
        trimmedSel !== ''
            ? trimmedSel
            : preferredFontStack && String(preferredFontStack).trim() !== ''
              ? preferredFontStack
              : 'Inter, sans-serif';
    const foundFont = ALL_FONTS.find(f => f.stack === currentStack) ?? ALL_FONTS.find(f => currentStack.includes(f.name));
    const currentFont = foundFont ?? { name: currentStack.split(',')[0].replace(/['"]/g, '').trim(), stack: currentStack };
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (open) void preloadAllBundledFonts();
    }, [open]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    className="h-8 px-2 gap-1 border-none bg-transparent hover:bg-muted/50 focus:ring-0 text-sm font-normal min-w-[110px] justify-between"
                    onMouseDown={(e) => e.preventDefault()}
                >
                    <span style={{ fontFamily: currentFont.stack }} className="truncate max-w-[90px]">
                        {currentFont.name}
                    </span>
                    <MaterialIcon icon="arrow_drop_down" size={16} className="shrink-0 opacity-60" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-1 glass" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="max-h-[360px] overflow-y-auto custom-scrollbar">
                    {FONT_GROUPS.map((group, gi) => (
                        <div key={group.label}>
                            {gi > 0 && <div className="my-1 border-t border-border/50" />}
                            <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                {group.label}
                            </p>
                            {group.fonts.map(font => (
                                <button
                                    key={font.name}
                                    type="button"
                                    className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors hover:bg-muted ${font.stack === currentStack ? 'bg-muted/80 font-semibold' : ''}`}
                                    style={{ fontFamily: font.stack }}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        applyFontFamilyOrMarker(editor, font.stack);
                                        setOpen(false);
                                    }}
                                >
                                    {font.name}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
};

// ─── Main Toolbar ────────────────────────────────────────────────────────────
interface EditorToolbarProps {
    editor: Editor | null;
    showRuler?: boolean;
    onToggleRuler?: () => void;
    showLineNumbers?: boolean;
    onToggleLineNumbers?: () => void;
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({
    editor,
    showRuler,
    onToggleRuler,
    showLineNumbers,
    onToggleLineNumbers,
}) => {
    const [showTableSelector, setShowTableSelector] = useState(false);
    const [tableSelectorPosition, setTableSelectorPosition] = useState<{ x: number, y: number } | null>(null);
    const [painterSnap, setPainterSnap] = useState<FormatPainterSnapshot | null>(null);
    const [painterSticky, setPainterSticky] = useState(false);
    const painterClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [presetDraftName, setPresetDraftName] = useState('');
    const [editorRev, setEditorRev] = useState(0);
    const [lineHeightDraft, setLineHeightDraft] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);
    const [isSpellCheckEnabled, setIsSpellCheckEnabled] = useState(false);
    const [orderedListStyleOpen, setOrderedListStyleOpen] = useState(false);

    const {
        presets,
        blockDefaults,
        saveDefaults: saveTypographyDefaults,
        addPreset: addTypographyPreset,
        removePreset: removeTypographyPreset,
        defaults: typographyDefaults,
    } = useEditorStyleStore(
        useShallow((s) => ({
            presets: s.presets,
            blockDefaults: s.blockDefaults,
            saveDefaults: s.saveDefaults,
            addPreset: s.addPreset,
            removePreset: s.removePreset,
            defaults: s.defaults,
        })),
    );

    useEffect(() => {
        void useEditorStyleStore.getState().loadFromDb();
    }, []);

    useEffect(() => {
        if (!editor) return;
        let t: ReturnType<typeof setTimeout> | null = null;
        const bump = () => {
            if (t) clearTimeout(t);
            t = setTimeout(() => {
                t = null;
                setEditorRev((r) => r + 1);
            }, 120);
        };
        editor.on('selectionUpdate', bump);
        return () => {
            if (t) clearTimeout(t);
            editor.off('selectionUpdate', bump);
        };
    }, [editor]);

    const handleSelectOrderedListStyle = useCallback(
        (style: 'default' | 'legal' | 'roman' | 'paren' | 'outline') => {
            if (!editor) return;
            applyOrderedListStyle(editor, style);
            setOrderedListStyleOpen(false);
        },
        [editor],
    );

    const handleFormatPainterClick = useCallback(
        (e: React.MouseEvent) => {
            if (!editor) return;
            const showToast = (msg: string) =>
                toast(msg, { description: "", duration: 2100, icon: null, className: "px-3 py-1 text-sm", action: null });

            if (e.shiftKey) {
                setPainterSticky(false);
                setPainterSnap(null);
                showToast('Biçim boyacısı sıfırlandı');
                return;
            }
            if (e.detail > 1) return;
            if (painterClickTimerRef.current) clearTimeout(painterClickTimerRef.current);
            painterClickTimerRef.current = setTimeout(() => {
                painterClickTimerRef.current = null;
                if (painterSticky) {
                    if (!painterSnap) return;
                    applyFormatPainterSnapshot(editor, painterSnap);
                    showToast('Biçim uygulandı');
                    return;
                }
                if (!painterSnap) {
                    setPainterSnap(captureFormatPainterSnapshot(editor));
                    showToast('Biçim kopyalandı — seçime uygulamak için tekrar tıklayın');
                    return;
                }
                applyFormatPainterSnapshot(editor, painterSnap);
                setPainterSnap(null);
                showToast('Biçim uygulandı');
            }, 280);
        },
        [editor, painterSnap, painterSticky]
    );

    const handleFormatPainterDoubleClick = useCallback(
        (e: React.MouseEvent) => {
            if (!editor) return;
            e.preventDefault();
            if (painterClickTimerRef.current) {
                clearTimeout(painterClickTimerRef.current);
                painterClickTimerRef.current = null;
            }
            const snap = captureFormatPainterSnapshot(editor);
            setPainterSnap(snap);
            setPainterSticky(true);
            toast.message('Sabit biçim boyacısı — (⇧+⇱) ile kapatın');
        },
        [editor]
    );

    if (!editor) return null;

    void editorRev;
    void blockDefaults;
    const layoutBlock = getActiveLayoutBlock(editor);
    const layoutAttrs = layoutBlock?.attrs ?? {};
    const lineHeightPreset = lineHeightPresetRadioValue(layoutAttrs.lineHeight);

    const toggleSpellCheck = () => {
        const newVal = !isSpellCheckEnabled;
        setIsSpellCheckEnabled(newVal);
        editor.view.dom.setAttribute('spellcheck', newVal.toString());
    };

    return (
        <TooltipProvider delayDuration={200}>
            <div className="w-full flex justify-center py-1.5 px-4 overflow-visible relative">
                <div
                    className={`w-full max-w-[794px] mx-auto glass-panel rounded-2xl transition-all duration-300 backdrop-blur-xl bg-background/70 ${isExpanded
                        ? 'h-auto p-1.5 ring-2 ring-accent shadow-lg shadow-accent/20 cursor-default'
                        : 'h-[43px] max-h-[43px] overflow-hidden overflow-y-hidden hover:shadow-[0_0_15px_color-mix(in_srgb,var(--secondary)_40%,transparent)] p-1.5'
                        }`}
                >
                    <div
                        className={`w-full min-h-0 h-full flex items-center gap-1 ${isExpanded ? 'flex-wrap' : 'flex-nowrap overflow-x-auto overflow-y-hidden no-scrollbar'}`}
                    >
                        {/* Expand/Collapse Toggle & Search */}
                        <div className="flex items-center gap-0.5 shrink-0 sticky left-0 z-10 bg-background/90">
                            <ToolbarTooltip label="Ara ve Değiştir (Cmd+F)">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-muted transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        // Dispatch a custom event to open the search panel
                                        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true }));
                                    }}
                                >
                                    <MaterialIcon icon="search" size={16} />
                                </Button>
                            </ToolbarTooltip>
                            <ToolbarTooltip label={isExpanded ? 'Daha az araç göster' : 'Daha fazla araç göster'}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-8 w-8 hover:bg-muted transition-transform duration-300 ${isExpanded ? 'rotate-180 bg-accent text-accent-foreground' : ''}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsExpanded(!isExpanded);
                                    }}
                                >
                                    <MaterialIcon icon="expand_more" size={16} />
                                </Button>
                            </ToolbarTooltip>
                        </div>

                        <Separator orientation="vertical" className="hidden sm:block h-6 mx-0.5 shrink-0" />

                        {/* History */}
                        <div className="flex items-center gap-0.5 shrink-0">
                            <ToolbarTooltip label="Geri Al (⌘+Z)">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-muted transition-colors"
                                    onClick={() => editor.chain().focus().undo().run()}
                                    disabled={!editor.can().undo()}
                                >
                                    <MaterialIcon icon="undo" size={16} />
                                </Button>
                            </ToolbarTooltip>
                            <ToolbarTooltip label="Yinele (⌘+⇧+Z)">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-muted transition-colors"
                                    onClick={() => editor.chain().focus().redo().run()}
                                    disabled={!editor.can().redo()}
                                >
                                    <MaterialIcon icon="redo" size={16} />
                                </Button>
                            </ToolbarTooltip>

                            <Separator orientation="vertical" className="hidden sm:block h-6 mx-1 shrink-0" />
                            <DropdownMenu>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 shrink-0 hover:bg-accent transition-colors"
                                                aria-label="Tipografi Kütüphanesi"
                                            >
                                                <MaterialIcon icon="bookmark_added" size={18} />
                                            </Button>
                                        </DropdownMenuTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="px-2 py-1 text-xs">
                                        Tipografi Kütüphanesi
                                    </TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent
                                    align="start"
                                    className="w-43 p-0 glass max-h-[220px] overflow-y-auto shadow-sm border-muted/40"
                                >
                                    {/* Üst Kısım: Hızlı İşlem */}
                                    <DropdownMenuItem
                                        className="text-sm px-3 py-2 cursor-pointer focus:bg-accent/50"
                                        onClick={async () => {
                                            const p = captureTypographyPayload(editor);
                                            await saveTypographyDefaults(p);
                                            toast.success('Mevcut biçim varsayılan yapıldı');
                                        }}
                                    >
                                        <MaterialIcon icon="reset_settings" size={16} className="mr-2 opacity-70" />
                                        Varsayılan Yap
                                    </DropdownMenuItem>

                                    {/* Yeni Kayıt Alanı */}
                                    <div className="px-2 py-2 flex gap-1">
                                        <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
                                            <Input
                                                value={presetDraftName}
                                                onChange={(e) => setPresetDraftName(e.target.value)}
                                                placeholder="Önayar adı..."
                                                className="h-8 text-sm bg-background/50 border-muted-foreground/20 focus-visible:ring-1"
                                                onKeyDown={(e) => e.stopPropagation()}
                                            />
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="icon"
                                                className="h-8 w-8 shrink-0 hover:bg-primary hover:text-primary-foreground transition-all"
                                                title="Önayarı kaydet"
                                                aria-label="Önayarı kaydet"
                                                onClick={async () => {
                                                    const name = presetDraftName.trim();
                                                    if (!name) {
                                                        toast.error('Önce bir ad yazın');
                                                        return;
                                                    }
                                                    const p = captureTypographyPayload(editor);
                                                    await addTypographyPreset(name, p);
                                                    setPresetDraftName('');
                                                    toast.success(`Kaydedildi: ${name}`);
                                                }}
                                            >
                                                <MaterialIcon icon="check" size={16} />
                                            </Button>
                                        </div>
                                    </div>

                                    <DropdownMenuSeparator className="my-1" />

                                    {/* Kütüphane Listesi */}
                                    <div className="flex flex-col gap-0.5">
                                        <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                                            Kütüphane
                                        </p>

                                        {/* Varsayılan Ögesi */}
                                        <div className="flex items-center px-1">
                                            <DropdownMenuItem
                                                className="text-sm flex-1 py-1 cursor-pointer"
                                                disabled={!typographyDefaults?.payload}
                                                onClick={() => {
                                                    const p = typographyDefaults?.payload;
                                                    if (!p) return;
                                                    applyTypographyPayload(editor, p);
                                                    toast.message('Varsayılan biçim uygulandı');
                                                }}
                                            >
                                                Varsayılan Stil
                                            </DropdownMenuItem>
                                        </div>
                                        {/* Dinamik Listeler */}
                                        {presets.map((pr) => (
                                            <div key={pr.id} className="group flex items-center px-1">
                                                <DropdownMenuItem
                                                    className="text-sm flex-1 py-1 cursor-pointer"
                                                    onClick={() => {
                                                        applyTypographyPayload(editor, pr.payload);
                                                        toast.message(`Uygulandı: ${pr.name}`);
                                                    }}
                                                >
                                                    {pr.name}
                                                </DropdownMenuItem>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                                    title="Önayarı sil"
                                                    aria-label="Önayarı sil"
                                                    onClick={(ev) => {
                                                        ev.preventDefault();
                                                        ev.stopPropagation();
                                                        void removeTypographyPreset(pr.id);
                                                        toast.message('Önayar silindi');
                                                    }}
                                                >
                                                    <MaterialIcon icon="delete" size={14} />
                                                </Button>
                                            </div>
                                        ))}

                                        {presets.length === 0 && !typographyDefaults?.payload && (
                                            <p className="px-3 py-4 text-center text-xs text-muted-foreground italic">
                                                Henüz kayıtlı bir stil yok
                                            </p>
                                        )}
                                    </div>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <ToolbarTooltip label="Biçimlendirmeyi Temizle">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-muted transition-colors"
                                    onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
                                >
                                    <MaterialIcon icon="format_clear" size={16} />
                                </Button>
                            </ToolbarTooltip>
                            <ToolbarTooltip label="Biçim Boyacısı (Çift ⇱: sabitle, ⇧+⇱: kapat)">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-8 w-8 transition-colors ${painterSnap || painterSticky ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
                                    onClick={handleFormatPainterClick}
                                    onDoubleClick={handleFormatPainterDoubleClick}
                                >
                                    <MaterialIcon icon="format_paint" size={16} />
                                </Button>
                            </ToolbarTooltip>
                        </div>



                        <Separator orientation="vertical" className="hidden sm:block h-6 mx-1 shrink-0" />

                        {/* Text Style / Heading — setParagraph / setHeading for reliable WYSIWYG */}
                        <Select
                            value={getHeadingSelectValue(editor)}
                            onValueChange={(value) => {
                                applyParagraphStyleSelectValue(editor, value);
                            }}
                        >
                            <SelectTrigger
                                aria-label="Paragraf ve başlık stili"
                                className="h-8 min-h-8 shrink-0 gap-1.5 border-none bg-transparent px-1.5 hover:bg-muted/50 focus:ring-0 data-[state=open]:bg-muted/40 w-[max-content] max-w-[148px]"
                            >
                                {(() => {
                                    const hv = getHeadingSelectValue(editor);
                                    const bk = asBlockStyleKey(hv) ?? 'p';
                                    const line = getParagraphStyleSpecLine(bk, blockDefaults[bk]);
                                    const tag = formatBlockStyleCompactTag(bk, line);
                                    const fontName = firstFontNameFromSpecLine(line);
                                    void editorRev;
                                    return (
                                        <>
                                            <MaterialIcon icon="format_paragraph" size={14} className="shrink-0 text-muted-foreground opacity-80" role="presentation" aria-hidden />
                                            <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-0 leading-none">
                                                <sup className="max-w-full truncate text-left font-mono text-[9px] font-semibold leading-none tracking-tight text-foreground [font-variant-ligatures:none]">
                                                    {tag}
                                                </sup>
                                                <span className="mt-0.5 max-w-full truncate text-left font-mono text-[7px] text-muted-foreground">
                                                    {fontName}
                                                </span>
                                            </div>
                                        </>
                                    );
                                })()}
                                <SelectValue className="sr-only" />
                            </SelectTrigger>
                            <SelectContent
                                sideOffset={6}
                                className="w-auto p-1.5 rounded-xl glass shadow-xl"
                            >
                                <div className="grid grid-cols-3 gap-1">
                                    <ParagraphStyleSelectItem value="p" textValue={BLOCK_STYLE_META.p.textValue} styleKey="p" shortcutLabel={shortcutHintFor('p')} editor={editor} />
                                    <ParagraphStyleSelectItem value="title" textValue={BLOCK_STYLE_META.title.textValue} styleKey="title" shortcutLabel={shortcutHintFor('title')} editor={editor} />
                                    <ParagraphStyleSelectItem value="subtitle" textValue={BLOCK_STYLE_META.subtitle.textValue} styleKey="subtitle" shortcutLabel={shortcutHintFor('subtitle')} editor={editor} />
                                    <ParagraphStyleSelectItem value="h1" textValue={BLOCK_STYLE_META.h1.textValue} styleKey="h1" shortcutLabel={shortcutHintFor('h1')} editor={editor} />
                                    <ParagraphStyleSelectItem value="h2" textValue={BLOCK_STYLE_META.h2.textValue} styleKey="h2" shortcutLabel={shortcutHintFor('h2')} editor={editor} />
                                    <ParagraphStyleSelectItem value="h3" textValue={BLOCK_STYLE_META.h3.textValue} styleKey="h3" shortcutLabel={shortcutHintFor('h3')} editor={editor} />
                                    <ParagraphStyleSelectItem value="h4" textValue={BLOCK_STYLE_META.h4.textValue} styleKey="h4" shortcutLabel={shortcutHintFor('h4')} editor={editor} />
                                    <ParagraphStyleSelectItem value="h5" textValue={BLOCK_STYLE_META.h5.textValue} styleKey="h5" shortcutLabel={shortcutHintFor('h5')} editor={editor} />
                                    <ParagraphStyleSelectItem value="h6" textValue={BLOCK_STYLE_META.h6.textValue} styleKey="h6" shortcutLabel={shortcutHintFor('h6')} editor={editor} />
                                </div>
                            </SelectContent>
                        </Select>

                        <Separator orientation="vertical" className="hidden sm:block h-6 mx-1 shrink-0" />

                        {/* Font Family — custom picker with preview */}
                        <div className="shrink-0 flex items-center">
                            <FontFamilyPicker
                                editor={editor}
                                preferredFontStack={(() => {
                                    void editorRev;
                                    const bk = asBlockStyleKey(getHeadingSelectValue(editor)) ?? 'p';
                                    const def = blockDefaults[bk];
                                    if (
                                        hasBlockStylePayload(def) &&
                                        def?.fontFamily &&
                                        String(def.fontFamily).trim() !== ''
                                    ) {
                                        return def.fontFamily;
                                    }
                                    return null;
                                })()}
                            />
                        </div>

                        <Separator orientation="vertical" className="hidden sm:block h-6 mx-1 shrink-0" />

                        {/* Font Size */}
                        <div className="shrink-0 flex items-center">
                            <FontSizeInput editor={editor} />
                        </div>

                        <Separator orientation="vertical" className="hidden sm:block h-6 mx-1 shrink-0" />

                        {/* Line Height & Paragraph Options */}
                        <DropdownMenu
                            onOpenChange={(open) => {
                                if (!open || !editor) return;
                                const b = getActiveLayoutBlock(editor);
                                const lh = b?.attrs?.lineHeight;
                                const preset = lineHeightPresetRadioValue(lh);
                                const inSegment =
                                    preset === '1' || preset === '1.15' || preset === '1.5';
                                setLineHeightDraft(
                                    inSegment ? '' : (lh != null ? String(lh).replace(',', '.') : ''),
                                );
                            }}
                        >
                            <ToolbarTooltip label="Satır aralığı ve paragraf boşluğu">
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-8 px-2 gap-1.5 hover:bg-accent hover:text-accent-foreground border-none transition-all active:scale-95 shrink-0"
                                    >
                                        <MaterialIcon icon="format_line_spacing" size={18} className="opacity-80" />
                                        <MaterialIcon icon="expand_more" size={14} className="opacity-50" />
                                    </Button>
                                </DropdownMenuTrigger>
                            </ToolbarTooltip>

                            <DropdownMenuContent
                                align="start"
                                collisionPadding={16}
                                className="w-[260px] max-h-[min(28rem,calc(100vh-2rem))] overflow-y-auto overscroll-contain p-1.5 glass shadow-2xl border-muted/30"
                            >
                                <div className="flex items-center gap-1.5 p-1">
                                    <div className="flex bg-muted/20 p-0.5 rounded-md flex-1 min-w-0">
                                        {LINE_HEIGHT_SEGMENT_PRESETS.map((v) => (
                                            <Button
                                                key={v}
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className={cn(
                                                    'h-7 flex-1 text-[11px] px-0 min-w-0 transition-colors',
                                                    lineHeightPreset === v
                                                        ? 'bg-background dark:bg-primary/35 shadow-sm font-semibold text-foreground ring-1 ring-primary/50 dark:ring-primary/60'
                                                        : 'hover:bg-background/80 dark:hover:bg-muted/50 hover:shadow-sm',
                                                )}
                                                onClick={() => {
                                                    setLineHeightDraft('');
                                                    editor.chain().focus().setLineHeight(v).run();
                                                }}
                                            >
                                                {v}
                                            </Button>
                                        ))}
                                    </div>
                                    <div
                                        className="relative w-16 shrink-0"
                                        onPointerDown={(e) => e.stopPropagation()}
                                    >
                                        <Input
                                            inputMode="decimal"
                                            placeholder="1-8"
                                            className="h-8 text-[11px] px-2 bg-muted/20 border-none focus-visible:ring-1 focus-visible:ring-primary/20"
                                            value={lineHeightDraft}
                                            onChange={(e) => setLineHeightDraft(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    tryApplyCustomLineHeight(editor, lineHeightDraft);
                                                }
                                            }}
                                            onBlur={() => {
                                                tryApplyCustomLineHeight(editor, lineHeightDraft);
                                            }}
                                        />
                                    </div>
                                </div>

                                <DropdownMenuSeparator className="my-1 opacity-50" />

                                <div className="flex items-center gap-1 p-1">
                                    {(
                                        [
                                            { label: 'Önce', marginKey: 'marginTop' as const },
                                            { label: 'Sonra', marginKey: 'marginBottom' as const },
                                        ] as const
                                    ).map((row) => {
                                        const marginValue =
                                            row.marginKey === 'marginTop'
                                                ? layoutAttrs.marginTop
                                                : layoutAttrs.marginBottom;
                                        const canAdd = !isStandardParagraphGapPt(marginValue);
                                        const canRemove = hasPositiveMargin(marginValue);
                                        return (
                                            <div
                                                key={row.label}
                                                className="flex items-center justify-between flex-1 min-w-0 bg-muted/20 rounded-md px-2 py-1 border border-transparent hover:border-muted-foreground/20 transition-colors"
                                            >
                                                <span className="text-[10px] font-semibold text-muted-foreground uppercase truncate">
                                                    {row.label}
                                                </span>
                                                <div className="flex items-center shrink-0">
                                                    <button
                                                        type="button"
                                                        disabled={!canAdd}
                                                        className={`p-1 rounded-sm transition-colors disabled:pointer-events-none ${canAdd
                                                            ? 'text-primary/90 hover:bg-primary/15 hover:text-primary'
                                                            : 'opacity-35 text-muted-foreground'
                                                            }`}
                                                        onClick={() =>
                                                            row.marginKey === 'marginTop'
                                                                ? editor.chain().focus().setMarginTop('12pt').run()
                                                                : editor.chain().focus().setMarginBottom('12pt').run()
                                                        }
                                                    >
                                                        <MaterialIcon icon="add" size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={!canRemove}
                                                        className={`p-1 rounded-sm transition-colors disabled:pointer-events-none ${canRemove
                                                            ? 'text-destructive/90 hover:bg-destructive/10 hover:text-destructive'
                                                            : 'opacity-35 text-muted-foreground'
                                                            }`}
                                                        onClick={() =>
                                                            row.marginKey === 'marginTop'
                                                                ? editor.chain().focus().unsetMarginTop().run()
                                                                : editor.chain().focus().unsetMarginBottom().run()
                                                        }
                                                    >
                                                        <MaterialIcon icon="remove" size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <DropdownMenuSeparator className="my-1 opacity-50" />

                                <div className="grid grid-cols-2 gap-px bg-muted/10 rounded-md overflow-hidden p-px">
                                    {(
                                        [
                                            {
                                                attr: 'keepWithNext' as const,
                                                label: 'Birlikte tut',
                                                icon: 'link' as const,
                                                toggle: () => editor.chain().focus().toggleKeepWithNext().run(),
                                            },
                                            {
                                                attr: 'keepLines' as const,
                                                label: 'Satır bölme',
                                                icon: 'unfold_less' as const,
                                                toggle: () => editor.chain().focus().toggleKeepLines().run(),
                                            },
                                            {
                                                attr: 'preventSingleLines' as const,
                                                label: 'Dul/yetim',
                                                icon: 'low_priority' as const,
                                                toggle: () =>
                                                    editor.chain().focus().togglePreventSingleLines().run(),
                                            },
                                            {
                                                attr: 'pageBreakBefore' as const,
                                                label: 'Sayfa başı',
                                                icon: 'keyboard_return' as const,
                                                toggle: () =>
                                                    editor.chain().focus().togglePageBreakBefore().run(),
                                            },
                                        ] as const
                                    ).map((item) => (
                                        <DropdownMenuCheckboxItem
                                            key={item.attr}
                                            className={`text-[11px] py-2 px-2 cursor-pointer rounded-sm border-none focus:bg-accent flex items-center gap-1.5 ${item.attr === 'pageBreakBefore' ? 'text-primary font-medium' : ''
                                                }`}
                                            checked={Boolean(layoutAttrs[item.attr])}
                                            onCheckedChange={() => item.toggle()}
                                        >
                                            <MaterialIcon icon={item.icon} size={14} className="opacity-70 shrink-0" />
                                            <span className="leading-tight">{item.label}</span>
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </div>

                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Breaks */}
                        <DropdownMenu>
                            <ToolbarTooltip label="Sayfa ve Bölüm Sonları">
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-8 px-2 gap-1 hover:bg-accent hover:text-accent-foreground border-none transition-all active:scale-95 shrink-0"
                                    >
                                        <MaterialIcon icon="insert_page_break" size={16} className="opacity-80" />
                                        <MaterialIcon icon="expand_more" size={14} className="opacity-50" />
                                    </Button>
                                </DropdownMenuTrigger>
                            </ToolbarTooltip>
                            <DropdownMenuContent
                                align="start"
                                className="w-[200px] p-1.5 glass shadow-xl border-muted/30"
                            >
                                {/* Page Break */}
                                <div className="px-1 pt-0.5 pb-1">
                                    <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-1 pb-1">Sayfa</p>
                                    <DropdownMenuItem
                                        className="text-[11px] py-2 px-2 cursor-pointer rounded-sm focus:bg-accent/60"
                                        onClick={() => editor.chain().focus().setPageBreak({ kind: 'page' }).run()}
                                    >
                                        <span className="flex w-full items-center justify-between gap-2">
                                            <span className="flex items-center gap-2.5">
                                                <span className="flex items-center justify-center w-6 h-6 rounded bg-primary/10 shrink-0">
                                                    <MaterialIcon icon="insert_page_break" size={13} className="text-primary/70" />
                                                </span>
                                                <span className="flex flex-col gap-0.5 min-w-0">
                                                    <span className="font-medium leading-tight">Sayfa Sonu</span>
                                                    <span className="text-[9px] text-muted-foreground leading-tight">Yeni sayfada devam eder</span>
                                                </span>
                                            </span>
                                            <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">{pageBreakEnterShortcutLabel()}</span>
                                        </span>
                                    </DropdownMenuItem>
                                </div>

                                <DropdownMenuSeparator className="my-0.5 opacity-30" />

                                {/* Section Breaks */}
                                <div className="px-1 pt-1 pb-0.5">
                                    <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-1 pb-1">Bölüm Sonu</p>
                                    <DropdownMenuItem
                                        className="text-[11px] py-2 px-2 cursor-pointer rounded-sm focus:bg-accent/60"
                                        onClick={() => editor.chain().focus().insertSectionBreakNextPage().run()}
                                    >
                                        <span className="flex items-center gap-2.5">
                                            <span className="flex items-center justify-center w-6 h-6 rounded bg-amber-500/10 shrink-0">
                                                <MaterialIcon icon="view_day" size={13} className="text-amber-600/70 dark:text-amber-400/70" />
                                            </span>
                                            <span className="flex flex-col gap-0.5 min-w-0">
                                                <span className="font-medium leading-tight">Sonraki Sayfa</span>
                                                <span className="text-[9px] text-muted-foreground leading-tight">Yeni bölüm, yeni sayfada başlar</span>
                                            </span>
                                        </span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        className="text-[11px] py-2 px-2 cursor-pointer rounded-sm focus:bg-accent/60"
                                        onClick={() => editor.commands.insertSectionBreakContinuous()}
                                    >
                                        <span className="flex items-center gap-2.5">
                                            <span className="flex items-center justify-center w-6 h-6 rounded bg-muted/50 shrink-0">
                                                <MaterialIcon icon="horizontal_rule" size={13} className="text-muted-foreground/70" />
                                            </span>
                                            <span className="flex flex-col gap-0.5 min-w-0">
                                                <span className="font-medium leading-tight">Devam (Sürekli)</span>
                                                <span className="text-[9px] text-muted-foreground leading-tight">Yeni bölüm, aynı sayfada başlar</span>
                                            </span>
                                        </span>
                                    </DropdownMenuItem>
                                </div>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <Separator orientation="vertical" className="hidden sm:block h-6 mx-1 shrink-0" />

                        {/* Colors */}
                        <div className="flex items-center gap-0.5 shrink-0">
                            <ColorPicker
                                color={editor.getAttributes('textStyle').color}
                                onChange={(color) => applyEditorTextColor(editor, color)}
                                label="Yazı Rengi"
                                mode="text"
                            />
                            <ColorPicker
                                color={editor.getAttributes('highlight').color}
                                onChange={(color) => {
                                    if (color === '#ffffff') {
                                        editor.chain().focus().unsetHighlight().run();
                                    } else {
                                        editor.chain().focus().toggleHighlight({ color }).run();
                                    }
                                }}
                                label="Vurgu Rengi"
                                mode="highlight"
                            />
                        </div>

                        <Separator orientation="vertical" className="hidden sm:block h-6 mx-1 shrink-0" />

                        {/* Font Formatting */}
                        <ToggleGroup type="multiple" className="gap-0.5 shrink-0">
                            <ToolbarTooltip label="Kalın (⌘+B)">
                                <ToggleGroupItem
                                    value="bold"
                                    aria-label="Kalın"
                                    className="h-8 w-8 p-0 data-[state=on]:bg-muted"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => toggleMarkerFormatOrMark(editor, 'bold')}
                                    data-state={getMarkerFormatActive(editor, 'bold') ? 'on' : 'off'}
                                >
                                    <MaterialIcon icon="format_bold" size={16} />
                                </ToggleGroupItem>
                            </ToolbarTooltip>
                            <ToolbarTooltip label="İtalik (⌘+I)">
                                <ToggleGroupItem
                                    value="italic"
                                    aria-label="İtalik"
                                    className="h-8 w-8 p-0 data-[state=on]:bg-muted"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => toggleMarkerFormatOrMark(editor, 'italic')}
                                    data-state={getMarkerFormatActive(editor, 'italic') ? 'on' : 'off'}
                                >
                                    <MaterialIcon icon="format_italic" size={16} />
                                </ToggleGroupItem>
                            </ToolbarTooltip>
                            <ToolbarTooltip label="Altı Çizili (⌘+U)">
                                <ToggleGroupItem
                                    value="underline"
                                    aria-label="Altı Çizili"
                                    className="h-8 w-8 p-0 data-[state=on]:bg-muted"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => toggleMarkerFormatOrMark(editor, 'underline')}
                                    data-state={getMarkerFormatActive(editor, 'underline') ? 'on' : 'off'}
                                >
                                    <MaterialIcon icon="format_underlined" size={16} />
                                </ToggleGroupItem>
                            </ToolbarTooltip>
                            <ToolbarTooltip label="Üstü Çizili">
                                <ToggleGroupItem
                                    value="strike"
                                    aria-label="Üstü Çizili"
                                    className="h-8 w-8 p-0 data-[state=on]:bg-muted"
                                    onClick={() => editor.chain().focus().toggleStrike().run()}
                                    data-state={editor.isActive('strike') ? 'on' : 'off'}
                                >
                                    <MaterialIcon icon="strikethrough_s" size={16} />
                                </ToggleGroupItem>
                            </ToolbarTooltip>
                            <ToolbarTooltip label="Alt Simge">
                                <ToggleGroupItem
                                    value="subscript"
                                    aria-label="Alt Simge"
                                    className="h-8 w-8 p-0 data-[state=on]:bg-muted"
                                    onClick={() => editor.chain().focus().toggleSubscript().run()}
                                    data-state={editor.isActive('subscript') ? 'on' : 'off'}
                                >
                                    <MaterialIcon icon="subscript" size={16} />
                                </ToggleGroupItem>
                            </ToolbarTooltip>
                            <ToolbarTooltip label="Üst Simge">
                                <ToggleGroupItem
                                    value="superscript"
                                    aria-label="Üst Simge"
                                    className="h-8 w-8 p-0 data-[state=on]:bg-muted"
                                    onClick={() => editor.chain().focus().toggleSuperscript().run()}
                                    data-state={editor.isActive('superscript') ? 'on' : 'off'}
                                >
                                    <MaterialIcon icon="superscript" size={16} />
                                </ToggleGroupItem>
                            </ToolbarTooltip>
                        </ToggleGroup>

                        <DropdownMenu>
                            <ToolbarTooltip label="Büyük / Küçük Harf">
                                <DropdownMenuTrigger asChild>
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                        <MaterialIcon icon="titlecase" size={16} />
                                    </Button>
                                </DropdownMenuTrigger>
                            </ToolbarTooltip>
                            <DropdownMenuContent align="start" className="w-[130px] glass p-1.5">
                                <DropdownMenuItem
                                    className="text-xs"
                                    onClick={() => {
                                        if (!applyTurkishCaseToSelection(editor, 'title')) {
                                            toast.message('Önce metin seçin');
                                        }
                                    }}
                                >
                                    Başlık Stili
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="text-xs"
                                    onClick={() => {
                                        if (!applyTurkishCaseToSelection(editor, 'upper')) {
                                            toast.message('Önce metin seçin');
                                        }
                                    }}
                                >
                                    BÜYÜK HARF
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="text-xs"
                                    onClick={() => {
                                        if (!applyTurkishCaseToSelection(editor, 'lower')) {
                                            toast.message('Önce metin seçin');
                                        }
                                    }}
                                >
                                    küçük harf
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <Separator orientation="vertical" className="hidden sm:block h-6 mx-1 shrink-0" />

                        {/* Alignment */}
                        <ToggleGroup type="single" className="gap-0.5 shrink-0" value={
                            editor.isActive({ textAlign: 'center' }) ? 'center' :
                                editor.isActive({ textAlign: 'right' }) ? 'right' :
                                    editor.isActive({ textAlign: 'justify' }) ? 'justify' : 'left'
                        }>
                            <ToolbarTooltip label="Sola Hizala">
                                <ToggleGroupItem
                                    value="left"
                                    className="h-8 w-8 p-0 data-[state=on]:bg-muted"
                                    onClick={() => {
                                        if (editor.isActive('image')) {
                                            editor.chain().focus().updateAttributes('image', { align: 'left' }).run();
                                            return;
                                        }
                                        editor.chain().focus().setTextAlign('left').run();
                                    }}
                                >
                                    <MaterialIcon icon="format_align_left" size={16} />
                                </ToggleGroupItem>
                            </ToolbarTooltip>
                            <ToolbarTooltip label="Ortala">
                                <ToggleGroupItem
                                    value="center"
                                    className="h-8 w-8 p-0 data-[state=on]:bg-muted"
                                    onClick={() => {
                                        if (editor.isActive('image')) {
                                            editor.chain().focus().updateAttributes('image', { align: 'center' }).run();
                                            return;
                                        }
                                        editor.chain().focus().setTextAlign('center').run();
                                    }}
                                >
                                    <MaterialIcon icon="format_align_center" size={16} />
                                </ToggleGroupItem>
                            </ToolbarTooltip>
                            <ToolbarTooltip label="Sağa Hizala">
                                <ToggleGroupItem
                                    value="right"
                                    className="h-8 w-8 p-0 data-[state=on]:bg-muted"
                                    onClick={() => {
                                        if (editor.isActive('image')) {
                                            editor.chain().focus().updateAttributes('image', { align: 'right' }).run();
                                            return;
                                        }
                                        editor.chain().focus().setTextAlign('right').run();
                                    }}
                                >
                                    <MaterialIcon icon="format_align_right" size={16} />
                                </ToggleGroupItem>
                            </ToolbarTooltip>
                            <ToolbarTooltip label="İki Yana Yasla">
                                <ToggleGroupItem
                                    value="justify"
                                    className="h-8 w-8 p-0 data-[state=on]:bg-muted"
                                    onClick={() => {
                                        if (editor.isActive('image')) {
                                            editor.chain().focus().updateAttributes('image', { align: 'center' }).run();
                                            return;
                                        }
                                        editor.chain().focus().setTextAlign('justify').run();
                                    }}
                                >
                                    <MaterialIcon icon="format_align_justify" size={16} />
                                </ToggleGroupItem>
                            </ToolbarTooltip>
                        </ToggleGroup>

                        <Separator orientation="vertical" className="hidden sm:block h-6 mx-1 shrink-0" />

                        {/* Lists & Indent */}
                        <div className="flex items-center gap-0.5 shrink-0">
                            {/* Bullet list */}
                            <ToolbarTooltip label="Madde İşaretli Liste">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-8 w-8 ${editor.isActive('bulletList') ? 'bg-muted' : ''}`}
                                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                                >
                                    <MaterialIcon icon="format_list_bulleted" size={16} />
                                </Button>
                            </ToolbarTooltip>

                            {/* Ordered list with style picker — Tooltip must wrap PopoverTrigger so asChild merges into Button (not Tooltip root) */}
                            <div className="flex items-center">
                                <Popover open={orderedListStyleOpen} onOpenChange={setOrderedListStyleOpen}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className={`h-8 w-8 ${editor.isActive('orderedList') ? 'bg-muted' : ''}`}
                                                    aria-label="Numaralı Liste"
                                                >
                                                    <MaterialIcon icon="format_list_numbered" size={16} />
                                                </Button>
                                            </PopoverTrigger>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="px-2 py-1 text-xs">
                                            Numaralı Liste
                                        </TooltipContent>
                                    </Tooltip>
                                    <PopoverContent className="w-auto p-1.5 glass backdrop-blur-xl border border-border/40 shadow-lg rounded-xl" align="start" sideOffset={6}>
                                        <div className="flex flex-wrap gap-1.5 max-w-[280px] justify-center">
                                            {/* Default: 1. a. i. */}
                                            <button
                                                type="button"
                                                className="flex flex-col items-start gap-1 p-1.5 hover:bg-muted/70 rounded-lg border border-transparent hover:border-border/50 transition-colors w-[60px]"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => handleSelectOrderedListStyle('default')}
                                            >
                                                <div className="flex flex-col gap-[3px] opacity-70 w-full">
                                                    <div className="flex items-center gap-1"><span className="text-[9px] font-medium w-3 text-right">1.</span><div className="h-[2px] w-full bg-current rounded-full opacity-60" /></div>
                                                    <div className="flex items-center gap-1 pl-1.5"><span className="text-[9px] font-medium w-3 text-right">a.</span><div className="h-[2px] w-full bg-current rounded-full opacity-60" /></div>
                                                    <div className="flex items-center gap-1 pl-3"><span className="text-[9px] font-medium w-3 text-right">i.</span><div className="h-[2px] w-full bg-current rounded-full opacity-60" /></div>
                                                </div>
                                                <span className="text-[9px] text-muted-foreground mt-0.5 w-full text-center">1, a, i</span>
                                            </button>

                                            {/* Legal: 1. 1.1. 1.1.1. */}
                                            <button
                                                type="button"
                                                className="flex flex-col items-start gap-1 p-1.5 hover:bg-muted/70 rounded-lg border border-transparent hover:border-border/50 transition-colors w-[60px]"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => handleSelectOrderedListStyle('legal')}
                                            >
                                                <div className="flex flex-col gap-[3px] opacity-70 w-full">
                                                    <div className="flex items-center gap-1"><span className="text-[9px] font-medium w-4 shrink-0 text-right">1.</span><div className="h-[2px] w-full bg-current rounded-full opacity-60" /></div>
                                                    <div className="flex items-center gap-1"><span className="text-[9px] font-medium w-4 shrink-0 text-right">1.1.</span><div className="h-[2px] w-full bg-current rounded-full opacity-60" /></div>
                                                    <div className="flex items-center gap-1"><span className="text-[9px] font-medium w-6 shrink-0 text-right">1.1.1.</span><div className="h-[2px] w-full bg-current rounded-full opacity-60" /></div>
                                                </div>
                                                <span className="text-[9px] text-muted-foreground mt-0.5 w-full text-center">1, 1.1</span>
                                            </button>

                                            {/* Roman: I. A. 1. */}
                                            <button
                                                type="button"
                                                className="flex flex-col items-start gap-1 p-1.5 hover:bg-muted/70 rounded-lg border border-transparent hover:border-border/50 transition-colors w-[60px]"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => handleSelectOrderedListStyle('roman')}
                                            >
                                                <div className="flex flex-col gap-[3px] opacity-70 w-full">
                                                    <div className="flex items-center gap-1"><span className="text-[9px] font-bold w-3 text-right">I.</span><div className="h-[2px] w-full bg-current rounded-full opacity-60" /></div>
                                                    <div className="flex items-center gap-1 pl-1.5"><span className="text-[9px] font-bold w-3 text-right">A.</span><div className="h-[2px] w-full bg-current rounded-full opacity-60" /></div>
                                                    <div className="flex items-center gap-1 pl-3"><span className="text-[9px] font-medium w-3 text-right">1.</span><div className="h-[2px] w-full bg-current rounded-full opacity-60" /></div>
                                                </div>
                                                <span className="text-[9px] text-muted-foreground mt-0.5 w-full text-center">I, A, 1</span>
                                            </button>

                                            {/* Paren: 1) a) i) */}
                                            <button
                                                type="button"
                                                className="flex flex-col items-start gap-1 p-1.5 hover:bg-muted/70 rounded-lg border border-transparent hover:border-border/50 transition-colors w-[60px]"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => handleSelectOrderedListStyle('paren')}
                                            >
                                                <div className="flex flex-col gap-[3px] opacity-70 w-full">
                                                    <div className="flex items-center gap-1"><span className="text-[9px] font-medium w-3 text-right">1)</span><div className="h-[2px] w-full bg-current rounded-full opacity-60" /></div>
                                                    <div className="flex items-center gap-1 pl-1.5"><span className="text-[9px] font-medium w-3 text-right">a)</span><div className="h-[2px] w-full bg-current rounded-full opacity-60" /></div>
                                                    <div className="flex items-center gap-1 pl-3"><span className="text-[9px] font-medium w-3 text-right">i)</span><div className="h-[2px] w-full bg-current rounded-full opacity-60" /></div>
                                                </div>
                                                <span className="text-[9px] text-muted-foreground mt-0.5 w-full text-center">1), a), i)</span>
                                            </button>

                                            {/* Outline: A. 1. a. */}
                                            <button
                                                type="button"
                                                className="flex flex-col items-start gap-1 p-1.5 hover:bg-muted/70 rounded-lg border border-transparent hover:border-border/50 transition-colors w-[60px]"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => handleSelectOrderedListStyle('outline')}
                                            >
                                                <div className="flex flex-col gap-[3px] opacity-70 w-full">
                                                    <div className="flex items-center gap-1"><span className="text-[9px] font-medium w-3 text-right">A.</span><div className="h-[2px] w-full bg-current rounded-full opacity-60" /></div>
                                                    <div className="flex items-center gap-1 pl-1.5"><span className="text-[9px] font-medium w-3 text-right">1.</span><div className="h-[2px] w-full bg-current rounded-full opacity-60" /></div>
                                                    <div className="flex items-center gap-1 pl-3"><span className="text-[9px] font-medium w-3 text-right">a.</span><div className="h-[2px] w-full bg-current rounded-full opacity-60" /></div>
                                                </div>
                                                <span className="text-[9px] text-muted-foreground mt-0.5 w-full text-center">A, 1, a</span>
                                            </button>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Task / Checklist */}
                            <ToolbarTooltip label="Görev Listesi (Checklist)">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-8 w-8 ${editor.isActive('taskList') ? 'bg-muted' : ''}`}
                                    onClick={() => editor.chain().focus().toggleTaskList().run()}
                                >
                                    <MaterialIcon icon="checklist" size={16} />
                                </Button>
                            </ToolbarTooltip>

                            {/* Indent decrease / increase */}
                            <ToolbarTooltip label="Girintiyi Azalt">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => editor.chain().focus().smartOutdent().run()}
                                >
                                    <MaterialIcon icon="format_indent_decrease" size={16} />
                                </Button>
                            </ToolbarTooltip>
                            <ToolbarTooltip label="Girintiyi Artır">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => editor.chain().focus().smartIndent().run()}
                                >
                                    <MaterialIcon icon="format_indent_increase" size={16} />
                                </Button>
                            </ToolbarTooltip>
                        </div>

                        <Separator orientation="vertical" className="hidden sm:block h-6 mx-1 shrink-0" />

                        {/* Insert: Table, Link, Block Quote */}
                        <div className="flex items-center gap-0.5 shrink-0">
                            {/* Insert Table */}
                            <ToolbarTooltip label="Tablo Ekle">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setTableSelectorPosition({ x: rect.left, y: rect.bottom + 5 });
                                        setShowTableSelector(true);
                                    }}
                                >
                                    <MaterialIcon icon="table_chart" size={16} />
                                </Button>
                            </ToolbarTooltip>

                            {/* Link */}
                            <ToolbarTooltip label="Link Ekle/Düzenle">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-8 w-8 ${editor.isActive('link') ? 'bg-muted' : ''}`}
                                    onClick={() => promptSetLink(editor)}
                                >
                                    <MaterialIcon icon="link" size={16} />
                                </Button>
                            </ToolbarTooltip>

                            {/* Block Quote / 2cm indent */}
                            <ToolbarTooltip label="Blok Alıntı (2cm sol+sağ girinti)">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-8 w-8 ${editor.isActive('blockquote') ? 'bg-muted' : ''}`}
                                    onClick={() => {
                                        const CM_PX = Math.round(37.7953 * 2); // 2cm in px
                                        const b = getActiveLayoutBlock(editor);
                                        if (!b) return;
                                        const left = parseInt(String(b.attrs.marginLeft ?? 0), 10);
                                        const already = left === CM_PX;
                                        editor.chain().focus()
                                            .updateAttributes(b.name, {
                                                marginLeft: already ? 0 : CM_PX,
                                                marginRight: already ? 0 : CM_PX,
                                            })
                                            .run();
                                    }}
                                >
                                    <MaterialIcon icon="format_quote" size={16} />
                                </Button>
                            </ToolbarTooltip>
                        </div>

                        <Separator orientation="vertical" className="hidden sm:block h-6 mx-1 shrink-0" />

                        {/* Spellcheck Toggle */}
                        <div className="flex items-center gap-0.5 shrink-0">
                            <ToolbarTooltip label={isSpellCheckEnabled ? 'Yazım Denetimi Açık' : 'Yazım Denetimi Kapalı'}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-8 w-8 transition-colors ${isSpellCheckEnabled ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
                                    onClick={toggleSpellCheck}
                                >
                                    <MaterialIcon icon="spellcheck" size={16} />
                                </Button>
                            </ToolbarTooltip>

                            {onToggleLineNumbers != null && (
                                <ToolbarTooltip
                                    label={
                                        showLineNumbers
                                            ? 'Satır Numaraları'
                                            : 'Satır Numaraları'
                                    }
                                >
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={`h-8 w-8 transition-colors ${showLineNumbers ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
                                        onClick={onToggleLineNumbers}
                                        aria-pressed={showLineNumbers}
                                    >
                                        <MaterialIcon icon="vertical_split" size={16} />
                                    </Button>
                                </ToolbarTooltip>
                            )}

                            {/* Ruler Toggle */}
                            <ToolbarTooltip label={showRuler ? 'Cetveli Gizle' : 'Cetveli Göster'}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-8 w-8 transition-colors ${showRuler ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
                                    onClick={onToggleRuler}
                                >
                                    <MaterialIcon icon="straighten" size={16} />
                                </Button>
                            </ToolbarTooltip>
                        </div>
                    </div>
                </div>

                {
                    showTableSelector && tableSelectorPosition && (
                        <TableSelector
                            position={tableSelectorPosition}
                            onSelect={(rows, cols) => {
                                if (editor) {
                                    editor
                                        .chain()
                                        .focus()
                                        .insertTable({ rows, cols, withHeaderRow: true })
                                        .run();
                                }
                                setShowTableSelector(false);
                            }}
                            onClose={() => setShowTableSelector(false)}
                        />
                    )
                }
            </div>
        </TooltipProvider>
    );
};

export default EditorToolbar;
