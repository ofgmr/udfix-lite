import { useLayoutStore } from '../stores/useLayoutStore';
import { scheduleAfterUiEvent } from './scheduleAfterUiEvent';

export type EntityFormComponent = 'matterForm' | 'partyForm' | 'knowledgeForm';

export interface OpenEntityFloatingPanelOptions {
    id: string;
    component: EntityFormComponent;
    title: string;
    params?: Record<string, unknown>;
    width?: number;
    height?: number;
}

const DEFAULT_WIDTH = 440;
const DEFAULT_HEIGHT = 620;

export function openEntityFloatingPanel(options: OpenEntityFloatingPanelOptions): void {
    const api = useLayoutStore.getState().dockviewApi;
    if (!api) return;

    const existing = api.getPanel(options.id);
    if (existing) {
        existing.api.setActive?.();
        return;
    }

    const width = options.width ?? DEFAULT_WIDTH;
    // Keep floating forms inside the visible workspace even on shorter screens.
    const height = Math.min(options.height ?? DEFAULT_HEIGHT, window.innerHeight - 80);
    const left = Math.round(Math.max(48, (window.innerWidth - width) / 2));
    const top = Math.max(48, Math.round((window.innerHeight - height) / 2));

    scheduleAfterUiEvent(() => {
        const liveApi = useLayoutStore.getState().dockviewApi;
        if (!liveApi) return;
        const already = liveApi.getPanel(options.id);
        if (already) {
            already.api.setActive?.();
            return;
        }
        liveApi.addPanel({
            id: options.id,
            component: options.component,
            title: options.title,
            tabComponent: 'entityFloatingTab',
            params: options.params ?? {},
            floating: {
                position: { left, top },
                width,
                height,
            },
        });
        liveApi.getPanel(options.id)?.api.setActive?.();
    });
}
