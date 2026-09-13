import { app, BrowserWindow, Notification } from 'electron';
import {
    addCalendarDays,
    buildMorningDigestCopy,
    CALENDAR_NATIVE_MORNING_META_KEY,
    collectDueCalendarReminders,
    localDateKey,
    type CalendarReminderEvent,
    type DueCalendarReminder,
} from './calendarReminders';
import {
    getAppMeta,
    getSqliteDatabase,
    hasNotificationDedupeKey,
    insertAppNotification,
    listCalendarReminderEvents,
    setAppMeta,
} from './database';
import { broadcastToRenderers } from './workspaceMenuActions';

const TICK_MS = 60_000;
const FIRST_TICK_MS = 2_000;

export type CalendarReminderServiceDeps = {
    showMainWindow: () => BrowserWindow;
};

let timer: ReturnType<typeof setInterval> | null = null;
let firstTimer: ReturnType<typeof setTimeout> | null = null;
let deps: CalendarReminderServiceDeps | null = null;
let ticking = false;

function loadEvents(fromDateKey: string, toDateKey: string): CalendarReminderEvent[] {
    const db = getSqliteDatabase();
    if (!db) return [];
    return listCalendarReminderEvents(db, fromDateKey, toDateKey).map((row) => ({
        id: row.id,
        eventType: row.event_type || '',
        eventDate: row.event_date,
        isCompleted: Boolean(row.is_completed),
        description: row.description,
        matterId: row.matter_id,
        fileNumber: row.file_number,
        courtName: row.court_name,
    }));
}

function existingKeys(reminders: DueCalendarReminder[]): Set<string> {
    const db = getSqliteDatabase();
    const keys = new Set<string>();
    if (!db) return keys;
    for (const row of reminders) {
        if (hasNotificationDedupeKey(db, row.dedupeKey)) keys.add(row.dedupeKey);
    }
    return keys;
}

function insertDue(reminders: DueCalendarReminder[]): DueCalendarReminder[] {
    const db = getSqliteDatabase();
    if (!db || reminders.length === 0) return [];
    const inserted: DueCalendarReminder[] = [];
    const tx = db.transaction(() => {
        for (const row of reminders) {
            if (hasNotificationDedupeKey(db, row.dedupeKey)) continue;
            insertAppNotification(db, {
                kind: row.kind,
                title: row.title,
                body: row.body,
                matterId: row.matterId,
                payload: {
                    dedupeKey: row.dedupeKey,
                    deadlineId: row.eventId,
                    slot: row.slot,
                    nativeGroup: row.nativeGroup,
                },
            });
            inserted.push(row);
        }
    });
    tx();
    return inserted;
}

function revealMainAndOpenCalendar(): void {
    const win = deps?.showMainWindow();
    if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
        if (process.platform === 'darwin') app.focus({ steal: true });
        const send = () => broadcastToRenderers({ type: 'open-calendar' });
        if (win.webContents.isLoading()) {
            win.webContents.once('did-finish-load', send);
        } else {
            send();
        }
        return;
    }
    broadcastToRenderers({ type: 'open-calendar' });
}

function showNative(title: string, body: string): void {
    if (!Notification.isSupported()) return;
    const note = new Notification({
        title,
        body,
        silent: false,
    });
    note.on('click', () => {
        revealMainAndOpenCalendar();
    });
    note.show();
}

function tick(): void {
    if (ticking) return;
    const db = getSqliteDatabase();
    if (!db) return;
    ticking = true;
    try {
        const now = new Date();
        const todayKey = localDateKey(now);
        const events = loadEvents(todayKey, addCalendarDays(todayKey, 1));
        const candidates = collectDueCalendarReminders(now, events, new Set());
        const already = existingKeys(candidates);
        const due = candidates.filter((row) => !already.has(row.dedupeKey));
        const inserted = insertDue(due);
        if (inserted.length > 0) {
            broadcastToRenderers({ type: 'notifications-changed' });
        }

        const morningMeta = getAppMeta(db, CALENDAR_NATIVE_MORNING_META_KEY);
        const morningDue = candidates.filter((row) => row.nativeGroup === 'morning');
        if (morningDue.length > 0 && morningMeta !== todayKey) {
            const digest = buildMorningDigestCopy(morningDue);
            if (digest) showNative(digest.title, digest.body);
            setAppMeta(db, CALENDAR_NATIVE_MORNING_META_KEY, todayKey);
        }

        for (const row of inserted) {
            if (row.nativeGroup === 'soon') {
                showNative(row.title, row.body || '');
                continue;
            }
            if (morningMeta === todayKey) {
                showNative(row.title, row.body || '');
            }
        }
    } catch (err) {
        console.warn('[calendar-reminders] tick failed:', err);
    } finally {
        ticking = false;
    }
}

export function startCalendarReminderService(nextDeps: CalendarReminderServiceDeps): void {
    stopCalendarReminderService();
    deps = nextDeps;
    firstTimer = setTimeout(() => {
        firstTimer = null;
        tick();
        timer = setInterval(tick, TICK_MS);
        timer.unref?.();
    }, FIRST_TICK_MS);
    firstTimer.unref?.();
}

export function stopCalendarReminderService(): void {
    if (firstTimer) {
        clearTimeout(firstTimer);
        firstTimer = null;
    }
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    deps = null;
    ticking = false;
}
