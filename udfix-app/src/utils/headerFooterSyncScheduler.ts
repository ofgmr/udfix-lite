import debounce from 'lodash/debounce';

const DEBOUNCE_MS = 200;

type SyncRunner = () => void | Promise<void>;

let syncRunner: SyncRunner | null = null;
let rafId: number | null = null;
let pendingWaiters: Array<() => void> = [];

function flushWaiters(): void {
    if (pendingWaiters.length === 0) return;
    const waiters = pendingWaiters;
    pendingWaiters = [];
    waiters.forEach((resolve) => resolve());
}

function rafFlush(): Promise<void> {
    const job = new Promise<void>((resolve) => {
        pendingWaiters.push(resolve);
    });
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(async () => {
        rafId = null;
        try {
            await Promise.resolve(syncRunner?.());
        } catch (error) {
            console.error('[HF Sync Scheduler] runner failed:', error);
        } finally {
            flushWaiters();
        }
    });
    return job;
}

const debouncedFlush = debounce(rafFlush, DEBOUNCE_MS, { leading: false, trailing: true });

/**
 * UdfixEditor mounts a runner that performs HF sync (reads stores inside the closure).
 */
export function setHeaderFooterSyncRunner(runner: SyncRunner | null): void {
    syncRunner = runner;
}

export function scheduleSyncHfToEditor(): Promise<void> {
    debouncedFlush();
    return new Promise<void>((resolve) => {
        pendingWaiters.push(resolve);
    });
}

export function flushSyncHfToEditor(): Promise<void> {
    debouncedFlush.cancel();
    if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    return rafFlush();
}

export function cancelHeaderFooterSyncScheduler(): void {
    debouncedFlush.cancel();
    if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    flushWaiters();
}
