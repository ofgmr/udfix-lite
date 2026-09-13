import * as React from 'react';

export interface ViewerHostContextValue {
    /** Dockview viewer panel id (main or popout). */
    panelId: string;
    /** Live resolver — panel popout'a taşındığında güncel pencereyi döner. */
    getOwnerWindow: () => Window;
}

const ViewerHostContext = React.createContext<ViewerHostContextValue | null>(null);

export function ViewerHostProvider({
    panelId,
    getOwnerWindow,
    children,
}: {
    panelId: string;
    getOwnerWindow: () => Window;
    children: React.ReactNode;
}) {
    const value = React.useMemo(() => ({ panelId, getOwnerWindow }), [panelId, getOwnerWindow]);
    return <ViewerHostContext.Provider value={value}>{children}</ViewerHostContext.Provider>;
}

export function useViewerHost(): ViewerHostContextValue | null {
    return React.useContext(ViewerHostContext);
}
