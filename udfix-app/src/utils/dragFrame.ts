export interface DragFrame<T> {
    /** Coalesce pointer moves to one apply per animation frame. */
    push(value: T): void
    /** Cancel the pending frame and return the latest value for a mouseup commit. */
    flush(): T | null
    pending(): boolean
}

function scheduleFrame(cb: FrameRequestCallback): number {
    const schedule = globalThis.requestAnimationFrame
    if (typeof schedule === 'function') return schedule.call(globalThis, cb)
    return setTimeout(() => cb(Date.now()), 16) as unknown as number
}

function cancelFrame(id: number): void {
    const cancel = globalThis.cancelAnimationFrame
    if (typeof globalThis.requestAnimationFrame === 'function' && typeof cancel === 'function') {
        cancel.call(globalThis, id)
        return
    }
    clearTimeout(id)
}

export function createDragFrame<T>(
    apply: (value: T) => void,
    schedule: (cb: FrameRequestCallback) => number = scheduleFrame,
    cancel: (id: number) => void = cancelFrame,
): DragFrame<T> {
    let frame: number | null = null
    let latest: T | null = null
    let hasLatest = false

    return {
        push(value: T) {
            latest = value
            hasLatest = true
            if (frame != null) return
            frame = schedule(() => {
                frame = null
                if (!hasLatest) return
                hasLatest = false
                apply(latest as T)
            })
        },
        flush() {
            if (frame != null) {
                cancel(frame)
                frame = null
            }
            if (!hasLatest) return null
            hasLatest = false
            return latest
        },
        pending() {
            return frame != null
        },
    }
}

export function nextImageResizeWidth(
    startWidth: number,
    startX: number,
    clientX: number,
    direction: 'left' | 'right',
): number {
    const deltaX = clientX - startX
    const next = direction === 'right' ? startWidth + deltaX : startWidth - deltaX
    return Math.max(120, next)
}
