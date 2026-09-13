import React, { useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import MaterialIcon from './MaterialIcon';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from './command';

export type SearchableEntityOption = {
    value: string;
    label: string;
    /** Extra searchable text (file no, role hint, …) */
    keywords?: string;
};

export type SearchableEntitySelectProps = {
    value: string;
    onValueChange: (value: string) => void;
    options: SearchableEntityOption[];
    placeholder?: string;
    noneLabel?: string;
    allowNone?: boolean;
    /** Cap DOM nodes — type-to-search filters first, then slice */
    maxResults?: number;
    disabled?: boolean;
    className?: string;
    triggerClassName?: string;
    contentClassName?: string;
    /** Raise above Cmd+K / calendar popover when needed */
    contentZClassName?: string;
};

function normalizeSearch(s: string): string {
    return s.trim().toLocaleLowerCase('tr');
}

/**
 * Type-to-search entity picker. Avoids mounting full Select lists (lag with large matters/parties).
 */
export function SearchableEntitySelect({
    value,
    onValueChange,
    options,
    placeholder = 'Seç…',
    noneLabel = 'Yok',
    allowNone = true,
    maxResults = 60,
    disabled,
    className,
    triggerClassName,
    contentClassName,
    contentZClassName = 'z-[var(--z-command-palette-floating)]',
}: SearchableEntitySelectProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const selectedLabel = useMemo(() => {
        if (!value) return null;
        return options.find((o) => o.value === value)?.label ?? null;
    }, [options, value]);

    const filtered = useMemo(() => {
        const q = normalizeSearch(query);
        const list = !q
            ? options
            : options.filter((o) => {
                  const hay = normalizeSearch(`${o.label} ${o.keywords ?? ''} ${o.value}`);
                  return hay.includes(q);
              });
        const sliced = list.slice(0, maxResults);
        if (value) {
            const selected = options.find((o) => o.value === value);
            if (selected && !sliced.some((o) => o.value === value)) {
                return [selected, ...sliced.slice(0, Math.max(0, maxResults - 1))];
            }
        }
        return sliced;
    }, [options, query, maxResults, value]);

    const truncated = filtered.length >= maxResults && options.length > maxResults;

    return (
        <div className={cn('w-full', className)}>
            <Popover
                open={open}
                onOpenChange={(next) => {
                    setOpen(next);
                    if (!next) setQuery('');
                }}
            >
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={disabled}
                        role="combobox"
                        aria-expanded={open}
                        className={cn(
                            'h-8 w-full justify-between gap-2 px-2.5 text-xs font-normal',
                            !selectedLabel && 'text-muted-foreground',
                            triggerClassName,
                        )}
                    >
                        <span className="truncate text-left">
                            {selectedLabel || placeholder}
                        </span>
                        <MaterialIcon icon="expand_more" size={16} className="shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    variant="glass"
                    align="start"
                    className={cn(
                        'w-[var(--radix-popover-trigger-width)] min-w-[220px] p-0',
                        contentZClassName,
                        contentClassName,
                    )}
                    onOpenAutoFocus={(e) => {
                        // Keep focus on search input (cmdk handles it)
                        e.preventDefault();
                        const root = e.currentTarget as HTMLElement;
                        root.querySelector<HTMLInputElement>('[cmdk-input]')?.focus();
                    }}
                >
                    <Command shouldFilter={false} className="border-0 bg-transparent shadow-none">
                        <CommandInput
                            placeholder="Ara…"
                            value={query}
                            onValueChange={setQuery}
                            className="h-9 text-xs"
                        />
                        <CommandList className="max-h-[220px]">
                            <CommandEmpty className="py-4 text-xs">Sonuç yok</CommandEmpty>
                            <CommandGroup>
                                {allowNone ? (
                                    <CommandItem
                                        value="__none__"
                                        className="text-xs"
                                        onSelect={() => {
                                            onValueChange('');
                                            setOpen(false);
                                            setQuery('');
                                        }}
                                    >
                                        <MaterialIcon
                                            icon={!value ? 'check' : 'remove'}
                                            size={14}
                                            className={cn('mr-2 shrink-0', !value ? 'opacity-100' : 'opacity-0')}
                                        />
                                        {noneLabel}
                                    </CommandItem>
                                ) : null}
                                {filtered.map((opt) => {
                                    const selected = opt.value === value;
                                    return (
                                        <CommandItem
                                            key={opt.value}
                                            value={opt.value}
                                            className="text-xs"
                                            onSelect={() => {
                                                onValueChange(opt.value);
                                                setOpen(false);
                                                setQuery('');
                                            }}
                                        >
                                            <MaterialIcon
                                                icon="check"
                                                size={14}
                                                className={cn(
                                                    'mr-2 shrink-0',
                                                    selected ? 'opacity-100' : 'opacity-0',
                                                )}
                                            />
                                            <span className="truncate">{opt.label}</span>
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                            {truncated && query.trim() ? (
                                <p className="border-t border-border/50 px-2 py-1.5 text-[10px] text-muted-foreground">
                                    İlk {maxResults} sonuç — aramayı daraltın
                                </p>
                            ) : null}
                            {truncated && !query.trim() ? (
                                <p className="border-t border-border/50 px-2 py-1.5 text-[10px] text-muted-foreground">
                                    İlk {maxResults} kayıt — yazarak arayın
                                </p>
                            ) : null}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
}
