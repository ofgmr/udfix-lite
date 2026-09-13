import { useEffect, useRef } from 'react';
import { useThemeStore, THEME_PALETTES, type ThemeMode, type ThemePalette } from '../../stores/useThemeStore';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from './dropdown-menu';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { Separator } from './separator';
import MaterialIcon from './MaterialIcon';
import { cn } from '../../lib/utils';
import { useDelayedHoverReveal } from '../../hooks/useDelayedHoverReveal';
import { RailSideFlyout } from '../layout/RailSideFlyout';
import { useShowUserGuidanceLabels } from '../../hooks/useShowUserGuidanceLabels';
import { UserGuidanceFlyoutButton, GuidanceRailButtonContent, guidanceRailSurfaceClass } from './userGuidance';

function SplitCircle({ light, dark, size = 28 }: { light: string; dark: string; size?: number }) {
    const r = size / 2;
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
            <path d={`M ${r},0 A ${r},${r} 0 0,0 ${r},${size} Z`} fill={light} />
            <path d={`M ${r},0 A ${r},${r} 0 0,1 ${r},${size} Z`} fill={dark} />
            <line x1={r} y1="0" x2={r} y2={size} stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" />
        </svg>
    );
}

const MODE_OPTIONS: { value: ThemeMode; icon: string; label: string }[] = [
    { value: 'light', icon: 'light_mode', label: 'Açık' },
    { value: 'dark', icon: 'dark_mode', label: 'Koyu' },
    { value: 'system', icon: 'laptop', label: 'Sistem' },
];

interface ThemePickerProps {
    onSideFlyoutOpenChange?: (open: boolean) => void;
}

export function ThemePicker({ onSideFlyoutOpenChange }: ThemePickerProps) {
    const { palette, mode, setPalette, setMode, applyTheme } = useThemeStore();
    const showGuidance = useShowUserGuidanceLabels();
    const themeAnchorRef = useRef<HTMLDivElement>(null);
    const {
        visible: showGuidanceFlyout,
        bind: guidanceFlyoutBind,
        panelBind: guidancePanelBind,
    } = useDelayedHoverReveal();

    useEffect(() => {
        applyTheme();
    }, [applyTheme]);

    useEffect(() => {
        if (mode !== 'system') return;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => applyTheme();
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [mode, applyTheme]);

    useEffect(() => {
        onSideFlyoutOpenChange?.(showGuidanceFlyout);
    }, [onSideFlyoutOpenChange, showGuidanceFlyout]);

    const currentMeta = THEME_PALETTES.find((p) => p.id === palette) ?? THEME_PALETTES[0];
    const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const currentModeIcon = MODE_OPTIONS.find((m) => m.value === mode)?.icon ?? 'laptop';

    const themeIcon = (
        <span className="relative flex h-[22px] w-[22px] items-center justify-center">
            <SplitCircle light={currentMeta.lightAccent} dark={currentMeta.darkAccent} size={18} />
            <MaterialIcon
                icon={currentModeIcon}
                size={11}
                className="absolute -bottom-0.5 -right-0.5 text-muted-foreground"
            />
        </span>
    );

    return (
        <TooltipProvider>
            <div
                ref={themeAnchorRef}
                className={cn('relative w-full', showGuidance ? '' : 'h-9 w-9')}
                {...guidanceFlyoutBind}
            >
                <DropdownMenu>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size={showGuidance ? 'default' : 'icon'}
                                    className={cn(
                                        guidanceRailSurfaceClass(false, showGuidance),
                                        !showGuidance && 'h-9 w-9',
                                    )}
                                >
                                    <GuidanceRailButtonContent
                                        showGuidance={showGuidance}
                                        label="Tema Seçimi"
                                        iconNode={themeIcon}
                                    />
                                    <span className="sr-only">Tema</span>
                                </Button>
                            </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent className={cn(showGuidanceFlyout && 'hidden')}>
                            Tema: {currentMeta.name}
                        </TooltipContent>
                    </Tooltip>

                    <DropdownMenuContent
                        align="end"
                        sideOffset={8}
                        className="p-3 glass rounded-2xl border-border shadow-xl"
                        style={{ width: 200 }}
                    >
                        <div className="flex gap-1 bg-muted/40 rounded-xl p-1 mb-3">
                            {MODE_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => setMode(opt.value)}
                                    title={opt.label}
                                    className={cn(
                                        'flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150',
                                        mode === opt.value
                                            ? 'bg-background text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    <MaterialIcon icon={opt.icon} size={11} />
                                    <span>{opt.label}</span>
                                </button>
                            ))}
                        </div>

                        <Separator className="bg-border mb-3" />

                        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                            {THEME_PALETTES.map((p) => {
                                const isActive = palette === p.id;
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => setPalette(p.id as ThemePalette)}
                                        title={p.name}
                                        className={cn(
                                            'flex items-center justify-center rounded-full p-0.5 transition-all duration-150 cursor-pointer',
                                            isActive
                                                ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                                                : 'ring-1 ring-transparent hover:ring-border',
                                        )}
                                        style={{ width: 36, height: 36 }}
                                    >
                                        <SplitCircle light={p.lightAccent} dark={p.darkAccent} size={23} />
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-center text-[11px] text-muted-foreground mt-2 leading-tight">
                            {currentMeta.name}
                            <span className="ml-1 opacity-50">·</span>
                            <span className="ml-1 opacity-50">{isDark ? 'Koyu' : 'Açık'}</span>
                        </p>
                    </DropdownMenuContent>
                </DropdownMenu>

                <RailSideFlyout
                    open={showGuidanceFlyout}
                    anchorRef={themeAnchorRef}
                    panelBind={guidancePanelBind}
                >
                    <UserGuidanceFlyoutButton />
                </RailSideFlyout>
            </div>
        </TooltipProvider>
    );
}
