import React from 'react';
import { Label } from './label';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { Badge } from './badge';
import MaterialIcon from './MaterialIcon';

interface ReadOnlyTagsProps {
    label: string;
    tags?: string | null;
    icon?: string;
    className?: string;
}

export const ReadOnlyTags: React.FC<ReadOnlyTagsProps> = ({ label, tags, icon, className }) => {
    if (!tags) return null;

    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
    if (tagList.length === 0) return null;

    return (
        <div className={cn("space-y-2 group", className)}>
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                {icon && <MaterialIcon icon={icon} size={10} />}
                {label}
            </Label>
            <div className="flex flex-wrap gap-1.5">
                {tagList.map(tag => (
                    <Badge 
                        key={tag} 
                        variant="secondary" 
                        className="bg-white/5 text-[10px] cursor-copy hover:bg-white/10 transition-colors select-none"
                        onClick={() => {
                            navigator.clipboard.writeText(tag);
                            toast.success('Kopyalandı', { position: 'bottom-center' });
                        }}
                        title="Kopyalamak için tıklayın"
                    >
                        #{tag}
                    </Badge>
                ))}
            </div>
        </div>
    );
};
