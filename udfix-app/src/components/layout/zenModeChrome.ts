import { cn } from '../../lib/utils';

/** Zen açıkken sol/sağ ray üstündeki ikincil kontrolleri gizler; alt footer (zen + tema) kalır. */
export function layoutRailZenCollapseClassName(zenMode: boolean) {
    return cn(
        'flex flex-col items-center gap-2 transition-all duration-300 ease-out',
        zenMode
            ? 'max-h-0 overflow-hidden opacity-0 pointer-events-none -translate-y-1'
            : 'max-h-[480px] overflow-visible opacity-100 translate-y-0',
    );
}

/** Zen toggle: aktifken belirgin primary glow. */
export function zenModeToggleButtonClassName(active: boolean) {
    return cn(
        'relative rounded-xl w-10 h-10 border transition-all duration-300',
        active
            ? [
                  'border-primary/60 bg-primary/20 text-primary',
                  'shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_35%,transparent),0_0_24px_color-mix(in_srgb,var(--primary)_40%,transparent)]',
                  'ring-2 ring-primary/25',
              ]
            : 'border-transparent text-muted-foreground hover:bg-accent/80 hover:text-foreground hover:border-border/60',
    );
}

/** Ana çalışma alanı kökü — zen’de kenar boşlukları ve panel çerçeveleri sadeleşir. */
export function zenWorkspaceRootClassName(zenMode: boolean, className?: string) {
    return cn(className, zenMode && 'zen-workspace');
}

export function zenWorkspaceCenterClassName(zenMode: boolean) {
    return cn(
        'flex-1 flex overflow-hidden relative min-w-0 transition-all duration-300 ease-out',
        zenMode && 'min-w-0',
    );
}

export function zenWorkspaceDockAreaClassName(zenMode: boolean) {
    return cn(
        'flex-1 flex flex-row overflow-hidden relative transition-[padding,gap] duration-300 ease-out min-w-0',
        zenMode ? 'p-1 gap-0' : 'p-4 gap-4',
    );
}

export function zenWorkspaceDockShellClassName(zenMode: boolean) {
    return cn(
        'flex-1 relative overflow-hidden min-w-0 transition-all duration-300 ease-out',
        zenMode
            ? 'rounded-lg border border-border/30 shadow-none'
            : 'rounded-2xl overflow-hidden shadow-2xl border border-white/5',
    );
}

/** `leftDockOpen`: dosya gezgini veya (ileride) sol yan panel açıkken true. */
export function zenWorkspaceLeftDockClassName(zenMode: boolean, leftDockOpen: boolean) {
    return cn(
        'shrink-0 z-50 h-full flex flex-col justify-center transition-all duration-300 ease-out',
        zenMode || !leftDockOpen
            ? 'w-0 pl-0 py-0 overflow-hidden opacity-0 pointer-events-none'
            : 'w-auto pl-4 py-4 gap-3 flex-row items-stretch',
    );
}

export function zenWorkspaceRightRailClassName(zenMode: boolean) {
    return cn(
        'shrink-0 z-50 h-full flex flex-col justify-center transition-all duration-300 ease-out overflow-hidden',
        zenMode ? 'w-0 opacity-0 pointer-events-none' : '',
    );
}
