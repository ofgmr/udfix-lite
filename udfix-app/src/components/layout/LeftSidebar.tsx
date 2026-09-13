import React from 'react';
import { useLayoutStore } from '../../stores/useLayoutStore';
import MaterialIcon from '../ui/MaterialIcon';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { ThemePicker } from '../ui/ThemePicker';
import { cn } from '../../lib/utils';
import { zenModeToggleButtonClassName } from './zenModeChrome';
import { useThemeStore } from '../../stores/useThemeStore';
import { formatShortcutKeys } from '../../shortcuts/format';
import { getRegistryEntry } from '../../shortcuts/registry';
import { openCommandPalette } from './commandPaletteEvents';
import { NotificationBell } from './NotificationBell';
import { UDFIX_RAIL_LOGO_BY_THEME } from '../../branding/udfixBrandAssets';
import { useShowUserGuidanceLabels } from '../../hooks/useShowUserGuidanceLabels';
import { GuidanceRailButtonContent, guidanceRailSurfaceClass } from '../ui/userGuidance';

function getSystemPrefersDark() {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function useResolvedDarkMode() {
    const mode = useThemeStore((s) => s.mode);
    const [systemPrefersDark, setSystemPrefersDark] = React.useState(getSystemPrefersDark);

    React.useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);

        setSystemPrefersDark(mediaQuery.matches);
        mediaQuery.addEventListener('change', handleChange);

        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    return mode === 'dark' || (mode === 'system' && systemPrefersDark);
}

function UdfixRailLogo() {
    const palette = useThemeStore((s) => s.palette);
    const isDarkMode = useResolvedDarkMode();
    const showGuidance = useShowUserGuidanceLabels();
    const logoPair = UDFIX_RAIL_LOGO_BY_THEME[palette];
    const logoSrc = isDarkMode ? logoPair.dark : logoPair.light;
    const commandPaletteShortcut = formatShortcutKeys(getRegistryEntry('command-palette')!.combo);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    title={`Komut Paleti (${commandPaletteShortcut})`}
                    aria-label={`Komut Paleti (${commandPaletteShortcut})`}
                    onClick={() => openCommandPalette('search')}
                    className={cn(
                        'mb-0.5 flex w-full items-center justify-center rounded-xl border border-transparent bg-transparent p-0 transition-colors duration-200 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        showGuidance ? 'h-11 py-0.5' : 'h-24 w-10',
                    )}
                >
                    <img
                        src={logoSrc}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className={cn(
                            'pointer-events-none max-w-none -rotate-90 select-none object-contain opacity-90 drop-shadow-[0_4px_12px_color-mix(in_srgb,var(--primary)_24%,transparent)] transition-opacity duration-300',
                            showGuidance ? 'h-9 w-9' : 'h-14 w-14',
                        )}
                        draggable={false}
                    />
                </button>
            </TooltipTrigger>
            {!showGuidance ? (
                <TooltipContent side="right" className="max-w-[220px]">
                    <p>Komut Paleti</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{commandPaletteShortcut}</p>
                </TooltipContent>
            ) : null}
        </Tooltip>
    );
}

export function ZenModeToggle() {
    const isZenMode = useLayoutStore((s) => s.isZenMode);
    const toggleZenMode = useLayoutStore((s) => s.toggleZenMode);
    const showGuidance = useShowUserGuidanceLabels();

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-pressed={isZenMode}
                    data-zen-toggle
                    className={cn(
                        zenModeToggleButtonClassName(isZenMode),
                        showGuidance && cn(guidanceRailSurfaceClass(false, true), 'h-auto w-full !shadow-none'),
                    )}
                    onClick={toggleZenMode}
                >
                    <GuidanceRailButtonContent
                        showGuidance={showGuidance}
                        label="Odak Modu"
                        iconNode={
                            <MaterialIcon
                                icon="self_improvement"
                                size={22}
                                className={cn(isZenMode && 'drop-shadow-sm')}
                            />
                        }
                    />
                    <span className="sr-only">{isZenMode ? 'Odak modunu kapat' : 'Odak modu'}</span>
                </Button>
            </TooltipTrigger>
            {!showGuidance ? (
                <TooltipContent side="right" className="max-w-[220px]">
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                        {isZenMode ? 'Esc' : '⌘⇧M'}
                    </p>
                </TooltipContent>
            ) : null}
        </Tooltip>
    );
}

export function LeftSidebarFooter({
    className,
    onGuidanceFlyoutOpenChange,
}: {
    className?: string;
    onGuidanceFlyoutOpenChange?: (open: boolean) => void;
}) {
    const isZenMode = useLayoutStore((s) => s.isZenMode);
    const showGuidance = useShowUserGuidanceLabels();

    return (
        <div
            className={cn(
                'flex w-full shrink-0 flex-col items-center gap-2 border-t border-border/40 px-0.5 pb-1 pt-2',
                showGuidance && 'gap-1.5',
                className,
            )}
        >
            <UdfixRailLogo />
            <NotificationBell />
            <ZenModeToggle />
            <div className={cn('w-full transition-opacity duration-300', isZenMode && 'opacity-70 hover:opacity-100')}>
                <ThemePicker onSideFlyoutOpenChange={onGuidanceFlyoutOpenChange} />
            </div>
        </div>
    );
}

const LeftSidebar: React.FC = () => {
    return null;
};

export default LeftSidebar;
