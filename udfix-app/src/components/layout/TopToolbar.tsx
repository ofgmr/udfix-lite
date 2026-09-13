import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { useNotesStore } from '../../stores/useNotesStore';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { LeftSidebarFooter } from './LeftSidebar';
import { cn } from '../../lib/utils';
import { Separator } from '../ui/separator';
import { layoutRailOuterClassName } from './layoutRailChrome';
import { layoutRailZenCollapseClassName } from './zenModeChrome';
import { formatShortcutKeys } from '../../shortcuts/format';
import { getRegistryEntry } from '../../shortcuts/registry';
import { emptyTipTapDocJson } from '../../utils/editorEmptyPlaceholder';
import { useDelayedHoverReveal } from '../../hooks/useDelayedHoverReveal';
import { RailSideFlyout } from './RailSideFlyout';
import { useShowUserGuidanceLabels } from '../../hooks/useShowUserGuidanceLabels';
import { GuidanceRailButton, GUIDANCE_RAIL_WIDTH_CLASS } from '../ui/userGuidance';

const TopToolbar: React.FC = () => {
    const {
        leftExplorerOpen,
        toggleLeftExplorer,
        openEditorInNewTab,
        openDocumentRecoveryCenter,
        openEmptyViewerTab,
        dockviewApi,
        isZenMode,
    } = useLayoutStore(
        useShallow((s) => ({
            leftExplorerOpen: s.leftExplorerOpen,
            toggleLeftExplorer: s.toggleLeftExplorer,
            openEditorInNewTab: s.openEditorInNewTab,
            openDocumentRecoveryCenter: s.openDocumentRecoveryCenter,
            openEmptyViewerTab: s.openEmptyViewerTab,
            dockviewApi: s.dockviewApi,
            isZenMode: s.isZenMode,
        })),
    );

    const { addNote } = useNotesStore();
    const showGuidance = useShowUserGuidanceLabels();

    const fileExplorerShortcut = formatShortcutKeys(getRegistryEntry('toggle-file-explorer')!.combo);
    const newDocumentShortcut = formatShortcutKeys(getRegistryEntry('new-document')!.combo);
    const newNoteShortcut = formatShortcutKeys(getRegistryEntry('new-note')!.combo);
    const viewerShortcut = formatShortcutKeys(getRegistryEntry('focus-or-open-viewer')!.combo);
    const recoveryAnchorRef = React.useRef<HTMLDivElement>(null);
    const {
        visible: showRecoveryAction,
        bind: recoveryBind,
        panelBind: recoveryPanelBind,
    } = useDelayedHoverReveal();
    const [showGuidanceFlyout, setShowGuidanceFlyout] = React.useState(false);
    const railFlyoutOpen = showRecoveryAction || showGuidanceFlyout;

    return (
        <TooltipProvider delayDuration={0}>
            <aside
                data-layout-rail
                className={cn(
                    layoutRailOuterClassName({
                        className: cn(
                            'flex h-full min-h-0 shrink-0 flex-col overflow-hidden py-3 px-1.5 select-none',
                            showGuidance ? GUIDANCE_RAIL_WIDTH_CLASS : 'w-14',
                        ),
                    }),
                    isZenMode && 'shadow-[0_0_28px_color-mix(in_srgb,var(--primary)_12%,transparent)]',
                )}
                style={{ zIndex: railFlyoutOpen ? 'var(--z-floating)' : 'var(--z-interface)' }}
            >
                <div className="guidance-rail-scroll flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
                    <div className="flex min-h-full flex-1 flex-col">
                        <div
                            className={cn(
                                'flex w-full shrink-0 flex-col',
                                showGuidance ? 'gap-2' : 'gap-2',
                                layoutRailZenCollapseClassName(isZenMode),
                            )}
                        >
                    <GuidanceRailButton
                        icon="folder_data"
                        label="Dosya Gezgini"
                        shortcut={fileExplorerShortcut}
                        active={leftExplorerOpen}
                        onClick={toggleLeftExplorer}
                    />

                    <Separator className={cn('bg-border', showGuidance ? 'w-full' : 'w-8')} />

                    <div
                        ref={recoveryAnchorRef}
                        className={cn('relative w-full', showGuidance ? '' : 'h-10')}
                        {...recoveryBind}
                    >
                        <GuidanceRailButton
                            icon="edit_square"
                            label="Yeni Belge"
                            shortcut={newDocumentShortcut}
                            onClick={() => openEditorInNewTab()}
                        />

                        <RailSideFlyout
                            open={showRecoveryAction}
                            anchorRef={recoveryAnchorRef}
                            panelBind={recoveryPanelBind}
                        >
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                                        title="Belge Kurtarma"
                                        aria-label="Belge Kurtarma"
                                        onClick={() => openDocumentRecoveryCenter()}
                                    >
                                        <MaterialIcon icon="restore_page" size={18} />
                                        <span className="sr-only">Belge Kurtarma</span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                    <p>Belge Kurtarma</p>
                                </TooltipContent>
                            </Tooltip>
                        </RailSideFlyout>
                    </div>

                    <GuidanceRailButton
                        icon="edit_note"
                        label="Yeni Not"
                        shortcut={newNoteShortcut}
                        onClick={async () => {
                            const noteId = await addNote({
                                title: 'Yeni Not',
                                content_json: emptyTipTapDocJson(),
                                content_plain: '',
                                parent_type: 'GENERAL',
                                is_pinned: false,
                            });
                            if (noteId && dockviewApi) {
                                useLayoutStore.getState().openNote(noteId, 'Yeni Not');
                            }
                        }}
                    />

                    <GuidanceRailButton
                        icon="lab_profile"
                        label="Görüntüleyici"
                        shortcut={viewerShortcut}
                        onClick={() => openEmptyViewerTab()}
                    />
                        </div>

                        <div className="min-h-2 flex-1 shrink" aria-hidden="true" />

                        <LeftSidebarFooter onGuidanceFlyoutOpenChange={setShowGuidanceFlyout} />
                    </div>
                </div>
            </aside>
        </TooltipProvider>
    );
};

export default TopToolbar;
