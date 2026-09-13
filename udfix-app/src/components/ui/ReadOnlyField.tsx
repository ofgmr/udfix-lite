import React from 'react';
import { Label } from './label';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import MaterialIcon from './MaterialIcon';

interface ReadOnlyFieldProps {
    label: string;
    value?: string | null;
    icon?: string;
    className?: string;
}

export const ReadOnlyField: React.FC<ReadOnlyFieldProps> = ({ label, value, icon, className }) => {
    if (!value) return null;

    return (
        <div className={cn("space-y-0.5 group", className)}>
            <Label className="text-[9px] text-muted-foreground uppercase tracking-widest flex items-center gap-1 opacity-70">
                {icon && <MaterialIcon icon={icon} size={10} />}
                {label}
            </Label>
            <div 
                className="text-xs font-medium cursor-copy hover:bg-white/5 py-1 px-1.5 -ml-1.5 rounded transition-colors select-text relative break-words leading-tight"
                onClick={() => {
                    navigator.clipboard.writeText(value);
                    toast.success('Kopyalandı', { position: 'bottom-center' });
                }}
                title="Kopyalamak için tıklayın"
            >
                {value}
                <MaterialIcon 
                    icon="content_copy" 
                    size={12} 
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-50 transition-opacity" 
                />
            </div>
        </div>
    );
};
