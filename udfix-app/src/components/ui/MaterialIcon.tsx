import React from 'react';
import { cn } from '../../lib/utils';

interface MaterialIconProps {
    /**
     * The Material Symbol icon name (e.g., 'folder_open', 'search', 'settings')
     */
    icon: string;

    /**
     * Size of the icon in pixels
     * @default 24
     */
    size?: number;

    /**
     * Additional CSS classes
     */
    className?: string;

    /**
     * Whether to use filled variant
     * @default false
     */
    filled?: boolean;

    /**
     * ARIA label for accessibility
     */
    ariaLabel?: string;
}

/**
 * Material Symbols (Rounded) icon component
 * 
 * @example
 * <MaterialIcon icon="folder_open" size={20} />
 * <MaterialIcon icon="settings" filled className="text-primary" />
 */
const MaterialIcon: React.FC<MaterialIconProps & React.HTMLAttributes<HTMLSpanElement>> = ({
    icon,
    size = 24,
    className,
    filled = false,
    ariaLabel,
    style,
    ...props
}) => {
    return (
        <span
            className={cn(
                'material-symbols-rounded',
                filled && 'material-symbols-filled',
                className
            )}
            style={{
                fontSize: `${size}px`,
                fontVariationSettings: filled ? "'FILL' 1" : "'FILL' 0",
                ...style,
            }}
            aria-label={ariaLabel || icon}
            role="img"
            {...props}
        >
            {icon}
        </span>
    );
};

export default MaterialIcon;
