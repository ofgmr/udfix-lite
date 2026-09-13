import React from 'react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import type { EntityAttributeUpsertRow } from '../../services/dataService';
import {
    UYAP_ADRES_TURU_BY_TAG_KEY,
    UYAP_ADRES_TURU_QUICK_PICKS,
} from '../../data/uyap/uyapAdresTurleri';

export interface UyapAdresQuickPickStripProps {
    rows: EntityAttributeUpsertRow[];
    onChange: (rows: EntityAttributeUpsertRow[]) => void;
    label?: string;
    labelClassName?: string;
    buttonClassName?: string;
}

export const UyapAdresQuickPickStrip: React.FC<UyapAdresQuickPickStripProps> = ({
    rows,
    onChange,
    label = 'UYAP adres türü (hızlı)',
    labelClassName = 'text-[9px] text-muted-foreground uppercase tracking-widest opacity-80',
    buttonClassName = 'h-6 text-[9px] px-1.5',
}) => (
    <div className="space-y-1.5">
        <Label className={labelClassName}>{label}</Label>
        <div className="flex flex-wrap gap-1">
            {UYAP_ADRES_TURU_QUICK_PICKS.map((tagKey) => {
                const meta = UYAP_ADRES_TURU_BY_TAG_KEY[tagKey];
                const hasRow = rows.some((r) => r.tag_key === tagKey);
                return (
                    <Button
                        key={tagKey}
                        type="button"
                        variant={hasRow ? 'default' : 'outline'}
                        size="sm"
                        className={buttonClassName}
                        onClick={() => {
                            if (hasRow) return;
                            onChange([
                                ...rows,
                                { tag_key: tagKey, tag_value: '', sort_order: rows.length },
                            ]);
                        }}
                    >
                        {meta.aciklama.replace(' Adresi', '')}
                    </Button>
                );
            })}
        </div>
    </div>
);

export default UyapAdresQuickPickStrip;
