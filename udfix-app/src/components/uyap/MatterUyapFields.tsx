import React from 'react';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import MaterialIcon from '../ui/MaterialIcon';
import type { Matter, UyapDosyaTurLabel, UyapYargiBirimiTablo } from '../../services/dataService';
import { UYAP_DOSYA_TURLERI } from '../../data/uyap/uyapDosyaTurleri';
import { UYAP_YARGI_BIRIMLERI } from '../../data/uyap/yargiBirimleri';
import {
    UYAP_ICRA_TAKIP_MAHIYETLERI,
    UYAP_ICRA_TAKIP_SEKLI,
    UYAP_ICRA_TAKIP_TURU,
    UYAP_ICRA_TAKIP_YOLU,
} from '../../data/uyap/icraTakip';
import type { MatterUyapFormValues } from '../../data/uyap/matterUyapFormUtils';

export interface MatterUyapFieldsProps {
    matterType: Matter['matter_type'];
    values: MatterUyapFormValues;
    onChange: (patch: Partial<MatterUyapFormValues>) => void;
    /** When parent renders primary dosya türü row, hide duplicate field here. */
    hideDosyaTur?: boolean;
    /** `compact` = dock panel; `default` = dialog / popover */
    variant?: 'compact' | 'default';
    /** Hide section title (`UYAP sınıflandırma`) when parent already renders a title. */
    hideSectionLabel?: boolean;
    /** Render fields without bordered wrapper box. */
    unboxed?: boolean;
}

export const MatterUyapFields: React.FC<MatterUyapFieldsProps> = ({
    matterType,
    values,
    onChange,
    hideDosyaTur = false,
    variant = 'compact',
    hideSectionLabel = false,
    unboxed = false,
}) => {
    const isCompact = variant === 'compact';
    const triggerClass = isCompact ? 'h-7 text-[10px] glass-input py-0' : 'h-8 text-xs';
    const boxedWrapperClass = isCompact
        ? 'space-y-2 rounded border border-white/10 bg-white/[0.02] p-2'
        : 'space-y-2 rounded-lg border border-border/50 p-3 bg-muted/15';
    const labelClass = isCompact
        ? 'text-[9px] text-muted-foreground uppercase tracking-widest opacity-80 flex items-center gap-1'
        : 'text-xs font-medium text-muted-foreground flex items-center gap-1';
    const fieldLabelClass = isCompact
        ? 'text-[9px] text-muted-foreground opacity-70'
        : 'text-[10px] text-muted-foreground';

    const showIcra =
        matterType === 'ENFORCEMENT' || values.uyapDosyaTur === 'İcra Dosyası';

    return (
        <div className={unboxed ? 'space-y-2' : boxedWrapperClass}>
            {hideSectionLabel ? null : (
                <Label className={labelClass}>
                    <MaterialIcon icon="account_balance" size={10} />
                    UYAP sınıflandırma
                </Label>
            )}
            <div className={hideDosyaTur ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-2 gap-2'}>
                {hideDosyaTur ? null : (
                    <DosyaTurField
                        values={values}
                        onChange={onChange}
                        triggerClass={triggerClass}
                        fieldLabelClass={fieldLabelClass}
                    />
                )}
                <YargiBirimField
                    values={values}
                    onChange={onChange}
                    triggerClass={triggerClass}
                    fieldLabelClass={fieldLabelClass}
                />
            </div>
            {showIcra ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                        <Label className={fieldLabelClass}>Takip türü</Label>
                        <Select
                            value={values.icraTakipTuru}
                            onValueChange={(v) => onChange({ icraTakipTuru: v })}
                        >
                            <SelectTrigger className={triggerClass}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="glass">
                                <SelectItem value="__none__" className="text-xs">
                                    —
                                </SelectItem>
                                {UYAP_ICRA_TAKIP_TURU.map((o) => (
                                    <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                                        {o.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label className={fieldLabelClass}>Takip yolu</Label>
                        <Select
                            value={values.icraTakipYolu}
                            onValueChange={(v) => onChange({ icraTakipYolu: v })}
                        >
                            <SelectTrigger className={triggerClass}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="glass max-h-48">
                                <SelectItem value="__none__" className="text-xs">
                                    —
                                </SelectItem>
                                {UYAP_ICRA_TAKIP_YOLU.map((o) => (
                                    <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                                        {o.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label className={fieldLabelClass}>Mahiyet</Label>
                        <Select
                            value={values.icraTakipMahiyet}
                            onValueChange={(v) => onChange({ icraTakipMahiyet: v })}
                        >
                            <SelectTrigger className={triggerClass}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="glass max-h-48">
                                <SelectItem value="__none__" className="text-xs">
                                    —
                                </SelectItem>
                                {UYAP_ICRA_TAKIP_MAHIYETLERI.map((o) => (
                                    <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                                        {o.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label className={fieldLabelClass}>Takip şekli</Label>
                        <Select
                            value={values.icraTakipSekli}
                            onValueChange={(v) => onChange({ icraTakipSekli: v })}
                        >
                            <SelectTrigger className={triggerClass}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="glass max-h-48">
                                <SelectItem value="__none__" className="text-xs">
                                    —
                                </SelectItem>
                                {UYAP_ICRA_TAKIP_SEKLI.map((o) => (
                                    <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                                        {o.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export function UyapDosyaTurSelect({
    values,
    onChange,
    triggerClass,
    fieldLabelClass,
    label = 'Dosya türü',
}: {
    values: MatterUyapFormValues;
    onChange: (patch: Partial<MatterUyapFormValues>) => void;
    triggerClass: string;
    fieldLabelClass: string;
    label?: string;
}) {
    return (
        <DosyaTurField
            values={values}
            onChange={onChange}
            triggerClass={triggerClass}
            fieldLabelClass={fieldLabelClass}
            label={label}
        />
    );
}

function DosyaTurField({
    values,
    onChange,
    triggerClass,
    fieldLabelClass,
    label,
}: {
    values: MatterUyapFormValues;
    onChange: (patch: Partial<MatterUyapFormValues>) => void;
    triggerClass: string;
    fieldLabelClass: string;
    label?: string;
}) {
    return (
        <div className="space-y-1">
            <Label className={fieldLabelClass}>{label ?? 'UYAP dosya türü'}</Label>
            <Select
                value={values.uyapDosyaTur || '__none__'}
                onValueChange={(v) =>
                    onChange({ uyapDosyaTur: v === '__none__' ? '' : (v as UyapDosyaTurLabel) })
                }
            >
                <SelectTrigger className={triggerClass}>
                    <SelectValue placeholder="Seçin" />
                </SelectTrigger>
                <SelectContent className="max-h-48 glass">
                    <SelectItem value="__none__" className="text-xs">
                        —
                    </SelectItem>
                    {UYAP_DOSYA_TURLERI.map((d) => (
                        <SelectItem key={d.label} value={d.label} className="text-xs">
                            {d.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

function YargiBirimField({
    values,
    onChange,
    triggerClass,
    fieldLabelClass,
}: {
    values: MatterUyapFormValues;
    onChange: (patch: Partial<MatterUyapFormValues>) => void;
    triggerClass: string;
    fieldLabelClass: string;
}) {
    return (
        <div className="space-y-1">
            <Label className={fieldLabelClass}>Yargı birimi (tablo)</Label>
            <Select
                value={values.yargiBirimTablo || '__none__'}
                onValueChange={(v) =>
                    onChange({ yargiBirimTablo: v === '__none__' ? '' : (v as UyapYargiBirimiTablo) })
                }
            >
                <SelectTrigger className={triggerClass}>
                    <SelectValue placeholder="Seçin" />
                </SelectTrigger>
                <SelectContent className="max-h-48 glass">
                    <SelectItem value="__none__" className="text-xs">
                        —
                    </SelectItem>
                    {UYAP_YARGI_BIRIMLERI.map((b) => (
                        <SelectItem key={b.tablo} value={b.tablo} className="text-xs">
                            {b.tablo} — {b.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

export default MatterUyapFields;
