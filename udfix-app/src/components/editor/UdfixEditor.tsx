import type { EditorView } from '@tiptap/pm/view'
import { useEditor, EditorContent, Editor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useLayoutStore } from '../../stores/useLayoutStore';
import { useHeaderFooterStore } from '../../stores/useHeaderFooterStore';
import { useContextStore } from '../../stores/useContextStore';
import { cn } from '../../lib/utils';
import { toNomaiFileUrl } from '../../utils/fileUrl'
import { isEditorRasterImageExtension } from '../../utils/editorImagePolicy'
import MarginComments from './MarginComments'
import SearchPanel from './SearchPanel'
import { useDocumentCommentsStore } from '../../stores/useDocumentCommentsStore'
import { DataService } from '../../services/dataService'
import VersionHistoryPanel from './VersionHistoryPanel'
import {
    EDITOR_MARGIN_COMMENT_GUTTER_PX,
    EDITOR_RULER_LEFT_CONTROLS_WIDTH_PX,
} from '../../utils/editorLayout'
import { Ruler } from './Ruler'
import PrintPreview from './PrintPreview'
import FootnoteInspector from './FootnoteInspector'
import HeaderFooterOverlay from './HeaderFooterOverlay'
import HeaderFooterPanel from './HeaderFooterPanel'
import FloatingFormatMenu from './FloatingFormatMenu'
import CitationHover from './CitationHover'
import TableBubbleMenu from './TableBubbleMenu'
import EditorToolbar from './EditorToolbar'
import EditorFloatingToolbar from './EditorFloatingToolbar'
import EditorContextMenu from './EditorContextMenu'
import { SaveAsTemplateDialog } from '../notes/SaveAsTemplateDialog'
import { editorSelectionToDocJson } from '../../utils/editorTemplateClip'
import { tiptapToText } from '../../utils/noteTransformers'
import { toast } from 'sonner'
import '../../styles/table.css'
import '../../styles/lists.css'
import '../../styles/headerFooter.css'
import { createUdfixEditorExtensions } from './udfixEditorExtensions'
import { useUdfixEditorTypographyDefaults } from '../../hooks/useUdfixEditorTypographyDefaults'
import { useUdfixEditorPageSize } from '../../hooks/useUdfixEditorPageSize'
import { applySectionNextPageBridge } from '../../utils/paginationMarginSync'
import { pastePlainMatchingDestination } from '../../utils/editorPaste'
import { trySelectListItemNodeForMarkerEditing } from '../../utils/listItemMarkerSelection'
import { NOMAI_FS_ENTRY_MIME } from '../../utils/processDockviewFileDrop'
import { useUdfixEditorAutosave } from '../../hooks/useUdfixEditorAutosave'
import { useUdfixEditorRecoveryDraft } from '../../hooks/useUdfixEditorRecoveryDraft'
import { stripUyapVerificationFromHtml, stripUyapVerificationFromTipTapJson } from '../../utils/uyapVerification'
import { useUdfixEditorVersionHistory } from '../../hooks/useUdfixEditorVersionHistory'
import { useUdfixEditorSearchAndHistoryShortcuts } from '../../hooks/useUdfixEditorSearchAndHistoryShortcuts'
import { useHeaderFooterPanelOnDoubleClick } from '../../hooks/useHeaderFooterPanelOnDoubleClick'
import { useHeaderFooterPaginationSync } from '../../hooks/useHeaderFooterPaginationSync'
import { readUdfSignatureMetadata, type UdfSignatureMetadata } from '../../utils/udfSignatureState'
import { applyUyapImportMetaToEditor } from '../../utils/uyapImportApply'
import { activateHeaderFooterForDocument } from '../../utils/headerFooterDocumentActivate'
import {
    type UyapImportMeta,
    UYAP_IMPORT_META_STORAGE_PREFIX,
} from '../../utils/uyapImportMeta'
import { UdfEditorSignatureBadge } from './UdfEditorSignatureBadge';
import EditorScrollPageTooltip from './EditorScrollPageTooltip';
import MaterialIcon from '../ui/MaterialIcon';
import {
    EMPTY_TIPTAP_DOC,
    isLegacyStarterEditorHtml,
    normalizeTipTapDocContent,
} from '../../utils/editorEmptyPlaceholder';
import { APP_PREFERENCES_CHANGED_EVENT, type AppPreferences } from '../../preferences/appPreferencesTypes';
import { pushEditorPreferenceToggle } from '../../preferences/pushEditorPreferences';

interface UdfixEditorProps {
    onEditorReady?: (editor: Editor) => void;
    showHistory?: boolean;
    onCloseHistory?: () => void;
    documentId?: string;
    readOnly?: boolean;
    /** When set (UDF file editor), keeps badge metadata in sync after package parse. */
    udfSignatureMeta?: UdfSignatureMetadata | null;
}

const UdfixEditor: React.FC<UdfixEditorProps> = ({
    onEditorReady,
    showHistory,
    onCloseHistory,
    documentId = 'default',
    readOnly = false,
    udfSignatureMeta,
}) => {
    const setContext = useContextStore((s) => s.setContext);

    const {
        isZenMode,
        showVersionHistory,
        setShowVersionHistory,
        setEditorSaveState,
        versionHistoryForDocumentId,
        setVersionHistoryForDocumentId,
        setVersionHistoryAnchorRect,
        docTitle,
        signExportOverlay,
    } = useLayoutStore(
        useShallow((s) => ({
            isZenMode: s.isZenMode,
            showVersionHistory: s.showVersionHistory,
            setShowVersionHistory: s.setShowVersionHistory,
            setEditorSaveState: s.setEditorSaveState,
            versionHistoryForDocumentId: s.versionHistoryForDocumentId,
            setVersionHistoryForDocumentId: s.setVersionHistoryForDocumentId,
            setVersionHistoryAnchorRect: s.setVersionHistoryAnchorRect,
            docTitle: s.documents.find((d) => d.id === documentId)?.title ?? 'Belge',
            signExportOverlay: s.signExportOverlay,
        })),
    );

    const [showRuler, setShowRuler] = useState(() => localStorage.getItem('nomai-show-ruler') !== 'false');
    const toggleRuler = useCallback(() => {
        setShowRuler((v) => {
            const next = !v;
            localStorage.setItem('nomai-show-ruler', String(next));
            void pushEditorPreferenceToggle({ showRuler: next });
            return next;
        });
    }, []);

    useEffect(() => {
        const onPrefs = (event: Event) => {
            const prefs = (event as CustomEvent<AppPreferences>).detail;
            if (prefs && typeof prefs.showRuler === 'boolean') {
                setShowRuler(prefs.showRuler);
            }
        };
        window.addEventListener(APP_PREFERENCES_CHANGED_EVENT, onPrefs);
        return () => window.removeEventListener(APP_PREFERENCES_CHANGED_EVENT, onPrefs);
    }, []);
    const [showLineNumbers, setShowLineNumbers] = useState(
        () => localStorage.getItem('nomai-show-line-numbers') === 'true'
    );
    const toggleLineNumbers = useCallback(() => {
        setShowLineNumbers((v) => {
            const next = !v;
            localStorage.setItem('nomai-show-line-numbers', String(next));
            return next;
        });
    }, []);
    const [showNonPrinting, _setShowNonPrinting] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [showSearchPanel, setShowSearchPanel] = useState(false);
    const [templateDialog, setTemplateDialog] = useState<{
        open: boolean;
        defaultName: string;
        contentJson: string;
        contentPlain: string;
    }>({ open: false, defaultName: '', contentJson: '{}', contentPlain: '' });
    const searchPanelContainerRef = useRef<HTMLDivElement>(null);
    const [signatureMeta, setSignatureMeta] = useState<UdfSignatureMetadata | null>(() =>
        readUdfSignatureMetadata(documentId),
    );

    const isVersionHistoryOpen =
        showVersionHistory && versionHistoryForDocumentId === documentId;

    useEffect(() => {
        if (!documentId || documentId.startsWith('udf:')) return;
        void DataService.upsertEditorDocument({
            documentId,
            title: docTitle,
            kind: 'editor',
            touchOpened: true,
        });
    }, [documentId, docTitle]);

    const [editorZoomMode, setEditorZoomMode] = useState<'preset' | 'fit'>('preset');
    const [editorZoomPreset, setEditorZoomPreset] = useState(1);
    const [editorFitScale, setEditorFitScale] = useState(1);
    const editorScrollContainerRef = useRef<HTMLDivElement>(null);
    const udfImportMetaApplyRef = useRef<Promise<void> | null>(null);

    const loadContent = (id: string) => {
        if (id.startsWith('udf:')) {
            const jsonRaw = localStorage.getItem(`nomai-udf-initial-json-${id}`);
            if (jsonRaw) {
                try {
                    return stripUyapVerificationFromTipTapJson(JSON.parse(jsonRaw) as JSONContent);
                } catch {
                    /* fall through */
                }
            }
        }
        let saved = localStorage.getItem(`nomai-content-${id}`);
        if (!saved) {
            return EMPTY_TIPTAP_DOC;
        }
        if (id.startsWith('udf:')) {
            const stripped = stripUyapVerificationFromHtml(saved);
            if (stripped !== saved) {
                localStorage.setItem(`nomai-content-${id}`, stripped);
                saved = stripped;
            }
        }
        if (isLegacyStarterEditorHtml(saved)) {
            return EMPTY_TIPTAP_DOC;
        }
        const trimmed = saved.trim();
        if (trimmed.startsWith('{')) {
            try {
                return stripUyapVerificationFromTipTapJson(
                    normalizeTipTapDocContent(JSON.parse(trimmed) as unknown),
                );
            } catch {
                return saved;
            }
        }
        return saved;
    };

    const extensions = useMemo(() => createUdfixEditorExtensions(documentId), [documentId]);
    const initialContent = useMemo(() => loadContent(documentId), [documentId]);

    const editorProps = useMemo(
        () => ({
            attributes: {
                class: 'tiptap focus:outline-none min-h-[297mm]',
            },
            transformPastedHTML: (html: string) => {
                return html.replace(/style="[^"]*"/g, '');
            },
            handleClick: (view: EditorView, _pos: unknown, event: MouseEvent) => {
                const target = event.target as HTMLElement;
                const mentionElement = target.closest('[data-type="mention"]') as HTMLElement | null;
                if (mentionElement) {
                    const mentionId = mentionElement.getAttribute('data-id') || '';
                    const mentionLabel = mentionElement.getAttribute('data-label') || mentionId || 'Kayıt';
                    const entityType = mentionElement.getAttribute('data-entity-type') || '';
                    const mentionFilePath = mentionElement.getAttribute('data-file-path') || '';
                    const layoutState = useLayoutStore.getState();

                    if (entityType === 'NOTE' && mentionId) {
                        layoutState.openNote(mentionId, mentionLabel);
                        return true;
                    }
                    if (entityType === 'MATTER' || entityType === 'PARTY' || entityType === 'DOCUMENT') {
                        setContext(entityType as 'MATTER' | 'PARTY' | 'DOCUMENT', mentionId, mentionLabel);
                        if (entityType === 'MATTER') {
                            layoutState.openMatterFormFloating({ id: mentionId, title: mentionLabel });
                        }
                        if (entityType === 'PARTY') {
                            layoutState.openPartyFormFloating({ id: mentionId, full_name: mentionLabel });
                        }
                        return true;
                    }
                    if (entityType === 'KNOWLEDGE') {
                        layoutState.openKnowledgeFormFloating({ id: mentionId, title: mentionLabel });
                        return true;
                    }
                    if ((entityType === 'FILE' || mentionFilePath) && (mentionFilePath || mentionId)) {
                        const filePath = mentionFilePath || mentionId;
                        const fileName = filePath.split(/[\\/]/).pop() || mentionLabel || 'Dosya';
                        layoutState.openInNewViewerTab({ url: filePath, name: fileName });
                        return true;
                    }
                }
                const commentElement = target.closest('.comment');
                if (commentElement) {
                    // Margin comments handle selection automatically
                }
                if (trySelectListItemNodeForMarkerEditing(view, event)) {
                    return true;
                }
                return false;
            },
            handleDrop: (view: EditorView, event: DragEvent) => {
                const dt = event.dataTransfer;
                if (!dt) return false;
                const custom = dt.getData(NOMAI_FS_ENTRY_MIME);
                if (!custom) return false;
                try {
                    const parsed = JSON.parse(custom) as { path: string; name: string };
                    const ext = (parsed.name.split('.').pop() || '').toLowerCase();
                    if (!isEditorRasterImageExtension(ext)) {
                        return false;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
                    if (!coords) return true;
                    const src = toNomaiFileUrl(parsed.path);
                    const imageType = view.state.schema.nodes.image;
                    if (!imageType) return true;
                    const node = imageType.create({ src });
                    const tr = view.state.tr.insert(coords.pos, node);
                    view.dispatch(tr);
                    return true;
                } catch {
                    return false;
                }
            },
        }),
        [setContext],
    );

    const editor = useEditor(
        {
            extensions,
            content: initialContent,
            immediatelyRender: false,
            shouldRerenderOnTransaction: false,
            editorProps,
            onCreate: () => {
                if (documentId.startsWith('udf:')) {
                    localStorage.removeItem(`nomai-udf-initial-json-${documentId}`);
                }
            },
        },
        [documentId],
    );

    const openSaveFullTemplate = useCallback(() => {
        if (!editor || editor.isDestroyed) return;
        const json = editor.getJSON();
        const nameBase = (docTitle || 'Belge').trim() || 'Belge';
        setTemplateDialog({
            open: true,
            defaultName: `${nameBase} şablonu`,
            contentJson: JSON.stringify(json),
            contentPlain: tiptapToText(json),
        });
    }, [editor, docTitle]);

    const openSaveSelectionTemplate = useCallback(() => {
        if (!editor || editor.isDestroyed) return;
        if (editor.state.selection.empty) {
            toast.message('Önce metin seçin');
            return;
        }
        const slab = editorSelectionToDocJson(editor);
        if (!slab) {
            toast.message('Seçim şablona dönüştürülemedi');
            return;
        }
        const nameBase = (docTitle || 'Belge').trim() || 'Belge';
        setTemplateDialog({
            open: true,
            defaultName: `${nameBase} — seçim`,
            contentJson: JSON.stringify(slab),
            contentPlain: tiptapToText(slab),
        });
    }, [editor, docTitle]);

    const pageSize = useUdfixEditorPageSize(editor);
    const draftCommentId = useDocumentCommentsStore((s) => s.draftCommentId);
    const storedComments = useDocumentCommentsStore((s) => s.comments);
    const commentGutterPx = useMemo(() => {
        if (isZenMode) return 0;
        const hasDraft = Boolean(draftCommentId);
        const hasOpen = Object.values(storedComments).some((c) => !c.resolved);
        return hasDraft || hasOpen ? EDITOR_MARGIN_COMMENT_GUTTER_PX : 0;
    }, [isZenMode, draftCommentId, storedComments]);
    const rulerColPx = showRuler && !isZenMode ? EDITOR_RULER_LEFT_CONTROLS_WIDTH_PX : 0;
    const gridContentWidth = pageSize.pageWidth + rulerColPx + commentGutterPx;

    const canvasScrollRef = useRef({ top: 0, left: 0 });
    useEffect(() => {
        const el = editorScrollContainerRef.current;
        if (!el) return;
        const onScroll = () => {
            canvasScrollRef.current = { top: el.scrollTop, left: el.scrollLeft };
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, []);
    useLayoutEffect(() => {
        const el = editorScrollContainerRef.current;
        if (!el) return;
        el.scrollTop = canvasScrollRef.current.top;
        el.scrollLeft = canvasScrollRef.current.left;
    }, [commentGutterPx]);

    const effectiveEditorZoom = editorZoomMode === 'fit' ? editorFitScale : editorZoomPreset;

    /**
     * Zoom değişimi `editor.transaction` üretmiyor, bu yüzden
     * `useUdfixEditorPageSize`'daki transaction-tetikli bridge çağrısı
     * tek başına yetmiyor. CSS `zoom` ölçü farkı `getBoundingClientRect`'i
     * etkilediğinden bridge zoom değiştikten sonra yeniden çalışmalı:
     * iki frame bekleyip layout tamamlanınca margin-bottom'u doğru
     * un-zoomed CSS-px değeriyle yeniden yazıyoruz.
     */
    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        let raf1 = 0;
        let raf2 = 0;
        raf1 = window.requestAnimationFrame(() => {
            raf2 = window.requestAnimationFrame(() => {
                if (!editor.isDestroyed) applySectionNextPageBridge(editor);
            });
        });
        return () => {
            if (raf1) window.cancelAnimationFrame(raf1);
            if (raf2) window.cancelAnimationFrame(raf2);
        };
    }, [editor, effectiveEditorZoom]);

    useEffect(() => {
        if (editorZoomMode !== 'fit' || !editorScrollContainerRef.current) return;
        const el = editorScrollContainerRef.current;
        const measure = () => {
            const w = el.clientWidth;
            const pad = 48;
            const s = Math.min(1.25, Math.max(0.25, (w - pad) / Math.max(1, gridContentWidth)));
            setEditorFitScale(s);
        };
        measure();
        const ro = new ResizeObserver(() => measure());
        ro.observe(el);
        return () => ro.disconnect();
    }, [editorZoomMode, gridContentWidth]);

    useUdfixEditorTypographyDefaults(editor);

    useEffect(() => {
        if (editor && onEditorReady) {
            onEditorReady(editor);
        }
    }, [editor, onEditorReady]);

    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        editor.setEditable(!readOnly);
    }, [editor, readOnly]);

    useEffect(() => {
        if (udfSignatureMeta !== undefined) {
            setSignatureMeta(udfSignatureMeta);
            return;
        }
        setSignatureMeta(readUdfSignatureMetadata(documentId));
    }, [documentId, udfSignatureMeta]);

    useEffect(() => {
        if (udfSignatureMeta !== undefined) return;
        const onMetaChanged = (event: Event) => {
            const detail = (event as CustomEvent<{ documentId?: string }>).detail;
            if (detail?.documentId !== documentId) return;
            setSignatureMeta(readUdfSignatureMetadata(documentId));
        };
        window.addEventListener('udfix:signature-meta-updated', onMetaChanged as EventListener);
        return () => {
            window.removeEventListener('udfix:signature-meta-updated', onMetaChanged as EventListener);
        };
    }, [documentId, udfSignatureMeta]);

    useEffect(() => {
        void activateHeaderFooterForDocument(documentId);
    }, [documentId]);

    useEffect(() => {
        udfImportMetaApplyRef.current = null;
    }, [documentId]);

    useEffect(() => {
        if (!editor || editor.isDestroyed || !documentId.startsWith('udf:')) return;
        const raw = localStorage.getItem(`${UYAP_IMPORT_META_STORAGE_PREFIX}${documentId}`);
        if (!raw) return;
        if (udfImportMetaApplyRef.current) return;
        let cancelled = false;
        const job = (async () => {
            try {
                const meta = JSON.parse(raw) as UyapImportMeta;
                await applyUyapImportMetaToEditor(editor, meta);
                if (!cancelled) {
                    localStorage.removeItem(`${UYAP_IMPORT_META_STORAGE_PREFIX}${documentId}`);
                }
            } catch {
                if (!cancelled) {
                    localStorage.removeItem(`${UYAP_IMPORT_META_STORAGE_PREFIX}${documentId}`);
                }
            }
        })();
        udfImportMetaApplyRef.current = job;
        void job.finally(() => {
            if (udfImportMetaApplyRef.current === job) {
                udfImportMetaApplyRef.current = null;
            }
        });
        return () => {
            cancelled = true;
        };
    }, [editor, documentId]);

    useEffect(() => {
        useDocumentCommentsStore.getState().setDocumentId(documentId);
    }, [documentId]);

    const {
        versions,
        versionsLoading,
        loadVersions,
        closeVersionHistoryUi,
    } = useUdfixEditorVersionHistory({
        documentId,
        showHistory,
        onCloseHistory,
        isVersionHistoryOpen,
        showVersionHistory,
        setVersionHistoryForDocumentId,
        setVersionHistoryAnchorRect,
        setShowVersionHistory,
    });

    const { recoveryDraft, setRecoveryDraft } = useUdfixEditorRecoveryDraft(editor, documentId);

    const { dirtyRef } = useUdfixEditorAutosave(editor, documentId, setEditorSaveState);

    useUdfixEditorSearchAndHistoryShortcuts({
        showSearchPanel,
        setShowSearchPanel,
        documentId,
        setVersionHistoryForDocumentId,
        setVersionHistoryAnchorRect,
        setShowVersionHistory,
        editor,
        searchPanelContainerRef,
    });

    useHeaderFooterPanelOnDoubleClick(editor);
    useHeaderFooterPaginationSync(editor, documentId);

    useEffect(() => {
        return () => {
            void useHeaderFooterStore.getState().save();
        };
    }, []);

    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        const dom = editor.view.dom;
        const markAsActive = () => {
            useLayoutStore.getState().setEditor(editor);
            if (useHeaderFooterStore.getState().currentDocumentId === documentId) return;
            void activateHeaderFooterForDocument(documentId);
        };
        dom.addEventListener('focusin', markAsActive);
        dom.addEventListener('pointerdown', markAsActive);
        return () => {
            dom.removeEventListener('focusin', markAsActive);
            dom.removeEventListener('pointerdown', markAsActive);
        };
    }, [documentId, editor]);

    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        const dom = editor.view.dom;
        const onKeyDown = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
            if (e.key.toLowerCase() !== 'v') return;
            e.preventDefault();
            e.stopPropagation();
            void pastePlainMatchingDestination(editor);
        };
        dom.addEventListener('keydown', onKeyDown, true);
        return () => dom.removeEventListener('keydown', onKeyDown, true);
    }, [editor]);

    useEffect(() => {
        if (editor && !editor.isDestroyed && editor.view && editor.view.dom) {
            if (showNonPrinting) {
                editor.view.dom.classList.add('show-non-printing');
            } else {
                editor.view.dom.classList.remove('show-non-printing');
            }
        }
    }, [editor, showNonPrinting]);

    const handleRestoreVersion = useCallback(
        (versionId: string) => {
            if (!editor || editor.isDestroyed || !documentId) return;

            const restoreVersion = async () => {
                try {
                    const restored = await DataService.restoreDocumentVersion({ documentId, versionId });
                    if (restored?.ok && typeof restored.content === 'string') {
                        editor.commands.setContent(restored.content);
                        localStorage.setItem(`nomai-content-${documentId}`, restored.content);
                        closeVersionHistoryUi();
                        setEditorSaveState('saved');
                        setRecoveryDraft(null);
                    }
                } catch (err) {
                    console.warn('Restore failed', err);
                    setEditorSaveState('error');
                }
            };

            if (dirtyRef.current) {
                toast('Kaydedilmemiş değişiklikler var', {
                    description: 'Seçili sürüme geçerseniz bekleyen değişiklikler kaybolabilir.',
                    action: {
                        label: 'Sürüme geç',
                        onClick: () => {
                            void restoreVersion();
                        },
                    },
                    cancel: {
                        label: 'Vazgeç',
                        onClick: () => undefined,
                    },
                });
                return;
            }

            void restoreVersion();
        },
        [documentId, editor, closeVersionHistoryUi, setEditorSaveState, setRecoveryDraft, dirtyRef],
    );

    const applyRecoveryDraft = useCallback(
        async (mode: 'draft' | 'latest' | 'discard') => {
            if (!editor || editor.isDestroyed || !documentId) return;
            if (mode === 'draft' && recoveryDraft != null) {
                editor.commands.setContent(recoveryDraft);
                localStorage.setItem(`nomai-content-${documentId}`, recoveryDraft);
                setEditorSaveState('unsaved');
            }
            if (mode === 'latest') {
                const rows = await DataService.listDocumentVersions(documentId, 1, 0);
                const latest = Array.isArray(rows) ? rows[0] : null;
                if (latest?.content) {
                    editor.commands.setContent(latest.content);
                    localStorage.setItem(`nomai-content-${documentId}`, latest.content);
                    setEditorSaveState('saved');
                }
            }
            if (mode === 'discard') {
                void DataService.clearDocumentDraft(documentId);
            }
            setRecoveryDraft(null);
        },
        [documentId, editor, recoveryDraft, setEditorSaveState, setRecoveryDraft],
    );

    if (!editor) {
        return (
            <div className="flex h-full w-full flex-col bg-background">
                <div className="h-10 shrink-0 border-b border-white/5 bg-background/80" />
                <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                    Editör hazırlanıyor…
                </div>
            </div>
        );
    }

    const isUdfDocument = documentId.startsWith('udf:');

    return (
        <div className="relative w-full h-full flex flex-col bg-background">
            {signExportOverlay && (
                <div
                    className="absolute inset-0 z-[215] flex items-center justify-center bg-background/50 backdrop-blur-md pointer-events-auto"
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                >
                    <div className="mx-4 max-w-sm rounded-xl border border-white/15 bg-background/95 px-6 py-5 text-center shadow-2xl backdrop-blur-xl">
                        <MaterialIcon
                            icon="draw"
                            size={28}
                            className="mx-auto mb-3 text-primary animate-pulse"
                        />
                        <p className="text-sm font-medium text-foreground">{signExportOverlay.message}</p>
                        {signExportOverlay.hint ? (
                            <p className="mt-1.5 text-xs text-muted-foreground">{signExportOverlay.hint}</p>
                        ) : null}
                    </div>
                </div>
            )}
            {!readOnly && (
                <div
                    id="editor-toolbar-root"
                    className={cn(
                        'relative z-[var(--z-interface)] w-full min-w-0 flex flex-col items-center bg-background backdrop-blur-none transition-all duration-300 ease-out overflow-x-hidden overflow-y-hidden min-h-0',
                        isZenMode
                            ? 'max-h-0 opacity-0 pointer-events-none -translate-y-2 scale-[0.98]'
                            : 'max-h-[320px] opacity-100 translate-y-0 scale-100'
                    )}
                >
                    <EditorToolbar
                        editor={editor}
                        showRuler={showRuler}
                        onToggleRuler={toggleRuler}
                        showLineNumbers={showLineNumbers}
                        onToggleLineNumbers={toggleLineNumbers}
                    />
                </div>
            )}

            <div className="flex-1 relative overflow-hidden">
                {!readOnly && <FloatingFormatMenu editor={editor} />}
                <CitationHover editor={editor} />
                {!readOnly && <TableBubbleMenu editor={editor} />}
                {!readOnly && (
                    <EditorContextMenu
                        editor={editor}
                        onSaveSelectionAsTemplate={openSaveSelectionTemplate}
                        onSaveDocumentAsTemplate={openSaveFullTemplate}
                    />
                )}

                {!readOnly && (
                    <EditorFloatingToolbar
                        editor={editor}
                        onOpenSearch={() => setShowSearchPanel(true)}
                        zoomMode={editorZoomMode}
                        zoomPreset={editorZoomPreset}
                        onZoomPreset={(scale) => {
                            setEditorZoomMode('preset');
                            setEditorZoomPreset(scale);
                        }}
                        onZoomFit={() => setEditorZoomMode('fit')}
                    />
                )}

                {showSearchPanel && (
                    <div ref={searchPanelContainerRef} className="absolute top-4 right-8 z-[200]">
                        <SearchPanel editor={editor} onClose={() => setShowSearchPanel(false)} />
                    </div>
                )}

                <div
                    ref={editorScrollContainerRef}
                    className={cn(
                        'absolute inset-0 overflow-y-auto overflow-x-auto custom-scrollbar transition-all duration-500',
                        isZenMode
                            ? 'zen-editor-canvas bg-background'
                            : 'bg-background/30',
                    )}
                    id="editor-scroll-container"
                    style={{ padding: '0 24px' }}
                >
                    <div
                        className="udfix-editor-zoom-shell"
                        style={{
                            zoom: effectiveEditorZoom,
                            width: gridContentWidth,
                            margin: '0 auto',
                        }}
                    >
                    <div
                        style={{
                            display: 'grid',
                            ...(showRuler && !isZenMode
                                ? {
                                      gridTemplateColumns: commentGutterPx
                                          ? `${EDITOR_RULER_LEFT_CONTROLS_WIDTH_PX}px ${pageSize.pageWidth}px ${commentGutterPx}px`
                                          : `${EDITOR_RULER_LEFT_CONTROLS_WIDTH_PX}px ${pageSize.pageWidth}px`,
                                      gridTemplateRows: 'auto 1fr',
                                      width: gridContentWidth,
                                  }
                                : {
                                      gridTemplateColumns: commentGutterPx
                                          ? `${pageSize.pageWidth}px ${commentGutterPx}px`
                                          : `${pageSize.pageWidth}px`,
                                      gridTemplateRows: '1fr',
                                      width: gridContentWidth,
                                  }),
                            margin: '0 auto',
                            position: 'relative',
                            minWidth: 0,
                        }}
                    >
                        {showRuler && !isZenMode && (
                            <Ruler
                                editor={editor}
                                pageWidthPx={pageSize.pageWidth}
                                pageHeightPx={pageSize.pageHeight}
                                showRuler={showRuler}
                                onToggleRuler={toggleRuler}
                            />
                        )}

                        <div
                            className="a4-page relative flex flex-col w-full overflow-visible bg-transparent border-0 shadow-none mb-12"
                            style={
                                showRuler && !isZenMode
                                    ? { minHeight: `${pageSize.pageHeight}px`, gridColumn: 2, gridRow: 2 }
                                    : { minHeight: `${pageSize.pageHeight}px` }
                            }
                        >
                            <div
                                className={cn(
                                    'flex-1 max-w-none transition-opacity duration-300',
                                    showLineNumbers && 'udfix-editor-line-numbers'
                                )}
                            >
                                <EditorContent editor={editor} className="min-h-full" />
                            </div>

                            {!isZenMode && (
                                <MarginComments
                                    editor={editor}
                                    documentId={documentId}
                                    zoom={effectiveEditorZoom}
                                />
                            )}
                            {isUdfDocument && !isZenMode ? (
                                <UdfEditorSignatureBadge metadata={signatureMeta} />
                            ) : null}
                        </div>
                    </div>
                    </div>
                </div>
                <EditorScrollPageTooltip scrollRef={editorScrollContainerRef} />
            </div>

            {editor && !editor.isDestroyed && (
                <HeaderFooterOverlay editor={editor} />
            )}

            {isVersionHistoryOpen && (
                <VersionHistoryPanel
                    versions={versions}
                    isLoading={versionsLoading}
                    onClose={closeVersionHistoryUi}
                    onRestore={handleRestoreVersion}
                    onVersionsChanged={() => void loadVersions()}
                />
            )}
            {recoveryDraft != null && (
                <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60">
                    <div className="w-[460px] max-w-[92vw] rounded-xl border border-white/15 bg-background/95 p-4 shadow-2xl backdrop-blur-xl">
                        <h3 className="text-sm font-semibold">Kurtarilabilir taslak bulundu</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Uygulama kapanışında kaydedilmemiş son değişiklikler bulundu.
                        </p>
                        <div className="mt-3 grid grid-cols-1 gap-2">
                            <button
                                type="button"
                                onClick={() => applyRecoveryDraft('draft')}
                                className="rounded-md border border-primary/35 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/25"
                            >
                            Taslağı kurtar
                            </button>
                            <button
                                type="button"
                                onClick={() => applyRecoveryDraft('latest')}
                                className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
                            >
                                Son stabil sürümle devam et
                            </button>
                            <button
                                type="button"
                                onClick={() => applyRecoveryDraft('discard')}
                                className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
                            >
                                Taslağı sil
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {
                showPreview && editor && (
                    <PrintPreview
                        content={editor.getHTML()}
                        onClose={() => setShowPreview(false)}
                    />
                )
            }

            <HeaderFooterPanel />

            <FootnoteInspector editor={editor} />

            <SaveAsTemplateDialog
                open={templateDialog.open}
                onOpenChange={(o) => setTemplateDialog((s) => ({ ...s, open: o }))}
                defaultName={templateDialog.defaultName}
                contentJson={templateDialog.contentJson}
                contentPlain={templateDialog.contentPlain}
            />
        </div >
    )
}

export default UdfixEditor
