type UdfSaveWaiter = {
    resolve: () => void;
    reject: (error: unknown) => void;
};

type PendingUdfSave = {
    waiters: UdfSaveWaiter[];
    inFlight: boolean;
    needsResave: boolean;
    timeoutId: ReturnType<typeof setTimeout>;
};

const SAVE_WAIT_TIMEOUT_MS = 60_000;

const pendingSaveByPanelId = new Map<string, PendingUdfSave>();

function dispatchUdfSave(panelId: string, source: string): void {
    window.dispatchEvent(
        new CustomEvent('udfix:request-save-udf', {
            detail: { panelId, source },
        }),
    );
}

function finishPendingSave(panelId: string, error?: unknown): void {
    const pending = pendingSaveByPanelId.get(panelId);
    if (!pending) return;

    if (error !== undefined) {
        clearTimeout(pending.timeoutId);
        pendingSaveByPanelId.delete(panelId);
        for (const waiter of pending.waiters) {
            waiter.reject(error);
        }
        return;
    }

    if (pending.needsResave) {
        pending.needsResave = false;
        pending.inFlight = true;
        queueMicrotask(() => dispatchUdfSave(panelId, 'coalesced'));
        return;
    }

    clearTimeout(pending.timeoutId);
    pendingSaveByPanelId.delete(panelId);
    for (const waiter of pending.waiters) {
        waiter.resolve();
    }
}

function enqueueUdfSave(panelId: string, source: string, waiter: UdfSaveWaiter): void {
    let pending = pendingSaveByPanelId.get(panelId);
    if (!pending) {
        pending = {
            waiters: [waiter],
            inFlight: true,
            needsResave: false,
            timeoutId: setTimeout(() => {
                finishPendingSave(
                    panelId,
                    new Error('UDF kaydı zaman aşımına uğradı. Dosyayı ⌘S ile yeniden kaydedin.'),
                );
            }, SAVE_WAIT_TIMEOUT_MS),
        };
        pendingSaveByPanelId.set(panelId, pending);
        dispatchUdfSave(panelId, source);
        return;
    }

    pending.waiters.push(waiter);
    if (pending.inFlight) {
        pending.needsResave = true;
        return;
    }

    pending.inFlight = true;
    dispatchUdfSave(panelId, source);
}

/** Request UDF panel save and await completion (success or failure). Concurrent calls coalesce. */
export function requestUdfSaveAndWait(panelId: string, source: string): Promise<void> {
    const safePanelId = String(panelId ?? '').trim();
    if (!safePanelId) {
        return Promise.reject(new Error('UDF panel kimliği bulunamadı.'));
    }
    return new Promise((resolve, reject) => {
        enqueueUdfSave(safePanelId, source, { resolve, reject });
    });
}

export function settleUdfSave(panelId: string, error?: unknown): void {
    const safePanelId = String(panelId ?? '').trim();
    finishPendingSave(safePanelId, error);
}

const saveAsWaitersByPanelId = new Map<string, UdfSaveWaiter>();

/** Request UDF panel save-as and await completion (success, cancel, or failure). */
export function requestUdfSaveAsAndWait(panelId: string, source: string): Promise<void> {
    const safePanelId = String(panelId ?? '').trim();
    if (!safePanelId) {
        return Promise.reject(new Error('UDF panel kimliği bulunamadı.'));
    }
    if (saveAsWaitersByPanelId.has(safePanelId)) {
        return Promise.reject(new Error('Bu panel için farklı kaydet zaten devam ediyor.'));
    }
    return new Promise((resolve, reject) => {
        saveAsWaitersByPanelId.set(safePanelId, { resolve, reject });
        window.dispatchEvent(
            new CustomEvent('udfix:request-save-as-udf', {
                detail: { panelId: safePanelId, source },
            }),
        );
    });
}

export function settleUdfSaveAs(panelId: string, error?: unknown): void {
    const safePanelId = String(panelId ?? '').trim();
    const waiter = saveAsWaitersByPanelId.get(safePanelId);
    if (!waiter) {
        return;
    }
    saveAsWaitersByPanelId.delete(safePanelId);
    if (error !== undefined) {
        waiter.reject(error);
    } else {
        waiter.resolve();
    }
}

/** Test-only reset of in-flight save bookkeeping. */
export function resetUdfSaveBusForTests(): void {
    for (const pending of pendingSaveByPanelId.values()) {
        clearTimeout(pending.timeoutId);
    }
    pendingSaveByPanelId.clear();
    saveAsWaitersByPanelId.clear();
}
