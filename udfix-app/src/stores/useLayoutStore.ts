import { Editor } from '@tiptap/react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { openEntityFloatingPanel } from '../utils/openEntityFloatingPanel';
import type { DockviewPanelApiLike, LayoutDockviewApi } from '../types/dockviewLayout';
import { getUdfixDocumentIdForPanel, getNoteIdFromPanelId } from '../utils/dockviewNoteTab';
import { finalizeNoteEditorIfRegistered } from '../utils/noteEditorCloseRegistry';
import { scheduleAfterUiEvent } from '../utils/scheduleAfterUiEvent';

function panelComponent(p: { component?: string; api?: { component?: string } }): string | undefined {
    return p.component ?? p.api?.component;
}

function panelLocationType(p: DockviewPanelApiLike): string | undefined {
    return (p.api as { location?: { type?: string } } | undefined)?.location?.type;
}

function isPanelInMainDock(p: DockviewPanelApiLike): boolean {
    const location = panelLocationType(p);
    return location == null || location === 'grid';
}

function listMainDockPanels(api: LayoutDockviewApi) {
    return Array.from(api.panels).filter(isPanelInMainDock);
}

function listMainGridGroups(api: LayoutDockviewApi) {
    return Array.from(api.groups ?? []).filter((group) => group.api?.location?.type === 'grid');
}

export type ViewerOpenFile = {
    url: string;
    name: string;
    previewDocumentId?: string;
};

function viewerParams(file: ViewerOpenFile) {
    return {
        fileUrl: file.url,
        fileName: file.name,
        ...(file.previewDocumentId ? { previewDocumentId: file.previewDocumentId } : {}),
    };
}

function ensureMainGridGroup(api: LayoutDockviewApi): { id: string } | null {
    const existing = listMainGridGroups(api)[0];
    if (existing) return { id: existing.id };
    if (typeof api.addGroup !== 'function') return null;
    try {
        const created = api.addGroup({ skipSetActive: true });
        return created ? { id: created.id } : null;
    } catch {
        try {
            const created = api.addGroup();
            return created ? { id: created.id } : null;
        } catch {
            return null;
        }
    }
}

/** Dockview hides the main reference group when the last tab popouts; reveal before adding main-only panels. */
function revealMainGridGroups(api: LayoutDockviewApi): void {
    for (const group of listMainGridGroups(api)) {
        const groupApi = group.api;
        if (groupApi?.isVisible === false && typeof groupApi.setVisible === 'function') {
            groupApi.setVisible(true);
        }
    }
    const host = document.querySelector('.dockview-theme-abyss, .dockview-theme');
    if (host && typeof api.layout === 'function') {
        const { width, height } = host.getBoundingClientRect();
        if (width > 0 && height > 0) {
            api.layout(width, height, true);
        }
    }
}

function listViewerComponentPanels(api: LayoutDockviewApi) {
    return listMainDockPanels(api).filter(
        (p) => panelComponent(p) === 'viewer'
    );
}

function listNoteComponentPanels(api: LayoutDockviewApi) {
    return listMainDockPanels(api).filter(
        (p) => panelComponent(p) === 'note'
    );
}

function listUdfEditorComponentPanels(api: LayoutDockviewApi) {
    return listMainDockPanels(api).filter(
        (p) => panelComponent(p) === 'udfEditor'
    );
}

function listEditorComponentPanels(api: LayoutDockviewApi) {
    return listMainDockPanels(api).filter(
        (p) => panelComponent(p) === 'editor'
    );
}

function hasPopoutPanels(api: LayoutDockviewApi): boolean {
    return Array.from(api.panels).some((p) => panelLocationType(p) === 'popout');
}

function focusMainApplicationWindow(): void {
    void window.electron?.invoke('focus-main-window');
}

type WorkAreaComponent = 'editor' | 'viewer' | 'note' | 'udfEditor';

type PanelAnchorDirection = 'within' | 'right' | 'below' | 'above' | 'left';
type PanelPosition =
    | { referencePanel: string; direction: PanelAnchorDirection }
    | { referenceGroup: string };

function listPanelsOfComponent(api: LayoutDockviewApi, component: WorkAreaComponent) {
    switch (component) {
        case 'editor':
            return listEditorComponentPanels(api);
        case 'viewer':
            return listViewerComponentPanels(api);
        case 'note':
            return listNoteComponentPanels(api);
        case 'udfEditor':
            return listUdfEditorComponentPanels(api);
        default: {
            const _exhaustive: never = component;
            void _exhaustive;
            return [];
        }
    }
}

function emptyGridPosition(api: LayoutDockviewApi): PanelPosition | undefined {
    const mainGroup = ensureMainGridGroup(api);
    return mainGroup ? { referenceGroup: mainGroup.id } : undefined;
}

function getLastEditorLikePanel(api: LayoutDockviewApi): DockviewPanelApiLike | null {
    const editors = listEditorComponentPanels(api);
    if (editors.length > 0) {
        return editors[editors.length - 1]!;
    }
    const udfEditors = listUdfEditorComponentPanels(api);
    if (udfEditors.length > 0) {
        return udfEditors[udfEditors.length - 1]!;
    }
    const rootEditor = api.getPanel('editor');
    if (rootEditor && isPanelInMainDock(rootEditor)) {
        return rootEditor;
    }
    return null;
}

/** İlk panel of type — soft default; açılış sonrası kullanıcı serbestçe taşır. */
function firstSpawnPosition(
    api: LayoutDockviewApi,
    component: WorkAreaComponent,
): PanelPosition | undefined {
    const editorLike = getLastEditorLikePanel(api);
    const viewers = listViewerComponentPanels(api);
    const notes = listNoteComponentPanels(api);
    const lastViewer = viewers.length > 0 ? viewers[viewers.length - 1]! : null;
    const lastNote = notes.length > 0 ? notes[notes.length - 1]! : null;
    const mainPanels = listMainDockPanels(api);

    switch (component) {
        case 'viewer':
            if (editorLike) {
                return { referencePanel: editorLike.id, direction: 'right' };
            }
            if (lastNote) {
                return { referencePanel: lastNote.id, direction: 'above' };
            }
            return emptyGridPosition(api);
        case 'note':
            if (editorLike) {
                if (lastViewer) {
                    return { referencePanel: lastViewer.id, direction: 'below' };
                }
                return { referencePanel: editorLike.id, direction: 'right' };
            }
            if (lastViewer) {
                return { referencePanel: lastViewer.id, direction: 'below' };
            }
            return emptyGridPosition(api);
        case 'editor':
            if (mainPanels.length > 0) {
                return { referencePanel: mainPanels[0]!.id, direction: 'left' };
            }
            return emptyGridPosition(api);
        case 'udfEditor':
            if (editorLike) {
                return { referencePanel: editorLike.id, direction: 'within' };
            }
            if (lastViewer) {
                return { referencePanel: lastViewer.id, direction: 'right' };
            }
            return emptyGridPosition(api);
        default: {
            const _exhaustive: never = component;
            void _exhaustive;
            return undefined;
        }
    }
}

/** Açılış konumu: aynı tip → son panelin grubu; ilk kez → spawn tablosu. Yalnızca addPanel anında. */
function resolveOpenPosition(
    api: LayoutDockviewApi,
    component: WorkAreaComponent,
): PanelPosition | undefined {
    const sameType = listPanelsOfComponent(api, component);
    if (sameType.length > 0) {
        return {
            referencePanel: sameType[sameType.length - 1]!.id,
            direction: 'within',
        };
    }
    return firstSpawnPosition(api, component);
}

/**
 * Editör / not / UDF yalnızca ana grid'de açılır. Popout varken ve ana grid boşken
 * doğrudan `referenceGroup` kullan; panel yanlışlıkla popout grubuna düşerse taşı.
 */
function positionForMainOnlyPanel(
    api: LayoutDockviewApi,
    component: WorkAreaComponent,
): PanelPosition | undefined {
    const mainCount = listMainDockPanels(api).length;
    if (hasPopoutPanels(api) && mainCount === 0) {
        const mainGroup = ensureMainGridGroup(api);
        return mainGroup ? { referenceGroup: mainGroup.id } : undefined;
    }
    return resolveOpenPosition(api, component);
}

function finalizeMainOnlyPanel(api: LayoutDockviewApi, panelId: string): void {
    const panel = api.getPanel(panelId);
    if (!panel) return;

    if (!isPanelInMainDock(panel as DockviewPanelApiLike)) {
        const mainGroup = ensureMainGridGroup(api);
        if (mainGroup && typeof panel.api.moveTo === 'function') {
            try {
                panel.api.moveTo({ group: mainGroup.id });
            } catch {
                try {
                    panel.api.moveTo({ group: mainGroup });
                } catch {
                    /* noop */
                }
            }
        }
    }

    try {
        panel.api.setActive?.();
    } catch {
        /* noop */
    }

    if (hasPopoutPanels(api)) {
        revealMainGridGroups(api);
        focusMainApplicationWindow();
    }
}

function getEditorLikeReferenceForNewTab(api: LayoutDockviewApi): { id: string } | undefined {
    const active = api.activePanel as
        | { id: string; component?: string; api?: { component?: string } }
        | undefined;
    const activeInMainDock = active
        ? isPanelInMainDock(active as DockviewPanelApiLike)
        : false;
    const comp = active ? panelComponent(active as { component?: string; api?: { component?: string } }) : undefined;
    if (active && activeInMainDock && (comp === 'editor' || comp === 'udfEditor')) {
        return { id: active.id };
    }
    const root = api.getPanel('editor');
    if (root && isPanelInMainDock(root)) return { id: root.id };
    const editors = listMainDockPanels(api).filter((p) => panelComponent(p) === 'editor');
    if (editors.length) return { id: editors[editors.length - 1].id };
    const fallbackMainPanel = listMainDockPanels(api)[0];
    return fallbackMainPanel ? { id: fallbackMainPanel.id } : undefined;
}

const SEARCHABLE_FLYOUT_PANELS = new Set(['matters', 'parties', 'knowledge_base', 'notes', 'mevzuat']);

function isSearchableFlyoutPanel(panel: string | null | undefined): panel is string {
    return typeof panel === 'string' && SEARCHABLE_FLYOUT_PANELS.has(panel);
}

function searchFocusState(panel: string, currentPulse: number) {
    if (!isSearchableFlyoutPanel(panel)) return {};
    return {
        flyoutSearchFocusPulse: currentPulse + 1,
        flyoutSearchFocusPanel: panel,
    };
}

function searchablePanelOrDefault(panel: string | null | undefined): string {
    return isSearchableFlyoutPanel(panel) ? panel : 'matters';
}

interface Document {
    id: string;
    title: string;
}

interface LayoutState {
    // Editor Instance (Non-persisted)
    editor: Editor | null;
    setEditor: (editor: Editor | null) => void;

    // Sidebar Visibility
    leftSidebarOpen: boolean;
    leftExplorerOpen: boolean;
    rightSidebarOpen: boolean; // Keeping for backward compatibility or global toggle
    activeRightPanel: string | null; // 'matters', 'parties', 'notes', 'ai', etc.
    flyoutSearchQuery: string;
    setFlyoutSearchQuery: (query: string) => void;
    flyoutSearchFocusPulse: number;
    flyoutSearchFocusPanel: string | null;

    /** Ephemeral: NoteEditor / command palette opens Notlar with an FTS preset. */
    notesPanelSearchPulse: number;
    notesPanelSearchPayload: { query: string; hint?: string } | null;

    toggleLeftSidebar: () => void;
    toggleLeftExplorer: () => void;
    openExplorerPanel: () => void;
    closeExplorerPanel: () => void;
    toggleRightSidebar: () => void;
    toggleRightPanel: (panel: string) => void;
    /** Flyout paneli kapatır; arama satırını da temizler. */
    closeRightPanel: () => void;

    setLeftSidebarOpen: (open: boolean) => void;
    setLeftExplorerOpen: (open: boolean) => void;
    setRightSidebarOpen: (open: boolean) => void;
    /** Open a flyout panel without toggle-close semantics (e.g. comment hover). */
    openRightPanel: (panel: string) => void;
    /** Open or focus the current database flyout search input. */
    openRightPanelSearch: (panel?: string | null) => void;
    openNotesPanelWithSearch: (query: string, hint?: string) => void;
    clearNotesPanelSearchPayload: () => void;

    // Panel Sizing (percentages)
    layout: number[]; // [left, center, right]
    setLayout: (sizes: number[]) => void;

    // Document Management
    activeDocument: string;
    documents: Document[];
    setActiveDocument: (id: string) => void;
    addDocument: (title: string) => void;
    closeDocument: (id: string) => void;
    renameDocument: (id: string, newTitle: string) => void;

    // Viewer State (For Universal Viewer)
    viewerFile: ViewerOpenFile | null;
    setViewerFile: (file: ViewerOpenFile | null) => void;

    // Dockview API (Non-persisted)
    dockviewApi: LayoutDockviewApi | null;
    setDockviewApi: (api: LayoutDockviewApi | null) => void;
    pendingViewerOpen: { file: ViewerOpenFile; options?: { targetViewerPanelId?: string; forceSiblingTab?: boolean } } | null;

    // Editor Save State
    editorSaveState: 'saved' | 'saving' | 'unsaved' | 'error';
    editorSaveError: string | null;
    setEditorSaveState: (
        state: 'saved' | 'saving' | 'unsaved' | 'error',
        errorMessage?: string | null,
    ) => void;
    /** e-imza + UDF dışa aktarımı sırasında editör üstü bekleme katmanı */
    signExportOverlay: { message: string; hint?: string } | null;
    setSignExportOverlay: (overlay: { message: string; hint?: string } | null) => void;
    showVersionHistory: boolean;
    setShowVersionHistory: (show: boolean) => void;
    /** Versiyon paneli yalnızca bu documentId’ye sahip UdfixEditor’da açılır (çoklu sekme çakışmasını önler). */
    versionHistoryForDocumentId: string | null;
    setVersionHistoryForDocumentId: (id: string | null) => void;
    /** Sekme ikonundan açılınca popover konumu; null = ortalanmış modal. */
    versionHistoryAnchorRect: { top: number; left: number; width: number; height: number } | null;
    setVersionHistoryAnchorRect: (
        r: { top: number; left: number; width: number; height: number } | null
    ) => void;

    openNote: (noteId: string, title?: string) => void;
    /** Ayrı sekme (aynı nota ikinci panel). */
    openNoteInNewTab: (noteId: string, title?: string) => void;
    openInNewViewerTab: (
        file: ViewerOpenFile,
        options?: { targetViewerPanelId?: string; forceSiblingTab?: boolean }
    ) => void;
    /** Araç çubuğu: görüntüleyici grubunda yeni boş sekme. */
    openEmptyViewerTab: () => void;
    /** Metin farkını Görüntüleyici alanında yeni sekmede açar (UniversalViewer içi). */
    openDiffInViewerTab: (payload: { html: string; title: string }) => void;
    openUdfEditorTab: (file: { path: string; name: string }) => void;
    /** UDF editör sekmesini yeni dosya yoluna taşır (farklı kaydet sonrası). */
    retargetUdfEditorTab: (oldPath: string, newPath: string, newName: string) => void;
    /** Odaktaki Dockview sekmesini kapatır (⌘W). */
    closeActiveTab: () => void;
    /** Yeni belge sekmesi: açık editör grubu varsa aynı gruba, yoksa yeni panel. */
    openEditorInNewTab: () => void;
    /** Registry/recovery üzerinden belirli bir Udfix documentId'yi editörde açar. */
    openEditorDocument: (documentId: string, title?: string) => void;
    /** Görüntüleyici paneli yoksa editörün sağına ekler ve odaklar. */
    focusOrOpenViewer: () => void;
    /** Son/kayıp editör belgelerini gösteren floating kurtarma merkezi. */
    openDocumentRecoveryCenter: () => void;
    /** UDF → PDF toplu dönüştürücü modalı */
    udfBatchConverterOpen: boolean;
    setUdfBatchConverterOpen: (open: boolean) => void;
    openUdfBatchConverter: () => void;
    /** Çalışma alanına UDF sürüklendiğinde editör / görüntüleyici seçimi */
    udfOpenChoice: {
        fsPath: string | null;
        viewerUrl: string;
        name: string;
        viewerOptions?: { targetViewerPanelId?: string; forceSiblingTab?: boolean };
    } | null;
    requestUdfOpenChoice: (
        file: { fsPath: string | null; viewerUrl: string; name: string },
        viewerOptions?: { targetViewerPanelId?: string; forceSiblingTab?: boolean },
    ) => void;
    clearUdfOpenChoice: () => void;
    /** Opsiyonel ince veri şeridi paneli açar */
    openDataMattersStrip: () => void;

    /** Veritabanı kayıt formları — Dockview floating panel */
    openMatterFormFloating: (matter?: { id: string; title?: string } | null) => void;
    openPartyFormFloating: (party?: { id: string; full_name?: string } | null) => void;
    openKnowledgeFormFloating: (item?: { id?: string; title?: string } | null) => void;

    // Zen Mode (focus writing — UI snapshot restored on exit)
    isZenMode: boolean;
    zenModeSnapshot: {
        leftExplorerOpen: boolean;
        leftSidebarOpen: boolean;
        activeRightPanel: string | null;
    } | null;
    enterZenMode: () => void;
    exitZenMode: () => void;
    toggleZenMode: () => void;
}

export const useLayoutStore = create<LayoutState>()(
    persist(
        (set, get) => ({
            // Editor Instance
            editor: null,
            setEditor: (editor) => {
                if (get().editor === editor) return;
                set({ editor });
            },

            // Sidebar Visibility
            leftSidebarOpen: false,
            leftExplorerOpen: false,
            rightSidebarOpen: false, // Default closed now that we have panels
            activeRightPanel: null,
            flyoutSearchQuery: '',
            setFlyoutSearchQuery: (query) => set({ flyoutSearchQuery: query }),
            flyoutSearchFocusPulse: 0,
            flyoutSearchFocusPanel: null,
            notesPanelSearchPulse: 0,
            notesPanelSearchPayload: null,

            toggleLeftSidebar: () => set((state) => ({ leftSidebarOpen: !state.leftSidebarOpen })),
            toggleLeftExplorer: () =>
                set((state) => ({ leftExplorerOpen: !state.leftExplorerOpen })),
            openExplorerPanel: () => {
                set({ leftExplorerOpen: true });
            },
            closeExplorerPanel: () => {
                set({ leftExplorerOpen: false });
            },
            toggleRightSidebar: () => set((state) => {
                if (state.rightSidebarOpen) {
                    return {
                        rightSidebarOpen: false,
                        activeRightPanel: null,
                        flyoutSearchFocusPanel: null,
                    };
                }
                return {
                    rightSidebarOpen: true,
                    activeRightPanel: 'matters',
                    ...searchFocusState('matters', state.flyoutSearchFocusPulse),
                };
            }),

            toggleRightPanel: (panel) => set((state) => {
                // If clicking the same panel, close it. If different, switch to it.
                if (state.activeRightPanel === panel) {
                    return {
                        activeRightPanel: null,
                        rightSidebarOpen: false,
                        flyoutSearchQuery: '',
                        flyoutSearchFocusPanel: null,
                    };
                }
                return {
                    activeRightPanel: panel,
                    rightSidebarOpen: true,
                    flyoutSearchQuery: '',
                    ...searchFocusState(panel, state.flyoutSearchFocusPulse),
                };
            }),

            closeRightPanel: () =>
                set({
                    activeRightPanel: null,
                    rightSidebarOpen: false,
                    flyoutSearchQuery: '',
                    flyoutSearchFocusPanel: null,
                }),

            setLeftSidebarOpen: (open) => set({ leftSidebarOpen: open }),
            setLeftExplorerOpen: (open) => set({ leftExplorerOpen: open }),
            setRightSidebarOpen: (open) => set((state) => {
                const panel = open ? 'matters' : null;
                return {
                    rightSidebarOpen: open,
                    activeRightPanel: panel,
                    ...(panel
                        ? searchFocusState(panel, state.flyoutSearchFocusPulse)
                        : { flyoutSearchFocusPanel: null }),
                };
            }),

            openRightPanel: (panel) => set((state) => ({
                activeRightPanel: panel,
                rightSidebarOpen: true,
                ...searchFocusState(panel, state.flyoutSearchFocusPulse),
            })),

            openRightPanelSearch: (panel) => set((state) => {
                const targetPanel = searchablePanelOrDefault(panel ?? state.activeRightPanel);
                return {
                    activeRightPanel: targetPanel,
                    rightSidebarOpen: true,
                    flyoutSearchFocusPulse: state.flyoutSearchFocusPulse + 1,
                    flyoutSearchFocusPanel: targetPanel,
                };
            }),

            openNotesPanelWithSearch: (query, hint) =>
                set((state) => ({
                    activeRightPanel: 'notes',
                    rightSidebarOpen: true,
                    notesPanelSearchPulse: state.notesPanelSearchPulse + 1,
                    notesPanelSearchPayload: { query, hint },
                    flyoutSearchFocusPulse: state.flyoutSearchFocusPulse + 1,
                    flyoutSearchFocusPanel: 'notes',
                })),

            clearNotesPanelSearchPayload: () => set({ notesPanelSearchPayload: null }),

            // Panel Sizing
            layout: [20, 60, 20], // Default distribution
            setLayout: (sizes) => set({ layout: sizes }),

            // Document Management
            activeDocument: 'doc-1',
            documents: [{ id: 'doc-1', title: 'Untitled Document' }],
            setActiveDocument: (id) => set({ activeDocument: id }),
            addDocument: (title) => {
                const newDoc = {
                    id: `doc-${Date.now()}`,
                    title,
                };
                set((state) => ({
                    documents: [...state.documents, newDoc],
                    activeDocument: newDoc.id,
                }));
            },
            closeDocument: (id) => {
                const { documents, activeDocument } = get();
                const newDocs = documents.filter((doc) => doc.id !== id);

                if (newDocs.length === 0) {
                    // Always keep at least one document
                    const defaultDoc = { id: 'doc-1', title: 'Untitled Document' };
                    set({
                        documents: [defaultDoc],
                        activeDocument: defaultDoc.id,
                    });
                } else {
                    let newActiveId = activeDocument;
                    if (activeDocument === id) {
                        // If closing active doc, switch to the first available
                        newActiveId = newDocs[0].id;
                    }
                    set({
                        documents: newDocs,
                        activeDocument: newActiveId,
                    });
                }
            },
            renameDocument: (id, newTitle) => {
                set((state) => ({
                    documents: state.documents.map((doc) =>
                        doc.id === id ? { ...doc, title: newTitle } : doc
                    )
                }));
            },

            // Viewer State
            viewerFile: null,
            setViewerFile: (file) => set({ viewerFile: file }),

            // Dockview API
            dockviewApi: null,
            pendingViewerOpen: null,
            setDockviewApi: (api) => {
                set({ dockviewApi: api });
                const pending = get().pendingViewerOpen;
                if (api && pending) {
                    set({ pendingViewerOpen: null });
                    queueMicrotask(() => get().openInNewViewerTab(pending.file, pending.options));
                }
            },

            // Editor Save State
            editorSaveState: 'saved',
            editorSaveError: null,
            setEditorSaveState: (state, errorMessage) =>
                set({
                    editorSaveState: state,
                    editorSaveError: state === 'error' ? (errorMessage ?? 'Kaydetme başarısız') : null,
                }),
            signExportOverlay: null,
            setSignExportOverlay: (overlay) => set({ signExportOverlay: overlay }),
            showVersionHistory: false,
            setShowVersionHistory: (show) => set({ showVersionHistory: show }),
            versionHistoryForDocumentId: null,
            setVersionHistoryForDocumentId: (id) => set({ versionHistoryForDocumentId: id }),
            versionHistoryAnchorRect: null,
            setVersionHistoryAnchorRect: (r) => set({ versionHistoryAnchorRect: r }),

            openNote: (noteId, title = 'Not') => {
                const api = get().dockviewApi;
                if (!api) return;

                const stableId = `note:${noteId}`;
                const existing = api.getPanel(stableId) || api.getPanel(noteId);
                if (existing) {
                    existing.api.setActive?.();
                    return;
                }

                const position = positionForMainOnlyPanel(api, 'note');

                api.addPanel({
                    id: stableId,
                    component: 'note',
                    title: title || 'Not',
                    params: { noteId },
                    position,
                });
                finalizeMainOnlyPanel(api, stableId);
            },
            openNoteInNewTab: (noteId, title = 'Not') => {
                const api = get().dockviewApi;
                if (!api) return;

                const position = positionForMainOnlyPanel(api, 'note');

                const panelId = `noteview:${noteId}:${Date.now().toString(36)}`;
                api.addPanel({
                    id: panelId,
                    component: 'note',
                    title: title || 'Not',
                    params: { noteId },
                    position,
                });
                finalizeMainOnlyPanel(api, panelId);
            },
            openInNewViewerTab: (file, options) => {
                const api = get().dockviewApi;
                if (!api) {
                    set({ pendingViewerOpen: { file, options } });
                    return;
                }

                const allViewerPanels = () =>
                    Array.from(api.panels).filter((p) => panelComponent(p) === 'viewer');
                const viewerPanels = () =>
                    listMainDockPanels(api).filter(
                        (p) => panelComponent(p) === 'viewer'
                    );

                const resolvePanelUrl = (panel: DockviewPanelApiLike): string | undefined => {
                    const params = typeof panel.api?.getParameters === 'function' ? panel.api.getParameters() : {};
                    if (panel.id === 'viewer') {
                        const pUrl = params?.fileUrl;
                        if (typeof pUrl === 'string' && pUrl.length > 0) return pUrl;
                        return get().viewerFile?.url;
                    }
                    const u = params?.fileUrl;
                    return typeof u === 'string' && u.length > 0 ? u : undefined;
                };

                const panelShowsDiff = (panel: DockviewPanelApiLike): boolean => {
                    const params = typeof panel.api?.getParameters === 'function' ? panel.api.getParameters() : {};
                    return typeof params?.diffHtml === 'string' && params.diffHtml.length > 0;
                };

                const anyViewerHasContent = (): boolean => {
                    for (const p of viewerPanels()) {
                        if (panelShowsDiff(p)) return true;
                        const url = resolvePanelUrl(p);
                        if (url && url.length > 0) return true;
                    }
                    return false;
                };

                const targetId = options?.targetViewerPanelId;
                if (targetId) {
                    const targetPanel = allViewerPanels().find((p) => p.id === targetId);
                    if (targetPanel) {
                        if (options?.forceSiblingTab) {
                            const siblingId = `viewer-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                            api.addPanel({
                                id: siblingId,
                                component: 'viewer',
                                title: file.name,
                                params: viewerParams(file),
                                position: { referencePanel: targetId, direction: 'within' },
                            });
                            api.getPanel(siblingId)?.api.setActive?.();
                            return;
                        }
                        const params =
                            typeof targetPanel.api?.getParameters === 'function'
                                ? targetPanel.api.getParameters()
                                : {};
                        const primaryEmpty =
                            targetId === 'viewer' &&
                            !get().viewerFile &&
                            !(typeof params?.fileUrl === 'string' && params.fileUrl.length > 0);
                        const auxiliaryEmpty =
                            targetId !== 'viewer' &&
                            !(typeof params?.fileUrl === 'string' && params.fileUrl.length > 0) &&
                            !(typeof params?.diffHtml === 'string' && params.diffHtml.length > 0);

                        if (primaryEmpty || auxiliaryEmpty) {
                            if (targetId === 'viewer') {
                                set({ viewerFile: file });
                                const pv = api.getPanel('viewer');
                                pv?.api.updateParameters?.(viewerParams(file));
                                pv?.api.setTitle?.(file.name);
                                pv?.api.setActive?.();
                                return;
                            }
                            targetPanel.api.updateParameters?.(viewerParams(file));
                            targetPanel.api.setTitle?.(file.name);
                            targetPanel.api.setActive?.();
                            return;
                        }
                        const siblingId = `viewer-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                        api.addPanel({
                            id: siblingId,
                            component: 'viewer',
                            title: file.name,
                            params: viewerParams(file),
                            position: { referencePanel: targetId, direction: 'within' },
                        });
                        api.getPanel(siblingId)?.api.setActive?.();
                        return;
                    }
                }

                for (const p of viewerPanels()) {
                    const url = resolvePanelUrl(p);
                    if (url === file.url) {
                        try {
                            p.api.setActive?.();
                        } catch {
                            /* noop */
                        }
                        return;
                    }
                }

                const panelShowsNoFile = (panel: DockviewPanelApiLike) => {
                    if (panelShowsDiff(panel)) return false;
                    const u = resolvePanelUrl(panel);
                    return !u || u.length === 0;
                };

                if (!anyViewerHasContent()) {
                    const emptyPlaceholder = viewerPanels().find(panelShowsNoFile);
                    if (emptyPlaceholder) {
                        if (emptyPlaceholder.id === 'viewer') {
                            set({ viewerFile: file });
                            emptyPlaceholder.api.updateParameters?.(viewerParams(file));
                            emptyPlaceholder.api.setTitle?.(file.name);
                            emptyPlaceholder.api.setActive?.();
                            return;
                        }
                        emptyPlaceholder.api.updateParameters?.(viewerParams(file));
                        emptyPlaceholder.api.setTitle?.(file.name);
                        emptyPlaceholder.api.setActive?.();
                        return;
                    }

                    const position = resolveOpenPosition(api, 'viewer');
                    if (listMainDockPanels(api).length > 0 && !position) return;
                    const idFirst = `viewer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
                    api.addPanel({
                        id: idFirst,
                        component: 'viewer',
                        title: file.name,
                        params: viewerParams(file),
                        position,
                    });
                    api.getPanel(idFirst)?.api.setActive?.();
                    return;
                }

                const position = resolveOpenPosition(api, 'viewer');
                if (listMainDockPanels(api).length > 0 && !position) return;
                const id = `viewer-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                api.addPanel({
                    id,
                    component: 'viewer',
                    title: file.name,
                    params: viewerParams(file),
                    position,
                });
                api.getPanel(id)?.api.setActive?.();
            },
            openEmptyViewerTab: () => {
                const api = get().dockviewApi;
                if (!api) return;
                const position = resolveOpenPosition(api, 'viewer');
                if (listMainDockPanels(api).length > 0 && !position) return;
                const id = `viewer-empty-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                api.addPanel({
                    id,
                    component: 'viewer',
                    title: 'Yeni görüntüleyici',
                    params: {},
                    position,
                });
                api.getPanel(id)?.api.setActive?.();
            },
            openEditorInNewTab: () => {
                const api = get().dockviewApi;
                if (!api) return;
                const documentId = `doc-${Date.now()}`;
                const title = 'Yeni Belge';
                set((state) => ({
                    documents: [...state.documents.filter((doc) => doc.id !== documentId), { id: documentId, title }],
                    activeDocument: documentId,
                }));
                scheduleAfterUiEvent(() => {
                    const liveApi = get().dockviewApi;
                    if (!liveApi) return;
                    const position = positionForMainOnlyPanel(liveApi, 'editor');
                    const id = `editor-${documentId}`;
                    liveApi.addPanel({
                        id,
                        component: 'editor',
                        title,
                        params: { documentId },
                        position,
                    });
                    finalizeMainOnlyPanel(liveApi, id);
                });
            },
            openEditorDocument: (documentId, title = 'Belge') => {
                const trimmedId = documentId.trim();
                if (!trimmedId) return;
                const api = get().dockviewApi;
                const nextTitle = title.trim() || 'Belge';
                set((state) => ({
                    documents: [
                        ...state.documents.filter((doc) => doc.id !== trimmedId),
                        { id: trimmedId, title: nextTitle },
                    ],
                    activeDocument: trimmedId,
                }));
                if (!api) return;

                const existing = Array.from(api.panels).find((panel) => {
                    if (panelComponent(panel) !== 'editor') return false;
                    const params = typeof panel.api?.getParameters === 'function' ? panel.api.getParameters() : {};
                    return getUdfixDocumentIdForPanel(panel.id, get().activeDocument, params) === trimmedId;
                });
                if (existing) {
                    existing.api.setTitle?.(nextTitle);
                    existing.api.setActive?.();
                    return;
                }

                scheduleAfterUiEvent(() => {
                    const liveApi = get().dockviewApi;
                    if (!liveApi) return;
                    const already = Array.from(liveApi.panels).find((panel) => {
                        if (panelComponent(panel) !== 'editor') return false;
                        const params =
                            typeof panel.api?.getParameters === 'function' ? panel.api.getParameters() : {};
                        return getUdfixDocumentIdForPanel(panel.id, get().activeDocument, params) === trimmedId;
                    });
                    if (already) {
                        already.api.setTitle?.(nextTitle);
                        already.api.setActive?.();
                        return;
                    }
                    const panelId = `editor-${trimmedId}`;
                    const position = positionForMainOnlyPanel(liveApi, 'editor');
                    liveApi.addPanel({
                        id: panelId,
                        component: 'editor',
                        title: nextTitle,
                        params: { documentId: trimmedId },
                        position,
                    });
                    finalizeMainOnlyPanel(liveApi, panelId);
                });
            },
            focusOrOpenViewer: () => {
                const api = get().dockviewApi;
                if (!api) return;
                const viewers = listViewerComponentPanels(api);
                if (viewers.length > 0) {
                    viewers[viewers.length - 1]!.api.setActive?.();
                    return;
                }
                get().openEmptyViewerTab();
            },
            udfBatchConverterOpen: false,
            setUdfBatchConverterOpen: (open) => set({ udfBatchConverterOpen: open }),
            openUdfBatchConverter: () => set({ udfBatchConverterOpen: true }),
            udfOpenChoice: null,
            requestUdfOpenChoice: (file, viewerOptions) =>
                set({
                    udfOpenChoice: {
                        fsPath: file.fsPath,
                        viewerUrl: file.viewerUrl,
                        name: file.name,
                        viewerOptions,
                    },
                }),
            clearUdfOpenChoice: () => set({ udfOpenChoice: null }),

            openDocumentRecoveryCenter: () => {
                const api = get().dockviewApi;
                if (!api) return;
                const id = 'document-recovery-center';
                const existing = api.getPanel(id);
                if (existing) {
                    existing.api.setActive?.();
                    return;
                }
                const width = 540;
                const height = Math.min(680, window.innerHeight - 80);
                api.addPanel({
                    id,
                    component: 'documentRecoveryCenter',
                    title: 'Belge Kurtarma',
                    tabComponent: 'entityFloatingTab',
                    floating: {
                        position: {
                            left: Math.round(Math.max(48, (window.innerWidth - width) / 2)),
                            top: Math.max(48, Math.round((window.innerHeight - height) / 2)),
                        },
                        width,
                        height,
                    },
                });
                api.getPanel(id)?.api.setActive?.();
            },
            openDataMattersStrip: () => {
                const api = get().dockviewApi;
                if (!api) return;
                const id = 'data-matters-strip';
                const existing = api.getPanel(id);
                if (existing) {
                    existing.api.setActive?.();
                    return;
                }
                const ref = getEditorLikeReferenceForNewTab(api);
                api.addPanel({
                    id,
                    component: 'dataMattersStrip',
                    title: 'Dosya Özeti',
                    position: ref
                        ? { referencePanel: ref.id, direction: 'above' }
                        : emptyGridPosition(api),
                });
            },
            openMatterFormFloating: (matter) => {
                const id = `matter-form:${matter?.id ?? 'new'}`;
                const isExisting = Boolean(matter?.id);
                openEntityFloatingPanel({
                    id,
                    component: 'matterForm',
                    title: 'Dosya',
                    params: { matterId: matter?.id ?? null },
                    width: isExisting ? 400 : 430,
                    height: isExisting ? 540 : 620,
                });
            },
            openPartyFormFloating: (party) => {
                const id = `party-form:${party?.id ?? 'new'}`;
                const isExisting = Boolean(party?.id);
                openEntityFloatingPanel({
                    id,
                    component: 'partyForm',
                    title: 'Kişi',
                    params: { partyId: party?.id ?? null },
                    width: isExisting ? 400 : 430,
                    height: isExisting ? 540 : 620,
                });
            },
            openKnowledgeFormFloating: (item) => {
                const id = item?.id ? `knowledge-form:${item.id}` : 'knowledge-form:new';
                const isExisting = Boolean(item?.id);
                openEntityFloatingPanel({
                    id,
                    component: 'knowledgeForm',
                    title: 'Kayıt',
                    params: {
                        knowledgeId: item?.id ?? null,
                    },
                    width: isExisting ? 400 : 430,
                    height: isExisting ? 540 : 620,
                });
            },
            openDiffInViewerTab: (payload) => {
                const api = get().dockviewApi;
                if (!api) return;
                const position = resolveOpenPosition(api, 'viewer');
                if (listMainDockPanels(api).length > 0 && !position) return;
                const id = `viewer-diff-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                const title =
                    payload.title.length > 56 ? `${payload.title.slice(0, 53)}…` : payload.title;
                api.addPanel({
                    id,
                    component: 'viewer',
                    title,
                    params: { diffHtml: payload.html },
                    position,
                });
                api.getPanel(id)?.api.setActive?.();
            },
            openUdfEditorTab: (file) => {
                const api = get().dockviewApi;
                if (!api) return;
                const id = `udf-editor:${file.path}`;
                const existing = api.getPanel(id);
                if (existing) {
                    existing.api.setActive?.();
                    return;
                }
                const position = positionForMainOnlyPanel(api, 'udfEditor');
                api.addPanel({
                    id,
                    component: 'udfEditor',
                    title: `${file.name} (UDF)`,
                    params: { filePath: file.path, fileName: file.name },
                    position,
                });
                finalizeMainOnlyPanel(api, id);
            },
            retargetUdfEditorTab: (oldPath, newPath, newName) => {
                const api = get().dockviewApi;
                if (!api) return;
                const normalizedOld = oldPath.trim();
                const normalizedNew = newPath.trim();
                if (!normalizedNew) return;
                if (normalizedOld !== normalizedNew) {
                    const oldId = `udf-editor:${normalizedOld}`;
                    try {
                        api.getPanel(oldId)?.api?.close?.();
                    } catch (error) {
                        console.warn('close UDF editor tab after save-as failed', error);
                    }
                }
                get().openUdfEditorTab({ path: normalizedNew, name: newName });
            },
            closeActiveTab: () => {
                const api = get().dockviewApi;
                if (!api) return;
                const active = api.activePanel as DockviewPanelApiLike | undefined;
                if (!active?.api?.close) return;
                void (async () => {
                    try {
                        const noteId = getNoteIdFromPanelId(active.id);
                        if (noteId) {
                            await finalizeNoteEditorIfRegistered(noteId);
                        }
                        active.api.close();
                    } catch (error) {
                        console.warn('close active tab failed', error);
                    }
                })();
            },

            // Zen Mode
            isZenMode: false,
            zenModeSnapshot: null,
            enterZenMode: () => {
                const state = get();
                if (state.isZenMode) return;
                set({
                    zenModeSnapshot: {
                        leftExplorerOpen: state.leftExplorerOpen,
                        leftSidebarOpen: state.leftSidebarOpen,
                        activeRightPanel: state.activeRightPanel,
                    },
                    isZenMode: true,
                    leftExplorerOpen: false,
                    leftSidebarOpen: false,
                    activeRightPanel: null,
                });
            },
            exitZenMode: () => {
                const state = get();
                if (!state.isZenMode) return;
                const snap = state.zenModeSnapshot;
                set({
                    isZenMode: false,
                    zenModeSnapshot: null,
                    ...(snap
                        ? {
                              leftExplorerOpen: snap.leftExplorerOpen,
                              leftSidebarOpen: snap.leftSidebarOpen,
                              activeRightPanel: snap.activeRightPanel,
                          }
                        : { leftExplorerOpen: false }),
                });
            },
            toggleZenMode: () => {
                if (get().isZenMode) get().exitZenMode();
                else get().enterZenMode();
            },
        }),
        {
            name: 'udfix-layout-v4',
            version: 1,
            migrate: (persistedState) => {
                const state = { ...((persistedState ?? {}) as Record<string, unknown>) };
                delete state.leftExplorerOpen;
                return state;
            },
            merge: (persistedState, currentState) => ({
                ...currentState,
                ...((persistedState ?? {}) as Partial<LayoutState>),
                leftExplorerOpen: false,
            }),
            partialize: (state) => ({
                leftSidebarOpen: state.leftSidebarOpen,
                rightSidebarOpen: state.rightSidebarOpen,
                activeRightPanel: state.activeRightPanel,
                layout: state.layout,
                activeDocument: state.activeDocument,
                documents: state.documents,
            }),
        }
    )
);
