import React from 'react';

type DockviewPanelWindowApi = {
    getWindow?: () => Window;
    onDidLocationChange?: (cb: () => void) => { dispose: () => void } | void;
};

/** Resolves the panel's owning document body so overlays portal into popout windows. */
export function useDockviewPanelPortalContainer(api: DockviewPanelWindowApi): HTMLElement | null {
    const [container, setContainer] = React.useState<HTMLElement | null>(() => {
        try {
            return api.getWindow?.().document.body ?? null;
        } catch {
            return null;
        }
    });

    React.useEffect(() => {
        const refresh = () => {
            try {
                setContainer(api.getWindow?.().document.body ?? null);
            } catch {
                setContainer(null);
            }
        };
        refresh();
        const disposable = api.onDidLocationChange?.(refresh);
        return () => disposable?.dispose?.();
    }, [api]);

    return container;
}
