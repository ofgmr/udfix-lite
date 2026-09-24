import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { Popover, PopoverAnchor, PopoverContent } from '../../components/ui/popover';
import { layoutRailOuterClassName } from './layoutRailChrome';
import { getDatabaseSearchShortcutLabel } from '../../shortcuts/databaseSearch';
import { formatShortcutKeys } from '../../shortcuts/format';
import { getRegistryEntry } from '../../shortcuts/registry';
import { MattersList } from '../matters/MattersList';
import { PartiesList } from '../parties/PartiesList';
import { KnowledgeBasePanel } from '../knowledge/KnowledgeBasePanel';
import { NotesPanel } from '../notes/NotesPanel';
import { CalendarPanel } from '../calendar/CalendarPanel';
import { MevzuatPanel } from '../mevzuat/MevzuatPanel';
import { trackPanelOpened } from '../../telemetry/trackEvent';
import { useShowUserGuidanceLabels } from '../../hooks/useShowUserGuidanceLabels';
import {
    GuidanceRailButtonContent,
    guidanceRailSurfaceClass,
    GUIDANCE_RAIL_WIDTH_CLASS,
} from '../ui/userGuidance';

const RightActivityBar: React.FC = () => {
    const { activeRightPanel, toggleRightPanel, closeRightPanel } = useLayoutStore(
        useShallow((s) => ({
            activeRightPanel: s.activeRightPanel,
            toggleRightPanel: s.toggleRightPanel,
            closeRightPanel: s.closeRightPanel,
        })),
    );
    const showGuidance = useShowUserGuidanceLabels();

    const topTools = [
        { id: 'matters', icon: 'gavel', label: 'Dosyalar' },
        { id: 'parties', icon: 'group', label: 'Taraflar' },
        { id: 'knowledge_base', icon: 'local_library', label: 'Bilgi Bankası' },
        { id: 'notes', icon: 'description', label: 'Notlar' },
        { id: 'calendar', icon: 'calendar_month', label: 'Takvim' },
        { id: 'mevzuat', icon: 'balance', label: 'Mevzuat' },
    ] as const;

    const renderPanel = (panel: (typeof topTools)[number]['id']) => {
        switch (panel) {
            case 'matters':
                return <MattersList />;
            case 'parties':
                return <PartiesList />;
            case 'knowledge_base':
                return <KnowledgeBasePanel />;
            case 'notes':
                return <NotesPanel />;
            case 'calendar':
                return <CalendarPanel />;
            case 'mevzuat':
                return <MevzuatPanel />;
            default: {
                const _exhaustive: never = panel;
                return _exhaustive;
            }
        }
    };

    return (
        <TooltipProvider delayDuration={0}>
            <div
                data-layout-rail
                className={layoutRailOuterClassName({
                    className: cn(
                        'h-full min-h-0 shrink-0 items-center gap-4 overflow-y-auto overflow-x-hidden guidance-rail-scroll py-3 px-1.5 mr-1.5',
                        showGuidance ? GUIDANCE_RAIL_WIDTH_CLASS : 'w-14',
                    ),
                })}
                style={{ zIndex: 'var(--z-interface)' }}
                data-right-activity-bar
            >
                <div className={cn('flex flex-col w-full', showGuidance ? 'gap-2.5' : 'gap-1.5')}>
                    {topTools.map((item) => {
                        const isActive = activeRightPanel === item.id;
                        let shortcut = '';
                        if (item.id === 'calendar') {
                            const entry = getRegistryEntry('database-open-calendar');
                            shortcut = entry
                                ? formatShortcutKeys(entry.combo, entry.winCombo)
                                : '';
                        } else if (
                            item.id === 'matters' ||
                            item.id === 'parties' ||
                            item.id === 'knowledge_base' ||
                            item.id === 'notes' ||
                            item.id === 'mevzuat'
                        ) {
                            shortcut = getDatabaseSearchShortcutLabel(item.id);
                        }
                        const tooltip = shortcut ? `${item.label} (${shortcut})` : item.label;
                        return (
                            <Popover
                                key={item.id}
                                open={isActive}
                                onOpenChange={(open) => {
                                    if (!open && isActive) closeRightPanel();
                                }}
                            >
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <PopoverAnchor asChild>
                                            <button
                                                type="button"
                                                title={tooltip}
                                                aria-label={tooltip}
                                                onClick={() => {
                                                    if (!isActive) trackPanelOpened(item.id);
                                                    toggleRightPanel(item.id);
                                                }}
                                                className={guidanceRailSurfaceClass(isActive, showGuidance, undefined, 'subtle')}
                                            >
                                                <GuidanceRailButtonContent
                                                    showGuidance={showGuidance}
                                                    label={item.label}
                                                    icon={item.icon}
                                                    iconSize={20}
                                                />
                                            </button>
                                        </PopoverAnchor>
                                    </TooltipTrigger>
                                    <TooltipContent
                                        side="left"
                                        className={cn(
                                            'text-[11px] font-medium mr-2 glass-tooltip border-border',
                                            showGuidance && 'hidden',
                                        )}
                                    >
                                        {tooltip}
                                    </TooltipContent>
                                </Tooltip>
                                <PopoverContent
                                    side="left"
                                    align="start"
                                    sideOffset={10}
                                    variant="glass"
                                    className={
                                        item.id === 'calendar'
                                            ? 'w-[320px] max-h-[min(70vh,560px)] overflow-y-auto overflow-x-hidden rounded-xl border-border p-3 shadow-2xl'
                                            : item.id === 'mevzuat'
                                              ? 'w-[380px] max-h-[min(70vh,560px)] overflow-y-auto overflow-x-hidden rounded-xl border-border p-3 shadow-2xl'
                                              : 'w-[300px] max-h-[min(70vh,520px)] overflow-y-auto overflow-x-hidden rounded-xl border-border p-3 shadow-2xl'
                                    }
                                    onOpenAutoFocus={(event) => event.preventDefault()}
                                >
                                    {isActive ? renderPanel(item.id) : null}
                                </PopoverContent>
                            </Popover>
                        );
                    })}
                </div>
            </div>
        </TooltipProvider>
    );
};

export default RightActivityBar;
