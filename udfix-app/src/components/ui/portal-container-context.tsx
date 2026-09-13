import * as React from 'react';

const PortalContainerContext = React.createContext<HTMLElement | null>(null);

export function PortalContainerProvider({
    container,
    children,
}: {
    container: HTMLElement | null;
    children: React.ReactNode;
}) {
    return <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>;
}

export function usePortalContainer(override?: HTMLElement | null): HTMLElement | undefined {
    const contextContainer = React.useContext(PortalContainerContext);
    return override ?? contextContainer ?? undefined;
}

