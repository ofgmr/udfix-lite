import { toast } from '../lib/glass-utils';
import type { DragEvent } from 'react';
import { useLayoutStore } from '../stores/useLayoutStore';
import {
    NOMAI_FS_ENTRY_MIME,
    normalizeDroppedFsPath,
    resolveDroppedFilePath,
} from './droppedFilePath';
import { isProbablyLocalPath } from './localResource';

export { NOMAI_FS_ENTRY_MIME } from './droppedFilePath';

export function canProcessDockviewFileDrop(dataTransfer: DataTransfer): boolean {
    const types = Array.from(dataTransfer.types);
    return types.includes('Files') || types.includes('text/plain') || types.includes(NOMAI_FS_ENTRY_MIME);
}

/**
 * Dockview tab reorder uses HTML5 DnD with an empty `text/plain` payload (see dockview DragHandler).
 * Wrapper/panel dragover handlers must ignore these so dockview drop targets receive the drag.
 */
export function isLikelyDockviewPanelTabDrag(dataTransfer: DataTransfer): boolean {
    const types = Array.from(dataTransfer.types);
    if (types.includes('Files')) return false;
    if (types.includes(NOMAI_FS_ENTRY_MIME)) return false;
    const allowed = dataTransfer.effectAllowed;
    if (allowed === 'move' || allowed === 'linkMove') return true;
    if (typeof document !== 'undefined') {
        if (document.querySelector('.dv-tab.dv-dragged, .dv-tab.dv-tab-dragging')) return true;
    }
    return types.length === 1 && types[0] === 'text/plain';
}

/** Electron OS file hover often exposes no `types` until drop; still allow dragover preventDefault. */
export function allowDockviewFileDragOver(dataTransfer: DataTransfer): boolean {
    if (isLikelyDockviewPanelTabDrag(dataTransfer)) return false;
    const types = Array.from(dataTransfer.types);
    if (types.length === 0) {
        const allowed = dataTransfer.effectAllowed;
        return allowed !== 'move' && allowed !== 'linkMove';
    }
    return canProcessDockviewFileDrop(dataTransfer);
}

export function dockviewPanelFileDropHandlers(options?: {
    forceViewer?: boolean;
    targetViewerPanelId?: string;
}): {
    onDragOver: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
} {
    return {
        onDragOver: (e) => {
            if (allowDockviewFileDragOver(e.dataTransfer)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            }
        },
        onDrop: (e) => {
            if (processDockviewFileDrop(e, options)) {
                e.preventDefault();
                e.stopPropagation();
            }
        },
    };
}

export type DockviewFileDropEvent = {
    dataTransfer: DataTransfer;
    target: EventTarget | null;
    defaultPrevented?: boolean;
};

export function isDropOnUdfixEditorSurface(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return Boolean(el?.closest?.('.ProseMirror') || el?.closest?.('[data-component-id="editor"]'));
}

export function isUdfFileName(name: string): boolean {
    return name.split('.').pop()?.toLowerCase() === 'udf';
}

export type DockviewDropOpenAction = 'viewer' | 'udf-editor' | 'udf-choice';

export function resolveDockviewDropAction(
    name: string,
    options: { editorSurface: boolean },
): DockviewDropOpenAction {
    if (!isUdfFileName(name)) return 'viewer';
    return options.editorSurface ? 'udf-editor' : 'udf-choice';
}

type DropOpenPayload = {
    name: string;
    fsPath: string | null;
    viewerUrl: string;
};

function udfEditorPathUnavailableMessage(): string {
    return 'UDF dosya yolu okunamadı. Finder’dan doğrudan sürükleyin veya Dosya Gezgini’nden açın.';
}

function dispatchDropOpen(
    payload: DropOpenPayload,
    options: { editorSurface: boolean; viewerOpts?: { targetViewerPanelId?: string } },
): void {
    const { openInNewViewerTab, openUdfEditorTab, requestUdfOpenChoice } = useLayoutStore.getState();
    const action = resolveDockviewDropAction(payload.name, { editorSurface: options.editorSurface });

    switch (action) {
        case 'udf-editor':
            if (!payload.fsPath) {
                toast.error(udfEditorPathUnavailableMessage());
                return;
            }
            openUdfEditorTab({ path: payload.fsPath, name: payload.name });
            break;
        case 'udf-choice':
            requestUdfOpenChoice(
                {
                    fsPath: payload.fsPath,
                    viewerUrl: payload.viewerUrl,
                    name: payload.name,
                },
                options.viewerOpts,
            );
            break;
        case 'viewer':
            openInNewViewerTab({ url: payload.viewerUrl, name: payload.name }, options.viewerOpts);
            break;
        default: {
            const _exhaustive: never = action;
            void _exhaustive;
        }
    }
}

/**
 * Explorer payload, absolute path text/plain, or OS file list → viewer / UDF editor.
 * @returns true if a drop was handled.
 */
export function processDockviewFileDrop(
    e: DockviewFileDropEvent,
    options?: { forceViewer?: boolean; targetViewerPanelId?: string },
): boolean {
    const editorSurface = options?.forceViewer ? false : isDropOnUdfixEditorSurface(e.target);
    const viewerOpts = options?.targetViewerPanelId ? { targetViewerPanelId: options.targetViewerPanelId } : undefined;
    const openOpts = { editorSurface, viewerOpts };

    const custom = e.dataTransfer.getData(NOMAI_FS_ENTRY_MIME);
    if (custom) {
        try {
            const parsed = JSON.parse(custom) as { path: string; name: string };
            if (parsed.path && parsed.name) {
                dispatchDropOpen(
                    {
                        name: parsed.name,
                        fsPath: parsed.path,
                        viewerUrl: parsed.path,
                    },
                    openOpts,
                );
                return true;
            }
        } catch {
            /* noop */
        }
    }

    if (!editorSurface && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const fsPath = resolveDroppedFilePath(file);
        const viewerUrl = fsPath ?? URL.createObjectURL(file);
        dispatchDropOpen({ name: file.name, fsPath, viewerUrl }, openOpts);
        return true;
    }

    const plain = e.dataTransfer.getData('text/plain').trim();
    if (plain) {
        const fsPath = normalizeDroppedFsPath(plain);
        if (fsPath) {
            const base = fsPath.replace(/[/\\]+$/, '');
            const name =
                base.includes('/') || base.includes('\\') ? base.replace(/^.*[\\/]/, '') : base;
            if (name) {
                dispatchDropOpen(
                    {
                        name,
                        fsPath,
                        viewerUrl: fsPath,
                    },
                    openOpts,
                );
                return true;
            }
        }
    }

    return false;
}

export function canOpenUdfInEditor(fsPath: string | null | undefined): fsPath is string {
    return Boolean(fsPath && isProbablyLocalPath(fsPath));
}
