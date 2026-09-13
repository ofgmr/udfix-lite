import React from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Badge } from '../../components/ui/badge';
import { CopyContentButton } from '../../components/ui/CopyContentButton';

interface ActionButton {
    icon: string;
    label: string;
    onClick: (e: React.MouseEvent) => void;
    variant?: 'ghost' | 'secondary' | 'outline' | 'default';
    tone?: 'default' | 'destructive';
}

interface CommandResultCardProps {
    type: 'MATTER' | 'PARTY' | 'NOTE' | 'DOCUMENT';
    title: string;
    subtitle?: string;
    metadata?: { label: string; value: string; color?: string }[];
    actions?: ActionButton[];
    rightRailAction?: ActionButton;
    onClick?: () => void;
    className?: string;
    accent?: 'emerald' | 'primary';
    copyText?: string;
    copyLabel?: string;
}

const railButtonClass = (tone: 'default' | 'destructive' = 'default') =>
    cn(
        'flex-1 min-h-0 w-6 rounded-sm border transition-colors',
        tone === 'destructive'
            ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive border-transparent hover:border-destructive/30'
            : 'bg-background/80 text-muted-foreground hover:bg-accent hover:text-foreground border-white/10'
    );

const CommandResultCard: React.FC<CommandResultCardProps> = ({
    type,
    title,
    subtitle,
    metadata,
    actions,
    rightRailAction,
    onClick,
    className,
    accent = 'emerald',
    copyText,
    copyLabel = 'İçerik kopyala',
}) => {
    const hasActions = (actions?.length ?? 0) > 0;
    const hasDelete = !!rightRailAction;
    const showRail = hasActions || hasDelete;

    const getIcon = () => {
        switch (type) {
            case 'MATTER':
                return 'gavel';
            case 'PARTY':
                return 'person';
            case 'NOTE':
                return 'description';
            case 'DOCUMENT':
                return 'assignment';
            default:
                return 'circle';
        }
    };

    const accentClasses =
        accent === 'primary'
            ? {
                  card:
                      'border-border/70 bg-card/70 text-card-foreground hover:bg-accent/50 dark:border-white/10 dark:bg-card/50 dark:hover:bg-accent/35',
                  icon:
                      'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground dark:bg-primary/15 dark:text-primary',
                  title: 'text-card-foreground group-hover:text-primary dark:text-card-foreground dark:group-hover:text-primary',
                  subtitle: 'text-muted-foreground',
                  badge: 'border-border/70 bg-background/60 text-muted-foreground dark:border-white/10 dark:bg-white/5',
              }
            : {
                  card:
                      'border-slate-200/80 bg-white/70 text-slate-950 hover:bg-white/90 dark:border-white/10 dark:bg-neutral-900/70 dark:text-neutral-50 dark:hover:bg-white/10',
                  icon:
                      'bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white dark:bg-emerald-500/15 dark:text-emerald-300',
                  title: 'text-slate-950 group-hover:text-emerald-700 dark:text-neutral-50 dark:group-hover:text-emerald-300',
                  subtitle: 'text-slate-600 dark:text-neutral-400',
                  badge: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300',
              };

    return (
        <div
            className={cn(
                'group relative flex items-start gap-3 p-3 rounded-xl transition-all duration-200 select-text',
                'border shadow-sm backdrop-blur-md hover:shadow-md',
                accentClasses.card,
                'cursor-pointer',
                showRail && (hasActions && hasDelete ? 'pr-[4.25rem]' : 'pr-10'),
                copyText && !showRail && 'pr-9',
                className
            )}
            onClick={onClick}
        >
            <div
                className={cn(
                    'shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                    'transition-colors',
                    accentClasses.icon,
                )}
            >
                <MaterialIcon icon={getIcon()} size={20} />
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                    <h4 className={cn('truncate text-sm font-semibold transition-colors', accentClasses.title)}>
                        {title}
                    </h4>
                    {copyText && (
                        <CopyContentButton
                            text={copyText}
                            label={copyLabel}
                            className="opacity-60 group-hover:opacity-100"
                        />
                    )}
                </div>

                {subtitle && (
                    <p className={cn('line-clamp-2 text-xs leading-relaxed select-text', accentClasses.subtitle)}>
                        {subtitle}
                    </p>
                )}

                {metadata && metadata.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1.5 select-text">
                        {metadata.map((meta, idx) => (
                            <Badge
                                key={idx}
                                variant="outline"
                                className={cn('h-5 px-1.5 text-[10px]', accentClasses.badge)}
                            >
                                <span className="opacity-70 mr-1">{meta.label}:</span>
                                {meta.value}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>

            {showRail && (
                <div className="hidden group-hover:flex absolute right-2 top-2 bottom-2 flex-row items-stretch gap-1">
                    {hasActions && (
                        <div className="flex h-full flex-col gap-1">
                            {actions!.map((action, idx) => (
                                <Button
                                    key={idx}
                                    variant={action.variant || 'ghost'}
                                    size="icon"
                                    className={railButtonClass(action.tone ?? 'default')}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        action.onClick(e);
                                    }}
                                    title={action.label}
                                >
                                    <MaterialIcon icon={action.icon} size={14} />
                                </Button>
                            ))}
                        </div>
                    )}
                    {hasDelete && (
                        <Button
                            variant={rightRailAction.variant || 'ghost'}
                            size="icon"
                            className={cn(railButtonClass('destructive'), 'h-full min-h-[66px]')}
                            onClick={(e) => {
                                e.stopPropagation();
                                rightRailAction.onClick(e);
                            }}
                            title={rightRailAction.label}
                        >
                            <MaterialIcon icon={rightRailAction.icon} size={14} />
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
};

export default CommandResultCard;
