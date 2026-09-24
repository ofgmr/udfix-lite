import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
    DataService,
    type Matter,
    type UyapBridgeStatus,
    type UyapBreakdownRow,
    type UyapDashboardStats,
    type UyapDosyaTurBucket,
    type UyapEvrakDoc,
    type UyapOpeningMonthRow,
    type UyapEvrakTree,
    type UyapMatterPick,
    type UyapRecentEvrak,
    type UyapTrailingOpenings,
    type UyapWalkLogEvent,
} from '../../services/dataService';
import { useContextStore } from '../../stores/useContextStore';
import { useLayoutStore } from '../../stores/useLayoutStore';
import MaterialIcon from '../ui/MaterialIcon';
import { Button } from '../ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Input } from '../ui/input';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ScrollArea } from '../ui/scroll-area';
import { MatterHintDrawer } from './MatterHintDrawer';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { humanizeUyapMessage, humanizeWalkEventLine } from '../../lib/uyapUserMessages';
import { closeCommandPalette } from './commandPaletteEvents';
import { isUniversalViewerSupported } from '../../utils/viewerSupportedFormats';
import { resolveViewerExtension } from '../../utils/viewerExtension';
import { deriveUyapEvrakTree, type DerivedRelatedGroup, type DerivedTurFolder } from '../../lib/uyapEvrakTreeHelper';
import { formatCompactMatterPartyLine, formatKatirKunyeLine } from '../../lib/matterPartyLine';
import { displayCourtName, toTurkishTitleCase } from '../../lib/turkishTitleCase';
import { turkishIncludes } from '../../utils/turkishSearch';
import { formatTurkishRelativePast } from '../../lib/turkishRelativeTime';
import {
    CHART_RANGE_MONTHS,
    loadKatirChartPrefs,
    saveKatirChartPrefs,
    type ChartRangeMonths,
    type KatirChartMode,
    type KatirChartPrefs,
    type KatirChartSeries,
} from '../../lib/uyapChartPrefs';
import { toKatirPlotMonths, type ChartPlotMonth } from '../../lib/uyapChartMath';
import { KATIR_UPGRADE_URL, dashboardHasKatirCorpus, type AppEntitlements } from '../../lib/appEntitlements';

const SEARCH_DEBOUNCE_MS = 250;
const RECENT_UYAP_EVRAK_LIMIT = 100;
const RECENT_HINT_OPEN_DELAY_MS = 160;
const RECENT_HINT_CLOSE_DELAY_MS = 180;
const EVRAK_WAIT_TOAST_ID = 'uyap-evrak-wait';
const EVRAK_WAIT_TOAST_MSG = 'Dosya indirilirken lütfen bekleyiniz.';
const glassCard = 'rounded-xl border border-border/70 bg-card shadow-xl backdrop-blur-xl';
const paneScroll =
    'min-w-0 [&>[data-radix-scroll-area-viewport]>div]:!block [&>[data-radix-scroll-area-viewport]>div]:min-w-0 [&>[data-radix-scroll-area-viewport]>div]:max-w-full';

function sameSerialized<T>(left: T, right: T): boolean {
    if (left === right) return true;
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return false;
    }
}

function showEvrakWaitToast() {
    toast.loading(EVRAK_WAIT_TOAST_MSG, { id: EVRAK_WAIT_TOAST_ID });
}

function failEvrakWaitToast(message: string) {
    toast.error(humanizeUyapMessage(message), { id: EVRAK_WAIT_TOAST_ID });
}

function clearEvrakWaitToast() {
    toast.dismiss(EVRAK_WAIT_TOAST_ID);
}

function StatusDot({ on }: { on: boolean }) {
    return (
        <span
            className={`inline-block h-2 w-2 rounded-full ${on ? 'bg-emerald-400' : 'bg-muted-foreground/40'}`}
            aria-hidden
        />
    );
}

function formatMoney(value: number): string {
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(value || 0);
}

function formatCount(value: number): string {
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(value || 0);
}

function formatPair(open: number, total: number): string {
    return `${formatCount(open)} / ${formatCount(total)}`;
}

function formatCompactMoney(value: number): string {
    const n = value || 0;
    if (n >= 1_000_000) {
        return `${(n / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}M`;
    }
    return formatMoney(n);
}

function formatEvrakDate(raw?: string | null): string {
    if (!raw) return '';
    const text = String(raw).trim();
    const maxYear = new Date().getFullYear() + 1;
    const iso = text.slice(0, 10);
    const isoMatch = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        const year = Number(isoMatch[1]);
        if (year < 1990 || year > maxYear) return '';
        return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
    }
    const tr = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (tr) {
        const year = Number(tr[3]);
        if (year < 1990 || year > maxYear) return '';
        return `${tr[1].padStart(2, '0')}.${tr[2].padStart(2, '0')}.${tr[3]}`;
    }
    return text;
}

function monthLabel(key: string): string {
    const [year, month] = key.split('-').map(Number);
    if (!year || !month) return key;
    return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', { month: 'short' });
}

function jobLabel(job?: string | null): string {
    switch (job) {
        case 'hesap':
            return 'İcra Hesap';
        case 'detail':
            return 'Duruşma / Keşif';
        case 'inventory':
            return 'Dosyaları Yenile';
        case 'evrak':
            return 'Evrak Kontrol';
        case 'download':
            return 'İndir';
        case 'katir':
        case undefined:
        case null:
        case '':
            return 'Eksikleri Doldur';
        default: {
            const _unknown: never = job as never;
            void _unknown;
            return 'Katır';
        }
    }
}

function jobProgressLine(job?: string | null): string {
    switch (job) {
        case 'hesap':
            return 'İcra hesap alınıyor';
        case 'detail':
            return 'Duruşma / keşif alınıyor';
        case 'inventory':
            return 'Dosyalar yenileniyor';
        case 'evrak':
            return 'Evrak kontrol ediliyor';
        case 'download':
            return 'Evrak indiriliyor';
        case 'katir':
        case undefined:
        case null:
        case '':
            return 'Eksikler dolduruluyor';
        default: {
            const _unknown: never = job as never;
            void _unknown;
            return 'Katır çalışıyor';
        }
    }
}

function liveLine(status: UyapBridgeStatus | null, entitlements: AppEntitlements | null): string {
    const katirLive = entitlements?.katirLive === true;
    if (!katirLive) {
        switch (entitlements?.phase) {
            case 'authenticated':
                return 'Üyelik yok — köprü kapalı.';
            case 'expired':
                return 'Üyelik süresi doldu — köprü kapalı.';
            case 'revoked':
                return 'Üyelik iptal edildi — köprü kapalı.';
            case 'entitled':
            case 'grace':
                return 'Katır paketi yok, köprü kapalı.';
            case 'anonymous':
            case undefined:
                return 'Katır için e-posta ile giriş yapın.';
            default: {
                const _never: never = entitlements?.phase as never;
                void _never;
                return 'Katır yok, köprü kapalı.';
            }
        }
    }
    if (!status?.up) return 'Katır bağlı değil. UYAP Avukat Portal\'ına giriş yapınız.';
    if (status.seat?.mismatch) {
        const bound = status.seat.fullName || entitlements?.boundLawyerName || 'kayıtlı avukat';
        const seen = status.seat.seenFullName;
        return seen
            ? `Bu üyelik ${bound} için; açık UYAP oturumu ${seen}.`
            : `Bu üyelik ${bound} için. Chrome’da o avukatın UYAP oturumunu açın.`;
    }
    if (status.walkRunning) {
        const p = status.lastWalk?.progress;
        const quiet =
            status.scanningQuietly ||
            status.lastWalk?.scheduled ||
            status.lastWalk?.class === 'background';
        if (quiet) {
            if (p?.phase === 'file' && p.total) {
                return `Sessiz tarama… ${p.current}/${p.total}${p.file_number ? ` — ${p.file_number}` : ''}`;
            }
            return 'Sessiz tarama…';
        }
        const job = status.lastWalk?.job || p?.job;
        const action = jobProgressLine(job);
        if (p?.phase === 'search') return `${action}…`;
        if (p?.phase === 'file' && p.total) {
            return `${action}… ${p.current}/${p.total}${p.file_number ? ` — ${p.file_number}` : ''}`;
        }
        return `${action}…`;
    }
    if (status.lastWalk?.error) return humanizeUyapMessage(status.lastWalk.error);
    if (status.lastWalk?.warning) return humanizeUyapMessage(status.lastWalk.warning);
    if (status.lastWalk?.preempted) return 'Sessiz tarama duraklatıldı.';
    if (status.lastWalk?.stopped) return 'Durduruldu.';
    if (status.lastWalk?.finished) {
        if (status.lastWalk.scheduled || status.lastWalk.class === 'background') {
            return 'Sessiz tarama bitti.';
        }
        return `${jobLabel(status.lastWalk.job)} tamamlandı.`;
    }
    if (!status.sessionReady) return 'UYAP Avukat Portal sekmesini açın.';
    return 'Oturum hazır.';
}

function formatScanClock(iso?: string | null): string | null {
    if (!iso) return null;
    const parsed = new Date(iso);
    if (!Number.isFinite(parsed.getTime())) return null;
    return parsed.toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

type MembershipTone = 'neutral' | 'warning' | 'danger';

type MembershipCopy = {
    icon: string;
    badge: string;
    title: string;
    body: string;
    tone: MembershipTone;
    dateLabel: string | null;
    dateIso: string | null;
    acquireLabel: string;
};

function membershipCopy(entitlements: AppEntitlements): MembershipCopy {
    const { phase, katirLive, periodEndsAt, graceEndsAt } = entitlements;
    switch (phase) {
        case 'anonymous':
        case 'authenticated':
            return {
                icon: 'key',
                badge: 'Lisans',
                title: 'Katır Lisansı',
                body: 'Ödeme veya hediye linki UDFIX’i açar. Açılmazsa sitedeki kodu aşağıya yazın.',
                tone: 'neutral',
                dateLabel: null,
                dateIso: null,
                acquireLabel: 'Katır Edin',
            };
        case 'entitled':
            return {
                icon: katirLive ? 'verified' : 'inventory_2',
                badge: 'Üye',
                title: 'Katır Üyeliği',
                body: katirLive
                    ? 'Üyelik dönemi içinde.'
                    : 'Üyelik var. Bu kurulumda canlı yol kapalı.',
                tone: katirLive ? 'neutral' : 'warning',
                dateLabel: periodEndsAt ? 'Bitiş' : null,
                dateIso: periodEndsAt,
                acquireLabel: 'Katır Yenile',
            };
        case 'grace':
            return {
                icon: 'schedule',
                badge: 'Ek Süre',
                title: 'Üyelik Doldu',
                body: katirLive
                    ? 'Köprü ek süre boyunca açık kalır. Süre bitince senkronizasyon durur.'
                    : 'Üyelik doldu. Bu kurulumda canlı yol kapalı.',
                tone: 'warning',
                dateLabel: graceEndsAt ? 'Ek Süre Sonu' : periodEndsAt ? 'Bitiş' : null,
                dateIso: graceEndsAt || periodEndsAt,
                acquireLabel: 'Katır Yenile',
            };
        case 'expired':
            return {
                icon: 'event_busy',
                badge: 'Süre Doldu',
                title: 'Üyelik Süresi Doldu',
                body: 'UYAP senkronizasyonu durdu. Yerel kayıtlar durur.',
                tone: 'danger',
                dateLabel: periodEndsAt ? 'Bitiş' : null,
                dateIso: periodEndsAt,
                acquireLabel: 'Katır Yenile',
            };
        case 'revoked':
            return {
                icon: 'block',
                badge: 'İptal',
                title: 'Üyelik İptal Edildi',
                body: 'UYAP senkronizasyonu durdu. Köprü kapalı.',
                tone: 'danger',
                dateLabel: null,
                dateIso: null,
                acquireLabel: 'Katır Edin',
            };
        default: {
            const _never: never = phase;
            return _never;
        }
    }
}

function membershipToneClass(tone: MembershipTone): string {
    switch (tone) {
        case 'warning':
            return 'border-amber-500/40 bg-amber-500/[0.08]';
        case 'danger':
            return 'border-destructive/40 bg-destructive/[0.06]';
        case 'neutral':
            return '';
        default: {
            const _never: never = tone;
            return _never;
        }
    }
}

function membershipBadgeClass(tone: MembershipTone): string {
    switch (tone) {
        case 'warning':
            return 'border-amber-500/40 text-amber-800 dark:text-amber-300';
        case 'danger':
            return 'border-destructive/40 text-destructive';
        case 'neutral':
            return 'border-border/70 text-muted-foreground';
        default: {
            const _never: never = tone;
            return _never;
        }
    }
}

function lastResultLine(status: UyapBridgeStatus | null): string | null {
    if (!status?.up || status.walkRunning) return null;
    const last = status.lastWalk;
    if (!last) return null;
    if (last.error || last.warning || last.stopped) return null;
    if (!last.finished || !last.stats) return null;
    const stats = last.stats;
    const downloaded = Number(stats.downloaded) || 0;
    const queued = Number(stats.queued) || 0;
    if (last.job === 'download' && downloaded > 0) return `${downloaded} evrak indirildi.`;
    if (queued > 0) return `${queued} dosya işlendi.`;
    return null;
}

function eventTime(iso?: string): string {
    if (!iso) return '';
    const parsed = new Date(iso);
    if (!Number.isFinite(parsed.getTime())) return iso.slice(11, 19);
    return parsed.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function eventClass(level?: string): string {
    if (level === 'error') return 'text-destructive';
    if (level === 'warn') return 'text-amber-700 dark:text-amber-400';
    return 'text-muted-foreground';
}

function WalkStatusSummary({
    events,
}: {
    events?: UyapWalkLogEvent[] | null;
}) {
    const [open, setOpen] = useState(false);
    const lines = Array.isArray(events) && events.length
        ? [...events]
              .reverse()
              .slice(0, 12)
              .map((row) => ({ ...row, message: humanizeWalkEventLine(row.message) }))
              .filter((row) => row.message)
        : [];

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="inline-flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    aria-expanded={open}
                >
                    Ayrıntı
                    <MaterialIcon
                        icon="expand_more"
                        size={14}
                        className={cn('transition-transform', open && 'rotate-180')}
                    />
                </button>
            </PopoverTrigger>
            <PopoverContent
                variant="glass"
                align="end"
                side="bottom"
                sideOffset={8}
                className="z-[var(--z-command-palette-floating)] w-72 p-2"
                onOpenAutoFocus={(event) => event.preventDefault()}
            >
                <div className="max-h-52 overflow-y-auto text-[11px] leading-relaxed">
                    {lines.length === 0 ? (
                        <div className="text-muted-foreground">Henüz işlem yok.</div>
                    ) : (
                        lines.map((row, index) => (
                            <div
                                key={`${row.at}-${index}`}
                                className={cn('break-words', eventClass(row.level))}
                            >
                                <span className="text-muted-foreground/80">{eventTime(row.at)} </span>
                                {row.message}
                            </div>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

function isPreviewCacheDoc(doc: UyapEvrakDoc): boolean {
    try {
        const meta = doc.metadata ? JSON.parse(doc.metadata) : {};
        return meta?.uyap?.previewCache === true;
    } catch {
        return false;
    }
}

function viewerNameForDoc(doc: UyapEvrakDoc): string {
    const fromPath = String(doc.file_path || '')
        .split(/[\\/]/)
        .pop() || '';
    if (fromPath && (isUniversalViewerSupported(fromPath) || resolveViewerExtension(fromPath))) {
        return fromPath;
    }
    return fromPath || parseCardLabel(doc).tur || doc.title || 'evrak.pdf';
}

async function waitForNewWalk(previousAt: string | null, timeoutMs = 180000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const next = await DataService.getUyapBridgeStatus();
        const last =
            next.lastInteractiveWalk ||
            ((next.scanningQuietly || !next.walkRunning) ? next.lastWalk : null);
        const stamp = last?.at ?? null;
        const done = Boolean(last?.finished || last?.error || last?.stopped || last?.ok === false);
        if (last?.job === 'download' && stamp && stamp !== previousAt && done) {
            return last;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 400));
    }
    return null;
}

async function waitForDocOnDisk(matterId: string, docId: string, timeoutMs = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const tree = await DataService.getUyapEvrakTree(matterId);
        const fresh = (tree.docs || []).find((row) => row.id === docId);
        if (fresh?.file_path) {
            const url = await DataService.fileUrlForPath(fresh.file_path);
            if (url) return { tree, fresh, url };
        }
        await new Promise((resolve) => window.setTimeout(resolve, 400));
    }
    return null;
}

async function openDocInMainViewer(doc: UyapEvrakDoc) {
    closeCommandPalette();
    await DataService.focusMainWindow();
    if (!doc.file_path) {
        toast.error('Dosya bulunamadı');
        return;
    }
    const url = await DataService.fileUrlForPath(doc.file_path);
    if (!url) {
        toast.error('Dosya bulunamadı');
        return;
    }
    useLayoutStore.getState().openInNewViewerTab({
        url,
        name: viewerNameForDoc(doc),
        previewDocumentId: isPreviewCacheDoc(doc) ? doc.id : undefined,
    });
}

function docItemKey(doc: UyapEvrakDoc): string | null {
    try {
        const meta = doc.metadata ? JSON.parse(doc.metadata) : {};
        return typeof meta?.uyap?.itemKey === 'string' ? meta.uyap.itemKey : null;
    } catch {
        return null;
    }
}

function parseCardLabel(doc: UyapEvrakDoc & { portal_date?: string | null }): { tur: string; date: string } {
    let tur = doc.title || 'Evrak';
    let dateRaw = '';
    try {
        const meta = doc.metadata ? JSON.parse(doc.metadata) : {};
        const uyap = meta?.uyap ?? {};
        if (typeof uyap.tur === 'string' && uyap.tur.trim()) tur = uyap.tur.trim();
        if (typeof uyap.tarih === 'string' && uyap.tarih.trim()) dateRaw = uyap.tarih.trim();
        else if (typeof uyap.sistemeGonderildigiTarih === 'string' && uyap.sistemeGonderildigiTarih.trim()) {
            dateRaw = uyap.sistemeGonderildigiTarih.trim();
        }
    } catch {
        /* keep title */
    }
    const incoming =
        doc.incoming_date && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:/.test(String(doc.incoming_date).trim())
            ? ''
            : doc.incoming_date;
    const date = formatEvrakDate(doc.portal_date) || formatEvrakDate(dateRaw) || formatEvrakDate(incoming);
    return { tur, date };
}

function pickMatchesNeedle(row: UyapMatterPick, needle: string): boolean {
    const q = needle.trim();
    if (!q) return false;
    return [row.file_number, row.title, row.court_name || ''].some((value) => turkishIncludes(value, q));
}

function matterToPick(matter: Matter | null | undefined): UyapMatterPick | null {
    if (!matter?.id) return null;
    const fileNumber = String(matter.file_number || '').trim();
    if (!fileNumber) return null;
    return {
        id: matter.id,
        title: matter.title,
        file_number: fileNumber,
        court_name: matter.court_name ?? null,
        matter_type: matter.matter_type ?? null,
        status: matter.status,
    };
}

function recentToPick(row: UyapRecentEvrak): UyapMatterPick | null {
    const fileNumber = String(row.file_number || '').trim();
    if (!row.matter_id || !fileNumber) return null;
    return {
        id: row.matter_id,
        title: row.matter_title,
        file_number: fileNumber,
        court_name: row.court_name || row.birimAdi || null,
        matter_type: row.matter_type,
        status: row.status,
    };
}

function recentToDoc(row: UyapRecentEvrak): UyapEvrakDoc {
    return {
        id: row.id,
        folder_id: null,
        title: row.title,
        file_path: row.file_path ?? null,
        incoming_date: row.incoming_date,
        metadata: row.metadata,
    };
}

function MatterKunyeText({
    fileNumber,
    courtName,
    fallbackTitle,
    partiesLine,
    fileCourtSep,
}: {
    fileNumber: string;
    courtName?: string | null;
    fallbackTitle?: string | null;
    partiesLine?: string;
    fileCourtSep: '—' | '·';
}) {
    const court = courtName ? displayCourtName(courtName) : String(fallbackTitle || '').trim();
    return (
        <>
            <span className="tabular-nums">{fileNumber}</span>
            {court ? ` ${fileCourtSep} ${court}` : null}
            {partiesLine ? <span className="font-normal text-muted-foreground"> · {partiesLine}</span> : null}
        </>
    );
}

function recentCourtName(row: UyapRecentEvrak): string {
    const fromCols = String(row.court_name || row.birimAdi || '').trim();
    if (fromCols) return displayCourtName(fromCols);
    try {
        const meta = row.metadata ? JSON.parse(row.metadata) : {};
        const fromDoc = String(meta?.uyap?.birimAdi || '').trim();
        if (fromDoc) return displayCourtName(fromDoc);
    } catch {
        /* keep fallback */
    }
    return 'Mahkeme Bilgisi Yok';
}

function recentCardLabel(row: UyapRecentEvrak): { tur: string; date: string } {
    return parseCardLabel({
        id: row.id,
        folder_id: null,
        title: row.title,
        file_path: row.file_path ?? null,
        incoming_date: row.incoming_date,
        portal_date: row.portal_date,
        metadata: row.metadata,
    });
}

function ViewEvrakButton({
    onClick,
    disabled,
    title = 'Görüntüle',
}: {
    onClick: () => void;
    disabled?: boolean;
    title?: string;
}) {
    return (
        <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            title={title}
            aria-label={title}
            className="h-6 shrink-0 gap-0.5 px-1.5 text-[11px] @[12rem]:px-2"
            onClick={onClick}
        >
            <MaterialIcon icon="visibility" size={14} className="shrink-0" aria-hidden />
            <span className="hidden @[12rem]:inline">Görüntüle</span>
        </Button>
    );
}

function DownloadEvrakButton({
    onClick,
    disabled,
    title = 'İndir',
}: {
    onClick: () => void;
    disabled?: boolean;
    title?: string;
}) {
    return (
        <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            title={title}
            aria-label={title}
            className="h-6 shrink-0 gap-0.5 px-1.5 text-[11px] @[12rem]:px-2"
            onClick={onClick}
        >
            <MaterialIcon icon="download" size={14} className="shrink-0" aria-hidden />
            <span className="hidden @[12rem]:inline">İndir</span>
        </Button>
    );
}

function isRecentEvrakHintTarget(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest('[data-recent-evrak-hint]'));
}

function RecentEvrakRow({
    row,
    selected,
    busy,
    katirLive,
    onSelect,
    onView,
    onDownload,
}: {
    row: UyapRecentEvrak;
    selected: boolean;
    busy: boolean;
    katirLive: boolean;
    onSelect: (row: UyapRecentEvrak) => void;
    onView: (row: UyapRecentEvrak) => void;
    onDownload: (row: UyapRecentEvrak) => void;
}) {
    const hintId = useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const { tur, date } = recentCardLabel(row);
    const court = recentCourtName(row);
    const partiesLine = String(row.parties_line || '').trim();
    const typeLabel = String(row.dosya_tur_label || '').trim();
    const hasHints = Boolean(partiesLine || typeLabel);
    const [hintOpen, setHintOpen] = useState(false);

    const button = (
        <button
            ref={triggerRef}
            type="button"
            aria-describedby={hasHints ? hintId : undefined}
            className={cn(
                'min-w-0 w-full flex-1 rounded-lg px-2 py-1 text-left hover:bg-accent/50',
                selected
                    ? 'bg-primary/20 text-foreground ring-1 ring-inset ring-primary/45'
                    : 'text-foreground/80',
            )}
            onClick={() => onSelect(row)}
            onFocus={() => {
                if (hasHints) setHintOpen(true);
            }}
            onBlur={(event) => {
                if (isRecentEvrakHintTarget(event.relatedTarget)) return;
                setHintOpen(false);
            }}
        >
            <span className="block min-w-0 truncate">
                {row.file_number}
                <span className="text-muted-foreground"> · {tur}</span>
            </span>
            <span className="block min-w-0 truncate text-[11px] text-muted-foreground">
                {court}
                {date ? ` · ${date}` : ''}
            </span>
        </button>
    );

    return (
        <li className="flex min-w-0 items-center gap-1.5">
            {hasHints ? (
                <div className="min-w-0 flex-1">
                    <HoverCard
                        open={hintOpen}
                        onOpenChange={(next) => {
                            if (!next && triggerRef.current === document.activeElement) return;
                            setHintOpen(next);
                        }}
                        openDelay={RECENT_HINT_OPEN_DELAY_MS}
                        closeDelay={RECENT_HINT_CLOSE_DELAY_MS}
                    >
                        <HoverCardTrigger asChild>{button}</HoverCardTrigger>
                        <HoverCardContent
                            id={hintId}
                            data-recent-evrak-hint=""
                            side="right"
                            align="start"
                            sideOffset={10}
                            collisionPadding={8}
                            variant="glass"
                            className="z-[var(--z-command-palette-floating)] w-72 max-w-[18rem] p-3"
                        >
                            <MatterHintDrawer partiesLine={partiesLine} typeLabel={typeLabel} />
                        </HoverCardContent>
                    </HoverCard>
                </div>
            ) : (
                button
            )}
            <ViewEvrakButton
                disabled={busy || (!katirLive && !row.file_path)}
                title={!katirLive && !row.file_path ? 'Katır ile indirilir' : 'Görüntüle'}
                onClick={() => onView(row)}
            />
            <DownloadEvrakButton
                disabled={busy || !katirLive}
                title={katirLive ? 'İndir' : 'Katır ile indirilir'}
                onClick={() => onDownload(row)}
            />
        </li>
    );
}

function EvrakCardRow({
    doc,
    ek = [],
    onView,
    onDownload,
    liveEnabled,
}: {
    doc: UyapEvrakDoc;
    ek?: UyapEvrakDoc[];
    onView: (doc: UyapEvrakDoc) => void;
    onDownload: (doc: UyapEvrakDoc) => void;
    liveEnabled: boolean;
}) {
    const { tur, date } = parseCardLabel(doc);
    const hasEk = ek.length > 0;
    const [open, setOpen] = useState(false);
    const label = hasEk ? `${tur} (${ek.length} ek)` : tur;
    return (
        <li className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5 py-0.5 pl-3 text-sm">
                {hasEk ? (
                    <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        aria-expanded={open}
                        onClick={() => setOpen((value) => !value)}
                    >
                        <MaterialIcon
                            icon="chevron_right"
                            size={14}
                            className={cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
                        />
                        <MaterialIcon
                            icon={doc.file_path ? 'draft' : 'description'}
                            size={15}
                            className="shrink-0 text-muted-foreground"
                        />
                        <span className="min-w-0 flex-1 truncate">
                            {label}
                            {date ? <span className="ml-1.5 text-[11px] text-muted-foreground">{date}</span> : null}
                        </span>
                    </button>
                ) : (
                    <>
                        <MaterialIcon
                            icon={doc.file_path ? 'draft' : 'description'}
                            size={15}
                            className="shrink-0 text-muted-foreground"
                        />
                        <span className="min-w-0 flex-1 truncate">
                            {label}
                            {date ? <span className="ml-1.5 text-[11px] text-muted-foreground">{date}</span> : null}
                        </span>
                    </>
                )}
                <ViewEvrakButton
                    disabled={!liveEnabled && !doc.file_path}
                    title={!liveEnabled && !doc.file_path ? 'Katır ile indirilir' : 'Görüntüle'}
                    onClick={() => onView(doc)}
                />
                <DownloadEvrakButton
                    disabled={!liveEnabled}
                    title={liveEnabled ? 'İndir' : 'Katır ile indirilir'}
                    onClick={() => onDownload(doc)}
                />
            </div>
            {hasEk && open ? (
                <ul className="min-w-0 pl-4">
                    {ek.map((child) => (
                        <EvrakCardRow
                            key={child.id}
                            doc={child}
                            onView={onView}
                            onDownload={onDownload}
                            liveEnabled={liveEnabled}
                        />
                    ))}
                </ul>
            ) : null}
        </li>
    );
}

function TurFolderNode({
    folder,
    onView,
    onDownload,
    liveEnabled,
}: {
    folder: DerivedTurFolder;
    onView: (doc: UyapEvrakDoc) => void;
    onDownload: (doc: UyapEvrakDoc) => void;
    liveEnabled: boolean;
}) {
    const [open, setOpen] = useState(false);
    return (
        <Collapsible open={open} onOpenChange={setOpen} className="min-w-0 pl-3">
            <CollapsibleTrigger className="flex w-full min-w-0 items-center gap-1 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                <MaterialIcon
                    icon="chevron_right"
                    size={14}
                    className={cn('shrink-0 transition-transform', open && 'rotate-90')}
                />
                <MaterialIcon icon="folder" size={14} className="shrink-0" />
                <span className="min-w-0 truncate text-left">
                    {folder.tur} <span className="ml-1 text-[10px] opacity-70">({folder.docs.length})</span>
                </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <ul className="min-w-0 pl-4">
                    {folder.docs.map((node) => (
                        <EvrakCardRow
                            key={node.doc.id}
                            doc={node.doc}
                            ek={node.ek}
                            onView={onView}
                            onDownload={onDownload}
                            liveEnabled={liveEnabled}
                        />
                    ))}
                </ul>
            </CollapsibleContent>
        </Collapsible>
    );
}

function RelatedGroupNode({
    group,
    onView,
    onDownload,
    liveEnabled,
}: {
    group: DerivedRelatedGroup;
    onView: (doc: UyapEvrakDoc) => void;
    onDownload: (doc: UyapEvrakDoc) => void;
    liveEnabled: boolean;
}) {
    const [open, setOpen] = useState(true);
    return (
        <Collapsible open={open} onOpenChange={setOpen} className="min-w-0 pl-1 mt-1">
            <CollapsibleTrigger className="flex w-full min-w-0 items-center gap-1 py-0.5 text-xs font-medium text-foreground hover:bg-accent/30 rounded-sm px-1">
                <MaterialIcon
                    icon="chevron_right"
                    size={14}
                    className={cn('shrink-0 transition-transform', open && 'rotate-90')}
                />
                <MaterialIcon icon="topic" size={14} className="shrink-0 text-primary/80" />
                <span className="min-w-0 truncate text-left">{group.label}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="min-w-0 mt-0.5">
                    {group.turFolders.map((folder) => (
                        <TurFolderNode
                            key={folder.tur}
                            folder={folder}
                            onView={onView}
                            onDownload={onDownload}
                            liveEnabled={liveEnabled}
                        />
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

const EMPTY_BY_TYPE: Record<UyapDosyaTurBucket, number> = {
    icra: 0,
    hukuk: 0,
    ceza: 0,
    idare: 0,
    other: 0,
};

const TYPE_BAR_COLORS: Record<UyapDosyaTurBucket, string> = {
    icra: 'color-mix(in srgb, var(--primary) 55%, #2f8f78)',
    hukuk: 'var(--primary)',
    ceza: 'color-mix(in srgb, var(--primary) 35%, #c4a056)',
    idare: 'color-mix(in srgb, var(--primary) 40%, #6a7aa8)',
    other: 'color-mix(in srgb, var(--muted-foreground) 50%, transparent)',
};

const TYPE_LEGEND: Array<{ bucket: UyapDosyaTurBucket; label: string }> = [
    { bucket: 'icra', label: 'İcra' },
    { bucket: 'hukuk', label: 'Hukuk' },
    { bucket: 'ceza', label: 'Ceza' },
    { bucket: 'idare', label: 'İdari' },
    { bucket: 'other', label: 'Diğer' },
];

function typeCountsOf(row: UyapOpeningMonthRow | undefined): Record<UyapDosyaTurBucket, number> {
    return row?.byType ?? EMPTY_BY_TYPE;
}

function stackBarPx(
    byType: Record<UyapDosyaTurBucket, number>,
    max: number,
    barMaxPx: number,
): Array<{ bucket: UyapDosyaTurBucket; px: number }> {
    const order: UyapDosyaTurBucket[] = ['icra', 'hukuk', 'ceza', 'idare', 'other'];
    const total = order.reduce((sum, key) => sum + (byType[key] || 0), 0);
    if (total <= 0 || max <= 0) return [];
    const pxTotal = Math.max(4, Math.round((total / max) * barMaxPx));
    const present = order.filter((key) => (byType[key] || 0) > 0);
    let remaining = pxTotal;
    return present.map((bucket, index) => {
        const isLast = index === present.length - 1;
        const px = isLast ? remaining : Math.max(1, Math.round(((byType[bucket] || 0) / total) * pxTotal));
        remaining = Math.max(0, remaining - px);
        return { bucket, px };
    });
}

function monthAxisLabel(key: string, withYear: boolean): string {
    const label = monthLabel(key);
    if (!withYear) return label;
    const year = key.slice(0, 4);
    return year ? `${label} ${year.slice(2)}` : label;
}

function sliceOpeningChartMonths(
    months: UyapOpeningMonthRow[],
    range: ChartRangeMonths,
): UyapOpeningMonthRow[] {
    switch (range) {
        case 12:
        case 24:
        case 36:
        case 48:
        case 60:
            return months.slice(-range);
        default: {
            const _never: never = range;
            return _never;
        }
    }
}

function chartAxisLabelStep(length: number): number {
    if (length > 48) return 6;
    if (length > 36) return 4;
    if (length > 20) return 3;
    if (length > 14) return 2;
    return 1;
}

function IcraTakipSplitList({ dash }: { dash: UyapDashboardStats }) {
    const rows = [
        {
            key: 'alacakli',
            label: 'Alacak Takibi',
            open: dash.icraAlacakliOpen ?? 0,
            count: dash.icraAlacakli ?? 0,
            amount: dash.alacakAlacakli ?? 0,
            amountOpen: dash.alacakAlacakliOpen ?? 0,
        },
        {
            key: 'borclu',
            label: 'Borç Takibi',
            open: dash.icraBorcluOpen ?? 0,
            count: dash.icraBorclu ?? 0,
            amount: dash.alacakBorclu ?? 0,
            amountOpen: dash.alacakBorcluOpen ?? 0,
        },
    ];
    const any = rows.some((row) => row.count > 0 || row.amount > 0);
    if (!any) {
        return <p className="text-xs text-muted-foreground">Müvekkil Alacaklı / Borçlu Kaydı Yok.</p>;
    }
    return (
        <ul className="space-y-1">
            {rows.map((row) => (
                <li key={row.key} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate">{row.label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatPair(row.open, row.count)}
                        {row.amount > 0
                            ? ` · ${formatCompactMoney(row.amountOpen)} / ${formatCompactMoney(row.amount)} TL`
                            : ''}
                    </span>
                </li>
            ))}
        </ul>
    );
}

function BreakdownList({ rows }: { rows: UyapBreakdownRow[] }) {
    if (rows.length === 0) {
        return <p className="text-xs text-muted-foreground">Kayıtlı Alt Tür Yok.</p>;
    }
    return (
        <ul className="space-y-1">
            {rows.map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate">{toTurkishTitleCase(row.label)}</span>
                    <span className="tabular-nums text-muted-foreground">
                        {formatPair(row.open ?? 0, row.count)}
                    </span>
                </li>
            ))}
        </ul>
    );
}

function breakdownTitleFor(bucket: UyapDosyaTurBucket): string {
    switch (bucket) {
        case 'icra':
            return 'Alacak Takibi / Borç Takibi';
        case 'hukuk':
            return 'Hukuk / Dava Mahkeme Türü';
        case 'ceza':
            return 'Ceza Mahkeme Türü';
        case 'idare':
            return 'İdari Mahkeme Türü';
        case 'other':
            return 'Diğer Mahkeme Türü';
        default: {
            const _never: never = bucket;
            return _never;
        }
    }
}

function monthBarAriaLabel(row: UyapOpeningMonthRow): string {
    const byType = typeCountsOf(row);
    const types = TYPE_LEGEND.filter((item) => (byType[item.bucket] || 0) > 0)
        .map((item) => `${item.label} ${byType[item.bucket]}`)
        .join(', ');
    const bits = [`${row.month}: ${row.count} dosya açıldı`];
    if (types) bits.push(types);
    if ((row.icraAlacak || 0) > 0) bits.push(`İcra Alacak ${formatMoney(row.icraAlacak)} TL`);
    const alacakli = row.icraAlacakAlacakli || 0;
    const borclu = row.icraAlacakBorclu || 0;
    if (alacakli > 0) bits.push(`Müvekkil Alacaklı ${formatMoney(alacakli)} TL`);
    if (borclu > 0) bits.push(`Müvekkil Borçlu ${formatMoney(borclu)} TL`);
    if ((row.closedThisMonth || 0) > 0) bits.push(`bu ay kapanan ${row.closedThisMonth}`);
    if ((row.closed || 0) > 0) bits.push(`bu ay açılıp kapanmış ${row.closed}`);
    return bits.join(' · ');
}

const SPARK_PAD_PX = 2;
const PLOT_H = 120;
const STROKE_ALACAKLI = 'color-mix(in srgb, var(--foreground) 55%, #c4a056)';
const STROKE_BORCLU = 'color-mix(in srgb, var(--foreground) 50%, #5b87b8)';
const STROKE_ALACAK = 'color-mix(in srgb, var(--foreground) 65%, #c4a056)';
const STROKE_CLOSE = 'color-mix(in srgb, var(--muted-foreground) 85%, #8b5a2b)';
const STROKE_STOCK = 'color-mix(in srgb, var(--foreground) 70%, #3d6b5a)';
const HAREKETSIZ_SNOOZE_MONTHS = [1, 3, 6] as const;

function hareketsizSnoozeUntilIso(months: (typeof HAREKETSIZ_SNOOZE_MONTHS)[number]): string {
    switch (months) {
        case 1:
        case 3:
        case 6: {
            const d = new Date();
            d.setMonth(d.getMonth() + months);
            return d.toISOString();
        }
        default: {
            const _never: never = months;
            return _never;
        }
    }
}

function shouldLogSpark(values: number[]): boolean {
    const positive = values.filter((value) => value > 0);
    if (positive.length < 2) return false;
    const max = Math.max(...positive);
    const sorted = [...positive].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return median > 0 && max / median >= 8;
}

function sparkScaleUnit(value: number, max: number, log: boolean): number {
    if (max <= 0) return 0;
    const clamped = Math.max(0, value);
    if (!log) return Math.min(1, clamped / max);
    const top = Math.log10(1 + max);
    if (top <= 0) return 0;
    return Math.min(1, Math.log10(1 + clamped) / top);
}

function sparkPoints(
    values: number[],
    heightPx: number,
    options?: { log?: boolean; sharedMax?: number },
): string | null {
    const n = values.length;
    if (n === 0 || heightPx <= 0) return null;
    const max = options?.sharedMax != null ? options.sharedMax : Math.max(0, ...values);
    if (max <= 0) return null;
    const inner = Math.max(0, heightPx - SPARK_PAD_PX * 2);
    const log = Boolean(options?.log);
    return values
        .map((value, i) => {
            const y = heightPx - SPARK_PAD_PX - sparkScaleUnit(value, max, log) * inner;
            const clipped = Math.min(heightPx - SPARK_PAD_PX, Math.max(SPARK_PAD_PX, y));
            return `${i + 0.5},${clipped}`;
        })
        .join(' ');
}

function monthHoverLines(row: UyapOpeningMonthRow, options?: { showAktifStok?: boolean }): string[] {
    const byType = typeCountsOf(row);
    const types = TYPE_LEGEND.filter((item) => (byType[item.bucket] || 0) > 0)
        .map((item) => `${item.label} ${byType[item.bucket]}`)
        .join(' · ');
    const closedThisMonth = row.closedThisMonth || 0;
    const lines = [
        `${monthAxisLabel(row.month, true)} · Açılan ${formatCount(row.count)} · Kapanan ${formatCount(closedThisMonth)}`,
    ];
    if (types) lines.push(types);
    const alacakli = row.icraAlacakAlacakli || 0;
    const borclu = row.icraAlacakBorclu || 0;
    const alacak = row.icraAlacak || 0;
    if (alacakli > 0 || borclu > 0) {
        lines.push(`Alacaklı ${formatCompactMoney(alacakli)} · Borçlu ${formatCompactMoney(borclu)}`);
    } else if (alacak > 0) {
        lines.push(`${formatCompactMoney(alacak)} TL`);
    }
    const netStock = 'netStock' in row ? Number((row as ChartPlotMonth).netStock) : NaN;
    if (options?.showAktifStok && Number.isFinite(netStock)) {
        lines.push(`Aktif stok ${formatCount(netStock)}`);
    }
    return lines;
}

function OpeningMonthFocus({ row }: { row: UyapOpeningMonthRow }) {
    const byType = typeCountsOf(row);
    const types = TYPE_LEGEND.filter((item) => (byType[item.bucket] || 0) > 0);
    const alacakli = row.icraAlacakAlacakli || 0;
    const borclu = row.icraAlacakBorclu || 0;
    const alacak = row.icraAlacak || 0;
    const closedThisMonth = row.closedThisMonth || 0;
    const topLabels = row.topLabels || [];
    const moneyBits: string[] = [];
    if (alacakli > 0 || borclu > 0) {
        moneyBits.push(`A ${formatCompactMoney(alacakli)}`, `B ${formatCompactMoney(borclu)}`);
    } else if (alacak > 0) {
        moneyBits.push(`${formatCompactMoney(alacak)} TL`);
    }
    if (closedThisMonth > 0) moneyBits.push(`Kapanan ${closedThisMonth}`);
    return (
        <div className="mt-1.5 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                <span className="font-medium tabular-nums">{monthAxisLabel(row.month, true)}</span>
                <span className="tabular-nums text-muted-foreground">{formatCount(row.count)}</span>
                {types.map((item) => (
                    <span key={item.bucket} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span
                            className="inline-block h-1.5 w-1.5 rounded-sm"
                            style={{ backgroundColor: TYPE_BAR_COLORS[item.bucket] }}
                            aria-hidden
                        />
                        {item.label}
                        <span className="tabular-nums text-foreground/80">{byType[item.bucket]}</span>
                    </span>
                ))}
            </div>
            {moneyBits.length > 0 ? (
                <p className="text-[10px] tabular-nums text-muted-foreground">{moneyBits.join(' · ')}</p>
            ) : null}
            {topLabels.length > 0 ? (
                <p className="truncate text-[10px] text-muted-foreground">
                    {topLabels.map((item) => `${item.label} ${item.count}`).join(' · ')}
                </p>
            ) : null}
        </div>
    );
}

function SeriesChip({
    on,
    onClick,
    label,
    swatch,
}: {
    on: boolean;
    onClick: () => void;
    label: string;
    swatch: React.ReactNode;
}) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onClick}
            className={cn(
                'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] shadow-sm backdrop-blur-xl',
                on
                    ? 'border-primary/50 bg-primary/15 text-foreground'
                    : 'border-border/60 bg-card/45 text-muted-foreground hover:bg-accent/40',
            )}
        >
            {swatch}
            {label}
        </button>
    );
}

const OpeningTimeline = React.memo(function OpeningTimeline({
    months,
    series,
    mode,
    showAktifStok,
    selectedMonth,
    onSelectMonth,
    onToggleSeries,
}: {
    months: ChartPlotMonth[];
    series: KatirChartSeries;
    mode: KatirChartMode;
    showAktifStok: boolean;
    selectedMonth: string | null;
    onSelectMonth: (month: string | null) => void;
    onToggleSeries: (key: keyof KatirChartSeries) => void;
}) {
    const reactId = useId().replace(/:/g, '');
    const clipId = `plot-clip-${reactId}`;
    const [hoverMonth, setHoverMonth] = useState<string | null>(null);
    const typesOn = TYPE_LEGEND.some((row) => series[row.bucket]);
    const stockSeries = showAktifStok ? months.map((row) => row.netStock) : [];
    const closingSeries = months.map((row) => row.closedThisMonth || 0);
    const alacakliSeries = months.map((row) => row.icraAlacakAlacakli || 0);
    const borcluSeries = months.map((row) => row.icraAlacakBorclu || 0);
    const totalAlacak = months.map((row) => row.icraAlacak || 0);
    const splitAlacak = alacakliSeries.some((v) => v > 0) && borcluSeries.some((v) => v > 0);
    const amountSeries = splitAlacak
        ? [
              { key: 'alacakli', values: alacakliSeries, color: STROKE_ALACAKLI },
              { key: 'borclu', values: borcluSeries, color: STROKE_BORCLU },
          ]
        : totalAlacak.some((v) => v > 0)
          ? [{ key: 'alacak', values: totalAlacak, color: STROKE_ALACAK }]
          : [];
    const financeOn = amountSeries.some((item) => item.values.some((v) => v > 0));
    const countMax = Math.max(
        0,
        ...months.map((row) =>
            Math.max(typesOn ? row.count : 0, series.kapanis ? row.closedThisMonth || 0 : 0, showAktifStok ? row.netStock : 0),
        ),
    );
    const focusKey = hoverMonth || selectedMonth;
    const focus = months.find((row) => row.month === focusKey);
    const hover = months.find((row) => row.month === hoverMonth);
    const amountLog = shouldLogSpark(amountSeries.flatMap((item) => item.values));
    const tlMax = Math.max(0, ...amountSeries.flatMap((item) => item.values));
    const n = Math.max(1, months.length);
    const countScaleMax = countMax;
    const closePoints =
        series.kapanis && countScaleMax > 0 ? sparkPoints(closingSeries, PLOT_H, { sharedMax: countScaleMax }) : null;
    const stockPoints =
        showAktifStok && countScaleMax > 0 ? sparkPoints(stockSeries, PLOT_H, { sharedMax: countScaleMax }) : null;
    const amountPolylines = amountSeries
        .map((item) => ({
            ...item,
            points: sparkPoints(item.values, PLOT_H, { log: amountLog, sharedMax: tlMax }),
        }))
        .filter((item) => item.points);
    const showClose = series.kapanis && closingSeries.some((v) => v > 0);
    const showCountAxis = countScaleMax > 0;
    const showMoneyAxis = financeOn && tlMax > 0;
    const hasPlot = showCountAxis || showMoneyAxis;
    const seriesChips = (
        <div className="mt-1.5 flex flex-wrap items-center justify-start gap-1">
            {TYPE_LEGEND.map((row) => (
                <SeriesChip
                    key={row.bucket}
                    on={series[row.bucket]}
                    onClick={() => onToggleSeries(row.bucket)}
                    label={row.label}
                    swatch={
                        <span
                            className="inline-block h-1.5 w-1.5 rounded-sm"
                            style={{ backgroundColor: TYPE_BAR_COLORS[row.bucket], opacity: series[row.bucket] ? 1 : 0.35 }}
                            aria-hidden
                        />
                    }
                />
            ))}
            <SeriesChip
                on={series.alacakli}
                onClick={() => onToggleSeries('alacakli')}
                label="Alacaklı"
                swatch={
                    <span className="inline-block w-3" style={{ height: 2, backgroundColor: STROKE_ALACAKLI }} aria-hidden />
                }
            />
            <SeriesChip
                on={series.borclu}
                onClick={() => onToggleSeries('borclu')}
                label="Borçlu"
                swatch={
                    <span className="inline-block w-3" style={{ height: 2, backgroundColor: STROKE_BORCLU }} aria-hidden />
                }
            />
            <SeriesChip
                on={series.kapanis}
                onClick={() => onToggleSeries('kapanis')}
                label={mode === 'cumulative' ? 'Kümülatif Kapanış' : 'Kapanış'}
                swatch={
                    <span className="inline-block w-3" style={{ height: 2, backgroundColor: STROKE_CLOSE }} aria-hidden />
                }
            />
            {mode === 'cumulative' ? (
                <SeriesChip
                    on={series.aktifStok}
                    onClick={() => onToggleSeries('aktifStok')}
                    label="Aktif Stok"
                    swatch={
                        <span className="inline-block w-3" style={{ height: 2, backgroundColor: STROKE_STOCK }} aria-hidden />
                    }
                />
            ) : null}
        </div>
    );
    return (
        <div>
            {!hasPlot ? (
                <p className="text-xs text-muted-foreground">
                    {months.length === 0 ? 'Açılış Tarihi Olan Dosya Yok.' : 'Gösterilecek seri seçin.'}
                </p>
            ) : (
                <div>
                    <div className="mb-0.5 flex items-center justify-between gap-2 text-[9px] text-muted-foreground">
                        <span className="tabular-nums">{showCountAxis ? formatCount(countScaleMax) : ''}</span>
                        {showMoneyAxis ? (
                            <span className="inline-flex items-center gap-1">
                                <span className="tabular-nums">{formatCompactMoney(tlMax)}</span>
                                {amountLog ? (
                                    <span className="rounded border border-border/60 px-1 py-px text-[8px] leading-none tracking-wide">
                                        log
                                    </span>
                                ) : null}
                            </span>
                        ) : null}
                    </div>
                    <div className="relative overflow-hidden rounded-md" style={{ height: PLOT_H }}>
                        <svg
                            className="absolute inset-0 block h-full w-full overflow-hidden"
                            viewBox={`0 0 ${n} ${PLOT_H}`}
                            preserveAspectRatio="none"
                            aria-hidden
                        >
                            <defs>
                                <clipPath id={clipId}>
                                    <rect x="0" y="0" width={n} height={PLOT_H} />
                                </clipPath>
                            </defs>
                            <g clipPath={`url(#${clipId})`}>
                                <line
                                    x1="0"
                                    y1={PLOT_H - 0.4}
                                    x2={n}
                                    y2={PLOT_H - 0.4}
                                    stroke="currentColor"
                                    strokeOpacity="0.18"
                                    vectorEffect="non-scaling-stroke"
                                />
                                {typesOn && countScaleMax > 0
                                    ? months.map((row, index) => {
                                          const segsRaw = stackBarPx(typeCountsOf(row), countScaleMax, PLOT_H);
                                          const segs =
                                              segsRaw.length > 0
                                                  ? segsRaw
                                                  : row.count > 0
                                                    ? [
                                                          {
                                                              bucket: 'other' as UyapDosyaTurBucket,
                                                              px: Math.max(4, Math.round((row.count / countScaleMax) * PLOT_H)),
                                                          },
                                                      ]
                                                    : [];
                                          let yBottom = PLOT_H;
                                          return (
                                              <g key={row.month}>
                                                  {segs.map((seg) => {
                                                      const h = seg.px;
                                                      yBottom -= h;
                                                      return (
                                                          <rect
                                                              key={seg.bucket}
                                                              x={index + 0.16}
                                                              y={yBottom}
                                                              width={0.68}
                                                              height={h}
                                                              rx={0.04}
                                                              fill={TYPE_BAR_COLORS[seg.bucket]}
                                                              opacity={selectedMonth && selectedMonth !== row.month ? 0.45 : 0.92}
                                                          />
                                                      );
                                                  })}
                                              </g>
                                          );
                                      })
                                    : null}
                                {amountPolylines.map((item) => (
                                    <polyline
                                        key={item.key}
                                        fill="none"
                                        stroke={item.color}
                                        strokeWidth="1.6"
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                        vectorEffect="non-scaling-stroke"
                                        points={item.points!}
                                    />
                                ))}
                                {showClose && closePoints ? (
                                    <polyline
                                        fill="none"
                                        stroke={STROKE_CLOSE}
                                        strokeWidth="1.35"
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                        vectorEffect="non-scaling-stroke"
                                        points={closePoints}
                                    />
                                ) : null}
                                {showAktifStok && stockPoints ? (
                                    <polyline
                                        fill="none"
                                        stroke={STROKE_STOCK}
                                        strokeWidth="1.5"
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                        vectorEffect="non-scaling-stroke"
                                        points={stockPoints}
                                    />
                                ) : null}
                            </g>
                        </svg>
                        <div className="absolute inset-0 flex">
                            {months.map((row) => {
                                const selected = selectedMonth === row.month;
                                return (
                                    <button
                                        key={row.month}
                                        type="button"
                                        className={cn(
                                            'min-w-0 flex-1 rounded-sm',
                                            selected && 'bg-primary/10',
                                            hoverMonth === row.month && !selected && 'bg-foreground/5',
                                        )}
                                        aria-pressed={selected}
                                        aria-label={monthBarAriaLabel(row)}
                                        onMouseEnter={() => setHoverMonth(row.month)}
                                        onMouseLeave={() => setHoverMonth(null)}
                                        onClick={() => onSelectMonth(selected ? null : row.month)}
                                    />
                                );
                            })}
                        </div>
                        {hover ? (
                            <div className="glass-tooltip pointer-events-none absolute right-1.5 top-1.5 z-10 max-w-[min(52%,240px)] rounded-md px-2 py-1.5 text-[10px] leading-snug shadow-lg">
                                {monthHoverLines(hover, { showAktifStok }).map((line) => (
                                    <div key={line} className="truncate">
                                        {line}
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    <div className="mt-1 flex gap-1">
                        {months.map((row, index) => {
                            const prevYear = index > 0 ? months[index - 1]?.month.slice(0, 4) : '';
                            const withYear = index === 0 || row.month.slice(0, 4) !== prevYear;
                            const step = chartAxisLabelStep(months.length);
                            const show =
                                withYear ||
                                index === months.length - 1 ||
                                index % step === 0;
                            return (
                                <span
                                    key={`${row.month}-lbl`}
                                    className="min-w-0 flex-1 truncate text-center text-[9px] text-muted-foreground"
                                >
                                    {show ? monthAxisLabel(row.month, withYear) : ''}
                                </span>
                            );
                        })}
                    </div>
                    {focus && !hover ? <OpeningMonthFocus row={focus} /> : null}
                </div>
            )}
            {seriesChips}
        </div>
    );
});

function trailingWindowOf(
    trailing: UyapTrailingOpenings | undefined,
    months: ChartRangeMonths,
): { count: number; byType: Record<UyapDosyaTurBucket, number>; icraAlacakAlacakli: number; icraAlacakBorclu: number } {
    const empty = {
        count: 0,
        byType: { ...EMPTY_BY_TYPE },
        icraAlacakAlacakli: 0,
        icraAlacakBorclu: 0,
    };
    const pick = (window: UyapTrailingOpenings['window12'], count: number | undefined) =>
        window
            ? {
                  count: window.count,
                  byType: { ...EMPTY_BY_TYPE, ...window.byType },
                  icraAlacakAlacakli: window.icraAlacakAlacakli,
                  icraAlacakBorclu: window.icraAlacakBorclu,
              }
            : { ...empty, count: count ?? 0 };
    switch (months) {
        case 12:
            return pick(trailing?.window12, trailing?.months12);
        case 24:
            return pick(trailing?.window24, trailing?.months24);
        case 36:
            return pick(trailing?.window36, trailing?.months36);
        case 48:
            return pick(trailing?.window48, trailing?.months48);
        case 60:
            return pick(trailing?.window60, trailing?.months60);
        default: {
            const _never: never = months;
            return _never;
        }
    }
}

function TrailingMetricsGrid({
    trailing,
    chartRange,
}: {
    trailing: UyapTrailingOpenings | undefined;
    chartRange: ChartRangeMonths;
}) {
    const windows = CHART_RANGE_MONTHS.map((n) => ({ n, metrics: trailingWindowOf(trailing, n) }));
    const rows: Array<{ key: string; label: string; value: (m: (typeof windows)[number]['metrics']) => number; money?: boolean }> = [
        { key: 'total', label: 'Açılış', value: (m) => m.count },
        { key: 'icra', label: 'İcra', value: (m) => m.byType.icra },
        { key: 'hukuk', label: 'Hukuk', value: (m) => m.byType.hukuk },
        { key: 'ceza', label: 'Ceza', value: (m) => m.byType.ceza },
        { key: 'idare', label: 'İdari', value: (m) => m.byType.idare },
        { key: 'other', label: 'Diğer', value: (m) => m.byType.other },
        { key: 'alacakli', label: 'Alacak Takipleri', value: (m) => m.icraAlacakAlacakli, money: true },
        { key: 'borclu', label: 'Borç Takipleri', value: (m) => m.icraAlacakBorclu, money: true },
    ];
    return (
        <div className="mb-1.5 overflow-hidden rounded-lg border border-border/60 bg-card/35 text-[10px] shadow-sm backdrop-blur-xl">
            <div className="grid grid-cols-[minmax(4.5rem,1fr)_repeat(5,minmax(0,1fr))] gap-px">
                <div className="px-1.5 py-1 text-muted-foreground">Son</div>
                {windows.map((col) => (
                    <div
                        key={col.n}
                        className={cn(
                            'px-1.5 py-1 text-center tabular-nums text-muted-foreground',
                            chartRange === col.n && 'font-medium text-foreground',
                        )}
                    >
                        {col.n} Ay
                    </div>
                ))}
                {rows.map((row) => (
                    <React.Fragment key={row.key}>
                        <div className="px-1.5 py-0.5 text-muted-foreground">{row.label}</div>
                        {windows.map((col) => {
                            const n = row.value(col.metrics);
                            return (
                                <div
                                    key={`${row.key}-${col.n}`}
                                    className={cn(
                                        'px-1.5 py-0.5 text-center tabular-nums',
                                        chartRange === col.n && 'font-medium text-foreground',
                                    )}
                                >
                                    {row.money ? formatCompactMoney(n) : formatCount(n)}
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}

function KatirMembershipPanel({
    entitlements,
    onChanged,
    variant,
}: {
    entitlements: AppEntitlements;
    onChanged?: () => void;
    variant: 'gate' | 'grace';
}) {
    const [busy, setBusy] = useState(false);
    const [activationCode, setActivationCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const copy = membershipCopy(entitlements);
    const dateLine = copy.dateIso ? formatScanClock(copy.dateIso) : null;
    const showAcquire = copy.acquireLabel === 'Katır Edin' || copy.acquireLabel === 'Katır Yenile';
    const showRemove = entitlements.signedIn && variant === 'gate';
    const showCodeBackup = variant === 'gate' && entitlements.phase !== 'entitled' && entitlements.phase !== 'grace';

    const onUpgradeSite = async () => {
        const result = await DataService.openExternalUrl(KATIR_UPGRADE_URL);
        if (!result.ok) toast.error(result.error || 'Sayfa açılamadı');
    };

    const onApplyCode = async () => {
        setBusy(true);
        setError(null);
        try {
            const result = await DataService.activateLicenseKey(activationCode.trim());
            if (!result.ok) {
                setError(result.error || 'Kod uygulanamadı');
                return;
            }
            setActivationCode('');
            onChanged?.();
        } finally {
            setBusy(false);
        }
    };

    const onRemoveKey = async () => {
        setBusy(true);
        try {
            await DataService.signOutAccount();
            onChanged?.();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={cn(glassCard, 'flex flex-col gap-3 p-3', membershipToneClass(copy.tone))}>
            <div className="flex items-start gap-2.5">
                <MaterialIcon
                    icon={copy.icon}
                    size={18}
                    className={cn(
                        'mt-0.5 shrink-0',
                        copy.tone === 'danger'
                            ? 'text-destructive'
                            : copy.tone === 'warning'
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-primary',
                    )}
                />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-medium text-foreground">{copy.title}</h2>
                        <span
                            className={cn(
                                'rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
                                membershipBadgeClass(copy.tone),
                            )}
                        >
                            {copy.badge}
                        </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.body}</p>
                    {copy.dateLabel && dateLine ? (
                        <p className="mt-1 text-[11px] tabular-nums text-foreground/85">
                            {copy.dateLabel} {dateLine}
                        </p>
                    ) : null}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {showAcquire && entitlements.phase !== 'entitled' ? (
                    <Button
                        type="button"
                        size="sm"
                        className="h-8 px-3"
                        disabled={busy}
                        onClick={() => void onUpgradeSite()}
                    >
                        {copy.acquireLabel}
                    </Button>
                ) : null}
                {showRemove ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-3"
                        disabled={busy}
                        onClick={() => void onRemoveKey()}
                    >
                        Anahtarı kaldır
                    </Button>
                ) : null}
            </div>
            {showCodeBackup ? (
                <form
                    className="flex min-w-0 flex-col gap-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void onApplyCode();
                    }}
                >
                    <Input
                        autoComplete="off"
                        placeholder="Aktivasyon kodu"
                        aria-label="Aktivasyon kodu"
                        value={activationCode}
                        error={Boolean(error)}
                        onChange={(event) => setActivationCode(event.target.value)}
                        className="h-9 border-border/70 bg-card/45"
                    />
                    {error ? <p className="text-xs text-destructive">{error}</p> : null}
                    <Button
                        type="submit"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-fit px-3"
                        disabled={busy || !activationCode.trim()}
                    >
                        Kodu uygula
                    </Button>
                </form>
            ) : null}
        </div>
    );
}

function KatirStatusRow({
    status,
    dash,
    entitlements,
}: {
    status: UyapBridgeStatus | null;
    dash: UyapDashboardStats | null;
    entitlements: AppEntitlements | null;
}) {
    const katirReady = Boolean(status?.up && status.sessionReady);
    const lastScanIso = status?.lastEvrakScanAt || dash?.lastEvrakScanAt || null;
    const lastScanLine = formatScanClock(lastScanIso);
    const extra = lastResultLine(status);
    const inventoryPercent =
        dash && dash.inventoryEligibleCount && dash.inventoryEligibleCount > 0
            ? dash.inventoryCurrentPercent
            : null;
    const added24h = dash?.evrakAddedLast24Hours;
    const catalogLine =
        typeof status?.catalogCoverage === 'string' && status.catalogCoverage.trim()
            ? `katalog ${status.catalogCoverage.trim()}`
            : null;

    return (
        <div className={cn(glassCard, 'flex items-center justify-between px-3 py-2 text-sm')}>
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <div
                    className="flex cursor-help items-center gap-1.5 font-medium"
                    title="Köprü ve oturum açıkken oturum süresince P ≥ 1.0 mikro-partiler listelenir; kullanıcı .ajx duraklatır"
                >
                    <MaterialIcon icon="sync_desktop" size={16} className={status?.up ? 'text-primary' : 'text-muted-foreground'} />
                    <span className="hidden sm:inline">Katır</span>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                    <StatusDot on={katirReady} />
                    <span className="hidden sm:inline">
                        {status?.up
                            ? status.seat?.mismatch
                                ? 'Koltuk uyuşmaz'
                                : status.sessionReady
                                  ? entitlements?.boundLawyerName
                                      ? `Oturum: ${entitlements.boundLawyerName}`
                                      : 'Oturum hazır'
                                  : 'Oturum yok'
                            : 'Köprü kapalı'}
                    </span>
                </div>

                <div className="h-3 w-px shrink-0 bg-border/50" />

                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="truncate text-foreground/90">{liveLine(status, entitlements)}</span>
                    {extra ? <span className="shrink-0 truncate">· {extra}</span> : null}
                    {lastScanLine ? (
                        <span className="shrink-0 tabular-nums text-foreground/85" title="Son damla taraması (app_meta / köprü). Tam ofis turu değil.">
                            · Son tarama {lastScanLine}
                        </span>
                    ) : null}
                    {inventoryPercent != null ? (
                        <span
                            className="shrink-0 tabular-nums text-foreground/85"
                            title={`Taranabilir künyede katalog süresi dolmamış dosyalar (P < 1.0). ${formatCount(dash?.inventoryCurrentCount ?? 0)} / ${formatCount(dash?.inventoryEligibleCount ?? 0)}. DLQ hariç. ${catalogLine || 'katalog N/M ağaç varlığıdır.'}`}
                        >
                            · Güncel %{formatCount(inventoryPercent)}
                        </span>
                    ) : catalogLine ? (
                        <span className="hidden shrink-0 truncate md:inline">· {catalogLine}</span>
                    ) : null}
                    {added24h != null ? (
                        <span
                            className="shrink-0 tabular-nums text-foreground/85"
                            title="Son 24 saatte veritabanına kaydedilen UYAP evrak kartı (created_at)."
                        >
                            · 24s +{formatCount(added24h)} evrak
                        </span>
                    ) : null}
                    {entitlements?.phase === 'entitled' && entitlements.periodEndsAt ? (
                        <span className="shrink-0 tabular-nums text-foreground/85">
                            · Üye {formatScanClock(entitlements.periodEndsAt)}
                        </span>
                    ) : null}
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 pl-2">
                {entitlements?.signedIn ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[11px]"
                        title="Lisansı kaldır ve köprüyü durdur"
                        onClick={() => {
                            void DataService.signOutAccount();
                        }}
                    >
                        Anahtarı kaldır
                    </Button>
                ) : null}
                <WalkStatusSummary
                    events={status?.activity?.length ? status.activity : status?.lastWalk?.events}
                />
            </div>
        </div>
    );
}

const KatirDashboardPanel = React.memo(function KatirDashboardPanel({
    dash,
    onPickMatter,
    onSnoozeIdle,
}: {
    dash: UyapDashboardStats | null;
    onPickMatter?: (row: UyapMatterPick) => void;
    onSnoozeIdle?: (matterId: string, untilIso: string | null) => void;
}) {
    const [selectedCategory, setSelectedCategory] = useState<UyapDosyaTurBucket | null>(null);
    const [idleOpen, setIdleOpen] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
    const [chartPrefs, setChartPrefs] = useState<KatirChartPrefs>(() => loadKatirChartPrefs());
    const chartRange = chartPrefs.range;
    const chartMode = chartPrefs.mode;
    const chartSeries = chartPrefs.series;
    const patchChartPrefs = (patch: Partial<KatirChartPrefs> | ((prev: KatirChartPrefs) => KatirChartPrefs)) => {
        setChartPrefs((prev) => {
            const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
            saveKatirChartPrefs(next);
            return next;
        });
    };
    const sliced = sliceOpeningChartMonths(dash?.openingByMonth || [], chartRange);
    const months = toKatirPlotMonths(sliced, chartSeries, chartMode);
    const hasClosings = (dash?.openingByMonth || []).some((row) => (row.closedThisMonth || 0) > 0);
    const showAktifStok = chartMode === 'cumulative' && chartSeries.aktifStok && chartSeries.kapanis && hasClosings;
    const trailing = dash?.trailingOpenings;
    const statusByType = dash?.statusByType;
    const typeStatusPair = (bucket: UyapDosyaTurBucket, total: number) =>
        dash ? formatPair(statusByType?.[bucket]?.open ?? 0, total) : '—';
    const typeCards: Array<{
        key: string;
        label: string;
        value: string;
        bucket?: UyapDosyaTurBucket;
        hint?: string;
        sub?: string;
        compact?: boolean;
    }> = [
        {
            key: 'icra',
            label: 'İcra',
            value: dash ? typeStatusPair('icra', dash.icra) : '—',
            bucket: 'icra',
        },
        {
            key: 'hukuk',
            label: 'Hukuk',
            value: dash ? typeStatusPair('hukuk', dash.hukuk) : '—',
            bucket: 'hukuk',
        },
        {
            key: 'ceza',
            label: 'Ceza',
            value: dash ? typeStatusPair('ceza', dash.ceza) : '—',
            bucket: 'ceza',
        },
        {
            key: 'idare',
            label: 'İdari',
            value: dash ? typeStatusPair('idare', dash.idare) : '—',
            bucket: 'idare',
        },
        {
            key: 'other',
            label: 'Diğer',
            value: dash ? typeStatusPair('other', dash.other) : '—',
            bucket: 'other',
        },
    ];
    const extraCards: typeof typeCards = [
        {
            key: 'evrak',
            label: '14G / T',
            value: dash ? formatPair(dash.evrakLast14Days ?? 0, dash.evrakCards) : '—',
            sub: 'Evrak',
            compact: true,
        },
        {
            key: 'idle',
            label: 'Hareketsiz',
            value: dash ? formatPair(dash.idleOpenCount ?? 0, dash.idleSnoozedCount ?? 0) : '—',
        },
    ];
    const breakdown = selectedCategory && dash?.breakdowns ? dash.breakdowns[selectedCategory] ?? [] : [];
    const breakdownTitle = selectedCategory ? breakdownTitleFor(selectedCategory) : '';
    const idleMatters = dash?.idleOpenMatters || [];
    const idleSnoozed = dash?.idleSnoozedMatters || [];
    const idleTruncated = (dash?.idleOpenCount || 0) > idleMatters.length;

    const renderCard = (
        card: (typeof typeCards)[number] & { clickKey?: 'idle' | UyapDosyaTurBucket },
        on: boolean,
        onClick?: () => void,
    ) => {
        const color = card.bucket ? TYPE_BAR_COLORS[card.bucket] : undefined;
        const className = cn(
            'flex-1 min-w-[72px] rounded-lg border border-border/60 bg-card/45 px-2 py-1.5 text-center shadow-sm backdrop-blur-xl transition-colors',
            on && 'border-primary/50 bg-primary/10',
            onClick && !on && 'hover:bg-accent/40 cursor-pointer',
        );
        const inner = (
            <div className="flex flex-col items-center justify-center gap-0.5">
                <div className={cn('font-semibold tabular-nums leading-tight', card.compact ? 'text-xs' : 'text-sm')}>
                    {card.value}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    {color ? <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden /> : null}
                    {card.label}
                </div>
                {card.sub ? (
                    <div className="text-[10px] leading-tight tabular-nums text-muted-foreground">{card.sub}</div>
                ) : null}
            </div>
        );
        if (!onClick) {
            return (
                <div key={card.key} className={className} title={card.hint}>
                    {inner}
                </div>
            );
        }
        return (
            <button
                key={card.key}
                type="button"
                className={className}
                aria-pressed={on}
                title={card.hint}
                onClick={onClick}
            >
                {inner}
            </button>
        );
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5 text-xs">
                {typeCards.map((card) =>
                    renderCard(card, selectedCategory === card.bucket, () => {
                        setIdleOpen(false);
                        setSelectedCategory(selectedCategory === card.bucket ? null : card.bucket || null);
                    }),
                )}
                {extraCards.map((card) => {
                    if (card.key === 'idle') {
                        return renderCard(card, idleOpen, () => {
                            setSelectedCategory(null);
                            setIdleOpen(!idleOpen);
                        });
                    }
                    return renderCard(card, false);
                })}
            </div>
            {selectedCategory ? (
                <div className={cn(glassCard, 'p-2')}>
                    <div className="mb-1 text-[10px] font-medium text-muted-foreground">
                        {breakdownTitle}
                    </div>
                    {selectedCategory === 'icra' && dash ? <IcraTakipSplitList dash={dash} /> : null}
                    {selectedCategory === 'icra' && breakdown.length > 0 ? (
                        <div className="mt-2 border-t border-border/50 pt-2">
                            <div className="mb-1 text-[10px] font-medium text-muted-foreground">
                                Takip Türü / Yolu
                            </div>
                            <BreakdownList rows={breakdown} />
                        </div>
                    ) : selectedCategory === 'icra' ? null : (
                        <BreakdownList rows={breakdown} />
                    )}
                </div>
            ) : null}
            {idleOpen ? (
                <div className={cn(glassCard, 'p-2')}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                        <div className="min-w-0 text-[10px] font-medium text-muted-foreground">
                            {`İşlem Bekleyen / Hareketsiz${dash?.idleUsesTasks ? '' : ' (Yalnızca Evrak)'}`}
                        </div>
                        <div className="shrink-0 text-right text-[10px] text-muted-foreground">
                            {dash?.idleUsesTasks ? '3 Ay Evrak/Görev Yok' : '3 Ay Evrak Yok'}
                            {idleTruncated ? ` · ${idleMatters.length}` : ''}
                        </div>
                    </div>
                    {idleMatters.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Kayıt Yok.</p>
                    ) : (
                        <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                            {idleMatters.map((row) => (
                                <li key={row.id} className="flex min-w-0 items-center gap-1">
                                    <button
                                        type="button"
                                        className="flex min-w-0 flex-1 items-baseline gap-2 rounded-md px-1 py-0.5 text-left text-xs hover:bg-accent/40"
                                        onClick={() =>
                                            onPickMatter?.({
                                                id: row.id,
                                                title: row.file_number,
                                                file_number: row.file_number,
                                                court_name: row.court_name,
                                                matter_type: null,
                                                status: 'OPEN',
                                            })
                                        }
                                    >
                                        <span className="min-w-0 truncate font-medium tabular-nums">{row.file_number}</span>
                                        <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                                            {displayCourtName(row.court_name, 'Mahkeme Yok')}
                                        </span>
                                    </button>
                                    <span className="inline-flex shrink-0 gap-0.5" aria-label="Ertelendi">
                                        {HAREKETSIZ_SNOOZE_MONTHS.map((n) => (
                                            <button
                                                key={n}
                                                type="button"
                                                className="rounded border border-border/60 bg-card/45 px-1 py-px text-[9px] tabular-nums text-muted-foreground hover:bg-accent/40"
                                                title={`${n} ay erteleme`}
                                                onClick={() => onSnoozeIdle?.(row.id, hareketsizSnoozeUntilIso(n))}
                                            >
                                                {n}ay
                                            </button>
                                        ))}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {idleSnoozed.length > 0 ? (
                        <Collapsible defaultOpen={false} className="mt-2 border-t border-border/50">
                            <CollapsibleTrigger className="group flex w-full items-center gap-1 pt-2 text-[10px] font-medium text-muted-foreground hover:text-foreground">
                                <span className="min-w-0 flex-1 text-left">Ertelendi</span>
                                <span className="tabular-nums">{idleSnoozed.length}</span>
                                <MaterialIcon
                                    icon="expand_more"
                                    size={14}
                                    className="shrink-0 transition-transform group-data-[state=open]:rotate-180"
                                />
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto">
                                    {idleSnoozed.map((row) => (
                                        <li key={row.id} className="flex min-w-0 items-center gap-1">
                                            <button
                                                type="button"
                                                className="flex min-w-0 flex-1 items-baseline gap-2 rounded-md px-1 py-0.5 text-left text-xs hover:bg-accent/40"
                                                onClick={() =>
                                                    onPickMatter?.({
                                                        id: row.id,
                                                        title: row.file_number,
                                                        file_number: row.file_number,
                                                        court_name: row.court_name,
                                                        matter_type: null,
                                                        status: 'OPEN',
                                                    })
                                                }
                                            >
                                                <span className="min-w-0 truncate font-medium tabular-nums">{row.file_number}</span>
                                                <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                                                    {displayCourtName(row.court_name, 'Mahkeme Yok')}
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                className="shrink-0 rounded border border-border/60 bg-card/45 px-1.5 py-px text-[9px] text-muted-foreground hover:bg-accent/40"
                                                onClick={() => onSnoozeIdle?.(row.id, null)}
                                            >
                                                Kaldır
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </CollapsibleContent>
                        </Collapsible>
                    ) : null}
                </div>
            ) : null}
            <Collapsible defaultOpen={false}>
                <div className={cn(glassCard, 'overflow-hidden')}>
                    <CollapsibleTrigger
                        className="group flex w-full items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent/30"
                    >
                        <MaterialIcon icon="show_chart" size={14} />
                        <span className="min-w-0 flex-1 text-left">Grafik</span>
                        <MaterialIcon
                            icon="expand_more"
                            size={16}
                            className="shrink-0 transition-transform group-data-[state=open]:rotate-180"
                        />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <div className="px-2.5 pb-2.5">
                            {chartMode === 'cumulative' ? (
                                <p className="mb-1 text-[10px] text-muted-foreground">
                                    {showAktifStok
                                        ? ''
                                        : ''}
                                </p>
                            ) : null}
                            <OpeningTimeline
                                months={months}
                                series={chartSeries}
                                mode={chartMode}
                                showAktifStok={showAktifStok}
                                selectedMonth={selectedMonth}
                                onSelectMonth={setSelectedMonth}
                                onToggleSeries={(key) =>
                                    patchChartPrefs((prev) => ({
                                        ...prev,
                                        series: { ...prev.series, [key]: !prev.series[key] },
                                    }))
                                }
                            />
                            <div className="mt-1.5 flex flex-wrap items-center justify-start gap-1.5">
                                <div
                                    className="inline-flex shrink-0 rounded-md border border-border/60 bg-card/45 p-0.5 shadow-sm backdrop-blur-xl"
                                    role="group"
                                    aria-label="Grafik aralığı"
                                >
                                    {CHART_RANGE_MONTHS.map((n) => {
                                        const on = chartRange === n;
                                        return (
                                            <button
                                                key={n}
                                                type="button"
                                                aria-pressed={on}
                                                className={cn(
                                                    'rounded px-1.5 py-0.5 text-[10px] tabular-nums',
                                                    on
                                                        ? 'bg-primary/15 text-foreground'
                                                        : 'text-muted-foreground hover:bg-accent/40',
                                                )}
                                                onClick={() => patchChartPrefs((prev) => ({ ...prev, range: n }))}
                                            >
                                                {n}
                                            </button>
                                        );
                                    })}
                                </div>
                                <span
                                    className="inline-flex shrink-0 rounded-md border border-border/60 bg-card/45 p-0.5 shadow-sm backdrop-blur-xl"
                                    role="group"
                                    aria-label="Grafik kümülatif modu"
                                >
                                    {(
                                        [
                                            { key: 'monthly' as const, label: 'Aylık Akış' },
                                            { key: 'cumulative' as const, label: 'Kümülatif Toplam' },
                                        ] as const
                                    ).map((item) => {
                                        const on = chartMode === item.key;
                                        return (
                                            <button
                                                key={item.key}
                                                type="button"
                                                aria-pressed={on}
                                                className={cn(
                                                    'rounded px-1.5 py-0.5 text-[10px]',
                                                    on
                                                        ? 'bg-primary/15 text-foreground'
                                                        : 'text-muted-foreground hover:bg-accent/40',
                                                )}
                                                onClick={() => patchChartPrefs((prev) => ({ ...prev, mode: item.key }))}
                                            >
                                                {item.label}
                                            </button>
                                        );
                                    })}
                                </span>
                            </div>
                            <div className="mt-1.5">
                                <TrailingMetricsGrid trailing={trailing} chartRange={chartRange} />
                            </div>
                        </div>
                    </CollapsibleContent>
                </div>
            </Collapsible>
        </div>
    );
});

/** Local draft so typing does not re-render the KPI/chart/recent cockpit on every key. */
function KatirSearchInput({
    value,
    onCommit,
}: {
    value: string;
    onCommit: (query: string) => void;
}) {
    const [draft, setDraft] = useState(value);
    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        setDraft(value);
    }, [value]);

    useEffect(
        () => () => {
            if (timerRef.current) window.clearTimeout(timerRef.current);
        },
        [],
    );

    const commit = (next: string) => {
        if (timerRef.current) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        onCommit(next);
    };

    return (
        <Input
            variant="glass"
            placeholder="Esas No veya Mahkeme Ara"
            value={draft}
            onChange={(event) => {
                const next = event.target.value;
                setDraft(next);
                if (timerRef.current) window.clearTimeout(timerRef.current);
                if (!next.trim()) {
                    commit('');
                    return;
                }
                timerRef.current = window.setTimeout(() => {
                    timerRef.current = null;
                    onCommit(next);
                }, SEARCH_DEBOUNCE_MS) as unknown as number;
            }}
            onBlur={() => commit(draft)}
            className="mb-1.5 h-8 shrink-0"
        />
    );
}

export const UyapCommandTab: React.FC = () => {
    const { activeEntityType, activeEntityId, setContext } = useContextStore();
    const [entitlements, setEntitlements] = useState<AppEntitlements | null>(null);
    const [status, setStatus] = useState<UyapBridgeStatus | null>(null);
    const [dash, setDash] = useState<UyapDashboardStats | null>(null);
    const [recentEvrak, setRecentEvrak] = useState<UyapRecentEvrak[]>([]);
    const [recentEvrakFetchedAt, setRecentEvrakFetchedAt] = useState<number | null>(null);
    const recentEvrakFetchedAtRef = useRef<number | null>(null);
    const lastRecentRef = useRef<UyapRecentEvrak[] | null>(null);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [busy, setBusy] = useState(false);
    const [query, setQuery] = useState('');
    const [picks, setPicks] = useState<UyapMatterPick[]>([]);
    const [searchPending, setSearchPending] = useState(false);
    const [selected, setSelected] = useState<UyapMatterPick | null>(null);
    const [selectedPartiesLine, setSelectedPartiesLine] = useState('');
    const [tree, setTree] = useState<UyapEvrakTree>({ folders: [], docs: [] });
    const wasRunningRef = useRef(false);
    const skipFirstStatusRef = useRef(true);
    const toastedAtRef = useRef<string | null>(null);
    const viewDownloadRef = useRef(false);
    const refreshInFlightRef = useRef(false);

    const katirLive = entitlements?.katirLive === true;
    const hasCorpus = dashboardHasKatirCorpus(dash, recentEvrak.length);
    const showEmptyUpsell = entitlements?.katirLive === false && !hasCorpus;

    const refresh = useCallback(async () => {
        if (refreshInFlightRef.current) return;
        refreshInFlightRef.current = true;
        try {
            const nextEntitlements = await DataService.getEntitlements();
            setEntitlements(nextEntitlements);
            const [nextStatus, nextDash, nextRecent] = await Promise.all([
                nextEntitlements.katirLive
                    ? DataService.getUyapBridgeStatus()
                    : Promise.resolve({
                          up: false,
                          sessionReady: false,
                          sessionHost: null,
                          sessionCookieCount: 0,
                          walkRunning: false,
                          lastWalk: null,
                          lastInteractiveWalk: null,
                          scanningQuietly: false,
                          ingestCount: 0,
                      } satisfies UyapBridgeStatus),
                DataService.getUyapDashboard(),
                DataService.listRecentUyapEvrak(RECENT_UYAP_EVRAK_LIMIT),
            ]);
            const fetchedAt = Date.now();
            setNowMs(fetchedAt);
            setStatus((prev) => (sameSerialized(prev, nextStatus) ? prev : nextStatus));
            setDash((prev) => (sameSerialized(prev, nextDash) ? prev : nextDash));
            if (nextRecent != null) {
                const prevRecent = lastRecentRef.current;
                const unchanged = prevRecent != null && sameSerialized(prevRecent, nextRecent);
                lastRecentRef.current = nextRecent;
                setRecentEvrak((prev) => (sameSerialized(prev, nextRecent) ? prev : nextRecent));
                if (!unchanged || recentEvrakFetchedAtRef.current == null) {
                    recentEvrakFetchedAtRef.current = fetchedAt;
                    setRecentEvrakFetchedAt(fetchedAt);
                }
            }
        } finally {
            refreshInFlightRef.current = false;
        }
    }, []);

    useEffect(() => {
        const tick = () => {
            if (typeof document !== 'undefined' && document.hidden) return;
            void refresh();
        };
        void refresh();
        const timer = window.setInterval(tick, 2500);
        const onVisibility = () => {
            if (!document.hidden) void refresh();
        };
        document.addEventListener('visibilitychange', onVisibility);
        const onEntitlements = () => {
            void refresh();
        };
        window.electron?.on?.('app-entitlements-changed', onEntitlements);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisibility);
            window.electron?.off?.('app-entitlements-changed', onEntitlements);
        };
    }, [refresh]);

    useEffect(() => {
        const needle = query.trim();
        if (!needle) {
            setPicks([]);
            setSearchPending(false);
            return;
        }
        setSearchPending(true);
        let cancelled = false;
        void DataService.searchUyapMatters(needle).then((rows) => {
            if (cancelled) return;
            setPicks(Array.isArray(rows) ? rows : []);
            setSearchPending(false);
        });
        return () => {
            cancelled = true;
        };
    }, [query]);

    useEffect(() => {
        if (query.trim()) return;
        if (activeEntityType !== 'MATTER' || !activeEntityId) return;
        if (selected?.id === activeEntityId) return;
        let cancelled = false;
        void DataService.getMatter(activeEntityId)
            .then((matter) => {
                if (cancelled) return;
                const pick = matterToPick(matter);
                if (pick) setSelected(pick);
            })
            .catch(() => {
                /* keep current selection */
            });
        return () => {
            cancelled = true;
        };
    }, [activeEntityId, activeEntityType, selected?.id, query]);

    useEffect(() => {
        if (!selected?.id) {
            setTree({ folders: [], docs: [] });
            setSelectedPartiesLine('');
            return;
        }
        let cancelled = false;
        setSelectedPartiesLine('');
        void DataService.getUyapEvrakTree(selected.id).then((next) => {
            if (!cancelled) setTree(next);
        });
        void DataService.getMatter(selected.id)
            .then((matter) => {
                if (cancelled) return;
                setSelectedPartiesLine(formatCompactMatterPartyLine(matter?.parties ?? []));
            })
            .catch(() => {
                if (!cancelled) setSelectedPartiesLine('');
            });
        return () => {
            cancelled = true;
        };
    }, [selected?.id]);

    useEffect(() => {
        if (skipFirstStatusRef.current) {
            skipFirstStatusRef.current = false;
            toastedAtRef.current = status?.lastWalk?.at ?? null;
            wasRunningRef.current = Boolean(status?.walkRunning);
            return;
        }
        const running = Boolean(status?.walkRunning);
        const last = status?.lastInteractiveWalk || status?.lastWalk;
        const stamp = last?.at ?? null;
        const becameIdle = wasRunningRef.current && !running;
        wasRunningRef.current = running;
        const outcomeReady = Boolean(last?.finished || last?.stopped || last?.error || last?.warning);
        const newOutcome = Boolean(stamp && toastedAtRef.current !== stamp && outcomeReady);
        if (selected?.id && (becameIdle || newOutcome)) {
            void DataService.getUyapEvrakTree(selected.id).then(setTree);
        }
        if (running || !newOutcome) return;
        toastedAtRef.current = stamp;
        void refresh();
        if (viewDownloadRef.current) return;
        if (last?.class === 'background' || last?.scheduled) return;
        if (last?.error) {
            toast.error(humanizeUyapMessage(last.error));
            return;
        }
        if (last?.warning) {
            toast.message(humanizeUyapMessage(last.warning));
            return;
        }
        if (last?.job === 'download' && last?.finished) {
            const downloaded = Number(last.stats?.downloaded) || 0;
            if (downloaded > 0) toast.success(`${downloaded} evrak indirildi`);
        }
    }, [status, selected?.id, refresh]);

    const selectMatter = useCallback((row: UyapMatterPick) => {
        setSelected(row);
        setContext('MATTER', row.id, row.title);
    }, [setContext]);

    const visiblePicks = React.useMemo(() => {
        const needle = query.trim();
        if (!needle) return picks;
        if (!selected?.id || picks.some((row) => row.id === selected.id)) return picks;
        if (!pickMatchesNeedle(selected, needle)) return picks;
        return [selected, ...picks];
    }, [query, picks, selected]);

    useEffect(() => {
        if (!query.trim() || searchPending || visiblePicks.length === 0) return;
        if (selected && visiblePicks.some((row) => row.id === selected.id)) return;
        const first = visiblePicks[0];
        if (!first) return;
        selectMatter(first);
    }, [query, searchPending, visiblePicks, selected, selectMatter]);

    const runDownload = async (
        extra: { dosya: string; keys?: string[]; preview?: boolean; destDir?: string },
        previousAt: string | null,
    ) => {
        const result = await DataService.startUyapWalk({ job: 'download', ...extra });
        if (!result?.ok) {
            return { error: result?.error || 'İş başlatılamadı' as string, last: null };
        }
        const last = await waitForNewWalk(previousAt);
        void refresh();
        return { error: last?.error, last };
    };

    const pickKeepDirectory = async (): Promise<string | null> => {
        const picked = await DataService.selectUyapEvrakDirectory();
        if (picked?.cancelled) return null;
        if (!picked?.ok || !picked.path) {
            if (picked?.error) toast.error(humanizeUyapMessage(picked.error));
            return null;
        }
        return picked.path;
    };

    const onDownload = async (doc: UyapEvrakDoc, matter?: { id: string; file_number: string } | null) => {
        if (!katirLive) {
            toast.error('Katır canlı yolu bu sürümde kapalı.');
            return;
        }
        if (viewDownloadRef.current) return;
        const fileNumber = String(matter?.file_number || selected?.file_number || '').trim();
        const matterId = matter?.id || selected?.id;
        const key = docItemKey(doc);
        if (!fileNumber || !matterId) {
            toast.error(humanizeUyapMessage('Künye yok'));
            return;
        }
        if (!key) {
            toast.error(humanizeUyapMessage('Kart anahtarı yok (metadata.uyap.itemKey)'));
            return;
        }
        const destDir = await pickKeepDirectory();
        if (!destDir) return;
        const previousAt = status?.lastInteractiveWalk?.at ?? status?.lastWalk?.at ?? null;
        setBusy(true);
        viewDownloadRef.current = true;
        showEvrakWaitToast();
        try {
            const { error, last } = await runDownload(
                { dosya: fileNumber, keys: [key], destDir },
                previousAt,
            );
            if (error) {
                failEvrakWaitToast(error);
                return;
            }
            const waited = await waitForDocOnDisk(matterId, doc.id);
            if (!waited?.fresh?.file_path) {
                failEvrakWaitToast(last?.warning || last?.error || 'Evrak indirilemedi');
                return;
            }
            if (matterId === selected?.id) setTree(waited.tree);
            clearEvrakWaitToast();
            const downloaded = Number(last?.stats?.downloaded) || 1;
            toast.success(downloaded > 1 ? `${downloaded} evrak indirildi` : 'Evrak indirildi');
        } finally {
            viewDownloadRef.current = false;
            setBusy(false);
        }
    };

    const onView = async (doc: UyapEvrakDoc, matter?: { id: string; file_number: string } | null) => {
        if (viewDownloadRef.current) return;
        const fileNumber = String(matter?.file_number || selected?.file_number || '').trim();
        const matterId = matter?.id || selected?.id;
        if (doc.file_path) {
            await openDocInMainViewer(doc);
            return;
        }
        if (!katirLive) {
            toast.error('Katır canlı yolu bu sürümde kapalı.');
            return;
        }
        if (!fileNumber || !matterId) {
            toast.error(humanizeUyapMessage('Künye yok'));
            return;
        }
        const key = docItemKey(doc);
        if (!key) {
            toast.error(humanizeUyapMessage('Kart anahtarı yok (metadata.uyap.itemKey)'));
            return;
        }
        const previousAt = status?.lastInteractiveWalk?.at ?? status?.lastWalk?.at ?? null;
        setBusy(true);
        viewDownloadRef.current = true;
        showEvrakWaitToast();
        try {
            const { error, last } = await runDownload(
                { dosya: fileNumber, keys: [key], preview: true },
                previousAt,
            );
            if (error) {
                failEvrakWaitToast(error);
                return;
            }
            const waited = await waitForDocOnDisk(matterId, doc.id);
            if (!waited?.fresh?.file_path || !waited.url) {
                failEvrakWaitToast(last?.warning || last?.error || 'Önizleme indirilemedi');
                return;
            }
            if (matterId === selected?.id) setTree(waited.tree);
            clearEvrakWaitToast();
            await openDocInMainViewer(waited.fresh);
        } finally {
            viewDownloadRef.current = false;
            setBusy(false);
        }
    };

    const onViewRecent = async (row: UyapRecentEvrak) => {
        const pick = recentToPick(row);
        if (pick) selectMatter(pick);
        await onView(recentToDoc(row), {
            id: row.matter_id,
            file_number: String(row.file_number || '').trim(),
        });
    };

    const onDownloadRecent = async (row: UyapRecentEvrak) => {
        const pick = recentToPick(row);
        if (pick) selectMatter(pick);
        await onDownload(recentToDoc(row), {
            id: row.matter_id,
            file_number: String(row.file_number || '').trim(),
        });
    };

    const { recent, groups } = React.useMemo(() => deriveUyapEvrakTree(tree.folders || [], tree.docs || []), [tree]);

    const onSnoozeIdle = useCallback(
        async (matterId: string, untilIso: string | null) => {
            const ok = await DataService.setMatterHareketsizSnooze(matterId, untilIso);
            if (!ok) {
                toast.error('Erteleme işlemi kaydedilemedi.');
                return;
            }
            void refresh();
        },
        [refresh],
    );

    return (
        <ScrollArea className={cn('h-full', paneScroll)}>
            <div className="flex min-w-0 flex-col gap-2 overflow-x-hidden p-3">
                {entitlements && !katirLive ? (
                    <KatirMembershipPanel
                        entitlements={entitlements}
                        onChanged={() => void refresh()}
                        variant="gate"
                    />
                ) : null}
                {entitlements?.phase === 'grace' && katirLive ? (
                    <KatirMembershipPanel entitlements={entitlements} variant="grace" />
                ) : null}
                {showEmptyUpsell ? null : (
                    <>
                <KatirStatusRow status={status} dash={dash} entitlements={entitlements} />
                <KatirDashboardPanel dash={dash} onPickMatter={selectMatter} onSnoozeIdle={onSnoozeIdle} />

                <div className="grid min-w-0 gap-2 lg:grid-cols-2">
                    <Collapsible defaultOpen={false} className="min-w-0">
                        <div className={cn(glassCard, '@container min-w-0 overflow-hidden')}>
                            <CollapsibleTrigger className="group flex w-full items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent/30">
                                <MaterialIcon icon="history" size={14} />
                                <span className="min-w-0 flex-1 text-left">UYAP’a Son Girenler</span>
                                {recentEvrakFetchedAt != null ? (
                                    <span className="shrink-0 text-[10px] font-normal tabular-nums text-muted-foreground">
                                        Son güncelleme: {formatTurkishRelativePast(recentEvrakFetchedAt, nowMs)}
                                    </span>
                                ) : null}
                                {recentEvrak.length > 0 ? (
                                    <span className="tabular-nums text-foreground/80">{recentEvrak.length}</span>
                                ) : null}
                                <MaterialIcon
                                    icon="expand_more"
                                    size={16}
                                    className="shrink-0 transition-transform group-data-[state=open]:rotate-180"
                                />
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <div className="max-h-[420px] min-w-0 overflow-y-auto px-2 pb-2">
                                    {recentEvrak.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">Henüz UYAP Evrak Kartı Yok.</p>
                                    ) : (
                                        <ul className="min-w-0 space-y-0.5 text-sm">
                                            {recentEvrak.map((row) => (
                                                <RecentEvrakRow
                                                    key={row.id}
                                                    row={row}
                                                    selected={selected?.id === row.matter_id}
                                                    busy={busy}
                                                    katirLive={katirLive}
                                                    onSelect={(next) => {
                                                        const pick = recentToPick(next);
                                                        if (pick) selectMatter(pick);
                                                    }}
                                                    onView={(next) => void onViewRecent(next)}
                                                    onDownload={(next) => void onDownloadRecent(next)}
                                                />
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </CollapsibleContent>
                        </div>
                    </Collapsible>

                    <div className={cn(glassCard, '@container flex max-h-[500px] min-w-0 flex-col overflow-hidden p-2.5')}>
                        <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                            UYAP Dosya ve Evrak Ağaçları
                        </div>
                        <KatirSearchInput value={query} onCommit={setQuery} />
                        {query.trim() ? (
                            <ul className="mb-2 max-h-28 shrink-0 space-y-0.5 overflow-y-auto text-sm">
                                {searchPending ? null : visiblePicks.length === 0 ? (
                                    <li className="px-1 py-1.5 text-xs text-muted-foreground">Dosya Bulunamadı.</li>
                                ) : (
                                    visiblePicks.map((row) => {
                                        const on = selected?.id === row.id;
                                        const partiesLine = on ? selectedPartiesLine : '';
                                        const kunyeTitle = formatKatirKunyeLine({
                                            fileNumber: row.file_number,
                                            courtName: row.court_name,
                                            fallbackTitle: row.title,
                                            partiesLine,
                                            fileCourtSep: '·',
                                        });
                                        return (
                                            <li key={row.id} className="min-w-0">
                                                <button
                                                    type="button"
                                                    className={cn(
                                                        'flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-accent/50',
                                                        on
                                                            ? 'bg-primary/20 text-foreground ring-1 ring-inset ring-primary/45'
                                                            : 'text-foreground/80',
                                                    )}
                                                    onClick={() => selectMatter(row)}
                                                    title={kunyeTitle}
                                                >
                                                    <span
                                                        className={cn(
                                                            'h-3.5 w-3.5 shrink-0 rounded-full border',
                                                            on ? 'border-primary bg-primary' : 'border-border',
                                                        )}
                                                    />
                                                    <span className="min-w-0 flex-1 truncate">
                                                        <MatterKunyeText
                                                            fileNumber={row.file_number}
                                                            courtName={row.court_name}
                                                            fallbackTitle={row.title}
                                                            partiesLine={partiesLine}
                                                            fileCourtSep="·"
                                                        />
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })
                                )}
                            </ul>
                        ) : null}
                        {!selected ? (
                            <p className="text-xs text-muted-foreground">Dosya Seçin.</p>
                        ) : (
                            <ScrollArea className={cn('min-w-0 flex-1 rounded-lg border border-border/50 p-2', paneScroll)}>
                                <div
                                    className="mb-1 min-w-0 truncate text-xs font-medium"
                                    title={formatKatirKunyeLine({
                                        fileNumber: selected.file_number,
                                        courtName: selected.court_name,
                                        fallbackTitle: selected.title,
                                        partiesLine: selectedPartiesLine,
                                    })}
                                >
                                    <MatterKunyeText
                                        fileNumber={selected.file_number}
                                        courtName={selected.court_name}
                                        fallbackTitle={selected.title}
                                        partiesLine={selectedPartiesLine}
                                        fileCourtSep="—"
                                    />
                                </div>
                                {recent.length === 0 && groups.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Bu Dosyada UYAP Evrak Kartı Yok.</p>
                                ) : (
                                    <div className="min-w-0 overflow-hidden space-y-3">
                                        {recent.length > 0 && (
                                            <div className="min-w-0">
                                                <div className="flex min-w-0 items-center gap-1 py-0.5 text-xs font-medium text-muted-foreground pl-2">
                                                    <MaterialIcon icon="history" size={14} className="shrink-0" />
                                                    <span className="min-w-0 truncate">Son 20 Evrak</span>
                                                </div>
                                                <ul className="min-w-0">
                                                    {recent.map((node) => (
                                                        <EvrakCardRow
                                                            key={node.doc.id}
                                                            doc={node.doc}
                                                            ek={node.ek}
                                                            onView={(item) => void onView(item)}
                                                            onDownload={(item) => void onDownload(item)}
                                                            liveEnabled={katirLive}
                                                        />
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {groups.length > 0 && (
                                            <div className="min-w-0">
                                                <div className="flex min-w-0 items-center gap-1 py-0.5 text-xs font-medium text-muted-foreground pl-2">
                                                    <MaterialIcon icon="folder_open" size={14} className="shrink-0" />
                                                    <span className="min-w-0 truncate">Tüm Evrak</span>
                                                </div>
                                                <div className="min-w-0 pl-2">
                                                    {groups.map((group) => (
                                                        <RelatedGroupNode
                                                            key={group.relatedKey}
                                                            group={group}
                                                            onView={(item) => void onView(item)}
                                                            onDownload={(item) => void onDownload(item)}
                                                            liveEnabled={katirLive}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </ScrollArea>
                        )}
                    </div>
                </div>
                    </>
                )}
            </div>
        </ScrollArea>
    );
};
