export const CALENDAR_EVENT_TYPES = [
    { value: 'DURUSMA', label: 'Duruşma', dotClass: 'bg-rose-500' },
    { value: 'KESIF', label: 'Keşif', dotClass: 'bg-amber-500' },
    { value: 'SURE', label: 'Süre', dotClass: 'bg-sky-500' },
    { value: 'GOREV', label: 'Görev', dotClass: 'bg-emerald-500' },
    { value: 'DIGER', label: 'Diğer', dotClass: 'bg-muted-foreground' },
] as const;

export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number]['value'];

export function isCalendarEventType(value: string): value is CalendarEventType {
    return CALENDAR_EVENT_TYPES.some((t) => t.value === value);
}

export function calendarEventTypeMeta(value: string) {
    return (
        CALENDAR_EVENT_TYPES.find((t) => t.value === value) ??
        CALENDAR_EVENT_TYPES[CALENDAR_EVENT_TYPES.length - 1]!
    );
}

export const MONTH_NAMES_TR = [
    'Ocak',
    'Şubat',
    'Mart',
    'Nisan',
    'Mayıs',
    'Haziran',
    'Temmuz',
    'Ağustos',
    'Eylül',
    'Ekim',
    'Kasım',
    'Aralık',
] as const;

export const WEEKDAY_LABELS_TR = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'] as const;

/** Local YYYY-MM-DD */
export function toDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** Inclusive month bounds as SQLite-friendly local datetimes */
export function monthRangeBounds(year: number, monthIndex: number): { from: string; to: string } {
    const from = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01 00:00:00`;
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    const to = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')} 23:59:59`;
    return { from, to };
}

export function eventDateKey(eventDate: string): string {
    return eventDate.slice(0, 10);
}

export function formatEventTime(eventDate: string): string | null {
    const time = eventDate.slice(11, 16);
    if (!time || time === '00:00') return null;
    return time;
}

export function buildEventDateTime(dateKey: string, time?: string): string {
    const t = time && /^\d{2}:\d{2}$/.test(time) ? time : '00:00';
    return `${dateKey} ${t}:00`;
}

const CLIENT_ROLES = new Set(['MÜVEKKİL', 'MUVEKKIL']);
const COUNTERPARTY_ROLES = new Set(['KARŞI_TARAF', 'KARSI_TARAF', 'KARŞI TARAF']);

/** Build "Müvekkil: … · Karşı taraf: …" from matter_parties roles. */
export function buildMatterPartyDescription(
    parties: Array<{ full_name?: string | null; role?: string | null }>,
): string {
    const clients: string[] = [];
    const counters: string[] = [];
    for (const p of parties) {
        const name = (p.full_name || '').trim();
        if (!name) continue;
        const role = (p.role || '').trim().toUpperCase();
        if (CLIENT_ROLES.has(role)) clients.push(name);
        else if (COUNTERPARTY_ROLES.has(role)) counters.push(name);
    }
    const parts: string[] = [];
    if (clients.length) parts.push(`Müvekkil: ${clients.join(', ')}`);
    if (counters.length) parts.push(`Karşı taraf: ${counters.join(', ')}`);
    return parts.join(' · ');
}

export function isAutoPartyDescription(text: string): boolean {
    const t = text.trim();
    if (!t) return true;
    return /^(Müvekkil:|Karşı taraf:)/.test(t);
}

