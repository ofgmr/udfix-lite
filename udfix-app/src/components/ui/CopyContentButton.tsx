import React from 'react';
import { Button } from './button';
import MaterialIcon from './MaterialIcon';
import { cn } from '../../lib/utils';
import { copyTextWithToast } from '../../utils/copyText';

interface CopyContentButtonProps {
    text: string;
    label?: string;
    className?: string;
    successMessage?: string;
}

export const CopyContentButton: React.FC<CopyContentButtonProps> = ({
    text,
    label = 'İçerik kopyala',
    className,
    successMessage,
}) => {
    const disabled = !text.trim();

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            className={cn(
                'h-6 w-6 shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10',
                className,
            )}
            title={label}
            aria-label={label}
            onClick={(e) => {
                e.stopPropagation();
                void copyTextWithToast(text, successMessage);
            }}
        >
            <MaterialIcon icon="content_copy" size={14} />
        </Button>
    );
};
