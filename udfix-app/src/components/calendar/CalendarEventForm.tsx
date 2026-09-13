import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DataService, type Deadline, type Matter, type Party } from '../../services/dataService';
import { useDeadlinesStore } from '../../stores/useDeadlinesStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import { SearchableEntitySelect } from '../ui/SearchableEntitySelect';
import MaterialIcon from '../ui/MaterialIcon';
import {
    CALENDAR_EVENT_TYPES,
    type CalendarEventType,
    buildEventDateTime,
    buildMatterPartyDescription,
    eventDateKey,
    formatEventTime,
    isAutoPartyDescription,
    isCalendarEventType,
} from './calendarEventTypes';

export type CalendarEventFormProps = {
    mode: 'create' | 'edit';
    initialDateKey: string;
    event?: Deadline | null;
    matters: Matter[];
    parties: Party[];
    defaultMatterId?: string | null;
    defaultPartyId?: string | null;
    onCancel: () => void;
    onSaved: () => void;
};

export function CalendarEventForm({
    mode,
    initialDateKey,
    event,
    matters,
    parties,
    defaultMatterId,
    defaultPartyId,
    onCancel,
    onSaved,
}: CalendarEventFormProps) {
    const { addDeadline, updateDeadline, deleteDeadline } = useDeadlinesStore();
    const [eventType, setEventType] = useState<CalendarEventType>('DURUSMA');
    const [dateKey, setDateKey] = useState(initialDateKey);
    const [time, setTime] = useState('');
    const [description, setDescription] = useState('');
    const [matterId, setMatterId] = useState('');
    const [partyId, setPartyId] = useState('');
    const [isCompleted, setIsCompleted] = useState(false);
    const [saving, setSaving] = useState(false);
    const descriptionTouchedRef = useRef(false);
    const lastAutoDescRef = useRef('');

    useEffect(() => {
        if (mode === 'edit' && event) {
            setEventType(isCalendarEventType(event.event_type) ? event.event_type : 'DIGER');
            setDateKey(eventDateKey(event.event_date) || initialDateKey);
            setTime(formatEventTime(event.event_date) ?? '');
            setDescription(event.description ?? '');
            setMatterId(event.matter_id ?? '');
            setPartyId(event.party_id ?? '');
            setIsCompleted(Boolean(event.is_completed));
            descriptionTouchedRef.current = Boolean(event.description);
            lastAutoDescRef.current = '';
            return;
        }
        setEventType('DURUSMA');
        setDateKey(initialDateKey);
        setTime('');
        setDescription('');
        setMatterId(defaultMatterId ?? '');
        setPartyId(defaultPartyId ?? '');
        setIsCompleted(false);
        descriptionTouchedRef.current = false;
        lastAutoDescRef.current = '';
    }, [mode, event, initialDateKey, defaultMatterId, defaultPartyId]);

    useEffect(() => {
        if (!matterId || eventType === 'GOREV') return;
        let cancelled = false;
        void (async () => {
            try {
                const matter = await DataService.getMatter(matterId);
                if (cancelled) return;
                const auto = buildMatterPartyDescription(matter.parties ?? []);
                if (!auto) return;
                setDescription((prev) => {
                    const canReplace =
                        !descriptionTouchedRef.current ||
                        prev.trim() === '' ||
                        prev.trim() === lastAutoDescRef.current ||
                        isAutoPartyDescription(prev);
                    if (!canReplace) return prev;
                    lastAutoDescRef.current = auto;
                    descriptionTouchedRef.current = false;
                    return auto;
                });
            } catch (error) {
                console.error('Failed to load matter parties for calendar description:', error);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [matterId, eventType]);

    const matterOptions = useMemo(
        () =>
            matters.map((m) => ({
                value: m.id,
                label: m.title || m.file_number || m.esas_no || m.internal_id || m.id,
                keywords: [m.file_number, m.esas_no, m.internal_id, m.court_name]
                    .filter(Boolean)
                    .join(' '),
            })),
        [matters],
    );

    const partyOptions = useMemo(
        () =>
            parties.map((p) => ({
                value: p.id,
                label: p.is_client
                    ? `${p.full_name || p.id} · müvekkil`
                    : p.full_name || p.id,
                keywords: p.is_client ? 'müvekkil' : '',
            })),
        [parties],
    );

    const handleSave = async () => {
        if (!dateKey) {
            toast.error('Tarih gerekli');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                matter_id: matterId || null,
                party_id: partyId || null,
                event_type: eventType,
                event_date: buildEventDateTime(dateKey, time || undefined),
                description: description.trim() || undefined,
                is_completed: isCompleted,
            };
            if (mode === 'edit' && event) {
                await updateDeadline({ id: event.id, ...payload });
            } else {
                await addDeadline({ id: crypto.randomUUID(), ...payload });
            }
            onSaved();
        } catch {
            toast.error('Kayıt başarısız');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!event) return;
        setSaving(true);
        try {
            await deleteDeadline(event.id);
            onSaved();
        } catch {
            toast.error('Silinemedi');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-2.5 border-t border-white/10 pt-2.5 mt-1">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">
                    {mode === 'edit' ? 'Olayı düzenle' : 'Yeni olay'}
                </span>
                <button
                    type="button"
                    onClick={onCancel}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Formu kapat"
                >
                    <MaterialIcon icon="close" size={16} />
                </button>
            </div>

            <div className="grid gap-1.5">
                <Label className="text-[10px] text-muted-foreground">Tür</Label>
                <Select
                    value={eventType}
                    onValueChange={(v) => {
                        if (isCalendarEventType(v)) setEventType(v);
                    }}
                >
                    <SelectTrigger className="h-7 text-xs glass-input py-0">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass">
                        {CALENDAR_EVENT_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value} className="text-xs">
                                {t.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {eventType === 'GOREV' ? (
                    <p className="text-[10px] leading-4 text-muted-foreground/90">
                        Yapılacaklar listesine de eklenir (⌘⇧T).
                    </p>
                ) : null}
                {mode === 'edit' && event?.task_id ? (
                    <p className="text-[10px] leading-4 text-emerald-600/90 dark:text-emerald-400/90">
                        Bağlı görev — düzenleme görevi günceller; silmek yalnızca tarihi kaldırır.
                    </p>
                ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                    <Label className="text-[10px] text-muted-foreground">Tarih</Label>
                    <Input
                        type="date"
                        value={dateKey}
                        onChange={(e) => setDateKey(e.target.value)}
                        className="h-7 text-xs glass-input py-0"
                    />
                </div>
                <div className="grid gap-1.5">
                    <Label className="text-[10px] text-muted-foreground">Saat</Label>
                    <Input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="h-7 text-xs glass-input py-0"
                    />
                </div>
            </div>

            <div className="grid gap-1.5">
                <Label className="text-[10px] text-muted-foreground">Dosya</Label>
                <SearchableEntitySelect
                    value={matterId}
                    onValueChange={setMatterId}
                    options={matterOptions}
                    placeholder="Dosya ara…"
                    noneLabel="Yok"
                    triggerClassName="h-7 glass-input border-input"
                    contentZClassName="z-[var(--z-floating)]"
                />
            </div>

            <div className="grid gap-1.5">
                <Label className="text-[10px] text-muted-foreground">Taraf</Label>
                <SearchableEntitySelect
                    value={partyId}
                    onValueChange={setPartyId}
                    options={partyOptions}
                    placeholder="Taraf / müvekkil ara…"
                    noneLabel="Yok"
                    triggerClassName="h-7 glass-input border-input"
                    contentZClassName="z-[var(--z-floating)]"
                />
            </div>

            <div className="grid gap-1.5">
                <Label className="text-[10px] text-muted-foreground">
                    {eventType === 'GOREV' ? 'Başlık' : 'Açıklama'}
                </Label>
                <Input
                    value={description}
                    onChange={(e) => {
                        descriptionTouchedRef.current = true;
                        setDescription(e.target.value);
                    }}
                    placeholder={eventType === 'GOREV' ? 'Görev başlığı…' : 'Müvekkil / karşı taraf…'}
                    className="h-7 text-xs glass-input py-0"
                />
            </div>

            {mode === 'edit' && (
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                    <input
                        type="checkbox"
                        checked={isCompleted}
                        onChange={(e) => setIsCompleted(e.target.checked)}
                        className="rounded border-white/20"
                    />
                    Tamamlandı
                </label>
            )}

            <div className="flex items-center gap-1.5 pt-0.5">
                <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs flex-1"
                    disabled={saving}
                    onClick={() => void handleSave()}
                >
                    Kaydet
                </Button>
                {mode === 'edit' && (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        disabled={saving}
                        onClick={() => void handleDelete()}
                        title={
                            event?.task_id
                                ? 'Takvimden kaldırır; görev Yapılacaklar’da tarihsiz kalır'
                                : 'Olayı sil'
                        }
                    >
                        Sil
                    </Button>
                )}
            </div>
        </div>
    );
}
