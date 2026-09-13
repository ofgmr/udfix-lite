import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Task, TaskFilters, TaskStatus } from '../../services/dataService';
import { useContextStore } from '../../stores/useContextStore';
import { useDeadlinesStore } from '../../stores/useDeadlinesStore';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { useMattersStore } from '../../stores/useMattersStore';
import { usePartiesStore } from '../../stores/usePartiesStore';
import { useTasksStore } from '../../stores/useTasksStore';
import { cn } from '../../lib/utils';
import MaterialIcon from '../ui/MaterialIcon';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { SearchableEntitySelect } from '../ui/SearchableEntitySelect';
import { buildEventDateTime, toDateKey } from '../calendar/calendarEventTypes';

type ListFilter = 'open' | 'done' | 'all' | 'undated' | 'overdue';

function todayKey(): string {
    return toDateKey(new Date());
}

function dueDateKey(due: string | null | undefined): string | null {
    if (!due) return null;
    return due.slice(0, 10);
}

function formatDueLabel(due: string | null | undefined): string | null {
    const key = dueDateKey(due);
    if (!key) return null;
    try {
        const d = parseLocalDateKey(key);
        return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    } catch {
        return key;
    }
}

function parseLocalDateKey(key: string): Date {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function isOverdue(task: Task): boolean {
    if (task.status !== 'open') return false;
    const key = dueDateKey(task.due_date);
    if (!key) return false;
    return key < todayKey();
}

async function refreshCalendarMirror() {
    const { lastFilters, fetchDeadlines } = useDeadlinesStore.getState();
    if (lastFilters) {
        await fetchDeadlines(lastFilters);
    }
}

export const TasksCommandTab: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { tasks, isLoading, fetchTasks, addTask, updateTask, deleteTask } = useTasksStore();
    const { matters, fetchMatters } = useMattersStore();
    const { parties, fetchParties } = usePartiesStore();
    const { activeEntityType, activeEntityId, activeEntityName } = useContextStore();
    const openNote = useLayoutStore((s) => s.openNote);

    const [listFilter, setListFilter] = useState<ListFilter>('open');
    const [useContextFilter, setUseContextFilter] = useState(true);
    const [draftTitle, setDraftTitle] = useState('');
    const [draftDue, setDraftDue] = useState('');
    const [linkMatterId, setLinkMatterId] = useState('');
    const [linkPartyId, setLinkPartyId] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const seededContextRef = useRef<string | null>(null);

    useEffect(() => {
        if (matters.length === 0) void fetchMatters();
        if (parties.length === 0) void fetchParties();
    }, [fetchMatters, fetchParties, matters.length, parties.length]);

    // Seed links from active context once per context id (user can still change selects).
    useEffect(() => {
        const key =
            activeEntityType && activeEntityId ? `${activeEntityType}:${activeEntityId}` : null;
        if (!key || seededContextRef.current === key) return;
        seededContextRef.current = key;
        if (activeEntityType === 'MATTER') {
            setLinkMatterId(activeEntityId!);
        } else if (activeEntityType === 'PARTY') {
            setLinkPartyId(activeEntityId!);
        }
    }, [activeEntityType, activeEntityId]);

    const queryFilters = useMemo((): TaskFilters => {
        const filters: TaskFilters = {};
        if (listFilter === 'open') filters.status = 'open';
        else if (listFilter === 'done') filters.status = 'done';
        else if (listFilter === 'undated') {
            filters.status = 'open';
            filters.hasDueDate = false;
        } else if (listFilter === 'overdue') {
            filters.status = 'open';
            filters.hasDueDate = true;
            filters.to = `${todayKey()} 23:59:59`;
        } else {
            filters.status = 'all';
        }

        if (useContextFilter) {
            if (activeEntityType === 'MATTER' && activeEntityId) filters.matterId = activeEntityId;
            else if (activeEntityType === 'PARTY' && activeEntityId) filters.partyId = activeEntityId;
        }
        return filters;
    }, [listFilter, useContextFilter, activeEntityType, activeEntityId]);

    useEffect(() => {
        void fetchTasks(queryFilters);
    }, [fetchTasks, queryFilters]);

    const matterById = useMemo(() => {
        const map = new Map<string, string>();
        for (const m of matters) {
            map.set(m.id, m.title || m.file_number || m.esas_no || m.internal_id || 'Dosya');
        }
        return map;
    }, [matters]);

    const partyById = useMemo(() => {
        const map = new Map<string, string>();
        for (const p of parties) map.set(p.id, p.full_name || 'Taraf');
        return map;
    }, [parties]);

    const sortedMatters = useMemo(
        () =>
            [...matters].sort((a, b) =>
                (a.title || a.internal_id || '').localeCompare(b.title || b.internal_id || '', 'tr'),
            ),
        [matters],
    );

    const sortedParties = useMemo(
        () =>
            [...parties].sort((a, b) =>
                (a.full_name || '').localeCompare(b.full_name || '', 'tr'),
            ),
        [parties],
    );

    const matterOptions = useMemo(
        () =>
            sortedMatters.map((m) => ({
                value: m.id,
                label: m.title || m.file_number || m.esas_no || m.internal_id || m.id,
                keywords: [m.file_number, m.esas_no, m.internal_id].filter(Boolean).join(' '),
            })),
        [sortedMatters],
    );

    const partyOptions = useMemo(
        () =>
            sortedParties.map((p) => ({
                value: p.id,
                label: p.is_client
                    ? `${p.full_name || p.id} · müvekkil`
                    : p.full_name || p.id,
                keywords: p.is_client ? 'müvekkil' : '',
            })),
        [sortedParties],
    );

    const visibleTasks = useMemo(() => {
        if (listFilter !== 'overdue') return tasks;
        const today = todayKey();
        return tasks.filter((t) => {
            const key = dueDateKey(t.due_date);
            return key != null && key < today;
        });
    }, [tasks, listFilter]);

    const contextChipLabel = useMemo(() => {
        if (activeEntityType === 'MATTER' && activeEntityId) {
            return activeEntityName || matterById.get(activeEntityId) || 'Bu dosya';
        }
        if (activeEntityType === 'PARTY' && activeEntityId) {
            return activeEntityName || partyById.get(activeEntityId) || 'Bu müvekkil';
        }
        return null;
    }, [activeEntityType, activeEntityId, activeEntityName, matterById, partyById]);

    const handleAdd = useCallback(async () => {
        const title = draftTitle.trim();
        if (!title || submitting) return;
        setSubmitting(true);
        try {
            await addTask({
                id: crypto.randomUUID(),
                title,
                status: 'open',
                due_date: draftDue ? buildEventDateTime(draftDue) : null,
                matter_id: linkMatterId || null,
                party_id: linkPartyId || null,
            });
            setDraftTitle('');
            setDraftDue('');
            await refreshCalendarMirror();
        } finally {
            setSubmitting(false);
        }
    }, [addTask, draftTitle, draftDue, linkMatterId, linkPartyId, submitting]);

    const toggleDone = useCallback(
        async (task: Task) => {
            const next: TaskStatus = task.status === 'done' ? 'open' : 'done';
            await updateTask({ id: task.id, status: next });
            await refreshCalendarMirror();
        },
        [updateTask],
    );

    const clearDue = useCallback(
        async (task: Task) => {
            await updateTask({ id: task.id, due_date: null });
            await refreshCalendarMirror();
        },
        [updateTask],
    );

    const setDueToday = useCallback(
        async (task: Task) => {
            await updateTask({ id: task.id, due_date: buildEventDateTime(todayKey()) });
            await refreshCalendarMirror();
        },
        [updateTask],
    );

    const removeTask = useCallback(
        async (task: Task) => {
            await deleteTask(task.id);
            await refreshCalendarMirror();
        },
        [deleteTask],
    );

    const filterChips: { id: ListFilter; label: string }[] = [
        { id: 'open', label: 'Açık' },
        { id: 'done', label: 'Bitti' },
        { id: 'all', label: 'Tümü' },
        { id: 'undated', label: 'Tarihsiz' },
        { id: 'overdue', label: 'Geciken' },
    ];

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 space-y-2 border-b border-border/60 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="text"
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleAdd();
                            }
                        }}
                        placeholder="Yeni görev… (Enter)"
                        className="min-w-0 flex-1 rounded-md border border-border/70 bg-background/50 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/40"
                    />
                    <input
                        type="date"
                        value={draftDue}
                        onChange={(e) => setDraftDue(e.target.value)}
                        className="rounded-md border border-border/70 bg-background/50 px-2 py-1.5 text-xs text-foreground outline-none"
                        title="Opsiyonel tarih (Takvim'e yazılır)"
                    />
                    <Button
                        type="button"
                        size="sm"
                        className="h-8 gap-1"
                        disabled={!draftTitle.trim() || submitting}
                        onClick={() => void handleAdd()}
                    >
                        <MaterialIcon icon="add" size={16} />
                        Ekle
                    </Button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <SearchableEntitySelect
                        value={linkMatterId}
                        onValueChange={setLinkMatterId}
                        options={matterOptions}
                        placeholder="Dosya ara…"
                        noneLabel="Dosya yok"
                    />
                    <SearchableEntitySelect
                        value={linkPartyId}
                        onValueChange={setLinkPartyId}
                        options={partyOptions}
                        placeholder="Taraf / müvekkil ara…"
                        noneLabel="Taraf yok"
                    />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    {filterChips.map((chip) => (
                        <button
                            key={chip.id}
                            type="button"
                            onClick={() => setListFilter(chip.id)}
                            className={cn(
                                'rounded-md border px-2 py-1 text-[10px] font-medium transition-colors',
                                listFilter === chip.id
                                    ? 'border-primary/35 bg-primary/12 text-foreground'
                                    : 'border-border/60 bg-background/35 text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {chip.label}
                        </button>
                    ))}
                    {contextChipLabel ? (
                        <button
                            type="button"
                            onClick={() => setUseContextFilter((v) => !v)}
                            className={cn(
                                'ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium',
                                useContextFilter
                                    ? 'border-primary/35 bg-primary/12 text-foreground'
                                    : 'border-border/60 bg-background/35 text-muted-foreground',
                            )}
                            title="Aktif bağlam filtresi"
                        >
                            <MaterialIcon icon="filter_alt" size={12} />
                            {contextChipLabel}
                        </button>
                    ) : null}
                </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-1 p-2">
                    {isLoading && visibleTasks.length === 0 ? (
                        <p className="px-2 py-6 text-center text-xs text-muted-foreground">Yükleniyor…</p>
                    ) : null}
                    {!isLoading && visibleTasks.length === 0 ? (
                        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                            Görev yok. Yukarıdan ekleyin; tarih verirseniz Takvim’e de yazılır.
                        </p>
                    ) : null}
                    {visibleTasks.map((task) => {
                        const dueLabel = formatDueLabel(task.due_date);
                        const overdue = isOverdue(task);
                        const matterLabel = task.matter_id ? matterById.get(task.matter_id) : null;
                        const partyLabel = task.party_id ? partyById.get(task.party_id) : null;
                        return (
                            <div
                                key={task.id}
                                className={cn(
                                    'flex items-start gap-2 rounded-lg border border-border/50 bg-card/40 px-2.5 py-2',
                                    task.status === 'done' && 'opacity-60',
                                )}
                            >
                                <button
                                    type="button"
                                    className="mt-0.5 text-muted-foreground hover:text-foreground"
                                    onClick={() => void toggleDone(task)}
                                    aria-label={task.status === 'done' ? 'Yeniden aç' : 'Tamamla'}
                                >
                                    <MaterialIcon
                                        icon={
                                            task.status === 'done'
                                                ? 'check_circle'
                                                : 'radio_button_unchecked'
                                        }
                                        size={18}
                                    />
                                </button>
                                <div className="min-w-0 flex-1">
                                    <p
                                        className={cn(
                                            'text-sm text-foreground',
                                            task.status === 'done' && 'line-through',
                                        )}
                                    >
                                        {task.title}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                                        {dueLabel ? (
                                            <span
                                                className={cn(
                                                    'inline-flex items-center gap-0.5 rounded border px-1 py-0.5',
                                                    overdue
                                                        ? 'border-rose-500/40 text-rose-600 dark:text-rose-400'
                                                        : 'border-border/60',
                                                )}
                                            >
                                                <MaterialIcon icon="event" size={11} />
                                                {dueLabel}
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-0.5 rounded border border-dashed border-border/60 px-1 py-0.5 hover:text-foreground"
                                                onClick={() => void setDueToday(task)}
                                            >
                                                <MaterialIcon icon="today" size={11} />
                                                Bugün
                                            </button>
                                        )}
                                        {matterLabel ? (
                                            <span className="inline-flex items-center gap-0.5">
                                                <MaterialIcon icon="folder" size={11} />
                                                {matterLabel}
                                            </span>
                                        ) : null}
                                        {partyLabel ? (
                                            <span className="inline-flex items-center gap-0.5">
                                                <MaterialIcon icon="person" size={11} />
                                                {partyLabel}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-0.5">
                                    {task.source_note_id ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            title="Nota git"
                                            onClick={() => {
                                                openNote(task.source_note_id!);
                                                onClose();
                                            }}
                                        >
                                            <MaterialIcon icon="sticky_note_2" size={16} />
                                        </Button>
                                    ) : null}
                                    {task.due_date ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            title="Tarihi kaldır"
                                            onClick={() => void clearDue(task)}
                                        >
                                            <MaterialIcon icon="event_busy" size={16} />
                                        </Button>
                                    ) : null}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                        title="Sil"
                                        onClick={() => void removeTask(task)}
                                    >
                                        <MaterialIcon icon="delete" size={16} />
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </ScrollArea>
        </div>
    );
};
