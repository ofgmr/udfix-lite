import React from 'react';
import { DockviewWrapper } from './DockviewWrapper';
import CommandPalette from './CommandPalette';
import { UdfBatchConverterDialog } from '../converter/UdfBatchConverterDialog';
import { UdfOpenChoiceDialog } from './UdfOpenChoiceDialog';
import { ClientReportHost } from '../parties/ClientReportDialog';
import TopToolbar from './TopToolbar';
import LeftSidebar from './LeftSidebar';
import RightActivityBar from './RightActivityBar';
import FlyoutPanel from '../ui/FlyoutPanel';
import { useShallow } from 'zustand/react/shallow';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { FileExplorerPanel } from '../explorer/FileExplorerPanel';
import CommentPanel from '../sidebar/CommentPanel';
import { useZenModeKeyboard } from '../../hooks/useZenModeKeyboard';
import { useAppKeyboardShortcuts } from '../../shortcuts/useAppKeyboardShortcuts';
import { registerScopedSelectAllShortcut } from '../../shortcuts/scopedSelectAll';
import { useCloseFlyoutOnOutsideClick } from '../../hooks/useCloseFlyoutOnOutsideClick';
import { useApplicationMenuBridge } from '../../hooks/useApplicationMenuBridge';
import { UserGuidanceRoot } from '../ui/userGuidance';
import { rendererStartupFlushSummary, rendererStartupMark } from '../../lib/startupTiming';
import {
    zenWorkspaceCenterClassName,
    zenWorkspaceDockAreaClassName,
    zenWorkspaceDockShellClassName,
    zenWorkspaceLeftDockClassName,
    zenWorkspaceRightRailClassName,
    zenWorkspaceRootClassName,
} from './zenModeChrome';

const MainLayout: React.FC = () => {
    const {
        leftSidebarOpen,
        leftExplorerOpen,
        activeRightPanel,
        closeRightPanel,
        isZenMode,
        udfBatchConverterOpen,
        setUdfBatchConverterOpen,
    } = useLayoutStore(
        useShallow((s) => ({
            leftSidebarOpen: s.leftSidebarOpen,
            leftExplorerOpen: s.leftExplorerOpen,
            activeRightPanel: s.activeRightPanel,
            closeRightPanel: s.closeRightPanel,
            isZenMode: s.isZenMode,
            udfBatchConverterOpen: s.udfBatchConverterOpen,
            setUdfBatchConverterOpen: s.setUdfBatchConverterOpen,
        })),
    );

    useZenModeKeyboard();
    useAppKeyboardShortcuts();
    useApplicationMenuBridge();
    useCloseFlyoutOnOutsideClick();

    React.useEffect(() => registerScopedSelectAllShortcut(window), []);

    React.useEffect(() => {
        rendererStartupMark('renderer:MainLayout mounted');
        rendererStartupFlushSummary();
    }, []);

    return (
        <>
            <UserGuidanceRoot />
            <div
            className={zenWorkspaceRootClassName(
                isZenMode,
                'h-screen w-screen flex flex-row overflow-hidden bg-background relative',
            )}
        >
            <TopToolbar />

            <div className={zenWorkspaceCenterClassName(isZenMode)}>
                <div
                    className={zenWorkspaceLeftDockClassName(
                        isZenMode,
                        leftExplorerOpen || leftSidebarOpen,
                    )}
                >
                    <LeftSidebar />
                    {leftExplorerOpen && !isZenMode && (
                        <div className="h-full min-h-0 flex shrink-0">
                            <FileExplorerPanel />
                        </div>
                    )}
                </div>

                <div className={zenWorkspaceDockAreaClassName(isZenMode)}>
                    <div className={zenWorkspaceDockShellClassName(isZenMode)}>
                        <DockviewWrapper />
                    </div>

                    {!isZenMode && (
                        <>
                            <FlyoutPanel
                                title="Yorumlar"
                                isOpen={activeRightPanel === 'comments'}
                                onClose={closeRightPanel}
                            >
                                <CommentPanel />
                            </FlyoutPanel>
                        </>
                    )}

                    <div className={zenWorkspaceRightRailClassName(isZenMode)}>
                        <RightActivityBar />
                    </div>
                </div>

                <CommandPalette />
            <UdfBatchConverterDialog
                open={udfBatchConverterOpen}
                onOpenChange={setUdfBatchConverterOpen}
            />
            <UdfOpenChoiceDialog />
            <ClientReportHost />
            </div>

        </div>
        </>
    );
};

export default MainLayout;
