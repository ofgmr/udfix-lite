import React, { useEffect, useState } from 'react';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Button } from '../../components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../../components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../../components/ui/tooltip';
import { cn } from '../../lib/utils';
import {
    getDefaultHighlightColor,
    HIGHLIGHT_LEMON_HEX,
    subscribeToDefaultHighlightColor,
} from '../../utils/editorHighlight';

export { HIGHLIGHT_LEMON_HEX };

interface ColorPickerProps {
    color: string;
    onChange: (color: string) => void;
    label?: string;
    mode?: 'text' | 'highlight';
    /** Highlight mode: icon click applies the last/default swatch without opening the palette. */
    onApplyDefault?: () => void;
}

type TextColorDef = { value: string; label: string; class: string; yinYang?: boolean };

const TEXT_COLORS: TextColorDef[] = [
    { value: 'var(--editor-text)', label: 'Standart', class: 'bg-black dark:bg-white', yinYang: true },
    { value: 'var(--legal-navy)', label: 'Navy Blue', class: 'bg-[var(--legal-navy)] dark:bg-[var(--legal-navy-bright)]' },
    { value: 'var(--legal-crimson)', label: 'Crimson Red', class: 'bg-[var(--legal-crimson)] dark:bg-[var(--legal-crimson-bright)]' },
];

const HIGHLIGHT_COLORS = [
    { value: '#ffffff', label: 'None', class: 'bg-white border border-gray-200' },
    { value: '#E9806E', label: 'Terra Cotta', class: 'bg-[#E9806E]' },
    { value: '#C59B76', label: 'Sand', class: 'bg-[#C59B76]' },
    { value: '#C0C781', label: 'Sage', class: 'bg-[#C0C781]' },
    { value: '#78BC61', label: 'Leaf', class: 'bg-[#78BC61]' },
    { value: HIGHLIGHT_LEMON_HEX, label: 'Lemon', class: 'bg-[#F6FEAA]' },
];

type ColorSwatch = { value: string; label: string; class: string; yinYang?: boolean };

const ColorPicker: React.FC<ColorPickerProps> = ({
    color,
    onChange,
    label,
    mode = 'text',
    onApplyDefault,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [defaultHighlight, setDefaultHighlight] = useState(getDefaultHighlightColor);
    const colors: ColorSwatch[] = mode === 'text' ? TEXT_COLORS : HIGHLIGHT_COLORS;
    const isHighlight = mode === 'highlight';
    const splitHighlight = isHighlight && Boolean(onApplyDefault);

    useEffect(() => {
        if (!isHighlight) return;
        return subscribeToDefaultHighlightColor(setDefaultHighlight);
    }, [isHighlight]);

    const handleColorSelect = (newColor: string) => {
        onChange(newColor);
        setIsOpen(false);
    };

    const displayColor = color || (mode === 'text' ? '#000000' : '#ffffff');
    const highlightBarColor =
        color && color !== '#ffffff' ? color : defaultHighlight;

    const swatches = (
        <PopoverContent className="w-auto p-3" align="start">
            <div className="flex gap-2">
                {colors.map((c) => {
                    const isYinYang = Boolean(c.yinYang);
                    return (
                        <TooltipProvider key={c.value}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => handleColorSelect(c.value)}
                                        className={cn(
                                            'relative w-6 h-6 rounded-full cursor-pointer transition-transform hover:scale-110 focus:outline-none flex items-center justify-center',
                                            !isYinYang && c.class,
                                            isYinYang && 'border border-border bg-muted/50',
                                            color === c.value && 'ring-2 ring-primary ring-offset-2',
                                        )}
                                    >
                                        {isYinYang ? (
                                            <MaterialIcon icon="contrast" size={18} className="text-foreground" />
                                        ) : null}
                                        {color === c.value && (
                                            <MaterialIcon
                                                icon="check"
                                                size={14}
                                                className={cn(
                                                    'text-white',
                                                    !isYinYang && c.value === '#ffffff' && 'text-black',
                                                    !isYinYang && c.value === HIGHLIGHT_LEMON_HEX && 'text-black',
                                                    isYinYang && 'absolute drop-shadow-sm text-primary',
                                                )}
                                            />
                                        )}
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{c.label}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    );
                })}
            </div>
        </PopoverContent>
    );

    if (splitHighlight) {
        return (
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <TooltipProvider>
                    <div className="flex items-center">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    className="w-8 h-8 p-0 rounded-md shrink-0"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => onApplyDefault?.()}
                                    aria-label={label || 'Vurgu'}
                                >
                                    <div className="flex flex-col items-center justify-center">
                                        <MaterialIcon icon="highlight" size={18} />
                                        <div
                                            className="h-1 w-5 mt-0.5 rounded-full"
                                            style={{ backgroundColor: highlightBarColor }}
                                        />
                                    </div>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{label || 'Vurgu'}</p>
                            </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        className="h-8 w-4 p-0 rounded-md shrink-0"
                                        onMouseDown={(e) => e.preventDefault()}
                                        aria-label="Vurgu rengi"
                                    >
                                        <MaterialIcon icon="arrow_drop_down" size={14} className="opacity-70" />
                                    </Button>
                                </PopoverTrigger>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Vurgu rengi</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </TooltipProvider>
                {swatches}
            </Popover>
        );
    }

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                className="w-8 h-8 p-0 rounded-md shrink-0"
                                onMouseDown={(e) => e.preventDefault()}
                            >
                                <div className="flex flex-col items-center justify-center">
                                    <MaterialIcon
                                        icon={isHighlight ? 'highlight' : 'format_color_text'}
                                        size={isHighlight ? 18 : 20}
                                        style={mode === 'text' ? { color: displayColor } : undefined}
                                    />
                                    {isHighlight && (
                                        <div
                                            className="h-1 w-5 mt-0.5 rounded-full"
                                            style={{
                                                backgroundColor:
                                                    displayColor !== '#ffffff' ? displayColor : 'transparent',
                                            }}
                                        />
                                    )}
                                </div>
                            </Button>
                        </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{label || 'Select Color'}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
            {swatches}
        </Popover>
    );
};

export default ColorPicker;
