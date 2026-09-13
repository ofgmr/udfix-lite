/** Flush pending mini-editor HTML into the HF store before preset save. */
const flushers = new Set<() => void>();

export function registerHfEditorFlusher(fn: () => void): void {
    flushers.add(fn);
}

export function unregisterHfEditorFlusher(fn: () => void): void {
    flushers.delete(fn);
}

export function flushAllHfEditors(): void {
    for (const fn of flushers) {
        try {
            fn();
        } catch (err) {
            console.warn('[hf] editor flush failed', err);
        }
    }
}
