export const CALENDAR_REMINDER_MORNING_HOUR = 8;
export const CALENDAR_REMINDER_SOON_MINUTES = 60;
export const CALENDAR_REMINDER_SOON_GRACE_MINUTES = 15;

export const CALENDAR_NATIVE_MORNING_META_KEY = 'calendar_reminder_native_morning';

export type CalendarReminderKind = 'calendar_durusma' | 'calendar_sure' | 'calendar_gorev';
export type CalendarReminderSlot = 'day' | 'eve' | 'soon';
export type CalendarNativeGroup = 'morning' | 'soon';
export type CalendarReminderEventType = 'DURUSMA' | 'SURE' | 'GOREV';

export type CalendarReminderEvent = {
    id: string;
    eventType: string;
    eventDate: string;
    isCompleted: boolean;
    description: string | null;
    matterId: string | null;
    fileNumber: string | null;
    courtName: string | null;
};

export type DueCalendarReminder = {
    dedupeKey: string;
    kind: CalendarReminderKind;
    slot: CalendarReminderSlot;
    nativeGroup: CalendarNativeGroup;
    eventId: string;
    matterId: string | null;
    title: string;
    body: string | null;
};

export type CalendarReminderClock = {
    morningHour: number;
    soonMinutes: number;
    soonGraceMinutes: number;
};

const DEFAULT_CLOCK: CalendarReminderClock = {
    morningHour: CALENDAR_REMINDER_MORNING_HOUR,
    soonMinutes: CALENDAR_REMINDER_SOON_MINUTES,
    soonGraceMinutes: CALENDAR_REMINDER_SOON_GRACE_MINUTES,
};

export function localDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function addCalendarDays(dateKey: string, days: number): string {
    const parsed = parseEventDate(`${dateKey} 00:00:00`);
    if (!parsed) return dateKey;
    parsed.setDate(parsed.getDate() + days);
    return localDateKey(parsed);
}

export function parseEventDate(eventDate: string): Date | null {
    const match = String(eventDate || '').match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/,
    );
    if (!match) return null;
    return new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4] || 0),
        Number(match[5] || 0),
        Number(match[6] || 0),
        0,
    );
}

export function eventDateKey(eventDate: string): string | null {
    const key = String(eventDate || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

export function hasClockTime(eventDate: string): boolean {
    const time = String(eventDate || '').slice(11, 16);
    return Boolean(time && /^\d{2}:\d{2}$/.test(time) && time !== '00:00');
}

export function formatTrDate(eventDate: string): string {
    const key = eventDateKey(eventDate);
    if (!key) return eventDate;
    const [y, m, d] = key.split('-');
    const time = hasClockTime(eventDate) ? ` ${eventDate.slice(11, 16)}` : '';
    return `${d}.${m}.${y}${time}`;
}

function asReminderEventType(value: string): CalendarReminderEventType | null {
    if (value === 'DURUSMA' || value === 'SURE' || value === 'GOREV') return value;
    return null;
}

function kindForType(eventType: CalendarReminderEventType): CalendarReminderKind {
    switch (eventType) {
        case 'DURUSMA':
            return 'calendar_durusma';
        case 'SURE':
            return 'calendar_sure';
        case 'GOREV':
            return 'calendar_gorev';
        default: {
            const _never: never = eventType;
            return _never;
        }
    }
}

function matterBits(event: CalendarReminderEvent): string {
    return [event.fileNumber, event.courtName]
        .map((part) => (part || '').trim())
        .filter(Boolean)
        .join(' ');
}

function taskTitle(event: CalendarReminderEvent): string {
    const title = (event.description || '').trim();
    return title || 'Görev';
}

function atLocalHour(dateKey: string, hour: number): Date | null {
    const parsed = parseEventDate(`${dateKey} 00:00:00`);
    if (!parsed) return null;
    parsed.setHours(hour, 0, 0, 0);
    return parsed;
}

function isMorningOpen(now: Date, todayKey: string, morningHour: number): boolean {
    const start = atLocalHour(todayKey, morningHour);
    const end = atLocalHour(addCalendarDays(todayKey, 1), 0);
    if (!start || !end) return false;
    return now.getTime() >= start.getTime() && now.getTime() < end.getTime();
}

function buildReminder(
    event: CalendarReminderEvent,
    eventType: CalendarReminderEventType,
    slot: CalendarReminderSlot,
    dateKey: string,
    title: string,
    body: string | null,
): DueCalendarReminder {
    return {
        dedupeKey: `calendar:${eventType}:${event.id}:${slot}:${dateKey}`,
        kind: kindForType(eventType),
        slot,
        nativeGroup: slot === 'soon' ? 'soon' : 'morning',
        eventId: event.id,
        matterId: event.matterId,
        title,
        body,
    };
}

export function collectDueCalendarReminders(
    now: Date,
    events: CalendarReminderEvent[],
    alreadyNotifiedKeys: ReadonlySet<string>,
    options?: Partial<CalendarReminderClock>,
): DueCalendarReminder[] {
    const clock: CalendarReminderClock = { ...DEFAULT_CLOCK, ...options };
    const todayKey = localDateKey(now);
    const tomorrowKey = addCalendarDays(todayKey, 1);
    const morningOpen = isMorningOpen(now, todayKey, clock.morningHour);
    const due: DueCalendarReminder[] = [];

    for (const event of events) {
        if (event.isCompleted) continue;
        const eventType = asReminderEventType(event.eventType);
        if (!eventType) continue;
        const key = eventDateKey(event.eventDate);
        const when = parseEventDate(event.eventDate);
        if (!key || !when) continue;
        const matter = matterBits(event);
        const displayDate = formatTrDate(event.eventDate);

        switch (eventType) {
            case 'DURUSMA': {
                if (morningOpen && key === todayKey) {
                    const reminder = buildReminder(
                        event,
                        eventType,
                        'day',
                        todayKey,
                        `Duruşma: ${displayDate}${matter ? ` ${matter}` : ''}`,
                        event.description?.trim() || null,
                    );
                    if (!alreadyNotifiedKeys.has(reminder.dedupeKey)) due.push(reminder);
                }
                if (hasClockTime(event.eventDate) && key === todayKey) {
                    const soonAt = when.getTime() - clock.soonMinutes * 60_000;
                    const graceUntil = when.getTime() + clock.soonGraceMinutes * 60_000;
                    if (now.getTime() >= soonAt && now.getTime() < graceUntil) {
                        const time = event.eventDate.slice(11, 16);
                        const reminder = buildReminder(
                            event,
                            eventType,
                            'soon',
                            todayKey,
                            `Duruşma 1 saat sonra: ${time}${matter ? ` ${matter}` : ''}`,
                            event.description?.trim() || null,
                        );
                        if (!alreadyNotifiedKeys.has(reminder.dedupeKey)) due.push(reminder);
                    }
                }
                break;
            }
            case 'SURE': {
                if (morningOpen && key === todayKey) {
                    const reminder = buildReminder(
                        event,
                        eventType,
                        'day',
                        todayKey,
                        `Bugün süre sonu: ${displayDate}${matter ? ` ${matter}` : ''}`,
                        event.description?.trim() || null,
                    );
                    if (!alreadyNotifiedKeys.has(reminder.dedupeKey)) due.push(reminder);
                }
                if (morningOpen && key === tomorrowKey) {
                    const reminder = buildReminder(
                        event,
                        eventType,
                        'eve',
                        todayKey,
                        `Yarın süre sonu: ${displayDate}${matter ? ` ${matter}` : ''}`,
                        event.description?.trim() || null,
                    );
                    if (!alreadyNotifiedKeys.has(reminder.dedupeKey)) due.push(reminder);
                }
                break;
            }
            case 'GOREV': {
                if (morningOpen && key === todayKey) {
                    const reminder = buildReminder(
                        event,
                        eventType,
                        'day',
                        todayKey,
                        `Bugün görev: ${taskTitle(event)}`,
                        matter || null,
                    );
                    if (!alreadyNotifiedKeys.has(reminder.dedupeKey)) due.push(reminder);
                }
                break;
            }
            default: {
                const _never: never = eventType;
                throw new Error(`unhandled reminder type: ${String(_never)}`);
            }
        }
    }

    return due;
}

export function buildMorningDigestCopy(reminders: DueCalendarReminder[]): { title: string; body: string } | null {
    const morning = reminders.filter((row) => row.nativeGroup === 'morning');
    if (morning.length === 0) return null;

    const durusma = morning.filter((row) => row.kind === 'calendar_durusma').length;
    const sureToday = morning.filter((row) => row.kind === 'calendar_sure' && row.slot === 'day').length;
    const sureEve = morning.filter((row) => row.kind === 'calendar_sure' && row.slot === 'eve').length;
    const gorev = morning.filter((row) => row.kind === 'calendar_gorev').length;

    const parts: string[] = [];
    if (durusma) parts.push(`${durusma} duruşma`);
    if (sureToday) parts.push(`${sureToday} süre sonu`);
    if (gorev) parts.push(`${gorev} görev`);
    if (sureEve) parts.push(`yarın ${sureEve} süre sonu`);

    if (morning.length === 1) {
        const only = morning[0]!;
        return { title: only.title, body: only.body || parts.join(' · ') };
    }

    const todayCount = durusma + sureToday + gorev;
    const title = todayCount > 0 ? 'Bugünkü takvim' : 'Yarın süre sonu';
    return { title, body: parts.join(' · ') };
}
