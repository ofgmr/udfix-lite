import React, { useEffect } from 'react';
import MaterialIcon from '../ui/MaterialIcon';
import { useDebouncedFlyoutSearchQuery } from '../../hooks/useDebouncedFlyoutSearchQuery';

type FlyoutSearchInputProps = {
    inputRef: React.RefObject<HTMLInputElement | null>;
    icon: string;
    placeholder: string;
    title: string;
    ariaLabel: string;
    onQueryChange?: () => void;
    onDraftChange?: (draft: string) => void;
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
};

export const FlyoutSearchInput: React.FC<FlyoutSearchInputProps> = ({
    inputRef,
    icon,
    placeholder,
    title,
    ariaLabel,
    onQueryChange,
    onDraftChange,
    onKeyDown,
}) => {
    const { draft, setQuery, flush } = useDebouncedFlyoutSearchQuery();

    useEffect(() => {
        onDraftChange?.(draft);
    }, [draft, onDraftChange]);

    return (
        <div className="relative group flex-1">
            <MaterialIcon
                icon={icon}
                size={16}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary z-10 pointer-events-none"
            />
            <input
                ref={inputRef}
                type="text"
                placeholder={placeholder}
                title={title}
                aria-label={ariaLabel}
                className="w-full pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 focus:border-primary/30 transition-all rounded-lg shadow-inner text-sm outline-none"
                value={draft}
                onChange={(event) => {
                    setQuery(event.target.value);
                    onQueryChange?.();
                }}
                onKeyDown={onKeyDown}
                onBlur={flush}
            />
        </div>
    );
};
