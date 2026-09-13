import React, { useEffect } from 'react';
import MaterialIcon from './MaterialIcon';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { cn } from '../../lib/utils';
import { useShowUserGuidanceLabels } from '../../hooks/useShowUserGuidanceLabels';
import { pushEditorPreferenceToggle } from '../../preferences/pushEditorPreferences';

/** Left/right rail width when guidance labels are visible. */
export const GUIDANCE_RAIL_WIDTH_CLASS = 'w-[4.75rem]';

const MAX_LABEL_LINE_CHARS = 11;

/** One display line per word; break only very long single tokens. */
function labelLines(text: string): string[] {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    for (const word of words) {
        if (word.length <= MAX_LABEL_LINE_CHARS) {
            lines.push(word);
            continue;
        }
        const mid = Math.ceil(word.length / 2);
        lines.push(word.slice(0, mid), word.slice(mid));
    }
    return lines;
}

export function GuidanceRailLabel({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    const text = typeof children === 'string' ? children.trim() : String(children).trim();
    const lines = labelLines(text);

    return (
        <span className={cn('guidance-rail-label', className)} aria-hidden="true">
            {lines.map((line, lineIndex) => (
                <span key={`${line}-${lineIndex}`} className="guidance-rail-label__line">
                    {line}
                </span>
            ))}
        </span>
    );
}

export function guidanceRailSurfaceClass(
    active: boolean,
    showGuidance: boolean,
    className?: string,
    activeVariant: 'solid' | 'subtle' = 'solid',
) {
    return cn(
        'rounded-xl border transition-all duration-200',
        showGuidance ? 'guidance-rail-btn guidance-rail-btn--expanded' : 'h-10 w-10 flex items-center justify-center',
        active
            ? activeVariant === 'subtle'
                ? 'text-primary bg-primary/10 border-primary/25 shadow-none'
                : 'bg-primary text-primary-foreground border-primary/40 shadow-md shadow-primary/15'
            : 'bg-transparent text-muted-foreground border-transparent hover:bg-accent/80 hover:text-foreground hover:border-border/50',
        className,
    );
}

export function GuidanceRailButtonContent({
    label,
    showGuidance,
    icon,
    iconSize = 22,
    iconNode,
    iconRowClassName,
}: {
    label?: string;
    showGuidance: boolean;
    icon?: string;
    iconSize?: number;
    iconNode?: React.ReactNode;
    iconRowClassName?: string;
}) {
    const iconContent =
        iconNode ?? (icon ? <MaterialIcon icon={icon} size={iconSize} className="shrink-0" /> : null);

    if (!showGuidance) return iconContent;

    return (
        <>
            <span className={cn('guidance-rail-btn__icon', iconRowClassName)}>{iconContent}</span>
            {label ? (
                <span className="guidance-rail-btn__label-zone">
                    <GuidanceRailLabel>{label}</GuidanceRailLabel>
                </span>
            ) : null}
        </>
    );
}

export function GuidanceRailButton({
    icon,
    label,
    shortcut,
    active = false,
    onClick,
    className,
    iconSize = 22,
}: {
    icon: string;
    label: string;
    shortcut?: string;
    active?: boolean;
    onClick: () => void;
    className?: string;
    iconSize?: number;
}) {
    const showGuidance = useShowUserGuidanceLabels();
    const tooltip = shortcut ? `${label} (${shortcut})` : label;

    const button = (
        <button
            type="button"
            title={tooltip}
            aria-label={tooltip}
            onClick={onClick}
            className={guidanceRailSurfaceClass(active, showGuidance, className)}
        >
            <GuidanceRailButtonContent
                showGuidance={showGuidance}
                label={label}
                icon={icon}
                iconSize={iconSize}
            />
        </button>
    );

    if (showGuidance) return button;

    return (
        <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="right">
                <p>{tooltip}</p>
            </TooltipContent>
        </Tooltip>
    );
}

export function UserGuidanceRoot() {
    const show = useShowUserGuidanceLabels();

    useEffect(() => {
        document.documentElement.dataset.userGuidance = show ? 'true' : 'false';
        return () => {
            delete document.documentElement.dataset.userGuidance;
        };
    }, [show]);

    return null;
}

export function UserGuidanceFlyoutButton({ className }: { className?: string }) {
    const showGuidance = useShowUserGuidanceLabels();

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-pressed={showGuidance}
                    className={cn(
                        'h-8 w-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground',
                        showGuidance && 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
                        className,
                    )}
                    title={showGuidance ? 'Rehber modunu kapat' : 'Rehber modunu aç'}
                    aria-label={showGuidance ? 'Rehber modunu kapat' : 'Rehber modunu aç'}
                    onClick={() => {
                        void pushEditorPreferenceToggle({ showUserGuidanceLabels: !showGuidance });
                    }}
                >
                    <MaterialIcon icon="label" size={18} />
                    <span className="sr-only">Kullanıcı rehberi</span>
                </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
                <p>{showGuidance ? 'Rehber modunu kapat' : 'Rehber modu'}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground"> Buton etiketleri</p>
            </TooltipContent>
        </Tooltip>
    );
}
