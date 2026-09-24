import { cn } from '../../lib/utils';

interface CommentPreviewTextProps {
    text: string;
    expanded: boolean;
    className?: string;
}

/** Collapsed cards clamp to 3 lines; the focused card shows the full body. */
export function CommentPreviewText({ text, expanded, className }: CommentPreviewTextProps) {
    return (
        <p
            className={cn(
                'text-sm leading-relaxed whitespace-pre-wrap break-words',
                !expanded && 'line-clamp-3',
                className,
            )}
        >
            {text}
        </p>
    );
}
