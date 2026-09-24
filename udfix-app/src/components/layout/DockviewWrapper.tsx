import React from 'react';
import { DockviewReact } from 'dockview';
import type { IDockviewPanelHeaderProps, IDockviewPanelProps } from 'dockview';
import 'dockview/dist/styles/dockview.css';
import { useShallow } from 'zustand/react/shallow';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { cn } from '../../lib/utils';
import { DockviewTab } from './DockviewTab';
import { DataService } from '../../services/dataService';
import {
    DEFAULT_EDITOR_DOCUMENT_ID,
    getUdfixDocumentIdForPanel,
    isEditorPanelId,
} from '../../utils/dockviewNoteTab';
import {
    allowDockviewFileDragOver,
    dockviewPanelFileDropHandlers,
    processDockviewFileDrop,
} from '../../utils/processDockviewFileDrop';
import { entityFormPanelComponents } from '../entityForms/EntityFormPanels';
import MaterialIcon from '../ui/MaterialIcon';
import type { DockviewReadyEvent } from 'dockview';
import type { LayoutDockviewApi } from '../../types/dockviewLayout';
import { toast } from '../../lib/glass-utils';
import { resolveDockviewPopoutUrl } from '../../utils/dockviewPopoutUrl';
import { syncThemeToPopoutWindow } from '../../utils/popoutThemeSync';
import { useThemeStore } from '../../stores/useThemeStore';
import { registerCloseActiveTabShortcut } from '../../shortcuts/closeActiveTab';
import { registerScopedSelectAllShortcut } from '../../shortcuts/scopedSelectAll';
import UdfixEditor from '../editor/UdfixEditor';
import { UniversalViewer } from '../viewer/UniversalViewer';
import { NoteEditor } from '../notes/NoteEditor';
import UdfFileEditorPanel from '../editor/UdfFileEditorPanel';
import DocumentRecoveryCenter from '../recovery/DocumentRecoveryCenter';
import { PortalContainerProvider } from '../ui/portal-container-context';
import { ViewerHostProvider } from '../viewer/viewer-host-context';
import { useDockviewPanelPortalContainer } from '../../hooks/useDockviewPanelPortalContainer';

const previewRetain = new Map<string, { refs: number; timer: ReturnType<typeof setTimeout> | null }>();

function retainUyapPreview(documentId: string) {
    const row = previewRetain.get(documentId) || { refs: 0, timer: null };
    row.refs += 1;
    if (row.timer != null) {
        clearTimeout(row.timer);
        row.timer = null;
    }
    previewRetain.set(documentId, row);
}

function releaseUyapPreview(documentId: string) {
    const row = previewRetain.get(documentId);
    if (!row) return;
    row.refs = Math.max(0, row.refs - 1);
    if (row.refs > 0) {
        previewRetain.set(documentId, row);
        return;
    }
    if (row.timer != null) clearTimeout(row.timer);
    row.timer = setTimeout(() => {
        previewRetain.delete(documentId);
        void DataService.clearUyapPreview(documentId);
    }, 400);
    previewRetain.set(documentId, row);
}

const panelFileDrop = dockviewPanelFileDropHandlers();

const EditorPanel = (_props: IDockviewPanelProps) => {
    const setEditor = useLayoutStore((s) => s.setEditor);
    const [showHistory, setShowHistory] = React.useState(false);
    const params =
        typeof _props.api?.getParameters === 'function' ? _props.api.getParameters() : _props.params;
    const documentId =
        getUdfixDocumentIdForPanel(_props.api.id, DEFAULT_EDITOR_DOCUMENT_ID, params) ??
        DEFAULT_EDITOR_DOCUMENT_ID;

    return (
        <div
            data-nomai-panel-scope
            data-nomai-panel-id={_props.api.id}
            className="h-full w-full flex flex-col bg-transparent relative overflow-hidden"
            {...panelFileDrop}
        >
            <UdfixEditor
                onEditorReady={setEditor}
                showHistory={showHistory}
                onCloseHistory={() => setShowHistory(false)}
                documentId={documentId}
            />
        </div>
    );
};

const NotePanel = (props: IDockviewPanelProps) => {
    const { noteId } = props.params;

    React.useEffect(() => {
        let cancelled = false;
        void (async () => {
            const n = await DataService.getNote(noteId);
            if (!cancelled && n) {
                const t = (n.title || '').trim() ? n.title! : 'Başlıksız Not';
                props.api.setTitle(t);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [noteId, props.api]);

    return (
        <div
            data-nomai-panel-scope
            data-nomai-panel-id={props.api.id}
            className="h-full w-full flex flex-col bg-transparent relative overflow-hidden"
            {...panelFileDrop}
        >
            <NoteEditor noteId={noteId} onClose={() => props.api.close()} />
        </div>
    );
};

const ViewerPanel = (props: IDockviewPanelProps) => {
    const panelApi = props.api as unknown as {
        getWindow?: () => Window;
        onDidLocationChange?: (cb: () => void) => { dispose: () => void } | void;
    };
    const portalContainer = useDockviewPanelPortalContainer(panelApi);
    const getOwnerWindow = React.useCallback((): Window => {
        try {
            return panelApi.getWindow?.() ?? window;
        } catch {
            return window;
        }
    }, [panelApi]);

    const viewerFile = useLayoutStore((s) => s.viewerFile);
    const diffHtml =
        typeof props.params?.diffHtml === 'string' && props.params.diffHtml.length > 0
            ? props.params.diffHtml
            : null;
    /** Yalnızca birincil `viewer` paneli global store'daki dosyayı gösterir; ek sekmeler bağımsız params kullanır. */
    const isPrimaryViewer = props.api.id === 'viewer';
    const fileUrl =
        diffHtml != null
            ? null
            : isPrimaryViewer
              ? (props.params?.fileUrl ?? viewerFile?.url ?? null)
              : (props.params?.fileUrl ?? null);
    const fileName =
        diffHtml != null
            ? null
            : isPrimaryViewer
              ? (props.params?.fileName ?? viewerFile?.name ?? null)
              : (props.params?.fileName ?? null);
    const previewDocumentId =
        diffHtml != null
            ? null
            : typeof props.params?.previewDocumentId === 'string'
              ? props.params.previewDocumentId
              : isPrimaryViewer && typeof viewerFile?.previewDocumentId === 'string'
                ? viewerFile.previewDocumentId
                : null;

    React.useEffect(() => {
        if (!previewDocumentId) return;
        retainUyapPreview(previewDocumentId);
        return () => {
            releaseUyapPreview(previewDocumentId);
        };
    }, [previewDocumentId]);

    const viewerDropHandlers = React.useMemo(
        () => dockviewPanelFileDropHandlers({ forceViewer: true, targetViewerPanelId: props.api.id }),
        [props.api.id],
    );

    return (
        <PortalContainerProvider container={portalContainer}>
            <ViewerHostProvider panelId={props.api.id} getOwnerWindow={getOwnerWindow}>
            <div
                data-nomai-panel-scope
                data-nomai-panel-id={props.api.id}
                className="h-full w-full relative bg-background/50 backdrop-blur-sm"
                {...viewerDropHandlers}
            >
                <div className="h-full w-full relative">
                    {diffHtml || (fileUrl && fileName) ? (
                        <UniversalViewer
                            fileUrl={fileUrl}
                            fileName={fileName}
                            embeddedDiffHtml={diffHtml}
                        />
                    ) : (
                        <div className="dockview-empty-canvas flex h-full flex-col items-center justify-center pointer-events-none">
                            <div className="dockview-empty-canvas__card">
                                <div className="dockview-empty-canvas__icon" aria-hidden>
                                    <MaterialIcon icon="upload_file" size={28} />
                                </div>
                                <p className="dockview-empty-canvas__title">Dosya bekleniyor</p>
                                <p className="dockview-empty-canvas__hint">
                                    Dosyayı buraya sürükleyin veya panelden açın.
                                    UDF, PDF, DOCX, RTF, XLSX,
                                    TIFF, JPEG, PNG, TXT, MD, ZIP, EML, EYP.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            </ViewerHostProvider>
        </PortalContainerProvider>
    );
};

const UdfEditorPanel = (props: IDockviewPanelProps) => {
    const filePath = String(props.params?.filePath ?? '');
    const fileName = String(props.params?.fileName ?? 'Belge.udf');
    return (
        <div
            data-nomai-panel-scope
            data-nomai-panel-id={props.api.id}
            className="h-full w-full bg-background"
            {...panelFileDrop}
        >
            <UdfFileEditorPanel filePath={filePath} fileName={fileName} />
        </div>
    );
};

const DataMattersStripPanel = (_props: IDockviewPanelProps) => {
    return (
        <div className="h-full w-full bg-background/50 backdrop-blur-sm flex items-center px-4 border-b border-white/5">
            <span className="text-xs text-muted-foreground">Dosya Özeti Şeridi (Yakında)</span>
        </div>
    );
};

type EntityFloatingTabProps = IDockviewPanelHeaderProps & React.HTMLAttributes<HTMLDivElement>;

const EntityFloatingTab = (props: EntityFloatingTabProps) => {
    const {
        api: _api,
        containerApi: _containerApi,
        params: _params,
        tabLocation: _tabLocation,
        className,
        ...rest
    } = props;

    return (
        <div
            {...rest}
            data-entity-floating-tab
            aria-label="Pencereyi taşımak için sürükleyin"
            title="Pencereyi taşımak için sürükleyin"
            className={cn('h-full w-full cursor-move', className)}
        />
    );
};

const components = {
    editor: EditorPanel,
    viewer: ViewerPanel,
    note: NotePanel,
    udfEditor: UdfEditorPanel,
    dataMattersStrip: DataMattersStripPanel,
    documentRecoveryCenter: DocumentRecoveryCenter,
    ...entityFormPanelComponents,
    default: (props: IDockviewPanelProps) => (
        <div className="p-4 text-foreground">{props.api.title}</div>
    ),
};

function getMainDockPanels(api: { panels: unknown[] }) {
    return api.panels.filter((panel) => {
        const locationType = (panel as { api?: { location?: { type?: string } } })?.api?.location?.type;
        return locationType == null || locationType === 'grid';
    }) as Array<{ id?: string; api?: { location?: { type?: string } } }>;
}

function getPopoutWindows(api: LayoutDockviewApi): Window[] {
    const windows = new Set<Window>();
    for (const panel of api.panels) {
        const panelApi = panel.api as unknown as {
            location?: { type?: string };
            getWindow?: () => Window;
        };
        if (panelApi.location?.type !== 'popout') continue;
        try {
            const win = panelApi.getWindow?.();
            if (win) windows.add(win);
        } catch {
            // noop
        }
    }
    return Array.from(windows);
}

export const DockviewWrapper: React.FC = () => {
    const { setDockviewApi, dockviewApi, viewerFile, isZenMode } = useLayoutStore(
        useShallow((s) => ({
            setDockviewApi: s.setDockviewApi,
            dockviewApi: s.dockviewApi,
            viewerFile: s.viewerFile,
            isZenMode: s.isZenMode,
        })),
    );

    React.useEffect(() => {
        if (!dockviewApi) return;

        const syncEditorTitles = (
            activeDocument: string,
            documents: { id: string; title: string }[],
        ) => {
            for (const panel of dockviewApi.panels) {
                if (isEditorPanelId(panel.id)) {
                    const params =
                        typeof panel.api?.getParameters === 'function' ? panel.api.getParameters() : {};
                    const documentId = getUdfixDocumentIdForPanel(panel.id, activeDocument, params);
                    const currentDoc = documents.find((d) => d.id === documentId);
                    if (currentDoc) panel.api.setTitle?.(currentDoc.title);
                }
            }
        };

        const initial = useLayoutStore.getState();
        syncEditorTitles(initial.activeDocument, initial.documents);
        return useLayoutStore.subscribe((next, prev) => {
            if (next.documents === prev.documents && next.activeDocument === prev.activeDocument) {
                return;
            }
            syncEditorTitles(next.activeDocument, next.documents);
        });
    }, [dockviewApi]);

    React.useEffect(() => {
        if (!dockviewApi) return;

        const viewerPanel = dockviewApi.getPanel('viewer');
        if (viewerPanel) {
            if (viewerFile) {
                viewerPanel.api.setTitle?.(viewerFile.name);
            } else {
                viewerPanel.api.setTitle?.('Önizleme');
            }
        }
    }, [dockviewApi, viewerFile]);

    const [panelCount, setPanelCount] = React.useState(0);
    const dropHostRef = React.useRef<HTMLDivElement>(null);

    const syncPanelCount = React.useCallback((api: LayoutDockviewApi) => {
        setPanelCount(getMainDockPanels(api).length);
    }, []);

    const onReady = (event: DockviewReadyEvent) => {
        const api = event.api as unknown as LayoutDockviewApi;
        setDockviewApi(api);
        api.getPanel('notes-placeholder')?.api.close?.();
        syncPanelCount(api);
        api.onDidAddPanel?.(() => {
            api.getPanel('notes-placeholder')?.api.close?.();
            syncPanelCount(api);
        });
        api.onDidRemovePanel?.(() => syncPanelCount(api));
        (api as unknown as { onDidLayoutChange?: (cb: () => void) => void }).onDidLayoutChange?.(() => {
            syncPanelCount(api);
        });
        api.onDidOpenPopoutWindowFail?.(() => {
            toast.error('Ayrı pencere açılamadı. Popup iznini kontrol edin.');
        });
    };

    React.useEffect(() => {
        let observer: MutationObserver | null = null;
        if (dockviewApi) {
            const syncAllPopoutThemes = () => {
                for (const popoutWindow of getPopoutWindows(dockviewApi)) {
                    syncThemeToPopoutWindow(window, popoutWindow);
                    const win = popoutWindow as Window & {
                        __nomaiCloseTabCleanup?: () => void;
                        __nomaiSelectAllCleanup?: () => void;
                    };
                    if (!win.__nomaiCloseTabCleanup) {
                        win.__nomaiCloseTabCleanup = registerCloseActiveTabShortcut(popoutWindow);
                    }
                    if (!win.__nomaiSelectAllCleanup) {
                        win.__nomaiSelectAllCleanup = registerScopedSelectAllShortcut(popoutWindow);
                    }
                }
            };
            syncAllPopoutThemes();
            observer = new MutationObserver(syncAllPopoutThemes);
            observer.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class'],
            });
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ['class'],
            });
            const unsubTheme = useThemeStore.subscribe(() => {
                // Palette/mode changes apply classes asynchronously; sync after paint.
                requestAnimationFrame(syncAllPopoutThemes);
            });
            return () => {
                observer?.disconnect();
                unsubTheme();
            };
        }
        return () => observer?.disconnect();
    }, [dockviewApi]);

    const isCanvasEmpty = panelCount === 0;

    const handleEmptyCanvasDragOver = React.useCallback((e: React.DragEvent) => {
        if (!allowDockviewFileDragOver(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
    }, []);

    const handleEmptyCanvasDrop = React.useCallback((e: React.DragEvent) => {
        if (processDockviewFileDrop(e)) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, []);

    React.useEffect(() => {
        const host = dropHostRef.current;
        if (!host || !isCanvasEmpty) return;

        const onCaptureDragOver = (event: DragEvent) => {
            if (!event.dataTransfer || !allowDockviewFileDragOver(event.dataTransfer)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        };

        const onCaptureDrop = (event: DragEvent) => {
            if (processDockviewFileDrop(event)) {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        host.addEventListener('dragover', onCaptureDragOver, true);
        host.addEventListener('drop', onCaptureDrop, true);
        return () => {
            host.removeEventListener('dragover', onCaptureDragOver, true);
            host.removeEventListener('drop', onCaptureDrop, true);
        };
    }, [isCanvasEmpty]);

    return (
        <div
            ref={dropHostRef}
            className={cn('relative h-full w-full bg-[var(--background)]', isZenMode && 'zen-dockview-host')}
        >
            <DockviewReact
                components={components}
                defaultTabComponent={DockviewTab}
                tabComponents={{ entityFloatingTab: EntityFloatingTab }}
                onReady={onReady}
                className="dockview-theme-abyss"
                popoutUrl={resolveDockviewPopoutUrl()}
            />
            {isCanvasEmpty && (
                <div
                    className="dockview-empty-canvas dockview-empty-canvas--drop-target absolute inset-0 flex items-center justify-center"
                    onDragOver={handleEmptyCanvasDragOver}
                    onDrop={handleEmptyCanvasDrop}
                >
                    <div className="dockview-empty-canvas__card pointer-events-none select-none">
                        <div className="dockview-empty-canvas__icon" aria-hidden>
                            <MaterialIcon icon="mindfulness" size={28} />
                        </div>
                        <p className="dockview-empty-canvas__title">Çalışma alanı boş</p>
                        <p className="dockview-empty-canvas__hint">
                            Şimdi çalışmaya başlayın! Yeni bir belge açın, bir not yazın veya dosya sürükleyin.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
