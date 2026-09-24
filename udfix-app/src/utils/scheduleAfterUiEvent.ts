/**
 * Run after the current click/keydown/pointer handler returns so Chromium can
 * paint and not attribute TipTap/Dockview work to the input event.
 */
export function scheduleAfterUiEvent(task: () => void): void {
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(task);
        return;
    }
    setTimeout(task, 0);
}
