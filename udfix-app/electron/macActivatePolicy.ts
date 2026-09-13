export type MacActivateAction = 'create' | 'restore-and-focus' | 'focus';

export function resolveMacActivateAction(state: {
    hasMainWindow: boolean;
    isDestroyed: boolean;
    isMinimized: boolean;
}): MacActivateAction {
    if (!state.hasMainWindow || state.isDestroyed) {
        return 'create';
    }
    if (state.isMinimized) {
        return 'restore-and-focus';
    }
    return 'focus';
}
