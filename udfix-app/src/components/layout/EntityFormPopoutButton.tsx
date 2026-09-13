import React from 'react';
import { Button } from '../ui/button';
import MaterialIcon from '../ui/MaterialIcon';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { isDockviewPanelInPopout, popOutDockviewPanel } from '../../utils/dockviewPopout';

type PanelApiLike = {
    id: string;
    location?: { type?: string };
    onDidLocationChange?: (cb: () => void) => { dispose: () => void } | void;
};

export function EntityFormPopoutButton({
    panelApi,
    disabled,
}: {
    panelApi?: PanelApiLike | null;
    disabled?: boolean;
}) {
    const dockviewApi = useLayoutStore((s) => s.dockviewApi);
    const [inPopout, setInPopout] = React.useState(() =>
        panelApi ? isDockviewPanelInPopout({ api: panelApi }) : false,
    );
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        if (!panelApi) {
            setInPopout(false);
            return;
        }
        const refresh = () => setInPopout(isDockviewPanelInPopout({ api: panelApi }));
        refresh();
        const disposable = panelApi.onDidLocationChange?.(refresh);
        return () => disposable?.dispose?.();
    }, [panelApi]);

    if (!panelApi || inPopout) return null;

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-[32px] w-6 rounded-sm border border-transparent bg-white/5 text-muted-foreground transition-colors hover:border-white/10 hover:bg-white/10 hover:text-foreground"
            disabled={disabled || busy || !dockviewApi?.addPopoutGroup}
            title="Dışarı çıkar"
            aria-label="Dışarı çıkar"
            onClick={() => {
                void (async () => {
                    setBusy(true);
                    try {
                        await popOutDockviewPanel(dockviewApi, panelApi.id);
                    } finally {
                        setBusy(false);
                    }
                })();
            }}
        >
            <MaterialIcon icon="open_in_new" size={14} />
        </Button>
    );
}
