import { cn } from '../../lib/utils';

/** Sol (TopToolbar) ve sağ (RightActivityBar) şeritlerinin ortak dış çerçevesi. */
export const LAYOUT_RAIL_FRAME =
    'rounded-xl border border-border/50 bg-background/70 backdrop-blur-md shadow-sm';

export function layoutRailOuterClassName(options: { className?: string } = {}) {
    const { className } = options;
    return cn(LAYOUT_RAIL_FRAME, 'relative flex flex-col transition-shadow duration-300', className);
}
