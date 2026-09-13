import React, { useEffect, useMemo, useState } from 'react';
import type { Deadline } from '../../services/dataService';
import { useContextStore } from '../../stores/useContextStore';
import { useDeadlinesStore } from '../../stores/useDeadlinesStore';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { useMattersStore } from '../../stores/useMattersStore';
import { usePartiesStore } from '../../stores/usePartiesStore';
import { cn } from '../../lib/utils';
import MaterialIcon from '../ui/MaterialIcon';
import { Button } from '../ui/button';
import { CalendarEventForm } from './CalendarEventForm';
import {
    MONTH_NAMES_TR,
    WEEKDAY_LABELS_TR,
    calendarEventTypeMeta,
    eventDateKey,
    formatEventTime,
    monthRangeBounds,
    parseDateKey,
    toDateKey,
} from './calendarEventTypes';

type FormState =
    | { kind: 'closed' }
    | { kind: 'create'; dateKey: string }
    | { kind: 'edit'; event: Deadline };

function buildMonthCells(year: number, monthIndex: number): (Date | null)[] {
    const first = new Date(year, monthIndex, 1);
    const startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, monthIndex, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
}

export const CalendarPanel: React.FC = () => {
    const today = useMemo(() => new Date(), []);
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [selectedKey, setSelectedKey] = useState(toDateKey(today));
    const [form, setForm] = useState<FormState>({ kind: 'closed' });

    const { deadlines, isLoading, fetchDeadlines } = useDeadlinesStore();
    const { matters, fetchMatters } = useMattersStore();
    const { parties, fetchParties } = usePartiesStore();
    const { activeEntityType, activeEntityId, setContext } = useContextStore();
    const openMatterFormFloating = useLayoutStore((s) => s.openMatterFormFloating);
    const openPartyFormFloating = useLayoutStore((s) => s.openPartyFormFloating);

    const defaultMatterId =
        activeEntityType === 'MATTER' && activeEntityId ? activeEntityId : null;
    const defaultPartyId =
        activeEntityType === 'PARTY' && activeEntityId ? activeEntityId : null;

    useEffect(() => {
        if (matters.length === 0) void fetchMatters();
        if (parties.length === 0) void fetchParties();
    }, [fetchMatters, fetchParties, matters.length, parties.length]);

    useEffect(() => {
        const { from, to } = monthRangeBounds(viewYear, viewMonth);
        void fetchDeadlines({ from, to });
    }, [viewYear, viewMonth, fetchDeadlines]);

    const matterById = useMemo(() => {
        const map = new Map<string, (typeof matters)[number]>();
        for (const m of matters) map.set(m.id, m);
        return map;
    }, [matters]);

    const partyById = useMemo(() => {
        const map = new Map<string, (typeof parties)[number]>();
        for (const p of parties) map.set(p.id, p);
        return map;
    }, [parties]);

    const eventsByDay = useMemo(() => {
        const map = new Map<string, Deadline[]>();
        for (const d of deadlines) {
            const key = eventDateKey(d.event_date);
            const list = map.get(key);
            if (list) list.push(d);
            else map.set(key, [d]);
        }
        return map;
    }, [deadlines]);

    const selectedEvents = eventsByDay.get(selectedKey) ?? [];
    const cells = useMemo(() => buildMonthCells(viewYear, viewMonth), [viewYear, viewMonth]);
    const todayKey = toDateKey(today);

    const goPrevMonth = () => {
        if (viewMonth === 0) {
            setViewYear((y) => y - 1);
            setViewMonth(11);
        } else {
            setViewMonth((m) => m - 1);
        }
        setForm({ kind: 'closed' });
    };

    const goNextMonth = () => {
        if (viewMonth === 11) {
            setViewYear((y) => y + 1);
            setViewMonth(0);
        } else {
            setViewMonth((m) => m + 1);
        }
        setForm({ kind: 'closed' });
    };

    const selectDay = (date: Date) => {
        const key = toDateKey(date);
        setSelectedKey(key);
        setForm({ kind: 'closed' });
    };

    const openMatter = (matterId: string) => {
        const matter = matterById.get(matterId);
        const title = matter?.title ?? matterId;
        setContext('MATTER', matterId, title);
        openMatterFormFloating({ id: matterId, title });
    };

    const openParty = (partyId: string) => {
        const party = partyById.get(partyId);
        const name = party?.full_name ?? partyId;
        setContext('PARTY', partyId, name);
        openPartyFormFloating({ id: partyId, full_name: name });
    };

    const selectedLabel = (() => {
        const d = parseDateKey(selectedKey);
        return `${d.getDate()} ${MONTH_NAMES_TR[d.getMonth()]}`;
    })();

    return (
        <div className="flex flex-col gap-2.5 min-h-0">
            <div className="flex items-center justify-between gap-1">
                <button
                    type="button"
                    onClick={goPrevMonth}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5"
                    aria-label="Önceki ay"
                >
                    <MaterialIcon icon="chevron_left" size={18} />
                </button>
                <span className="text-xs font-medium tabular-nums">
                    {MONTH_NAMES_TR[viewMonth]} {viewYear}
                </span>
                <button
                    type="button"
                    onClick={goNextMonth}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5"
                    aria-label="Sonraki ay"
                >
                    <MaterialIcon icon="chevron_right" size={18} />
                </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center">
                {WEEKDAY_LABELS_TR.map((label) => (
                    <div
                        key={label}
                        className="text-[9px] font-medium text-muted-foreground py-0.5"
                    >
                        {label}
                    </div>
                ))}
                {cells.map((date, idx) => {
                    if (!date) {
                        return <div key={`empty-${idx}`} className="h-8" />;
                    }
                    const key = toDateKey(date);
                    const dayEvents = eventsByDay.get(key);
                    const isSelected = key === selectedKey;
                    const isToday = key === todayKey;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => selectDay(date)}
                            className={cn(
                                'relative h-8 rounded-md text-[11px] tabular-nums transition-colors',
                                'hover:bg-white/10',
                                isSelected && 'bg-primary/20 text-foreground font-medium',
                                !isSelected && isToday && 'ring-1 ring-primary/40',
                                !isSelected && !isToday && 'text-foreground/90',
                            )}
                        >
                            {date.getDate()}
                            {dayEvents && dayEvents.length > 0 && (
                                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                                    {dayEvents.slice(0, 3).map((ev) => (
                                        <span
                                            key={ev.id}
                                            className={cn(
                                                'h-1 w-1 rounded-full',
                                                calendarEventTypeMeta(ev.event_type).dotClass,
                                                ev.is_completed && 'opacity-40',
                                            )}
                                        />
                                    ))}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                <span className="text-[11px] font-medium text-muted-foreground truncate">
                    {selectedLabel}
                    {isLoading ? ' …' : ''}
                </span>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-xs shrink-0"
                    onClick={() => setForm({ kind: 'create', dateKey: selectedKey })}
                    title="Olay ekle"
                >
                    <MaterialIcon icon="add" size={16} />
                </Button>
            </div>

            <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto min-h-0">
                {selectedEvents.length === 0 && form.kind === 'closed' && (
                    <p className="text-[11px] text-muted-foreground/80 py-1">
                        Bu günde olay yok
                    </p>
                )}
                {selectedEvents.map((ev) => {
                    const meta = calendarEventTypeMeta(ev.event_type);
                    const matter = ev.matter_id ? matterById.get(ev.matter_id) : undefined;
                    const party = ev.party_id ? partyById.get(ev.party_id) : undefined;
                    const time = formatEventTime(ev.event_date);
                    const isEditing = form.kind === 'edit' && form.event.id === ev.id;
                    if (isEditing) return null;
                    return (
                        <div
                            key={ev.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setForm({ kind: 'edit', event: ev })}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setForm({ kind: 'edit', event: ev });
                                }
                            }}
                            className={cn(
                                'w-full text-left rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5 cursor-pointer',
                                'hover:bg-white/[0.06] transition-colors',
                                ev.is_completed && 'opacity-60',
                            )}
                        >
                            <div className="flex items-center gap-1.5">
                                <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', meta.dotClass)} />
                                <span className="text-[11px] font-medium truncate">
                                    {meta.label}
                                    {time ? ` · ${time}` : ''}
                                </span>
                                {ev.task_id ? (
                                    <span className="ml-auto shrink-0 rounded border border-emerald-500/30 bg-emerald-500/10 px-1 py-px text-[9px] font-medium text-emerald-700 dark:text-emerald-300">
                                        Görev
                                    </span>
                                ) : null}
                            </div>
                            {ev.description ? (
                                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 pl-3">
                                    {ev.description}
                                </p>
                            ) : null}
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 pl-3 mt-0.5">
                                {ev.matter_id ? (
                                    <button
                                        type="button"
                                        className="text-[10px] text-primary/90 hover:underline truncate max-w-full"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openMatter(ev.matter_id!);
                                        }}
                                    >
                                        {matter?.title || matter?.internal_id || 'Dosya'}
                                    </button>
                                ) : null}
                                {ev.party_id ? (
                                    <button
                                        type="button"
                                        className="text-[10px] text-muted-foreground hover:text-foreground hover:underline truncate max-w-full"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openParty(ev.party_id!);
                                        }}
                                    >
                                        {party?.full_name || 'Taraf'}
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>

            {form.kind === 'create' && (
                <CalendarEventForm
                    mode="create"
                    initialDateKey={form.dateKey}
                    matters={matters}
                    parties={parties}
                    defaultMatterId={defaultMatterId}
                    defaultPartyId={defaultPartyId}
                    onCancel={() => setForm({ kind: 'closed' })}
                    onSaved={() => setForm({ kind: 'closed' })}
                />
            )}
            {form.kind === 'edit' && (
                <CalendarEventForm
                    mode="edit"
                    initialDateKey={eventDateKey(form.event.event_date)}
                    event={form.event}
                    matters={matters}
                    parties={parties}
                    defaultMatterId={form.event.matter_id}
                    defaultPartyId={form.event.party_id}
                    onCancel={() => setForm({ kind: 'closed' })}
                    onSaved={() => setForm({ kind: 'closed' })}
                />
            )}
        </div>
    );
};

export default CalendarPanel;
