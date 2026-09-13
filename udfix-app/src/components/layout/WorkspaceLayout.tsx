import React from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useShallow } from 'zustand/react/shallow';
import { useLayoutStore } from '../../stores/useLayoutStore';

interface WorkspaceLayoutProps {
    leftSidebar: React.ReactNode;
    mainContent: React.ReactNode;
    rightSidebar: React.ReactNode;
    topToolbar: React.ReactNode;
}

const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({
    leftSidebar,
    mainContent,
    rightSidebar,
    topToolbar,
}) => {
    const {
        leftSidebarOpen,
        rightSidebarOpen,
        layout,
        setLayout,
        setLeftSidebarOpen,
        setRightSidebarOpen
    } = useLayoutStore(
        useShallow((s) => ({
            leftSidebarOpen: s.leftSidebarOpen,
            rightSidebarOpen: s.rightSidebarOpen,
            layout: s.layout,
            setLayout: s.setLayout,
            setLeftSidebarOpen: s.setLeftSidebarOpen,
            setRightSidebarOpen: s.setRightSidebarOpen,
        })),
    );

    // Handle layout changes
    const onLayout = (sizes: number[]) => {
        setLayout(sizes);
    };

    // Collapse handlers
    const onLeftCollapse = () => {
        setLeftSidebarOpen(true);
    };

    const onLeftExpand = () => {
        setLeftSidebarOpen(true);
    };

    const onRightCollapse = () => {
        setRightSidebarOpen(true);
    };

    const onRightExpand = () => {
        setRightSidebarOpen(true);
    };

    return (
        <div className="h-screen w-screen flex flex-col overflow-hidden mesh-gradient-bg">
            {/* Top Toolbar Area */}
            <div className="flex-none z-50">
                {topToolbar}
            </div>

            {/* Resizable Panels Area */}
            <div className="flex-1 overflow-hidden relative">
                <PanelGroup
                    direction="horizontal"
                    onLayout={onLayout}
                    autoSaveId="nomai-workspace-layout"
                >
                    {/* Left Sidebar Panel */}
                    {leftSidebarOpen && (
                        <>
                            <Panel
                                defaultSize={layout[0]}
                                minSize={15}
                                maxSize={30}
                                collapsible={true}
                                onCollapse={onLeftCollapse}
                                onExpand={onLeftExpand}
                                order={1}
                                className="z-40"
                            >
                                {leftSidebar}
                            </Panel>
                            <PanelResizeHandle className="w-1 hover:bg-primary/50 transition-colors z-50 cursor-col-resize" />
                        </>
                    )}

                    {/* Main Content Panel */}
                    <Panel order={2} className="z-0 relative">
                        {mainContent}
                    </Panel>

                    {/* Right Sidebar Panel */}
                    {rightSidebarOpen && (
                        <>
                            <PanelResizeHandle className="w-1 hover:bg-primary/50 transition-colors z-50 cursor-col-resize" />
                            <Panel
                                defaultSize={layout[2]}
                                minSize={15}
                                maxSize={30}
                                collapsible={true}
                                onCollapse={onRightCollapse}
                                onExpand={onRightExpand}
                                order={3}
                                className="z-40"
                            >
                                {rightSidebar}
                            </Panel>
                        </>
                    )}
                </PanelGroup>
            </div>
        </div>
    );
};

export default WorkspaceLayout;
