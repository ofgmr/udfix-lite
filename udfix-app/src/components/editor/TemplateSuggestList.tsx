import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { cn } from '../../lib/utils';
import MaterialIcon from '../ui/MaterialIcon';
import type { TextTemplateHashSuggestItem } from '../../services/dataService';

export type TemplateSuggestListRef = { onKeyDown: (event: KeyboardEvent) => boolean };

const categoryLabel = (c: string) => {
    switch (c) {
        case 'PETITION':
            return 'Dilekçe';
        case 'CONTRACT':
            return 'Sözleşme';
        case 'LETTER':
            return 'Yazı';
        case 'CLAUSE':
            return 'Fıkra / madde';
        case 'DEFINITION':
            return 'Tanım';
        case 'PROCEDURE':
            return 'Prosedür';
        case 'LEGISLATION':
            return 'Kanun / yönetmelik';
        default:
            return 'Özel';
    }
};

type Props = { items: TextTemplateHashSuggestItem[]; command: (row: TextTemplateHashSuggestItem) => void };

/**
 * Faz 1: ## öneri açılır penceresi (Faz 3’te Ctrl+K ile büyük palete köprü).
 */
export const TemplateSuggestList = forwardRef<TemplateSuggestListRef, Props>(({ items, command }, ref) => {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        setIndex(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
        onKeyDown: (event: KeyboardEvent) => {
            if (event.key === 'ArrowDown') {
                if (!items.length) return false;
                setIndex((i) => (i + 1) % items.length);
                return true;
            }
            if (event.key === 'ArrowUp') {
                if (!items.length) return false;
                setIndex((i) => (i + items.length - 1) % items.length);
                return true;
            }
            if (event.key === 'Enter') {
                if (items[index]) {
                    event.preventDefault();
                    command(items[index]!);
                }
                return true;
            }
            return false;
        },
    }));

    if (!items.length) {
        return (
            <div className="rounded-xl border border-white/10 bg-background/60 text-foreground backdrop-blur-xl px-3 py-2 text-xs text-muted-foreground w-64 shadow-2xl">
                Eşleşen şablon veya not yok
            </div>
        );
    }

    return (
        <div className="w-64 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-background/60 text-foreground backdrop-blur-xl shadow-2xl py-1 custom-scrollbar text-left flex flex-col">
            {items.map((item, i) => (
                <button
                    key={item.kind === 'template' ? `t-${item.id}` : `n-${item.id}`}
                    type="button"
                    className={cn(
                        'flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors',
                        i === index
                            ? 'bg-white/10 text-foreground'
                            : 'text-foreground/80 hover:bg-white/5'
                    )}
                    onClick={() => command(item)}
                >
                    <MaterialIcon
                        icon={item.kind === 'template' ? 'stylus_note' : 'edit_note'}
                        size={18}
                        className={cn(
                            'mt-0.5 shrink-0',
                            item.kind === 'template' ? 'text-amber-600 dark:text-amber-400/90' : 'text-primary/80'
                        )}
                    />
                    <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                            {item.kind === 'template' ? item.name : item.label}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {item.kind === 'template' ? categoryLabel(item.category) : 'Not'}
                        </span>
                        {item.kind === 'template' && item.description ? (
                            <span className="line-clamp-2 block text-[11px] text-muted-foreground/80 mt-0.5">
                                {item.description}
                            </span>
                        ) : null}
                    </span>
                </button>
            ))}
            <div className="border-t border-white/10 px-2.5 py-1.5 text-[10px] text-muted-foreground/80 mt-auto shrink-0">
                Büyük kütüphane: <kbd className="rounded border border-white/10 bg-white/5 px-1">Ctrl</kbd>+
                <kbd className="rounded border border-white/10 bg-white/5 px-1">Shift</kbd>+
                <kbd className="rounded border border-white/10 bg-white/5 px-1">K</kbd> veya palet → Şablonlar
            </div>
        </div>
    );
});
TemplateSuggestList.displayName = 'TemplateSuggestList';
