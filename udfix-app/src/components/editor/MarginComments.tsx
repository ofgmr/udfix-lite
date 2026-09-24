import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { Editor } from '@tiptap/react';
import { EDITOR_MARGIN_COMMENT_GUTTER_PX } from '../../utils/editorLayout';
import { cssPxFromViewportDelta, getCumulativeCssZoom } from '../../utils/editorCssZoom';
import {
    getAllCommentIds,
    selectAndScrollToComment,
    highlightComment
} from '../../utils/commentUtils';
import type { CommentData, Reply } from '../../utils/commentUtils';
import { useDocumentCommentsStore } from '../../stores/useDocumentCommentsStore';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { armCommentDraftFocus } from '../../utils/startCommentDraft';
import { CommentPreviewText } from './CommentPreviewText';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { cn } from '../../lib/utils';

import { debounce } from 'lodash';

interface MarginCommentsProps {
    editor: Editor | null;
    documentId: string;
    /** Editor canvas CSS zoom (`1` = 100%). Re-measure when this changes. */
    zoom?: number;
}

interface PositionedComment extends CommentData {
    top: number;
}

function measureCommentAnchorTopPx(
    editor: Editor,
    commentId: string,
    container: HTMLElement,
): number {
    const zoom = getCumulativeCssZoom(container);
    const containerRect = container.getBoundingClientRect();
    const markEl = editor.view.dom.querySelector(
        `span[data-comment-id="${CSS.escape(commentId)}"]`,
    ) as HTMLElement | null;
    if (markEl) {
        return cssPxFromViewportDelta(markEl.getBoundingClientRect().top - containerRect.top, zoom);
    }
    try {
        const coords = editor.view.coordsAtPos(editor.state.selection.from);
        return cssPxFromViewportDelta(coords.top - containerRect.top, zoom);
    } catch {
        return 0;
    }
}

const MarginComments: React.FC<MarginCommentsProps> = ({ editor, documentId, zoom = 1 }) => {
    const commentsRevision = useDocumentCommentsStore((s) => s.revision);
    const draftCommentId = useDocumentCommentsStore((s) => s.draftCommentId);
    const draftCommentText = useDocumentCommentsStore((s) => s.draftCommentText);
    const setDraftCommentText = useDocumentCommentsStore((s) => s.setDraftCommentText);
    const upsertComment = useDocumentCommentsStore((s) => s.upsert);
    const clearDraft = useDocumentCommentsStore((s) => s.clearDraft);
    const [comments, setComments] = useState<PositionedComment[]>([]);
    const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [replyingToId, setReplyingToId] = useState<string | null>(null);
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const draftInputRef = useRef<HTMLTextAreaElement>(null);
    const updateCommentText = useDocumentCommentsStore((s) => s.updateCommentText);
    const inspectCommentId = useDocumentCommentsStore((s) => s.inspectCommentId);
    const setInspectCommentId = useDocumentCommentsStore((s) => s.setInspectCommentId);
    const openRightPanel = useLayoutStore((s) => s.openRightPanel);

    const currentUser = 'User';

    const updateComments = useCallback(() => {
        if (!editor || !containerRef.current) return;

        const currentContainer = containerRef.current;
        const zoomFactor = getCumulativeCssZoom(currentContainer);
        const currentIds = getAllCommentIds(editor);
        const stored = useDocumentCommentsStore.getState().comments;
        const liveDraftId = useDocumentCommentsStore.getState().draftCommentId;

        const containerRect = currentContainer.getBoundingClientRect();

        const positioned: PositionedComment[] = [];
        
        currentIds.forEach(id => {
            const data = stored[id];
            
            // If it's the draft comment, we create a temporary data object (always read live draft id from store — not stale closure)
            if (!data && id !== liveDraftId) return;
            
            const commentData = data || {
                id,
                text: '',
                author: currentUser,
                date: new Date().toISOString(),
                resolved: false,
                replies: []
            };
            
            // Find the DOM element for this comment
            const markEl = editor.view.dom.querySelector(`span[data-comment-id="${id}"]`) as HTMLElement;
            let top = 0;
            if (markEl) {
                const rect = markEl.getBoundingClientRect();
                top = cssPxFromViewportDelta(rect.top - containerRect.top, zoomFactor);
            }
            
            positioned.push({ ...commentData, top });
        });

        // Sort by top position to avoid overlaps later if needed
        positioned.sort((a, b) => a.top - b.top);
        
        // Simple collision resolution using actual DOM heights
        for (let i = 1; i < positioned.length; i++) {
            const prev = positioned[i - 1];
            const curr = positioned[i];
            const prevEl = document.getElementById(`margin-comment-${prev.id}`);
            const minDistance = prevEl ? prevEl.offsetHeight + 16 : 72;
            if (curr.top < prev.top + minDistance) {
                curr.top = prev.top + minDistance;
            }
        }

        setComments(positioned);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- zoom forces re-measure after canvas CSS zoom
    }, [editor, documentId, zoom]);

    const updateCommentsRef = useRef(updateComments);
    updateCommentsRef.current = updateComments;

    const debouncedUpdateComments = useMemo(
        () => debounce(() => updateCommentsRef.current(), 200),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- stable debounce keyed on editor only
        [editor]
    );

    useEffect(() => {
        updateComments();
    }, [zoom, updateComments]);

    useEffect(() => {
        if (!editor) return;

        updateComments();

        const handleUpdate = () => debouncedUpdateComments();
        
        const handleSelectionUpdate = () => {
            if (!editor) return;
            const { from, to } = editor.state.selection;
            let foundId: string | null = null;

            editor.state.doc.nodesBetween(from, to, (node) => {
                const mark = node.marks.find(m => m.type.name === 'comment');
                if (mark) {
                    foundId = mark.attrs.commentId;
                    return false;
                }
            });

            setActiveCommentId(foundId);
        };

        editor.on('update', handleUpdate);
        editor.on('selectionUpdate', handleSelectionUpdate);
        
        // Also update on scroll or resize to keep positions accurate
        const scrollContainer = document.getElementById('editor-scroll-container');
        if (scrollContainer) {
            scrollContainer.addEventListener('scroll', debouncedUpdateComments);
        }
        window.addEventListener('resize', debouncedUpdateComments);

        return () => {
            editor.off('update', handleUpdate);
            editor.off('selectionUpdate', handleSelectionUpdate);
            if (scrollContainer) {
                scrollContainer.removeEventListener('scroll', debouncedUpdateComments);
            }
            window.removeEventListener('resize', debouncedUpdateComments);
            debouncedUpdateComments.cancel();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- listeners wired once per editor instance
    }, [editor, documentId]);

    useEffect(() => {
        if (editor) {
            highlightComment(editor, activeCommentId);
            // Re-calculate layout when a comment becomes active (expands)
            debouncedUpdateComments();
        }
    }, [activeCommentId, editor, debouncedUpdateComments]);

    useEffect(() => {
        debouncedUpdateComments();
    }, [replyingToId, editingCommentId, inspectCommentId, debouncedUpdateComments]);

    const handleReply = (commentId: string) => {
        if (!replyText.trim()) return;

        const newReply: Reply = {
            id: `reply-${Date.now()}`,
            text: replyText,
            author: currentUser,
            date: new Date().toISOString()
        };
        useDocumentCommentsStore.getState().addReply(commentId, newReply);
        setReplyText('');
        setReplyingToId(null);
        updateComments();
    };

    const handleDelete = (id: string) => {
        setEditingCommentId(null);
        useDocumentCommentsStore.getState().remove(id);
        if (editor) {
            editor.commands.unsetComment(id);
        }
        updateComments();
    };

    const startEdit = (e: React.MouseEvent, comment: CommentData) => {
        e.stopPropagation();
        if (comment.author !== currentUser) return;
        setEditingCommentId(comment.id);
        setEditText(comment.text);
        setReplyingToId(null);
        setInspectCommentId(comment.id);
    };

    const saveEdit = (commentId: string) => {
        if (!editText.trim()) return;
        updateCommentText(commentId, editText);
        setEditingCommentId(null);
        updateComments();
    };

    const handleSaveNewComment = () => {
        const body = draftCommentText.trim();
        if (!draftCommentId || !body) return;
        upsertComment({
            id: draftCommentId,
            text: body,
            author: currentUser,
            date: new Date().toISOString(),
            resolved: false,
            replies: [],
        });
        clearDraft();
        updateComments();
    };

    const handleCancelDraft = () => {
        if (editor && draftCommentId) {
            editor.commands.unsetComment(draftCommentId);
        }
        clearDraft();
        updateComments();
    };

    useEffect(() => {
        if (!draftCommentId) return;
        updateComments();
    }, [draftCommentId, updateComments]);

    useLayoutEffect(() => {
        if (!draftCommentId) return;
        return armCommentDraftFocus(() => draftInputRef.current, editor);
    }, [draftCommentId, editor]);

    const visibleComments = useMemo(() => {
        const list = comments.filter((c) => !c.resolved);
        if (draftCommentId && !list.some((c) => c.id === draftCommentId)) {
            const top =
                editor && containerRef.current
                    ? measureCommentAnchorTopPx(editor, draftCommentId, containerRef.current)
                    : 0;
            list.push({
                id: draftCommentId,
                text: '',
                author: currentUser,
                date: new Date().toISOString(),
                resolved: false,
                replies: [],
                top,
            });
        }
        return list;
    }, [comments, draftCommentId, editor]);

    if (!editor) return null;

    return (
        <div ref={containerRef} className="pointer-events-none absolute inset-0">
            {visibleComments.map((comment) => {
                const isDraft = comment.id === draftCommentId;
                const isExpanded =
                    isDraft ||
                    editingCommentId === comment.id ||
                    activeCommentId === comment.id ||
                    inspectCommentId === comment.id ||
                    replyingToId === comment.id;
                const replyCount = comment.replies?.length ?? 0;
                return (
                <div
                    key={comment.id}
                    id={`margin-comment-${comment.id}`}
                    className={cn(
                        "absolute p-3 transition-all duration-300 pointer-events-auto cursor-pointer",
                        isExpanded ? "opacity-100 scale-100" : "opacity-60 scale-95 hover:opacity-100 hover:scale-100"
                    )}
                    style={{
                        top: `${comment.top}px`,
                        left: '100%',
                        marginLeft: 12,
                        width: EDITOR_MARGIN_COMMENT_GUTTER_PX - 20,
                    }}
                    onClick={() => {
                        if (isDraft) return;
                        setInspectCommentId(comment.id);
                        selectAndScrollToComment(editor, comment.id);
                    }}
                >
                    <div className={cn(
                        "flex flex-col gap-2 border-l-2 pl-3",
                        isExpanded ? "border-primary" : "border-primary/30"
                    )}>
                        {isDraft ? (
                            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-primary/85 mb-1">
                                    Yeni Yorum
                                </div>
                                <Textarea
                                    ref={draftInputRef}
                                    value={draftCommentText}
                                    onChange={(e) => setDraftCommentText(e.target.value)}
                                    placeholder="Yorumunuzu yazın..."
                                    className="min-h-[72px] text-xs resize-none bg-transparent border-primary/25 text-primary placeholder:text-primary/35"
                                />
                                <div className="flex justify-end gap-2 mt-2">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs text-primary/70"
                                        onClick={handleCancelDraft}
                                    >
                                        İptal
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="h-7 text-xs bg-primary/15 text-primary hover:bg-primary/25"
                                        onClick={handleSaveNewComment}
                                    >
                                        Gönder
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between gap-1">
                                    <span className="text-xs font-semibold text-primary">{comment.author}</span>
                                    <div className="flex gap-0.5">
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-5 w-5 text-primary/50 hover:text-primary"
                                            title="Yorumlar panelini aç"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setInspectCommentId(comment.id);
                                                openRightPanel('comments');
                                            }}
                                        >
                                            <MaterialIcon icon="right_panel_open" size={14} />
                                        </Button>
                                        {comment.author === currentUser && editingCommentId !== comment.id && (
                                            <Button size="icon" variant="ghost" className="h-5 w-5 text-primary/50 hover:text-primary" onClick={(e) => startEdit(e, comment)} title="Düzenle">
                                                <MaterialIcon icon="edit" size={14} />
                                            </Button>
                                        )}
                                        <Button size="icon" variant="ghost" className="h-5 w-5 text-primary/50 hover:text-primary" onClick={(e) => { e.stopPropagation(); handleDelete(comment.id); }} title="Sil">
                                            <MaterialIcon icon="close" size={14} />
                                        </Button>
                                    </div>
                                </div>
                                {editingCommentId === comment.id ? (
                                    <div className="mt-1 space-y-2" onClick={(e) => e.stopPropagation()}>
                                        <Textarea
                                            value={editText}
                                            onChange={(e) => setEditText(e.target.value)}
                                            className="min-h-[72px] text-xs resize-none bg-transparent text-primary border-primary/25 focus-visible:ring-primary/30"
                                            autoFocus
                                        />
                                        <div className="flex justify-end gap-2">
                                            <Button size="sm" variant="ghost" className="h-6 text-xs text-primary/70" onClick={() => { setEditingCommentId(null); }}>İptal</Button>
                                            <Button size="sm" className="h-6 text-xs bg-primary/10 text-primary" onClick={() => saveEdit(comment.id)}>Kaydet</Button>
                                        </div>
                                    </div>
                                ) : (
                                    <CommentPreviewText
                                        text={comment.text}
                                        expanded={isExpanded}
                                        className="text-primary/90"
                                    />
                                )}

                                {!isExpanded && replyCount > 0 && replyingToId !== comment.id && (
                                    <span className="text-[10px] text-primary/50">
                                        {replyCount} yanıt
                                    </span>
                                )}

                                {isExpanded && comment.replies?.map(reply => (
                                    <div key={reply.id} className="text-xs pl-2 border-l border-primary/20 mt-1">
                                        <span className="font-medium text-primary/80">{reply.author}: </span>
                                        <span className="text-primary/80">{reply.text}</span>
                                    </div>
                                ))}

                                {editingCommentId !== comment.id && (
                                    replyingToId === comment.id ? (
                                        <div className="mt-1 space-y-2" onClick={(e) => e.stopPropagation()}>
                                            <Textarea
                                                autoFocus
                                                value={replyText}
                                                onChange={e => setReplyText(e.target.value)}
                                                placeholder="Yanıt..."
                                                className="min-h-[60px] text-xs resize-none bg-transparent text-primary border-primary/20 focus-visible:ring-primary/30 placeholder:text-primary/40"
                                            />
                                            <div className="flex justify-end gap-2">
                                                <Button size="sm" variant="ghost" className="h-6 text-xs text-primary/70" onClick={(e) => { e.stopPropagation(); setReplyingToId(null); }}>İptal</Button>
                                                <Button size="sm" className="h-6 text-xs bg-primary/10 text-primary hover:bg-primary/20" onClick={(e) => { e.stopPropagation(); handleReply(comment.id); }}>Gönder</Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-5 px-1.5 text-[10px] text-primary/55 hover:text-primary hover:bg-transparent justify-start -ml-1"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setInspectCommentId(comment.id);
                                                setReplyingToId(comment.id);
                                            }}
                                        >
                                            <MaterialIcon icon="reply" size={12} className="mr-0.5" /> Yanıtla
                                        </Button>
                                    )
                                )}
                            </>
                        )}
                    </div>
                </div>
            )})}
        </div>
    );
};

export default MarginComments;
