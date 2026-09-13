import { useLayoutStore } from '../stores/useLayoutStore';
import { getRegistryEntry } from './registry';
import { matchesCombo } from './match';
import { isBlockingFormTarget, isModalOpen } from './target';

/** Returns true when the shortcut was handled. */
export function tryCloseActiveTabShortcut(e: KeyboardEvent): boolean {
    if (isModalOpen()) return false;
    const entry = getRegistryEntry('close-active-tab');
    if (!entry || !matchesCombo(e, entry.combo)) return false;
    if (isBlockingFormTarget(e)) return false;
    e.preventDefault();
    useLayoutStore.getState().closeActiveTab();
    return true;
}

export function registerCloseActiveTabShortcut(targetWindow: Window): () => void {
    const onKeyDown = (e: KeyboardEvent) => {
        tryCloseActiveTabShortcut(e);
    };
    targetWindow.addEventListener('keydown', onKeyDown);
    return () => targetWindow.removeEventListener('keydown', onKeyDown);
}
