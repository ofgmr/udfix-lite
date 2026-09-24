import React from 'react';
import MaterialIcon from '../ui/MaterialIcon';

/** Glass hover-card body: matter-card dosya türü + compact taraflar (no TCKN/VKN). */
export const MatterHintDrawer: React.FC<{ partiesLine: string; typeLabel: string }> = ({
    partiesLine,
    typeLabel,
}) => (
    <div className="space-y-2.5">
        {typeLabel ? (
            <div>
                <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <MaterialIcon icon="folder" size={14} aria-hidden className="opacity-80" />
                    Dosya türü
                </div>
                <p className="mt-0.5 text-xs leading-5 text-foreground">{typeLabel}</p>
            </div>
        ) : null}
        {partiesLine ? (
            <div>
                <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <MaterialIcon icon="groups" size={14} aria-hidden className="opacity-80" />
                    Taraflar
                </div>
                <p className="mt-0.5 break-words text-xs leading-5 text-foreground">{partiesLine}</p>
            </div>
        ) : null}
    </div>
);
