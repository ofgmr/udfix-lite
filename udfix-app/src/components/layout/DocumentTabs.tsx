import type { IDockviewPanelHeaderProps } from 'dockview';
import MaterialIcon from '../ui/MaterialIcon';
import { cn } from '../../lib/utils';
import React, { useMemo } from 'react';

// Helper to get icon name based on extension or component type
export const getPanelIcon = (component: string, title?: string, params?: Record<string, unknown>) => {
    if (component === 'editor') return 'description';
    if (component === 'note') return 'sticky_note_2';

    if (component === 'viewer') {
        // Use URL if available, otherwise fallback to title
        const source = String(params?.url ?? title ?? '');
        const extension = source.split('.').pop()?.toLowerCase();

        switch (extension) {
            case 'pdf': return 'picture_as_pdf';
            case 'docx':
            case 'doc': return 'description';
            case 'jpg':
            case 'jpeg':
            case 'png':
            case 'webp': return 'image';
            case 'tiff':
            case 'tif': return 'photo_library';
            case 'udf': return 'gavel';
            case 'md':
            case 'markdown': return 'article';
            default: return 'visibility';
        }
    }

    return 'terminal';
};

export const CustomTab = (props: IDockviewPanelHeaderProps) => {
    const { api } = props;

    // 1. Better type detection: Use parameters if available, fallback to ID prefix
    const componentType = useMemo(() => {
        const params = api.getParameters();
        if (params?.type) return params.type; // Best practice: pass type in params

        if (api.id.startsWith('editor')) return 'editor';
        if (api.id.startsWith('viewer')) return 'viewer';
        return 'note';
        // eslint-disable-next-line react-hooks/exhaustive-deps -- dockview api identity is stable per tab
    }, [api.id]);

    const icon = getPanelIcon(componentType, api.title, api.getParameters());
    const isActive = api.isActive;

    const onPointerDown = (event: React.PointerEvent) => {
        // 2. Middle-click to close (standard IDE behavior)
        if (event.button === 1) {
            event.preventDefault();
            api.close();
            return;
        }
        if (event.button === 0) {
            api.setActive();
        }
    };

    const onClose = (event: React.MouseEvent) => {
        event.stopPropagation();
        api.close();
    };

    return (
        <div
            onPointerDown={onPointerDown}
            className={cn(
                "group flex items-center h-full px-3 gap-2 border-r border-white/5 cursor-pointer transition-all duration-200 select-none min-w-[120px] max-w-[240px] relative",
                isActive
                    ? "bg-white/10 text-white"
                    : "text-white/40 hover:bg-white/5 hover:text-white/70"
            )}
        >
            {/* 3. Visual Active Indicator (bottom bar) */}
            {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
            )}

            <div className={cn(
                "flex-shrink-0 flex items-center justify-center w-5 h-5 transition-transform group-hover:scale-110",
                isActive ? "text-primary" : "text-white/30"
            )}>
                <MaterialIcon icon={icon} size={18} />
            </div>

            <span className="flex-1 text-[13px] font-medium truncate tracking-tight">
                {api.title}
            </span>

            <button
                type="button"
                onClick={onClose}
                className={cn(
                    "flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-md transition-all hover:bg-white/10 hover:text-red-400 opacity-0 group-hover:opacity-100",
                    isActive && "opacity-60"
                )}
                aria-label="Close tab"
            >
                <MaterialIcon icon="close" size={14} />
            </button>
        </div>
    );
};