/** Minimal Dockview surface used by layout store and wrapper (not full dockview-core API). */
export interface DockviewPanelParams {
    documentId?: string;
    fileUrl?: string;
    diffHtml?: string;
    noteId?: string;
    matterId?: string;
    partyId?: string;
    knowledgeId?: string;
    type?: string;
    [key: string]: unknown;
}

export interface DockviewPanelApiLike {
    id: string;
    component?: string;
    api: {
        component?: string;
        title?: string;
        location?: { type?: string };
        group?: unknown;
        getWindow?: () => Window;
        getParameters?: () => DockviewPanelParams;
        updateParameters?: (params: Partial<DockviewPanelParams>) => void;
        setTitle?: (title: string) => void;
        setActive?: () => void;
        moveTo?: (options: Record<string, unknown>) => void;
        close?: () => void;
    };
}

type DockviewPopoutTargetLike =
    | DockviewPanelApiLike
    | {
          id: string;
      };

export interface LayoutDockviewApi {
    panels: DockviewPanelApiLike[];
    groups?: Array<{
        id: string;
        api?: {
            location?: { type?: string };
            isVisible?: boolean;
            setVisible?: (visible: boolean) => void;
            moveTo?: (options: Record<string, unknown>) => void;
        };
    }>;
    layout?: (width: number, height: number, force?: boolean) => void;
    activePanel?: DockviewPanelApiLike;
    getPanel: (id: string) => DockviewPanelApiLike | undefined;
    addPanel: (options: Record<string, unknown>) => DockviewPanelApiLike;
    addGroup?: (options?: Record<string, unknown>) => { id: string };
    addPopoutGroup?: (
        item: DockviewPopoutTargetLike,
        options?: {
            popoutUrl?: string;
            position?: { left: number; top: number; width: number; height: number };
            onDidOpen?: (event: { id: string; window: Window }) => void;
            onWillClose?: (event: { id: string; window: Window }) => void;
            referenceGroup?: string | { id: string };
        }
    ) => Promise<boolean>;
    onDidAddPanel?: (cb: () => void) => void;
    onDidRemovePanel?: (cb: () => void) => void;
    onDidOpenPopoutWindowFail?: (cb: () => void) => { dispose: () => void } | void;
}

export interface DockviewReadyEvent {
    api: LayoutDockviewApi;
}
