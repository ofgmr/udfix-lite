import { useEffect, useState, type ReactNode } from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { MatterFormContent } from '../matters/MatterFormContent';
import { PartyFormContent } from '../parties/PartyFormContent';
import { KnowledgeFormContent } from '../knowledge/KnowledgeFormContent';
import { DataService, type Matter, type Party, type KnowledgeItem } from '../../services/dataService';
import { useMattersStore } from '../../stores/useMattersStore';
import { usePartiesStore } from '../../stores/usePartiesStore';
import { PortalContainerProvider } from '../ui/portal-container-context';
import { useDockviewPanelPortalContainer } from '../../hooks/useDockviewPanelPortalContainer';

function EntityFormPortalShell({
    api,
    children,
}: {
    api: IDockviewPanelProps['api'];
    children: ReactNode;
}) {
    const panelApi = api as unknown as {
        getWindow?: () => Window;
        onDidLocationChange?: (cb: () => void) => { dispose: () => void } | void;
    };
    const portalContainer = useDockviewPanelPortalContainer(panelApi);
    return <PortalContainerProvider container={portalContainer}>{children}</PortalContainerProvider>;
}

function MatterFormPanel(props: IDockviewPanelProps) {
    const matterId = props.params?.matterId as string | undefined;
    const [matter, setMatter] = useState<Matter | null>(null);
    const [loading, setLoading] = useState(Boolean(matterId));

    useEffect(() => {
        if (!matterId) {
            setMatter(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        void (async () => {
            setLoading(true);
            try {
                const data = await DataService.getMatter(matterId);
                if (!cancelled) setMatter(data ?? null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [matterId]);

    if (loading) {
        return (
            <EntityFormPortalShell api={props.api}>
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Yükleniyor...
                </div>
            </EntityFormPortalShell>
        );
    }

    return (
        <EntityFormPortalShell api={props.api}>
            <MatterFormContent
                matter={matter}
                onSuccess={() => void useMattersStore.getState().fetchMatters()}
                onCancel={() => props.api.close()}
                panelApi={props.api}
            />
        </EntityFormPortalShell>
    );
}

function PartyFormPanel(props: IDockviewPanelProps) {
    const partyId = props.params?.partyId as string | undefined;
    const [party, setParty] = useState<Party | null>(null);
    const [loading, setLoading] = useState(Boolean(partyId));

    useEffect(() => {
        if (!partyId) {
            setParty(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        void (async () => {
            setLoading(true);
            try {
                const parties = await DataService.getParties();
                const found = Array.isArray(parties)
                    ? parties.find((p) => p.id === partyId) ?? null
                    : null;
                if (!cancelled) setParty(found);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [partyId]);

    if (loading) {
        return (
            <EntityFormPortalShell api={props.api}>
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Yükleniyor...
                </div>
            </EntityFormPortalShell>
        );
    }

    return (
        <EntityFormPortalShell api={props.api}>
            <PartyFormContent
                party={party}
                onSuccess={() => void usePartiesStore.getState().fetchParties()}
                onCancel={() => props.api.close()}
                panelApi={props.api}
            />
        </EntityFormPortalShell>
    );
}

function KnowledgeFormPanel(props: IDockviewPanelProps) {
    const knowledgeId = props.params?.knowledgeId as string | undefined;
    const [item, setItem] = useState<Partial<KnowledgeItem> | null>(null);
    const [loading, setLoading] = useState(Boolean(knowledgeId));

    useEffect(() => {
        if (!knowledgeId) {
            setItem(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        void (async () => {
            setLoading(true);
            try {
                const found = await DataService.getKnowledgeItem(knowledgeId);
                if (!cancelled) setItem(found);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [knowledgeId]);

    if (loading) {
        return (
            <EntityFormPortalShell api={props.api}>
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Yükleniyor...
                </div>
            </EntityFormPortalShell>
        );
    }

    return (
        <EntityFormPortalShell api={props.api}>
            <KnowledgeFormContent
                item={item}
                onSuccess={() => {
                    window.dispatchEvent(new CustomEvent('nomai-knowledge-refresh'));
                }}
                onCancel={() => props.api.close()}
                panelApi={props.api}
            />
        </EntityFormPortalShell>
    );
}

export const entityFormPanelComponents = {
    matterForm: MatterFormPanel,
    partyForm: PartyFormPanel,
    knowledgeForm: KnowledgeFormPanel,
};
