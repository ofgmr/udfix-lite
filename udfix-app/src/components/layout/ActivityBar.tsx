import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { cn } from '../../lib/utils';
import { useLayoutStore } from '../../stores/useLayoutStore';

interface ActivityBarProps {
    className?: string;
}

const ActivityBar: React.FC<ActivityBarProps> = ({ className }) => {
    const {
        leftSidebarOpen,
        toggleLeftSidebar,
        rightSidebarOpen,
        toggleRightSidebar
    } = useLayoutStore(
        useShallow((s) => ({
            leftSidebarOpen: s.leftSidebarOpen,
            toggleLeftSidebar: s.toggleLeftSidebar,
            rightSidebarOpen: s.rightSidebarOpen,
            toggleRightSidebar: s.toggleRightSidebar,
        })),
    );

    // Mock active state for now - usually this would track which view is active
    const [activeView, setActiveView] = React.useState<'explorer' | 'search' | 'ai' | 'settings'>('explorer');

    return (
        <div className={cn("w-12 flex flex-col items-center py-4 bg-card/80 border-r border-border backdrop-blur-md z-50", className)}>

            {/* Top Section */}
            <div className="flex flex-col gap-4">
                <ActivityBarItem
                    icon="folder_open"
                    label="Explorer"
                    isActive={activeView === 'explorer' && leftSidebarOpen}
                    onClick={() => {
                        setActiveView('explorer');
                        if (!leftSidebarOpen) toggleLeftSidebar();
                    }}
                />
                <ActivityBarItem
                    icon="search"
                    label="Search"
                    isActive={activeView === 'search' && leftSidebarOpen}
                    onClick={() => {
                        setActiveView('search');
                        if (!leftSidebarOpen) toggleLeftSidebar();
                    }}
                />
                <ActivityBarItem
                    icon="smart_toy"
                    label="AI Assistant"
                    isActive={activeView === 'ai' && rightSidebarOpen}
                    onClick={() => {
                        setActiveView('ai');
                        if (!rightSidebarOpen) toggleRightSidebar();
                    }}
                />
            </div>

            {/* Bottom Section */}
            <div className="mt-auto flex flex-col gap-4">
                <ActivityBarItem
                    icon="settings"
                    label="Settings"
                    isActive={activeView === 'settings'}
                    onClick={() => setActiveView('settings')}
                />
            </div>
        </div>
    );
};

interface ActivityBarItemProps {
    icon: string;
    label: string;
    isActive?: boolean;
    onClick?: () => void;
}

const ActivityBarItem: React.FC<ActivityBarItemProps> = ({ icon, label, isActive, onClick }) => {
    return (
        <button
            onClick={onClick}
            title={label}
            className={cn(
                "p-2 rounded-lg transition-all duration-200 relative group",
                isActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
            )}
        >
            <MaterialIcon icon={icon} size={24} />
            {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-1 bg-primary rounded-r-full" />
            )}
        </button>
    );
};

export default ActivityBar;
