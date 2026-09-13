import { toast } from '../lib/glass-utils';
import { registerCloseActiveTabShortcut } from '../shortcuts/closeActiveTab';
import { registerScopedSelectAllShortcut } from '../shortcuts/scopedSelectAll';
import type { LayoutDockviewApi } from '../types/dockviewLayout';
import { resolveDockviewPopoutUrl } from './dockviewPopoutUrl';
import { syncThemeToPopoutWindowWithRetry } from './popoutThemeSync';

type PopoutWindowWithCleanups = Window & {
    __nomaiCloseTabCleanup?: () => void;
    __nomaiSelectAllCleanup?: () => void;
    __nomaiThemeSyncCleanup?: () => void;
};

function attachPopoutWindowListeners(popoutWindow: Window): void {
    const win = popoutWindow as PopoutWindowWithCleanups;
    win.__nomaiThemeSyncCleanup?.();
    win.__nomaiThemeSyncCleanup = syncThemeToPopoutWindowWithRetry(window, popoutWindow);
    win.__nomaiCloseTabCleanup = registerCloseActiveTabShortcut(popoutWindow);
    win.__nomaiSelectAllCleanup = registerScopedSelectAllShortcut(popoutWindow);
}

function detachPopoutWindowListeners(popoutWindow: Window): void {
    const win = popoutWindow as PopoutWindowWithCleanups;
    win.__nomaiThemeSyncCleanup?.();
    win.__nomaiCloseTabCleanup?.();
    win.__nomaiSelectAllCleanup?.();
    delete win.__nomaiThemeSyncCleanup;
    delete win.__nomaiCloseTabCleanup;
    delete win.__nomaiSelectAllCleanup;
}

export function isDockviewPanelInPopout(panel: {
    api?: { location?: { type?: string } };
}): boolean {
    return panel.api?.location?.type === 'popout';
}

/**
 * Moves a Dockview panel (or its group) into a same-origin popout window.
 * Returns false when the browser blocks the popup or the API is unavailable.
 */
export async function popOutDockviewPanel(
    api: LayoutDockviewApi | null | undefined,
    panelId: string,
): Promise<boolean> {
    if (!api?.addPopoutGroup) {
        toast.error('Ayrı pencere bu ortamda desteklenmiyor.');
        return false;
    }

    const panel = api.getPanel(panelId);
    if (!panel) {
        toast.error('Sekme paneli bulunamadı');
        return false;
    }

    if (isDockviewPanelInPopout(panel)) {
        return true;
    }

    try {
        const ok = await api.addPopoutGroup(panel, {
            popoutUrl: resolveDockviewPopoutUrl(),
            onDidOpen: ({ window: popoutWindow }) => {
                attachPopoutWindowListeners(popoutWindow);
            },
            onWillClose: ({ window: popoutWindow }) => {
                detachPopoutWindowListeners(popoutWindow);
            },
        });
        if (!ok) {
            toast.error('Ayrı pencere açılamadı. Popup iznini kontrol edin.');
            return false;
        }
        return true;
    } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : 'Ayrı pencereye taşınamadı');
        return false;
    }
}
