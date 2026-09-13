import React, { useState, useEffect } from 'react';
import type { IDockviewPanelHeaderProps } from 'dockview';
import MaterialIcon from '../ui/MaterialIcon';
import { cn } from '../../lib/utils';
import { useShallow } from 'zustand/react/shallow';
import { useLayoutStore } from '../../stores/useLayoutStore';
import {
    getUdfixDocumentIdForPanel,
    getNoteIdFromPanelId,
    isEditorPanelId,
    isUdfEditorPanelId,
    isUdfixEditorTabPanelId,
} from '../../utils/dockviewNoteTab';
import { finalizeNoteEditorIfRegistered } from '../../utils/noteEditorCloseRegistry';
import { getCommentIdsInDocumentOrder, getStoredComments } from '../../utils/commentUtils';
import { useNotesStore } from '../../stores/useNotesStore';
import { exportToDOCX, exportToPDF, sanitizeExportBaseName } from '../../utils/exportUtils';
import { exportEditorToMarkdown } from '../../utils/markdownExport';
import { useHeaderFooterStore } from '../../stores/useHeaderFooterStore';
import { activateHeaderFooterForDocument } from '../../utils/headerFooterDocumentActivate';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast, toastUdfExportError } from '../../lib/glass-utils';
import { formatSaveErrorMessage } from '../../utils/saveErrorMessage';
import { mapUyapSigningErrorMessage } from '../../utils/udfSignatureState';
import { requestUdfSaveAndWait, requestUdfSaveAsAndWait } from '../../utils/udfSaveBus';
import { FileSystemService } from '../../services/fileSystemService';
import { isProbablyLocalPath, toSystemPath } from '../../utils/localResource';
import {
    consumeUyapSignRequestForExport,
    stageTokenPinForExport,
    stageUyapSignRequestForExport,
    type UyapMobileOperator,
} from '../../utils/uyapTokenSession';
import { UyapIpcSigner } from '../../utils/uyapIpcSigner';
import { isUyapDebugEnabled, uyapDebugLog } from '../../utils/uyapDebug';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from '../ui/context-menu';
import { truncateMiddle } from '../../utils/truncateMiddle';
import { popOutDockviewPanel } from '../../utils/dockviewPopout';
import type { LayoutDockviewApi } from '../../types/dockviewLayout';

const TAB_TITLE_MAX_LENGTH = 61;

function isViewerPanelId(id: string): boolean {
    return id === 'viewer' || id.startsWith('viewer-');
}

function canRenameViaTabTitle(id: string): boolean {
    if (isEditorPanelId(id)) return true;
    if (isViewerPanelId(id)) return false;
    return getNoteIdFromPanelId(id) !== null;
}

type DockviewTabProps = IDockviewPanelHeaderProps & React.HTMLAttributes<HTMLDivElement>;
type TokenSignRequestedDetail = {
    panelId?: string;
    documentId?: string;
    password?: string;
    source?: string;
};
type UyapSignProvider = 'token' | 'mobile';

/**
 * Dockview: varsayılan sekme — `DockviewReact` üzerinde **defaultTabComponent={DockviewTab}** gerekir
 * (`tabComponents: { default: ... }` çekirdekte varsayılan panel başlığını bağlamaz).
 */
export const DockviewTab = (props: DockviewTabProps) => {
    const {
        api,
        containerApi,
        params: _params,
        tabLocation: _tabLocation,
        className,
        onPointerDown: dockviewOnPointerDown,
        onPointerUp,
        onPointerLeave,
        ...rest
    } = props;
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const [contextMenuOpen, setContextMenuOpen] = React.useState(false);
    const [contextMenuPoint, setContextMenuPoint] = React.useState<{ x: number; y: number } | null>(null);

    const [isEditing, setIsEditing] = useState(false);
    const [title, setTitle] = useState(() => api.title || 'Untitled');
    const [isClosing, setIsClosing] = useState(false);
    const [isTokenPasswordDialogOpen, setIsTokenPasswordDialogOpen] = useState(false);
    const [provider, setProvider] = useState<UyapSignProvider>('token');
    const [tokenPassword, setTokenPassword] = useState('');
    const [mobilePhone, setMobilePhone] = useState('');
    const [mobileTcKimlikNo, setMobileTcKimlikNo] = useState('');
    const [mobileOperator, setMobileOperator] = useState<UyapMobileOperator>('turkcell');
    const [mobileDisplayText, setMobileDisplayText] = useState('UDFIX belge imza onayi');
    const [isSubmittingTokenPassword, setIsSubmittingTokenPassword] = useState(false);
    const {
        activeDocument,
        renameDocument,
        editorSaveState,
        editorSaveError,
        setEditorSaveState,
        setSignExportOverlay,
        setShowVersionHistory,
        setVersionHistoryForDocumentId,
        setVersionHistoryAnchorRect,
        editor,
        viewerFile,
    } = useLayoutStore(
        useShallow((s) => ({
            activeDocument: s.activeDocument,
            renameDocument: s.renameDocument,
            editorSaveState: s.editorSaveState,
            editorSaveError: s.editorSaveError,
            setEditorSaveState: s.setEditorSaveState,
            setSignExportOverlay: s.setSignExportOverlay,
            setShowVersionHistory: s.setShowVersionHistory,
            setVersionHistoryForDocumentId: s.setVersionHistoryForDocumentId,
            setVersionHistoryAnchorRect: s.setVersionHistoryAnchorRect,
            editor: s.editor,
            viewerFile: s.viewerFile,
        })),
    );

    useEffect(() => {
        const disposable = api.onDidTitleChange((event) => {
            setTitle(event.title || 'Untitled');
        });
        return () => disposable.dispose();
    }, [api]);

    useEffect(() => {
        const onTokenSignRequested = (event: Event) => {
            const detail = (event as CustomEvent<TokenSignRequestedDetail>).detail;
            const panelId = typeof detail?.panelId === 'string' ? detail.panelId : '';
            const documentId = typeof detail?.documentId === 'string' ? detail.documentId : '';
            const password = typeof detail?.password === 'string' ? detail.password : '';
            if (panelId !== api.id || !documentId || !password) {
                uyapDebugLog('dockview', 'token request ignored due to payload mismatch', {
                    currentPanelId: api.id,
                    panelId,
                    documentId,
                    hasPassword: Boolean(password),
                });
                return;
            }
            stageTokenPinForExport(documentId, password);
            toast.success('Pin alındı');
            uyapDebugLog('dockview', 'token PIN staged for export', {
                panelId,
                documentId,
            });
        };
        window.addEventListener('udfix:token-sign-requested', onTokenSignRequested as EventListener);
        return () => {
            window.removeEventListener('udfix:token-sign-requested', onTokenSignRequested as EventListener);
        };
    }, [api.id]);

    const getPanelDocumentId = () => {
        const apiWithParams = api as { getParameters?: () => Record<string, unknown> };
        const params = typeof apiWithParams.getParameters === 'function' ? apiWithParams.getParameters() : {};
        return getUdfixDocumentIdForPanel(api.id, activeDocument, params);
    };

    useEffect(() => {
        if (!api.isActive || !isUdfixEditorTabPanelId(api.id)) return;
        const docId = getPanelDocumentId();
        if (!docId) return;
        void activateHeaderFooterForDocument(docId);
    }, [api.isActive, api.id, activeDocument]);

    const getPanelRevealPath = () => {
        const apiWithParams = api as { getParameters?: () => Record<string, unknown> };
        const params = typeof apiWithParams.getParameters === 'function' ? apiWithParams.getParameters() : {};
        let rawPath: unknown = null;

        if (isUdfEditorPanelId(api.id)) {
            rawPath = typeof params.filePath === 'string' ? params.filePath : api.id.slice('udf-editor:'.length);
        } else if (isViewerPanelId(api.id)) {
            rawPath = typeof params.fileUrl === 'string' ? params.fileUrl : api.id === 'viewer' ? viewerFile?.url : null;
        }

        if (typeof rawPath !== 'string' || !isProbablyLocalPath(rawPath)) return null;
        try {
            return toSystemPath(rawPath);
        } catch {
            return rawPath;
        }
    };

    const persistTitle = (raw: string) => {
        const trimmed = raw.trim();
        if (!trimmed) {
            setTitle(api.title || 'Untitled');
            return;
        }
        api.setTitle(trimmed);

        const id = api.id;
        if (isEditorPanelId(id)) {
            const docId = getPanelDocumentId();
            if (docId) renameDocument(docId, trimmed);
        } else {
            const noteId = getNoteIdFromPanelId(id);
            if (noteId) {
                void useNotesStore.getState().updateNote({ id: noteId, title: trimmed });
            }
        }
    };

    const finishEditing = () => {
        setIsEditing(false);
        persistTitle(title);
    };

    const getIcon = () => {
        const id = api.id;
        if (isEditorPanelId(id)) return 'edit_square';
        if (id.startsWith('udf-editor:')) return 'article';
        if (isViewerPanelId(id)) return 'lab_profile';
        return 'edit_note';
    };

    const onRootPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-close-tab]') || target.closest('[data-tab-action]')) {
            return;
        }
        dockviewOnPointerDown?.(e);
    };

    const onTitleDoubleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!canRenameViaTabTitle(api.id)) return;
        setIsEditing(true);
    };

    const onClose = (ev: React.MouseEvent) => {
        ev.stopPropagation();
        if (isClosing) return;
        setIsClosing(true);
        queueMicrotask(() => {
            void (async () => {
                try {
                    const noteId = getNoteIdFromPanelId(api.id);
                    if (noteId) {
                        await finalizeNoteEditorIfRegistered(noteId);
                    }
                    api.close();
                } catch (e) {
                    console.warn('close panel invalid operation', e);
                } finally {
                    setTimeout(() => setIsClosing(false), 80);
                }
            })();
        });
    };

    const handleTokenPasswordDialogOpenChange = (open: boolean) => {
        setIsTokenPasswordDialogOpen(open);
        if (!open) {
            setProvider('token');
            setTokenPassword('');
            setMobilePhone('');
            setMobileTcKimlikNo('');
            setMobileOperator('turkcell');
            setMobileDisplayText('UDFIX belge imza onayi');
            setIsSubmittingTokenPassword(false);
        }
    };

    const handleUdfixSave = async (source: string) => {
        if (isUdfEditorPanelId(api.id)) {
            uyapDebugLog('dockview', 'forwarding save request to UDF panel', { panelId: api.id, source });
            return requestUdfSaveAndWait(api.id, source);
        }
        const exportBaseName = sanitizeExportBaseName(title);
        let signingAttempt = false;
        try {
            const { UyapIO, buildUdfHfExportOptionsFromStore } = await import('../../utils/uyapIO');
            const { buildPageFormatFromMargins } = await import('../../utils/uyapExportBuild');
            const { getPaginationMargins } = await import('../../utils/paginationMarginSync');
            if (!editor) {
                uyapDebugLog('dockview', 'save skipped because editor is unavailable', { panelId: api.id, source });
                return;
            }
            const hfStore = useHeaderFooterStore.getState();
            const defaultSec = hfStore.sections.default;
            const settings = hfStore.settings;
            const docTitle = (title || '').trim();
            const hfExtras = await buildUdfHfExportOptionsFromStore(settings, defaultSec, {
                documentTitle: docTitle,
                formattedDate: hfStore.getFormattedDate(),
            }, buildPageFormatFromMargins(getPaginationMargins(editor), settings));

            const docId = getPanelDocumentId();
            const commentsForXml: Array<{
                id: string;
                text: string;
                author?: string;
                resolved?: boolean;
                date?: string;
            }> = [];
            if (docId) {
                const stored = getStoredComments(docId);
                for (const id of getCommentIdsInDocumentOrder(editor)) {
                    const c = stored[id];
                    if (c?.text?.trim()) {
                        commentsForXml.push({
                            id,
                            text: c.text,
                            author: c.author,
                            resolved: c.resolved,
                            date: c.date,
                        });
                    }
                }
            }
            const stagedSignRequest = docId ? consumeUyapSignRequestForExport(docId) : null;
            signingAttempt = Boolean(stagedSignRequest);
            if (stagedSignRequest) {
                setEditorSaveState('saving');
                setSignExportOverlay({
                    message:
                        stagedSignRequest.provider === 'mobile'
                            ? 'Mobil imza onayı bekleniyor…'
                            : 'Belge imzalanıyor…',
                    hint: 'İmzalı belge kayıt penceresi açılana kadar lütfen bekleyin.',
                });
            }
            const signatureOptions = stagedSignRequest
                ? {
                    enabled: true,
                    signer: new UyapIpcSigner(
                        stagedSignRequest,
                        process.env.NODE_ENV === 'development',
                        isUyapDebugEnabled(),
                    ),
                    writeManifestJson: true,
                    failOnSigningError: true,
                }
                : undefined;
            uyapDebugLog('dockview', 'starting UDF save', {
                source,
                panelId: api.id,
                documentId: docId,
                hasStagedSignRequest: Boolean(stagedSignRequest),
            });
            await UyapIO.saveUdf(editor, '', '', exportBaseName, {
                ...hfExtras,
                pageFormat: buildPageFormatFromMargins(getPaginationMargins(editor), settings),
                templateMeta: docTitle ? { description: docTitle } : undefined,
                commentsForXml: commentsForXml.length > 0 ? commentsForXml : undefined,
                signature: signatureOptions,
            });
            if (signatureOptions?.enabled) {
                toast.success('UDF imzalanarak dışa aktarıldı');
                setEditorSaveState('saved');
            } else {
                uyapDebugLog('dockview', 'save completed without signer (staged pin missing)', {
                    source,
                    panelId: api.id,
                    documentId: docId,
                });
            }
        } catch (error) {
            uyapDebugLog('dockview', 'UDF save failed', {
                source,
                panelId: api.id,
                error: error instanceof Error ? error.message : String(error),
            });
            toastUdfExportError(error);
            setEditorSaveState(
                'error',
                signingAttempt ? mapUyapSigningErrorMessage(error) : formatSaveErrorMessage(error),
            );
            throw error;
        } finally {
            setSignExportOverlay(null);
        }
    };

    const handleUdfixSaveAs = async (source: string) => {
        if (!isUdfEditorPanelId(api.id)) return;
        uyapDebugLog('dockview', 'forwarding save-as request to UDF panel', { panelId: api.id, source });
        return requestUdfSaveAsAndWait(api.id, source);
    };

    const submitTokenPassword = async () => {
        if (
            isSubmittingTokenPassword ||
            (provider === 'token' && !tokenPassword) ||
            (provider === 'mobile' && (!mobilePhone || !mobileTcKimlikNo))
        ) {
            return;
        }
        setIsSubmittingTokenPassword(true);
        try {
            const documentId = getPanelDocumentId();
            if (!documentId) {
                toast.error('Belge kimliği bulunamadı; imza başlatılamadı.');
                uyapDebugLog('dockview', 'token submit aborted because documentId is missing', { panelId: api.id });
                return;
            }
            if (provider === 'token') {
                window.dispatchEvent(
                    new CustomEvent('udfix:token-sign-requested', {
                        detail: {
                            panelId: api.id,
                            documentId,
                            password: tokenPassword,
                            source: 'dockview-token-password-dialog',
                        },
                    }),
                );
                uyapDebugLog('dockview', 'token PIN staged', { panelId: api.id, documentId });
            } else {
                stageUyapSignRequestForExport(documentId, {
                    provider: 'mobile',
                    gsmNo: mobilePhone.trim(),
                    tcKimlikNo: mobileTcKimlikNo.trim(),
                    operator: mobileOperator,
                    displayText: mobileDisplayText.trim() || undefined,
                });
                uyapDebugLog('dockview', 'mobile sign request staged', {
                    panelId: api.id,
                    documentId,
                    operator: mobileOperator,
                });
                toast.success('Mobil imza istegi hazirlandi');
            }
            if (isUdfEditorPanelId(api.id)) {
                await requestUdfSaveAndWait(api.id, 'dockview-token-password-dialog');
            } else {
                await handleUdfixSave('dockview-token-password-dialog');
            }
            handleTokenPasswordDialogOpenChange(false);
        } catch (error) {
            uyapDebugLog('dockview', 'token sign submit failed', {
                panelId: api.id,
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            setIsSubmittingTokenPassword(false);
        }
    };

    const displayTitle = truncateMiddle(title, TAB_TITLE_MAX_LENGTH);
    const isDisplayTitleTruncated = displayTitle !== title;
    const isViewerTab = isViewerPanelId(api.id);
    const canPopoutViewer = isViewerTab && typeof containerApi?.addPopoutGroup === 'function';
    const [isViewerInPopout, setIsViewerInPopout] = React.useState(
        () =>
            isViewerTab &&
            (api as unknown as { location?: { type?: string } }).location?.type === 'popout',
    );
    const portalContainer = rootRef.current?.ownerDocument?.body ?? null;

    React.useEffect(() => {
        if (!isViewerTab) {
            setIsViewerInPopout(false);
            return;
        }
        const panelApi = api as unknown as {
            location?: { type?: string };
            onDidLocationChange?: (cb: () => void) => { dispose: () => void } | void;
        };
        const refresh = () => setIsViewerInPopout(panelApi.location?.type === 'popout');
        refresh();
        const disposable = panelApi.onDidLocationChange?.(refresh);
        return () => disposable?.dispose?.();
    }, [api, isViewerTab]);

    const revealPath = getPanelRevealPath();
    const handleShowInFolder = async () => {
        if (!revealPath) return;
        try {
            await FileSystemService.showItemInFolder(revealPath);
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : 'Klasörde gösterilemedi');
        }
    };
    const handlePopout = async () => {
        if (!canPopoutViewer) return;
        await popOutDockviewPanel(containerApi as unknown as LayoutDockviewApi, api.id);
    };
    const handleTabContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!(revealPath || (canPopoutViewer && !isViewerInPopout))) return;
        e.preventDefault();
        setContextMenuPoint({ x: e.clientX, y: e.clientY });
        setContextMenuOpen(true);
    };

    return (
        <TooltipProvider delayDuration={0}>
            <>
                    <div
                        {...rest}
                        ref={rootRef}
                        className={cn(
                            'h-full flex items-center px-2 gap-2 select-none group relative cursor-grab active:cursor-grabbing',
                            'text-muted-foreground hover:text-foreground transition-colors',
                            api.isActive && 'text-foreground bg-white/5 backdrop-blur-sm border-b border-white/10',
                            className
                        )}
                        onPointerDown={onRootPointerDown}
                        onPointerUp={onPointerUp}
                        onPointerLeave={onPointerLeave}
                        onContextMenu={handleTabContextMenu}
                    >
                {isEditing ? (
                    <>
                        <MaterialIcon
                            icon={getIcon()}
                            size={16}
                            className={cn(
                                'shrink-0 opacity-70 group-hover:opacity-100 transition-opacity',
                                api.isActive && 'opacity-100 text-var(secondary)-400',
                                isUdfixEditorTabPanelId(api.id) && 'cursor-pointer hover:text-primary'
                            )}
                            onClick={(e) => {
                                if (!isUdfixEditorTabPanelId(api.id)) return;
                                e.stopPropagation();
                                const docId = getPanelDocumentId();
                                if (!docId) return;
                                const el = e.currentTarget as HTMLElement;
                                const r = el.getBoundingClientRect();
                                setVersionHistoryAnchorRect({
                                    top: r.top,
                                    left: r.left,
                                    width: r.width,
                                    height: r.height,
                                });
                                setVersionHistoryForDocumentId(docId);
                                setShowVersionHistory(true);
                            }}
                            title={isUdfixEditorTabPanelId(api.id) ? 'Versiyon geçmişi' : undefined}
                        />
                        <input
                            autoFocus
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onBlur={finishEditing}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.currentTarget.blur();
                                } else if (e.key === 'Escape') {
                                    setIsEditing(false);
                                    setTitle(api.title || 'Untitled');
                                }
                            }}
                            className="min-w-[140px] max-w-[240px] flex-1 bg-transparent border-b border-primary outline-none text-xs h-5 p-0"
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        />
                    </>
                ) : (
                    <div
                        data-tab-title
                        className={cn(
                            'flex min-w-0 flex-1 items-center gap-1.5 min-h-[20px]',
                            canRenameViaTabTitle(api.id) && 'cursor-text'
                        )}
                        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                        title={
                            canRenameViaTabTitle(api.id)
                                ? 'Başlığı düzenlemek için çift tıklayın'
                                : undefined
                        }
                        onDoubleClick={onTitleDoubleClick}
                    >
                        <MaterialIcon
                            icon={getIcon()}
                            size={16}
                            className={cn(
                                'shrink-0 opacity-70 group-hover:opacity-100 transition-opacity',
                                api.isActive && 'opacity-100 text-var(primary)-400',
                                isUdfixEditorTabPanelId(api.id) && 'cursor-pointer hover:text-primary'
                            )}
                            onClick={(e) => {
                                if (!isUdfixEditorTabPanelId(api.id)) return;
                                e.stopPropagation();
                                const docId = getPanelDocumentId();
                                if (!docId) return;
                                const el = e.currentTarget as HTMLElement;
                                const r = el.getBoundingClientRect();
                                setVersionHistoryAnchorRect({
                                    top: r.top,
                                    left: r.left,
                                    width: r.width,
                                    height: r.height,
                                });
                                setVersionHistoryForDocumentId(docId);
                                setShowVersionHistory(true);
                            }}
                            title={isUdfixEditorTabPanelId(api.id) ? 'Versiyon geçmişi' : undefined}
                        />
                        {isUdfixEditorTabPanelId(api.id) && api.isActive && (
                            <div
                                className="flex items-center opacity-70"
                                title={
                                    editorSaveState === 'saving'
                                        ? 'Kaydediliyor...'
                                        : editorSaveState === 'unsaved'
                                          ? 'Kaydedilmemiş değişiklikler'
                                          : editorSaveState === 'error'
                                            ? editorSaveError || 'Kaydetme hatası'
                                            : 'Kaydedildi'
                                }
                            >
                                <MaterialIcon 
                                    icon={editorSaveState === 'saving' ? 'sync' : editorSaveState === 'unsaved' ? 'edit_note' : editorSaveState === 'error' ? 'error' : 'cloud_done'} 
                                    size={14} 
                                    className={cn(
                                        editorSaveState === 'saving' && 'animate-spin',
                                        editorSaveState === 'error' && 'text-destructive',
                                        editorSaveState === 'unsaved' && 'text-amber-500'
                                    )}
                                />
                            </div>
                        )}
                        <span
                            className="text-xs font-medium min-w-0 select-none whitespace-nowrap"
                            title={isDisplayTitleTruncated ? title : undefined}
                        >
                            {displayTitle}
                        </span>
                    </div>
                )}

                {!isEditing && isUdfixEditorTabPanelId(api.id) && api.isActive && (
                    <div
                        data-tab-action
                        className="flex items-center gap-1.5 shrink-0 opacity-80 mr-1"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div>
                                    <MaterialIcon
                                        icon="key"
                                        size={14}
                                        className="cursor-pointer transition-colors text-muted-foreground hover:text-primary hover:opacity-100 flex"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleTokenPasswordDialogOpenChange(true);
                                        }}
                                    />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent portalContainer={portalContainer}>
                                <p>e-imzala</p>
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div>
                                    <MaterialIcon
                                        icon="save"
                                        size={14}
                                        className="cursor-pointer transition-colors text-muted-foreground hover:text-primary hover:opacity-100 flex"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            await handleUdfixSave('dockview-save-icon');
                                        }}
                                    />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent portalContainer={portalContainer}>
                                <p>UDF Kaydet (⌘S)</p>
                            </TooltipContent>
                        </Tooltip>

                        {isUdfEditorPanelId(api.id) ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div>
                                        <MaterialIcon
                                            icon="save_as"
                                            size={14}
                                            className="cursor-pointer transition-colors text-muted-foreground hover:text-primary hover:opacity-100 flex"
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                await handleUdfixSaveAs('dockview-save-as-icon');
                                            }}
                                        />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent portalContainer={portalContainer}>
                                    <p>Farklı Kaydet (⌘⇧S)</p>
                                </TooltipContent>
                            </Tooltip>
                        ) : null}

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div>
                                    <MaterialIcon
                                        icon="print"
                                        size={14}
                                        className="cursor-pointer transition-colors text-muted-foreground hover:text-primary hover:opacity-100 flex"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (editor) {
                                                exportToPDF(
                                                    editor,
                                                    sanitizeExportBaseName(title),
                                                    getPanelDocumentId(),
                                                );
                                            }
                                        }}
                                    />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent portalContainer={portalContainer}>
                                <p>Yazdır</p>
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div>
                                    <MaterialIcon
                                        icon="picture_as_pdf"
                                        size={14}
                                        className="cursor-pointer transition-colors text-muted-foreground hover:text-primary hover:opacity-100 flex"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (editor) {
                                                exportToPDF(
                                                    editor,
                                                    sanitizeExportBaseName(title),
                                                    getPanelDocumentId(),
                                                );
                                            }
                                        }}
                                    />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent portalContainer={portalContainer}>
                                <p>PDF Dışa Aktar</p>
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div>
                                    <MaterialIcon
                                        icon="description"
                                        size={14}
                                        className="cursor-pointer transition-colors text-muted-foreground hover:text-primary hover:opacity-100 flex"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (editor) exportToDOCX(editor, sanitizeExportBaseName(title));
                                        }}
                                    />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent portalContainer={portalContainer}>
                                <p>Word Dışa Aktar</p>
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div>
                                    <MaterialIcon
                                        icon="article"
                                        size={14}
                                        className="cursor-pointer transition-colors text-muted-foreground hover:text-primary hover:opacity-100 flex"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (!editor) return;
                                            void exportEditorToMarkdown(editor, sanitizeExportBaseName(title)).catch(
                                                (error) => {
                                                    console.error(error);
                                                    toast.error('Markdown dışa aktarılamadı');
                                                },
                                            );
                                        }}
                                    />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent portalContainer={portalContainer}>
                                <p>Markdown Dışa Aktar</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                )}

                {canPopoutViewer && !isViewerInPopout && (
                    <div
                        data-tab-action
                        className={cn(
                            'opacity-0 group-hover:opacity-100 p-0.5 rounded-sm hover:bg-white/10 transition-all cursor-pointer flex items-center justify-center shrink-0',
                            api.isActive && 'opacity-100',
                        )}
                        onPointerDown={(e) => e.stopPropagation()}
                        title="Dışarı çıkar"
                        aria-label="Dışarı çıkar"
                        onClick={(e) => {
                            e.stopPropagation();
                            void handlePopout();
                        }}
                    >
                        <MaterialIcon icon="open_in_new" size={12} />
                    </div>
                )}

                <div
                    data-close-tab
                    title="Sekmeyi kapat"
                    aria-label="Sekmeyi kapat"
                    className={cn(
                        'opacity-0 group-hover:opacity-100 p-0.5 rounded-sm hover:bg-white/10 transition-all ml-auto cursor-pointer flex items-center justify-center shrink-0',
                        api.isActive && 'opacity-100'
                    )}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={onClose}
                >
                    <MaterialIcon icon="close" size={12} />
                </div>

                        <Dialog open={isTokenPasswordDialogOpen} onOpenChange={handleTokenPasswordDialogOpenChange}>
                            <DialogContent
                                className="sm:max-w-sm glass-panel border-white/10"
                                variant="glass"
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                        <DialogHeader>
                            <DialogTitle>e-imzala</DialogTitle>
                            <DialogDescription>İmza sağlayıcı seçin ve imzalama akışını başlatın.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-2 py-1">
                            <label htmlFor={`sign-provider-${api.id}`} className="text-sm text-muted-foreground">
                                Provider
                            </label>
                            <Select
                                value={provider}
                                onValueChange={(value) => setProvider(value === 'mobile' ? 'mobile' : 'token')}
                            >
                                <SelectTrigger id={`sign-provider-${api.id}`} className="border-white/10">
                                    <SelectValue placeholder="Provider secin" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="token">Token</SelectItem>
                                    <SelectItem value="mobile">Mobil</SelectItem>
                                </SelectContent>
                            </Select>
                            {provider === 'token' ? (
                                <>
                            <label htmlFor={`token-password-${api.id}`} className="text-sm text-muted-foreground">
                                Pin
                            </label>
                            <Input
                                id={`token-password-${api.id}`}
                                type="password"
                                value={tokenPassword}
                                onChange={(e) => setTokenPassword(e.target.value)}
                                autoComplete="off"
                                placeholder="Pin"
                                className="border-white/10"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void submitTokenPassword();
                                    }
                                }}
                            />
                                </>
                            ) : (
                                <>
                                    <label htmlFor={`mobile-phone-${api.id}`} className="text-sm text-muted-foreground">
                                        GSM / MSISDN
                                    </label>
                                    <Input
                                        id={`mobile-phone-${api.id}`}
                                        value={mobilePhone}
                                        onChange={(e) => setMobilePhone(e.target.value)}
                                        autoComplete="off"
                                        placeholder="05XXXXXXXXX"
                                        className="border-white/10"
                                    />
                                    <label htmlFor={`mobile-tc-${api.id}`} className="text-sm text-muted-foreground">
                                        TC Kimlik No
                                    </label>
                                    <Input
                                        id={`mobile-tc-${api.id}`}
                                        value={mobileTcKimlikNo}
                                        onChange={(e) => setMobileTcKimlikNo(e.target.value)}
                                        autoComplete="off"
                                        placeholder="11 haneli kimlik no"
                                        className="border-white/10"
                                    />
                                    <label htmlFor={`mobile-operator-${api.id}`} className="text-sm text-muted-foreground">
                                        Operator
                                    </label>
                                    <Select
                                        value={mobileOperator}
                                        onValueChange={(value) =>
                                            setMobileOperator(
                                                value === 'turktelekom' || value === 'vodafone'
                                                    ? value
                                                    : 'turkcell',
                                            )
                                        }
                                    >
                                        <SelectTrigger id={`mobile-operator-${api.id}`} className="border-white/10">
                                            <SelectValue placeholder="Operator secin" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="turkcell">Turkcell</SelectItem>
                                            <SelectItem value="turktelekom">Turk Telekom</SelectItem>
                                            <SelectItem value="vodafone">Vodafone</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <label
                                        htmlFor={`mobile-display-text-${api.id}`}
                                        className="text-sm text-muted-foreground"
                                    >
                                        Bilgilendirme metni
                                    </label>
                                    <Input
                                        id={`mobile-display-text-${api.id}`}
                                        value={mobileDisplayText}
                                        onChange={(e) => setMobileDisplayText(e.target.value)}
                                        autoComplete="off"
                                        placeholder="MSSP ekraninda gorunen metin"
                                        className="border-white/10"
                                    />
                                </>
                            )}
                        </div>
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => handleTokenPasswordDialogOpenChange(false)}
                                disabled={isSubmittingTokenPassword}
                            >
                                İptal
                            </Button>
                            <Button
                                type="button"
                                onClick={() => void submitTokenPassword()}
                                disabled={
                                    isSubmittingTokenPassword ||
                                    (provider === 'token' && tokenPassword.length === 0) ||
                                    (provider === 'mobile' &&
                                        (mobilePhone.trim().length === 0 || mobileTcKimlikNo.trim().length === 0))
                                }
                            >
                                {isSubmittingTokenPassword ? 'İmzalanıyor…' : 'e-imzala'}
                            </Button>
                        </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
            {(revealPath || (canPopoutViewer && !isViewerInPopout)) && (
                <ContextMenu
                    open={contextMenuOpen}
                    onOpenChange={(open) => {
                        setContextMenuOpen(open);
                        if (!open) setContextMenuPoint(null);
                    }}
                >
                    <ContextMenuTrigger asChild>
                        <span
                            aria-hidden
                            style={{
                                position: 'fixed',
                                left: contextMenuPoint?.x ?? 0,
                                top: contextMenuPoint?.y ?? 0,
                                width: 1,
                                height: 1,
                                opacity: 0,
                                pointerEvents: 'none',
                            }}
                        />
                    </ContextMenuTrigger>
                    <ContextMenuContent
                        className="min-w-[12rem] border-white/15 p-1 text-popover-foreground"
                        glass={{ blur: 10, outline: 'rgba(255,255,255,0.12)' }}
                        style={{ backgroundImage: 'none' }}
                        portalContainer={portalContainer}
                    >
                        {canPopoutViewer && !isViewerInPopout && (
                            <ContextMenuItem className="gap-2 cursor-pointer" onSelect={() => void handlePopout()}>
                                <MaterialIcon icon="open_in_new" size={16} className="opacity-80" />
                                Dışarı çıkar
                            </ContextMenuItem>
                        )}
                        {revealPath && (
                            <ContextMenuItem className="gap-2 cursor-pointer" onSelect={() => void handleShowInFolder()}>
                                <MaterialIcon icon="folder_open" size={16} className="opacity-80" />
                                Klasörde göster
                            </ContextMenuItem>
                        )}
                    </ContextMenuContent>
                </ContextMenu>
            )}
            </>
        </TooltipProvider>
    );
};
