import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { UYAP_YARGI_BIRIMLERI } from '../../services/dataService';
import { DataService } from '../../services/dataService';
import type { MatterMerci } from '../../services/dataService';
import { cn } from '../../lib/utils';

type Props = {
    merci: MatterMerci | '';
    value: string;
    onChange: (name: string) => void;
    disabled?: boolean;
    className?: string;
};

const YARGI_ALANI_ORDER = ['hukuk', 'ceza', 'icra', 'idari', 'arabuluculuk'] as const;
const YARGI_ALANI_LABELS: Record<(typeof YARGI_ALANI_ORDER)[number], string> = {
    hukuk: 'Hukuk',
    ceza: 'Ceza',
    icra: 'İcra',
    idari: 'İdari',
    arabuluculuk: 'Arabuluculuk',
};

export const MerciNameField: React.FC<Props> = ({ merci, value, onChange, disabled, className }) => {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);

    const groupedCourts = useMemo(() => {
        const groups = new Map<(typeof YARGI_ALANI_ORDER)[number], typeof UYAP_YARGI_BIRIMLERI>();
        for (const alan of YARGI_ALANI_ORDER) {
            const items = UYAP_YARGI_BIRIMLERI.filter((b) => b.yargiAlani === alan);
            if (items.length) groups.set(alan, items);
        }
        return groups;
    }, []);

    const courtSelectValue = useMemo(() => {
        if (!value.trim()) return '__none__';
        const match = UYAP_YARGI_BIRIMLERI.find((b) => b.label === value.trim());
        return match?.tablo ?? '__custom__';
    }, [value]);

    const fetchSuggestions = useMemo(
        () =>
            debounce(async (merciKey: MatterMerci, query: string) => {
                try {
                    const rows = await DataService.getMerciNameSuggestions(merciKey, query, 15);
                    setSuggestions(rows);
                } catch {
                    setSuggestions([]);
                }
            }, 200),
        [],
    );

    useEffect(() => {
        if (merci !== 'COURT' && merci) {
            void fetchSuggestions(merci, value);
        } else {
            setSuggestions([]);
        }
        return () => fetchSuggestions.cancel();
    }, [merci, value, fetchSuggestions]);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) {
                setOpen(false);
                setActiveIndex(-1);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    const pickSuggestion = useCallback(
        (name: string) => {
            onChange(name);
            setOpen(false);
            setActiveIndex(-1);
        },
        [onChange],
    );

    const onComboboxKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && suggestions[activeIndex]) {
                pickSuggestion(suggestions[activeIndex]!);
            } else {
                setOpen(false);
            }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
            return;
        }
        if (e.key === 'Escape') {
            setOpen(false);
            setActiveIndex(-1);
        }
    };

    if (!merci) {
        return (
            <div className={className}>
                <Label className="text-[9px] text-muted-foreground uppercase tracking-widest opacity-80">
                    Merci Adı
                </Label>
                <Input disabled placeholder="Önce merci seçin" className="h-7 text-xs glass-input mt-1" />
            </div>
        );
    }

    if (merci === 'COURT') {
        return (
            <div className={className}>
                <Label className="text-[9px] text-muted-foreground uppercase tracking-widest opacity-80">
                    Merci Adı
                </Label>
                <Select
                    value={courtSelectValue}
                    onValueChange={(v) => {
                        if (v === '__none__') {
                            onChange('');
                            return;
                        }
                        if (v === '__custom__') return;
                        const birim = UYAP_YARGI_BIRIMLERI.find((b) => b.tablo === v);
                        onChange(birim?.label ?? '');
                    }}
                    disabled={disabled}
                >
                    <SelectTrigger className="h-7 text-xs glass-input py-0 mt-1">
                        <SelectValue placeholder="Mahkeme türü seçin" />
                    </SelectTrigger>
                    <SelectContent className="glass max-h-64">
                        <SelectItem value="__none__" className="text-xs">
                            —
                        </SelectItem>
                        {courtSelectValue === '__custom__' && value.trim() ? (
                            <SelectItem value="__custom__" className="text-xs">
                                {value.trim()}
                            </SelectItem>
                        ) : null}
                        {[...groupedCourts.entries()].map(([alan, items]) => (
                            <React.Fragment key={alan}>
                                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {YARGI_ALANI_LABELS[alan]}
                                </div>
                                {items.map((b) => (
                                    <SelectItem key={b.tablo} value={b.tablo} className="text-xs">
                                        {b.label}
                                    </SelectItem>
                                ))}
                            </React.Fragment>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        );
    }

    const filtered = suggestions.filter((s) =>
        !value.trim() ? true : s.toLowerCase().includes(value.trim().toLowerCase()),
    );

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            <Label className="text-[9px] text-muted-foreground uppercase tracking-widest opacity-80">
                Merci Adı
            </Label>
            <Input
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                    setOpen(true);
                    setActiveIndex(-1);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={onComboboxKeyDown}
                disabled={disabled}
                placeholder="Kurum adı yazın…"
                className="h-7 text-xs glass-input mt-1"
                autoComplete="off"
            />
            {open && filtered.length > 0 ? (
                <ul className="absolute z-50 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-white/10 bg-popover/95 py-1 shadow-lg backdrop-blur-xl">
                    {filtered.map((name, idx) => (
                        <li key={name}>
                            <button
                                type="button"
                                className={cn(
                                    'w-full px-2 py-1.5 text-left text-xs hover:bg-accent/70',
                                    idx === activeIndex && 'bg-accent/70',
                                )}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    pickSuggestion(name);
                                }}
                            >
                                {name}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
};

export default MerciNameField;
