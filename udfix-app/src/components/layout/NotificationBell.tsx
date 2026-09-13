import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { DataService, type AppNotification } from '../../services/dataService';
import { useContextStore } from '../../stores/useContextStore';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { openCommandPalette } from './commandPaletteEvents';
import { Button } from '../ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ScrollArea } from '../ui/scroll-area';
import MaterialIcon from '../ui/MaterialIcon';
import { cn } from '../../lib/utils';
import { NOTIFICATIONS_CHANGED_EVENT } from '../../preferences/appPreferencesTypes';
import { useShowUserGuidanceLabels } from '../../hooks/useShowUserGuidanceLabels';
import { GuidanceRailButtonContent, guidanceRailSurfaceClass } from '../ui/userGuidance';

const POLL_MS_OPEN = 8_000;
const POLL_MS_CLOSED = 30_000;
const HINT_OPEN_DELAY_MS = 160;
const HINT_CLOSE_DELAY_MS = 180;

function isNotificationHintTarget(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest('[data-notification-hint]'));
}

function notificationsFingerprint(list: AppNotification[]): string {
    return list
        .map(
            (row) =>
                `${row.id}:${row.read_at ?? ''}:${row.parties_line ?? ''}:${row.dosya_tur_label ?? ''}`,
        )
        .join('|');
}

function parsePayload(raw: string | null): { file_number?: string } {
    if (!raw) return {};
    try {
        return JSON.parse(raw) as { file_number?: string };
    } catch {
        return {};
    }
}

function notificationHints(row: AppNotification): { partiesLine: string; typeLabel: string } {
    return {
        partiesLine: String(row.parties_line || '').trim(),
        typeLabel: String(row.dosya_tur_label || '').trim(),
    };
}

const NotificationHintDrawer: React.FC<{ partiesLine: string; typeLabel: string }> = ({
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

const NotificationRow: React.FC<{
    row: AppNotification;
    selected: boolean;
    onOpen: (row: AppNotification) => void;
}> = ({ row, selected, onOpen }) => {
    const hintId = useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const payload = parsePayload(row.payload_json);
    const unread = !row.read_at;
    const { partiesLine, typeLabel } = notificationHints(row);
    const hasHints = Boolean(partiesLine || typeLabel);
    const [hintOpen, setHintOpen] = useState(false);

    const button = (
        <button
            ref={triggerRef}
            type="button"
            aria-current={selected ? 'true' : undefined}
            aria-describedby={hasHints ? hintId : undefined}
            className={cn(
                'flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors',
                selected
                    ? 'bg-primary/22 text-foreground ring-1 ring-inset ring-primary/50'
                    : unread
                      ? 'bg-primary/12 text-foreground'
                      : 'bg-transparent text-foreground/75 hover:bg-accent/45',
                !selected && unread && 'hover:bg-primary/18',
                selected && 'hover:bg-primary/28',
            )}
            onClick={() => onOpen(row)}
            onFocus={() => {
                if (hasHints) setHintOpen(true);
            }}
            onBlur={(event) => {
                if (isNotificationHintTarget(event.relatedTarget)) return;
                setHintOpen(false);
            }}
        >
            <span className="min-w-0 flex-1">
                <span className={cn('block leading-5', unread ? 'font-semibold' : 'font-medium')}>
                    {row.title}
                </span>
                {row.body ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{row.body}</span>
                ) : null}
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {payload.file_number || row.created_at}
                </span>
            </span>
        </button>
    );

    if (!hasHints) {
        return <li>{button}</li>;
    }

    return (
        <li>
            <HoverCard
                open={hintOpen}
                onOpenChange={(next) => {
                    if (!next && triggerRef.current === document.activeElement) return;
                    setHintOpen(next);
                }}
                openDelay={HINT_OPEN_DELAY_MS}
                closeDelay={HINT_CLOSE_DELAY_MS}
            >
                <HoverCardTrigger asChild>{button}</HoverCardTrigger>
                <HoverCardContent
                    id={hintId}
                    data-notification-hint=""
                    side="right"
                    align="start"
                    sideOffset={10}
                    collisionPadding={8}
                    avoidCollisions={false}
                    variant="glass"
                    className="z-[calc(var(--z-floating)_+_12)] w-72 max-w-[18rem] p-3"
                >
                    <NotificationHintDrawer partiesLine={partiesLine} typeLabel={typeLabel} />
                </HoverCardContent>
            </HoverCard>
        </li>
    );
};

export const NotificationBell: React.FC = () => {
    const showGuidance = useShowUserGuidanceLabels();
    const activeEntityId = useContextStore((state) => state.activeEntityId);
    const [open, setOpen] = useState(false);
    const [rows, setRows] = useState<AppNotification[]>([]);
    const seenUnread = useRef<Set<string>>(new Set());
    const primed = useRef(false);
    const inFlight = useRef(false);
    const fingerprint = useRef('');

    const refresh = useCallback(async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        try {
            const list = await DataService.listNotifications({ limit: 40 });
            const next = Array.isArray(list) ? list : [];
            const fp = notificationsFingerprint(next);
            if (fp !== fingerprint.current) {
                fingerprint.current = fp;
                setRows(next);
            }
            const unread = next.filter((row) => !row.read_at);
            if (!primed.current) {
                for (const row of unread) seenUnread.current.add(row.id);
                primed.current = true;
                return;
            }
            for (const row of unread) {
                if (seenUnread.current.has(row.id)) continue;
                seenUnread.current.add(row.id);
                if (row.kind.startsWith('calendar_')) continue;
                if (typeof document !== 'undefined' && !document.hasFocus()) {
                    void DataService.showNativeNotification({
                        title: row.title,
                        body: row.body || undefined,
                    });
                }
            }
        } finally {
            inFlight.current = false;
        }
    }, []);

    useEffect(() => {
        const tick = () => {
            if (typeof document !== 'undefined' && document.hidden) return;
            void refresh();
        };
        void refresh();
        const timer = window.setInterval(tick, open ? POLL_MS_OPEN : POLL_MS_CLOSED);
        const onVisibility = () => {
            if (!document.hidden) void refresh();
        };
        const onChanged = () => {
            void refresh();
        };
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
        };
    }, [refresh, open]);

    const unreadCount = rows.filter((row) => !row.read_at).length;

    const onOpenRow = async (row: AppNotification) => {
        if (!row.read_at) await DataService.markNotificationRead(row.id);
        if (row.kind.startsWith('calendar_')) {
            if (row.matter_id) {
                const matter = await DataService.getMatter(row.matter_id);
                useContextStore.getState().setContext('MATTER', row.matter_id, matter?.title || row.title);
            }
            useLayoutStore.getState().openRightPanel('calendar');
            setOpen(false);
            void refresh();
            return;
        }
        if (row.matter_id) {
            const matter = await DataService.getMatter(row.matter_id);
            useContextStore.getState().setContext('MATTER', row.matter_id, matter?.title || row.title);
            useLayoutStore.getState().openRightPanel('matters');
        }
        openCommandPalette('uyap');
        setOpen(false);
        void refresh();
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    title="Bildirimler"
                    aria-label="Bildirimler"
                    className={cn(guidanceRailSurfaceClass(unreadCount > 0, showGuidance), 'relative')}
                >
                    <GuidanceRailButtonContent
                        showGuidance={showGuidance}
                        icon="notifications"
                        label="Bildirim"
                    />
                    {unreadCount > 0 ? (
                        <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-primary px-1 text-[9px] font-semibold leading-4 text-primary-foreground">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    ) : null}
                </button>
            </PopoverTrigger>
            <PopoverContent
                side="right"
                align="end"
                className="w-[22rem] p-0"
                variant="glass"
                onPointerDownOutside={(event) => {
                    if (isNotificationHintTarget(event.target)) event.preventDefault();
                }}
                onFocusOutside={(event) => {
                    if (isNotificationHintTarget(event.target)) event.preventDefault();
                }}
                onInteractOutside={(event) => {
                    if (isNotificationHintTarget(event.target)) event.preventDefault();
                }}
            >
                <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
                    <span className="text-sm font-medium">Bildirimler</span>
                    {unreadCount > 0 ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => {
                                void DataService.markAllNotificationsRead().then(() => refresh());
                            }}
                        >
                            Tümünü oku
                        </Button>
                    ) : null}
                </div>
                <ScrollArea className="h-72">
                    {rows.length === 0 ? (
                        <p className="px-3 py-8 text-center text-xs text-muted-foreground">Henüz bildirim yok.</p>
                    ) : (
                        <ul className="divide-y divide-border/40">
                            {rows.map((row) => (
                                <NotificationRow
                                    key={row.id}
                                    row={row}
                                    selected={Boolean(row.matter_id && row.matter_id === activeEntityId)}
                                    onOpen={(next) => void onOpenRow(next)}
                                />
                            ))}
                        </ul>
                    )}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
};
