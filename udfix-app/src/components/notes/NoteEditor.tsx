import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import {
    EMPTY_TIPTAP_DOC,
    isNoteBodyTooShortForAutoDelete,
    normalizeTipTapDocContent,
} from '../../utils/editorEmptyPlaceholder';
import { useNotesStore } from '../../stores/useNotesStore';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { useContextStore } from '../../stores/useContextStore';
import { useTasksStore } from '../../stores/useTasksStore';
import {
    DataService,
    type Note,
    type NoteLinkRow,
    type NoteEntityMentionRow,
    type Tag,
} from '../../services/dataService';
import { openCommandPalette } from '../layout/commandPaletteEvents';
import { Button } from '../../components/ui/button';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Separator } from '../../components/ui/separator';
import { cn } from '../../lib/utils';
import { debounce } from 'lodash';
import { tiptapToText } from '../../utils/noteTransformers';
import { SaveAsTemplateDialog } from './SaveAsTemplateDialog';
import { editorSelectionToDocJson } from '../../utils/editorTemplateClip';
import { exportEditorToMarkdown } from '../../utils/markdownExport';
import { pasteMarkdownFromClipboard } from '../../utils/editorPaste';
import { createNoteEditorExtensions } from './noteEditorExtensions';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuTrigger,
} from '../ui/context-menu';
import { toast } from 'sonner';
import { registerNoteEditorFinalize } from '../../utils/noteEditorCloseRegistry';

import 'tippy.js/dist/tippy.css';

interface NoteEditorProps {
    noteId: string;
    onClose?: () => void;
}

const noteEditorExtensions = createNoteEditorExtensions();

function isMacLikePlatform(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /Mac|iPhone|iPad|iPod/i.test(ua) || (navigator.platform?.includes('Mac') ?? false);
}


const metaChipClass =
    'inline-flex items-center gap-1 shrink-0 max-w-[min(220px,45vw)] rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-foreground/90 transition-colors hover:bg-white/[0.08] hover:border-white/16 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40';

function formatNoteSavedAt(ts?: string | null): string {
    if (!ts) return '';
    try {
        const d = new Date(ts);
        if (Number.isNaN(d.getTime())) return ts;
        return d.toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
    } catch {
        return ts ?? '';
    }
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ noteId, onClose }) => {
    const { updateNote, deleteNote, getNote } = useNotesStore();
    const openNote = useLayoutStore((s) => s.openNote);
    const openNoteInNewTab = useLayoutStore((s) => s.openNoteInNewTab);
    const openNotesPanelWithSearch = useLayoutStore((s) => s.openNotesPanelWithSearch);
    const openMatterFormFloating = useLayoutStore((s) => s.openMatterFormFloating);
    const openPartyFormFloating = useLayoutStore((s) => s.openPartyFormFloating);
    const openKnowledgeFormFloating = useLayoutStore((s) => s.openKnowledgeFormFloating);
    const openInNewViewerTab = useLayoutStore((s) => s.openInNewViewerTab);
    const setContext = useContextStore((s) => s.setContext);

    const [note, setNote] = useState<Note | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [outbound, setOutbound] = useState<NoteLinkRow[]>([]);
    const [backlinks, setBacklinks] = useState<NoteLinkRow[]>([]);
    const [entityMentions, setEntityMentions] = useState<NoteEntityMentionRow[]>([]);
    const [noteTags, setNoteTags] = useState<Tag[]>([]);
    const [templateDialog, setTemplateDialog] = useState<{
        open: boolean;
        defaultName: string;
        contentJson: string;
        contentPlain: string;
    }>({ open: false, defaultName: '', contentJson: '{}', contentPlain: '' });
    const loadGraph = useCallback(async () => {
        try {
            const [out, back, ent, tags] = await Promise.all([
                DataService.getNoteOutboundNoteLinks(noteId),
                DataService.getNoteBacklinksNotes(noteId),
                DataService.getNoteOutboundEntityMentions(noteId),
                DataService.getEntityTags({ entityId: noteId, entityType: 'NOTE' }),
            ]);
            setOutbound(Array.isArray(out) ? out : []);
            setBacklinks(Array.isArray(back) ? back : []);
            setEntityMentions(Array.isArray(ent) ? ent : []);
            setNoteTags(Array.isArray(tags) ? tags : []);
        } catch (e) {
            console.warn('Failed to load note graph', e);
        }
    }, [noteId]);

    useEffect(() => {
        void loadGraph();
    }, [loadGraph]);

    const deletingEmptyNoteRef = useRef(false);
    const editorRef = useRef<Editor | null>(null);
    const debouncedUpdateRef = useRef<ReturnType<typeof debounce<(ed: Editor) => void>> | null>(null);
    /** Re-hydrate editor body only when switching notes — not after local autosave. */
    const hydratedNoteIdRef = useRef<string | null>(null);

    const persistEditorContent = useCallback(
        async (ed: Editor) => {
            if (deletingEmptyNoteRef.current) return;
            const doc = ed.getJSON();
            const plain = tiptapToText(doc);
            if (isNoteBodyTooShortForAutoDelete(plain)) {
                return;
            }
            const json = JSON.stringify(doc);
            await updateNote({ id: noteId, content_json: json, content_plain: plain });
            const savedAt = new Date().toISOString();
            setNote((prev) =>
                prev
                    ? {
                          ...prev,
                          updated_at: savedAt,
                          content_json: json,
                          content_plain: plain,
                      }
                    : prev,
            );
            await loadGraph();
        },
        [noteId, updateNote, loadGraph],
    );

    const deleteNoteIfBodyTooShort = useCallback(async () => {
        if (deletingEmptyNoteRef.current) return false;
        if (hydratedNoteIdRef.current !== noteId) return false;
        const ed = editorRef.current;
        if (!ed) return false;
        const plain = tiptapToText(ed.getJSON());
        if (!isNoteBodyTooShortForAutoDelete(plain)) return false;
        deletingEmptyNoteRef.current = true;
        debouncedUpdateRef.current?.cancel();
        try {
            await deleteNote(noteId);
            return true;
        } catch (e) {
            console.warn('Failed to auto-delete empty note on close', e);
            deletingEmptyNoteRef.current = false;
            return false;
        }
    }, [noteId, deleteNote]);

    const finalizeEditorOnClose = useCallback(async () => {
        if (deletingEmptyNoteRef.current) return;
        debouncedUpdateRef.current?.cancel();
        const deleted = await deleteNoteIfBodyTooShort();
        if (deleted) return;
        const ed = editorRef.current;
        if (ed) {
            await persistEditorContent(ed);
        }
    }, [deleteNoteIfBodyTooShort, persistEditorContent]);

    const debouncedUpdate = useMemo(() => {
        const fn = debounce((ed: Editor) => {
            void persistEditorContent(ed);
        }, 1000);
        debouncedUpdateRef.current = fn;
        return fn;
    }, [persistEditorContent]);

    const flushPendingSave = useCallback(() => {
        debouncedUpdate.flush();
    }, [debouncedUpdate]);

    const handleRequestClose = useCallback(() => {
        void finalizeEditorOnClose().then(() => onClose?.());
    }, [finalizeEditorOnClose, onClose]);

    const finalizeOnCloseRef = useRef(finalizeEditorOnClose);
    finalizeOnCloseRef.current = finalizeEditorOnClose;
    useEffect(() => {
        return registerNoteEditorFinalize(noteId, () => finalizeOnCloseRef.current());
    }, [noteId]);

    useEffect(() => {
        const onBeforeUnload = () => {
            void finalizeOnCloseRef.current();
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, []);
    useEffect(() => {
        hydratedNoteIdRef.current = null;
    }, [noteId]);

    const editor = useEditor(
        {
            extensions: noteEditorExtensions,
            content: EMPTY_TIPTAP_DOC,
            immediatelyRender: false,
            shouldRerenderOnTransaction: false,
            editorProps: {
                attributes: {
                    class: 'tiptap prose prose-sm dark:prose-invert focus:outline-none min-h-[500px] w-full max-w-none px-8 py-10 outline-none',
                },
                handleClick: (_view, _pos, event) => {
                    if ((event.target as HTMLElement).closest('[data-wiki-note-link="1"]')) {
                        return false;
                    }
                    const el = (event.target as HTMLElement).closest('a[href^="note:"]');
                    if (el) {
                        const href = el.getAttribute('href') || '';
                        const id = href.replace(/^note:/, '');
                        if (id) openNote(id, el.textContent || 'Not');
                        return true;
                    }
                    const mentionEl = (event.target as HTMLElement).closest('[data-type="mention"]') as HTMLElement | null;
                    if (mentionEl) {
                        const id = mentionEl.getAttribute('data-id') || '';
                        const label = mentionEl.getAttribute('data-label') || id || 'Kayıt';
                        const entityType = mentionEl.getAttribute('data-entity-type') || '';
                        const mentionFilePath = mentionEl.getAttribute('data-file-path') || '';

                        if (entityType === 'NOTE' && id) {
                            const mentionChar =
                                mentionEl.getAttribute('data-mention-char') ??
                                mentionEl.getAttribute('data-mention-suggestion-char') ??
                                '@';
                            if (mentionChar === '@') {
                                openNote(id, label);
                                return true;
                            }
                            return false;
                        }
                        if (entityType === 'MATTER' && id) {
                            setContext('MATTER', id, label);
                            openMatterFormFloating({ id, title: label });
                            return true;
                        }
                        if (entityType === 'PARTY' && id) {
                            setContext('PARTY', id, label);
                            openPartyFormFloating({ id, full_name: label });
                            return true;
                        }
                        if (entityType === 'DOCUMENT' && id) {
                            setContext('DOCUMENT', id, label);
                            return true;
                        }
                        if (entityType === 'KNOWLEDGE' && id) {
                            openKnowledgeFormFloating({ id, title: label });
                            return true;
                        }
                        if ((entityType === 'FILE' || mentionFilePath) && (mentionFilePath || id)) {
                            const filePath = mentionFilePath || id;
                            const fileName = filePath.split(/[\\/]/).pop() || label || 'Dosya';
                            openInNewViewerTab({ url: filePath, name: fileName });
                            return true;
                        }
                    }
                    return false;
                },
            },
            onUpdate: ({ editor: ed }) => {
                debouncedUpdate(ed);
            },
        },
        [noteId]
    );

    editorRef.current = editor ?? null;

    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            setIsLoading(true);
            const data = await getNote(noteId);
            if (!isMounted) return;
            setNote(data ?? null);
            setIsLoading(false);
        };
        void load();
        return () => {
            isMounted = false;
        };
    }, [noteId, getNote]);

    useEffect(() => {
        if (!editor || !note || note.id !== noteId) return;
        if (hydratedNoteIdRef.current === noteId) return;
        try {
            const content = normalizeTipTapDocContent(
                note.content_json ? JSON.parse(note.content_json) : null,
            );
            editor.commands.setContent(content, { emitUpdate: false });
            hydratedNoteIdRef.current = noteId;
        } catch (e) {
            console.error('Failed to parse note content', e);
        }
    }, [editor, noteId, note?.id, note?.content_json]);

    const handleDelete = () => {
        if (!note) return;
        toast('Not silinsin mi?', {
            description: note.title || 'Bu işlem geri alınamaz.',
            action: {
                label: 'Sil',
                onClick: () => {
                    void (async () => {
                        flushPendingSave();
                        await deleteNote(note.id);
                        handleRequestClose();
                    })();
                },
            },
            cancel: {
                label: 'Vazgeç',
                onClick: () => undefined,
            },
        });
    };

    const openNotesForQuery = (raw: string, hint: string) => {
        const q = raw.trim();
        if (!q) return;
        openNotesPanelWithSearch(q, hint);
    };

    const promoteCandidateRef = useRef<{
        title: string;
        checked: boolean;
        inTaskItem: boolean;
        taskItemPos: number | null;
    } | null>(null);

    const capturePromoteCandidate = useCallback(() => {
        if (!editor) {
            promoteCandidateRef.current = null;
            return;
        }
        const { state } = editor;
        const { $from, empty, from, to } = state.selection;

        let taskItemDepth = -1;
        for (let d = $from.depth; d > 0; d -= 1) {
            if ($from.node(d).type.name === 'taskItem') {
                taskItemDepth = d;
                break;
            }
        }

        if (taskItemDepth >= 0) {
            const node = $from.node(taskItemDepth);
            const title = node.textContent.replace(/\s+/g, ' ').trim();
            promoteCandidateRef.current = {
                title,
                checked: Boolean(node.attrs.checked),
                inTaskItem: true,
                taskItemPos: $from.before(taskItemDepth),
            };
            return;
        }

        const selected = empty ? '' : state.doc.textBetween(from, to, ' ').replace(/\s+/g, ' ').trim();
        if (selected) {
            promoteCandidateRef.current = {
                title: selected,
                checked: false,
                inTaskItem: false,
                taskItemPos: null,
            };
            return;
        }

        const block = $from.parent?.textContent?.replace(/\s+/g, ' ').trim() || '';
        promoteCandidateRef.current = block
            ? { title: block, checked: false, inTaskItem: false, taskItemPos: null }
            : null;
    }, [editor]);

    const promoteChecklistToTask = useCallback(async () => {
        if (!editor || !note) return;

        // Context menu often blurs TipTap selection — prefer capture from right-click.
        if (!promoteCandidateRef.current?.title) {
            capturePromoteCandidate();
        }
        const candidate = promoteCandidateRef.current;
        const title = candidate?.title?.trim() || '';
        if (!title) {
            toast.error('Göreve çevirmek için checklist satırı veya metin seçin');
            return;
        }

        const matterId = note.parent_type === 'MATTER' ? note.parent_id ?? null : null;
        const partyId = note.parent_type === 'PARTY' ? note.parent_id ?? null : null;

        try {
            const created = await useTasksStore.getState().addTask({
                id: crypto.randomUUID(),
                title,
                status: candidate?.checked ? 'done' : 'open',
                due_date: null,
                matter_id: matterId,
                party_id: partyId,
                source_note_id: note.id,
            });
            // Optional badge only — duplicates allowed; no checkbox sync.
            const pos = candidate?.taskItemPos;
            if (candidate?.inTaskItem && pos != null) {
                const node = editor.state.doc.nodeAt(pos);
                if (node?.type.name === 'taskItem') {
                    const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
                        ...node.attrs,
                        taskId: created.id,
                    });
                    editor.view.dispatch(tr);
                    await persistEditorContent(editor);
                }
            }
            toast.success('Yapılacaklar’a eklendi', {
                action: {
                    label: 'Aç',
                    onClick: () => openCommandPalette('tasks'),
                },
            });
        } catch (error) {
            console.error(error);
            toast.error('Görev oluşturulamadı');
        }
    }, [editor, note, persistEditorContent, capturePromoteCandidate]);

    const jumpToEntity = (row: NoteEntityMentionRow) => {
        const label = row.target_label || row.target_id;
        if (row.target_type === 'MATTER') {
            setContext('MATTER', row.target_id, label);
            openMatterFormFloating({ id: row.target_id, title: label });
        } else if (row.target_type === 'PARTY') {
            setContext('PARTY', row.target_id, label);
            openPartyFormFloating({ id: row.target_id, full_name: label });
        } else if (row.target_type === 'DOCUMENT') {
            setContext('DOCUMENT', row.target_id, label);
        } else if (row.target_type === 'KNOWLEDGE') {
            openKnowledgeFormFloating({ id: row.target_id, title: label });
        }
    };

    const handleExportMarkdown = () => {
        if (!editor) return;
        void (async () => {
            try {
                await exportEditorToMarkdown(editor, note?.title?.trim() || 'not');
            } catch (error) {
                console.error(error);
                toast.error('Markdown kaydedilemedi');
            }
        })();
    };

    const openSaveFullTemplate = () => {
        if (!editor || !note) return;
        const json = editor.getJSON();
        setTemplateDialog({
            open: true,
            defaultName: (note.title || 'Not').trim() || 'Not şablonu',
            contentJson: JSON.stringify(json),
            contentPlain: tiptapToText(json),
        });
    };

    const openSaveSelectionTemplate = () => {
        if (!editor || !note) return;
        if (editor.state.selection.empty) {
            toast.message('Önce metin seçin');
            return;
        }
        const slab = editorSelectionToDocJson(editor);
        if (!slab) {
            toast.message('Seçim şablona dönüştürülemedi');
            return;
        }
        setTemplateDialog({
            open: true,
            defaultName: `${(note.title || 'Not').trim() || 'Not'} — seçim`,
            contentJson: JSON.stringify(slab),
            contentPlain: tiptapToText(slab),
        });
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full opacity-50 space-y-4">
                <MaterialIcon icon="edit_note" size={48} className="animate-pulse text-primary drop-shadow-lg" />
                <span className="text-sm italic tracking-widest uppercase">Not Yükleniyor...</span>
            </div>
        );
    }

    if (!note)
        return (
            <div className="flex flex-col items-center justify-center h-full opacity-50 italic">
                <MaterialIcon icon="draft" size={48} className="mb-4 opacity-50" />
                <span>Not bulunamadı veya silinmiş.</span>
            </div>
        );

    const hasMetaStrip =
        noteTags.length > 0 || outbound.length > 0 || backlinks.length > 0 || entityMentions.length > 0;

    return (
        <div className="note-editor flex flex-col h-full animate-in fade-in duration-500 w-full relative bg-background/80 backdrop-blur-xl text-foreground border border-border/40">
            <div className="flex items-center justify-end gap-3 px-4 py-2 border-b border-white/10 shrink-0 glass-panel z-10">
                <span className="mr-auto text-[10px] text-muted-foreground/75 tabular-nums font-medium">
                    {note.updated_at ? formatNoteSavedAt(note.updated_at) : null}
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 rounded-lg px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/10"
                    title="Notu .md dosyası olarak indir"
                    onClick={handleExportMarkdown}
                >
                    <MaterialIcon icon="download" size={16} className="opacity-80" />
                    <span className="hidden sm:inline">MD indir</span>
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 rounded-lg px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/10"
                    title="Tüm notu metin kütüphanesine şablon olarak kaydet"
                    onClick={openSaveFullTemplate}
                >
                    <MaterialIcon icon="stylus_note" size={16} className="opacity-80" />
                    <span className="hidden sm:inline">Şablon kaydet</span>
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDelete}
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/15"
                    title="Notu sil"
                >
                    <MaterialIcon icon="delete" size={18} />
                </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative bg-muted/5">
                <ContextMenu>
                    <ContextMenuTrigger asChild>
                        <div
                            className="max-w-4xl mx-auto min-h-full bg-[var(--editor-paper-bg)]/80 dark:bg-card/25 backdrop-blur-sm border-x border-white/10 relative z-[1] min-h-[200px]"
                            onContextMenu={() => capturePromoteCandidate()}
                            onPointerDown={(e) => {
                                if (e.button === 2) capturePromoteCandidate();
                            }}
                        >
                            <EditorContent editor={editor} />
                        </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="min-w-[220px] glass border-white/10">
                        <ContextMenuItem
                            className="gap-2 cursor-pointer"
                            onSelect={() => {
                                setTimeout(() => {
                                    editor?.chain().focus().run();
                                    document.execCommand('cut');
                                }, 0);
                            }}
                        >
                            <MaterialIcon icon="content_cut" size={16} className="opacity-80" />
                            Kes
                            <ContextMenuShortcut>{isMacLikePlatform() ? '⌘X' : 'Ctrl+X'}</ContextMenuShortcut>
                        </ContextMenuItem>
                        <ContextMenuItem
                            className="gap-2 cursor-pointer"
                            onSelect={() => {
                                setTimeout(() => {
                                    editor?.chain().focus().run();
                                    document.execCommand('copy');
                                }, 0);
                            }}
                        >
                            <MaterialIcon icon="content_copy" size={16} className="opacity-80" />
                            Kopyala
                            <ContextMenuShortcut>{isMacLikePlatform() ? '⌘C' : 'Ctrl+C'}</ContextMenuShortcut>
                        </ContextMenuItem>
                        <ContextMenuItem
                            className="gap-2 cursor-pointer"
                            onSelect={() => {
                                setTimeout(() => {
                                    editor?.chain().focus().run();
                                    document.execCommand('paste');
                                }, 0);
                            }}
                        >
                            <MaterialIcon icon="content_paste" size={16} className="opacity-80" />
                            Yapıştır
                            <ContextMenuShortcut>{isMacLikePlatform() ? '⌘V' : 'Ctrl+V'}</ContextMenuShortcut>
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                            className="gap-2 cursor-pointer"
                            onSelect={() => {
                                setTimeout(() => {
                                    void promoteChecklistToTask();
                                }, 0);
                            }}
                        >
                            <MaterialIcon icon="checklist" size={16} className="opacity-80" />
                            Göreve çevir
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                            className="gap-2 cursor-pointer"
                            onSelect={() => {
                                setTimeout(async () => {
                                    if (!editor) return;
                                    try {
                                        await pasteMarkdownFromClipboard(editor);
                                    } catch (error) {
                                        console.error(error);
                                        toast.error('Markdown yapıştırılamadı');
                                    }
                                }, 0);
                            }}
                        >
                            <MaterialIcon icon="article" size={16} className="opacity-80" />
                            Markdown yapıştır
                        </ContextMenuItem>
                        <ContextMenuItem
                            className="gap-2 cursor-pointer"
                            onSelect={() => {
                                setTimeout(async () => {
                                    if (!editor) return;
                                    try {
                                        await exportEditorToMarkdown(
                                            editor,
                                            note?.title?.trim() || 'not',
                                        );
                                    } catch (error) {
                                        console.error(error);
                                        toast.error('Markdown dışa aktarılamadı');
                                    }
                                }, 0);
                            }}
                        >
                            <MaterialIcon icon="download" size={16} className="opacity-80" />
                            Markdown olarak dışa aktar
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                            className="gap-2 cursor-pointer"
                            onSelect={() => {
                                setTimeout(() => openSaveSelectionTemplate(), 0);
                            }}
                        >
                            <MaterialIcon icon="content_copy" size={16} className="opacity-80" />
                            Metni şablon olarak kaydet
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                            className="gap-2 cursor-pointer"
                            onSelect={() => {
                                setTimeout(() => openSaveFullTemplate(), 0);
                            }}
                        >
                            <MaterialIcon icon="stylus_note" size={16} className="opacity-80" />
                            Notu şablon olarak kaydet
                        </ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>
            </div>

            <div className="shrink-0 border-t border-white/10 glass-panel">
                <div className="max-w-4xl mx-auto">
                    {hasMetaStrip ? (
                        <div className="flex items-stretch gap-0 min-h-[36px]">
                            <div className="flex items-center gap-1.5 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/80 shrink-0 border-r border-white/10 bg-white/[0.02]">
                                <MaterialIcon icon="hub" size={12} className="text-primary/80" />
                                <span className="hidden sm:inline whitespace-nowrap">İlişkiler</span>
                            </div>
                            <div className="flex-1 min-w-0 flex items-center gap-2 py-1.5 pl-2 pr-1 overflow-x-auto custom-scrollbar">
                                {noteTags.length > 0 && (
                                    <>
                                        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70 shrink-0">
                                            Etiket
                                        </span>
                                        {noteTags.map((t) => (
                                            <button
                                                key={t.id}
                                                type="button"
                                                className={cn(metaChipClass, 'text-primary/95')}
                                                title="Notlarda bu etiketle ara"
                                                onClick={() =>
                                                    openNotesForQuery(`#${t.name}`, `Etiket: #${t.name}`)
                                                }
                                            >
                                                <span className="truncate">#{t.name}</span>
                                            </button>
                                        ))}
                                        <Separator orientation="vertical" className="h-5 bg-white/10 shrink-0" />
                                    </>
                                )}

                                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70 shrink-0">
                                    Çıkan
                                </span>
                                {outbound.length === 0 && (
                                    <span className="text-[10px] text-muted-foreground/45 italic shrink-0">—</span>
                                )}
                                {outbound.map((l) => {
                                    const label = l.display_text || l.target_title || l.unresolved_title || l.target_note_id || '';
                                    if (l.target_note_id) {
                                        return (
                                            <button
                                                key={l.id}
                                                type="button"
                                                className={metaChipClass}
                                                title="Yeni sekmede aç"
                                                onClick={() =>
                                                    openNoteInNewTab(
                                                        l.target_note_id!,
                                                        l.target_title || label || 'Not'
                                                    )
                                                }
                                            >
                                                <MaterialIcon icon="north_east" size={11} className="opacity-60 shrink-0" />
                                                <span className="truncate">{label}</span>
                                            </button>
                                        );
                                    }
                                    return (
                                        <button
                                            key={l.id}
                                            type="button"
                                            className={cn(metaChipClass, 'border-amber-500/25 text-amber-800/90 dark:text-amber-200/90')}
                                            title="Notlarda ara"
                                            onClick={() =>
                                                openNotesForQuery(
                                                    l.unresolved_title || l.display_text || '',
                                                    `Çözülmemiş: ${l.unresolved_title || l.display_text || ''}`
                                                )
                                            }
                                        >
                                            <span className="opacity-60">?</span>
                                            <span className="truncate">{l.unresolved_title || l.display_text}</span>
                                        </button>
                                    );
                                })}

                                <Separator orientation="vertical" className="h-5 bg-white/10 shrink-0" />

                                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70 shrink-0">
                                    Geri
                                </span>
                                {backlinks.length === 0 && (
                                    <span className="text-[10px] text-muted-foreground/45 italic shrink-0">—</span>
                                )}
                                {backlinks.map((l) => {
                                    const label = l.source_title || l.source_note_id;
                                    return (
                                        <button
                                            key={l.id}
                                            type="button"
                                            className={metaChipClass}
                                            title="Yeni sekmede aç"
                                            onClick={() =>
                                                openNoteInNewTab(l.source_note_id, l.source_title || label || 'Not')
                                            }
                                        >
                                            <MaterialIcon icon="south_west" size={11} className="opacity-60 shrink-0" />
                                            <span className="truncate">{label}</span>
                                        </button>
                                    );
                                })}

                                <Separator orientation="vertical" className="h-5 bg-white/10 shrink-0" />

                                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70 shrink-0">
                                    @
                                </span>
                                {entityMentions.length === 0 && (
                                    <span className="text-[10px] text-muted-foreground/45 italic shrink-0">—</span>
                                )}
                                {entityMentions.map((row, idx) => {
                                    const label = row.target_label || row.target_id;
                                    const kind =
                                        row.target_type === 'MATTER'
                                            ? 'Dava'
                                            : row.target_type === 'PARTY'
                                              ? 'Taraf'
                                              : row.target_type === 'DOCUMENT'
                                                ? 'Dosya'
                                                : row.target_type === 'KNOWLEDGE'
                                                  ? 'Kayıt'
                                                  : row.target_type === 'FILE'
                                                    ? 'Dosya yolu'
                                                    : 'Kayıt';
                                    return (
                                        <button
                                            key={`${row.target_id}-${idx}`}
                                            type="button"
                                            className={metaChipClass}
                                            title="Notlarda ara · orta tık: kayda git"
                                            onClick={() => openNotesForQuery(label, `@ ${kind}: ${label}`)}
                                            onAuxClick={(e) => {
                                                if (e.button === 1) jumpToEntity(row);
                                            }}
                                        >
                                            <span className="text-[8px] uppercase text-muted-foreground/80 shrink-0">
                                                {kind.slice(0, 1)}
                                            </span>
                                            <span className="truncate">{label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="px-3 py-2 flex items-center gap-2 text-[10px] text-muted-foreground/55">
                            <MaterialIcon icon="tag" size={12} className="text-primary/50" />
                            <span className="font-medium tracking-wide">
                                <span className="text-foreground/50">#etiket</span>
                                <span className="mx-1 opacity-40">·</span>
                                <span className="text-foreground/50">[[Not]]</span>
                                <span className="mx-1 opacity-40">·</span>
                                <span className="text-foreground/50">@kayıt</span>
                                <span className="ml-1 opacity-90">
                                    — ilişkiler kaydedilince burada görünür.
                                </span>
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <SaveAsTemplateDialog
                open={templateDialog.open}
                onOpenChange={(o) => setTemplateDialog((s) => ({ ...s, open: o }))}
                defaultName={templateDialog.defaultName}
                contentJson={templateDialog.contentJson}
                contentPlain={templateDialog.contentPlain}
            />
        </div>
    );
};
