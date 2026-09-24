import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Editor } from '@tiptap/react';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { ScrollArea } from '../../components/ui/scroll-area';
import { cn } from '../../lib/utils';
import {
    getCommentIdsInDocumentOrder,
    selectAndScrollToComment,
    highlightComment,
} from '../../utils/commentUtils';
import type { CommentData, Reply } from '../../utils/commentUtils';
import { useDocumentCommentsStore } from '../../stores/useDocumentCommentsStore';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { startCommentDraftOnSelection, armCommentDraftFocus } from '../../utils/startCommentDraft';
import { CommentPreviewText } from '../editor/CommentPreviewText';

interface CommentPanelProps {
    editor?: Editor | null;
}

const CommentPanel: React.FC<CommentPanelProps> = ({ editor: editorProp }) => {
    const editorFromStore = useLayoutStore((s) => s.editor);
    const editor = editorProp !== undefined ? editorProp : editorFromStore;

    const commentsRecord = useDocumentCommentsStore((s) => s.comments);
    const commentsRevision = useDocumentCommentsStore((s) => s.revision);
    const draftCommentId = useDocumentCommentsStore((s) => s.draftCommentId);
    const draftCommentText = useDocumentCommentsStore((s) => s.draftCommentText);
    const setDraftCommentText = useDocumentCommentsStore((s) => s.setDraftCommentText);
    const upsert = useDocumentCommentsStore((s) => s.upsert);
    const remove = useDocumentCommentsStore((s) => s.remove);
    const toggleResolved = useDocumentCommentsStore((s) => s.toggleResolved);
    const addReply = useDocumentCommentsStore((s) => s.addReply);
    const clearDraft = useDocumentCommentsStore((s) => s.clearDraft);
    const updateCommentText = useDocumentCommentsStore((s) => s.updateCommentText);
    const inspectCommentId = useDocumentCommentsStore((s) => s.inspectCommentId);
    const setInspectCommentId = useDocumentCommentsStore((s) => s.setInspectCommentId);

    const [replyText, setReplyText] = useState<string>('');
    const [replyingToId, setReplyingToId] = useState<string | null>(null);
    const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
    const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'open' | 'resolved'>('open');
    /** Re-sync list when the document marks change without a store revision (e.g. undo). */
    const [docTick, setDocTick] = useState(0);
    const draftInputRef = useRef<HTMLTextAreaElement>(null);
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');

    const currentUser = 'User';

    const comments = useMemo(() => {
        if (!editor) return [];
        void commentsRevision;
        void docTick;
        const ids = getCommentIdsInDocumentOrder(editor);
        return ids
            .map((id) => commentsRecord[id])
            .filter((c): c is CommentData => c !== undefined);
    }, [editor, commentsRecord, commentsRevision, docTick]);

    useEffect(() => {
        if (!editor) return;
        const onDocChange = () => setDocTick((t) => t + 1);
        editor.on('update', onDocChange);
        return () => {
            editor.off('update', onDocChange);
        };
    }, [editor]);

    useEffect(() => {
        if (!editor) return;

        const handleSelectionUpdate = () => {
            const { from, to } = editor.state.selection;
            let foundId: string | null = null;

            editor.state.doc.nodesBetween(from, to, (node) => {
                const mark = node.marks.find((m) => m.type.name === 'comment');
                if (mark) {
                    foundId = mark.attrs.commentId;
                    return false;
                }
            });

            setActiveCommentId(foundId);
        };

        handleSelectionUpdate();
        editor.on('selectionUpdate', handleSelectionUpdate);

        return () => {
            editor.off('selectionUpdate', handleSelectionUpdate);
        };
    }, [editor]);

    useEffect(() => {
        if (editor) {
            highlightComment(editor, highlightedCommentId || inspectCommentId || activeCommentId);
        }
    }, [highlightedCommentId, inspectCommentId, activeCommentId, editor]);

    useLayoutEffect(() => {
        if (!draftCommentId) return;
        if (document.getElementById(`margin-comment-${draftCommentId}`)) return;
        return armCommentDraftFocus(() => draftInputRef.current, editor);
    }, [draftCommentId, editor]);

    useEffect(() => {
        const id = inspectCommentId || activeCommentId;
        if (!id) return;
        const el = document.getElementById(`comment-panel-${id}`);
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [inspectCommentId, activeCommentId]);

    const handleSaveNewComment = () => {
        if (!editor || !draftCommentId || !draftCommentText.trim()) return;

        upsert({
            id: draftCommentId,
            text: draftCommentText.trim(),
            author: currentUser,
            date: new Date().toISOString(),
            resolved: false,
            replies: [],
        });

        clearDraft();
    };

    const handleCancelDraft = () => {
        if (editor && draftCommentId) {
            editor.commands.unsetComment(draftCommentId);
        }
        clearDraft();
    };

    const handleAddCommentAction = () => {
        if (!editor) return;
        startCommentDraftOnSelection(editor);
    };

    const handleReply = (commentId: string) => {
        if (!replyText.trim()) return;

        const newReply: Reply = {
            id: `reply-${Date.now()}`,
            text: replyText,
            author: currentUser,
            date: new Date().toISOString(),
        };

        addReply(commentId, newReply);
        setReplyText('');
        setReplyingToId(null);
    };

    const handleToggleResolve = (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        toggleResolved(id);
    };

    const handleDelete = (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (editingCommentId === id) setEditingCommentId(null);
        remove(id);

        if (editor) {
            editor.commands.unsetComment(id);
        }
    };

    const startEdit = (e: React.MouseEvent, comment: CommentData) => {
        e.stopPropagation();
        if (comment.author !== currentUser) return;
        setEditingCommentId(comment.id);
        setEditText(comment.text);
        setReplyingToId(null);
        setInspectCommentId(comment.id);
    };

    const saveEdit = (commentId: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!editText.trim()) return;
        updateCommentText(commentId, editText);
        setEditingCommentId(null);
    };

    const visibleComments = comments.filter((c) => (activeTab === 'open' ? !c.resolved : c.resolved));
    const isSelectionEmpty = editor?.state.selection.empty;

    return (
        <div className="flex flex-col h-full glass-panel rounded-lg overflow-hidden bg-background/50 backdrop-blur-xl border-l border-white/10">
            <div className="p-4 border-b border-border/50">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 font-semibold">
                        <MaterialIcon icon="forum" size={20} className="text-primary" />
                        <span>Yorumlar</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{comments.length} toplam</div>
                </div>

                <div className="flex gap-1 p-1 bg-muted/20 rounded-lg">
                    <button
                        type="button"
                        onClick={() => setActiveTab('open')}
                        className={cn(
                            'flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-all',
                            activeTab === 'open'
                                ? 'bg-background shadow-sm text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        Açık
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('resolved')}
                        className={cn(
                            'flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-all',
                            activeTab === 'resolved'
                                ? 'bg-background shadow-sm text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        Çözüldü
                    </button>
                </div>
            </div>

            <ScrollArea className="flex-1 p-4">
                <div className="flex flex-col gap-4 pb-4">
                    {draftCommentId && (
                        <Card className="border-2 border-primary/20 animate-in slide-in-from-top-2">
                            <CardHeader className="p-3 pb-2">
                                <span className="text-xs font-semibold text-primary">Yeni yorum</span>
                            </CardHeader>
                            <CardContent className="p-3 pt-0 gap-2 flex flex-col">
                                <Textarea
                                    ref={draftInputRef}
                                    placeholder="Yorumunuzu yazın..."
                                    value={draftCommentText}
                                    onChange={(e) => setDraftCommentText(e.target.value)}
                                    className="min-h-[80px] text-sm resize-none"
                                />
                                <div className="flex justify-end gap-2">
                                    <Button size="sm" variant="ghost" onClick={handleCancelDraft}>
                                        İptal
                                    </Button>
                                    <Button size="sm" onClick={handleSaveNewComment}>
                                        Gönder
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {!draftCommentId && visibleComments.length === 0 && (
                        <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                            <MaterialIcon icon="chat_bubble_outline" size={48} className="opacity-20 mb-2" />
                            <p className="text-sm">Henüz yorum yok</p>
                            {activeTab === 'open' && !isSelectionEmpty && (
                                <Button variant="link" onClick={handleAddCommentAction} className="mt-2 text-primary">
                                    Seçime yorum ekle
                                </Button>
                            )}
                        </div>
                    )}

                    {visibleComments.map((comment) => {
                        const isExpanded =
                            editingCommentId === comment.id ||
                            activeCommentId === comment.id ||
                            inspectCommentId === comment.id;
                        const replyCount = comment.replies?.length ?? 0;
                        return (
                        <Card
                            key={comment.id}
                            id={`comment-panel-${comment.id}`}
                            className={cn(
                                'group transition-all duration-200 border-l-4',
                                isExpanded
                                    ? 'border-l-primary shadow-md ring-1 ring-primary/10'
                                    : 'border-l-transparent hover:border-l-primary/50'
                            )}
                            onMouseEnter={() => setHighlightedCommentId(comment.id)}
                            onMouseLeave={() => setHighlightedCommentId(null)}
                            onClick={() => {
                                setInspectCommentId(comment.id);
                                if (editor) selectAndScrollToComment(editor, comment.id);
                            }}
                        >
                            <div className="p-3 space-y-3">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                        <Avatar className="h-6 w-6">
                                            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                                {comment.author[0]}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-semibold">{comment.author}</span>
                                            <span className="text-[10px] text-muted-foreground">
                                                {new Date(comment.date).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {comment.author === currentUser && editingCommentId !== comment.id && (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-6 w-6"
                                                title="Düzenle"
                                                onClick={(e) => startEdit(e, comment)}
                                            >
                                                <MaterialIcon icon="edit" size={14} />
                                            </Button>
                                        )}
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-6 w-6"
                                            title={comment.resolved ? 'Çözüldü işaretini kaldır' : 'Çözüldü işaretle'}
                                            onClick={(e) => handleToggleResolve(comment.id, e)}
                                        >
                                            <MaterialIcon icon="check" size={14} />
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-6 w-6 text-destructive"
                                            title="Sil"
                                            onClick={(e) => handleDelete(comment.id, e)}
                                        >
                                            <MaterialIcon icon="delete" size={14} />
                                        </Button>
                                    </div>
                                </div>

                                {editingCommentId === comment.id ? (
                                    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                        <Textarea
                                            value={editText}
                                            onChange={(e) => setEditText(e.target.value)}
                                            className="min-h-[80px] text-sm resize-none"
                                            autoFocus
                                        />
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingCommentId(null);
                                                }}
                                            >
                                                İptal
                                            </Button>
                                            <Button size="sm" onClick={(e) => saveEdit(comment.id, e)}>
                                                Kaydet
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <CommentPreviewText
                                        text={comment.text}
                                        expanded={isExpanded}
                                        className="text-foreground/90"
                                    />
                                )}

                                {!isExpanded && replyCount > 0 && (
                                    <span className="text-[10px] text-muted-foreground">{replyCount} yanıt</span>
                                )}

                                {isExpanded && comment.replies && comment.replies.length > 0 && (
                                    <div className="pl-3 border-l-2 border-muted space-y-3 mt-3">
                                        {comment.replies.map((reply) => (
                                            <div key={reply.id} className="text-sm">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-medium text-foreground/80">
                                                        {reply.author}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {new Date(reply.date).toLocaleTimeString([], {
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })}
                                                    </span>
                                                </div>
                                                <p className="text-muted-foreground whitespace-pre-wrap break-words">
                                                    {reply.text}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {isExpanded && editingCommentId !== comment.id && (
                                    replyingToId === comment.id ? (
                                        <div className="pt-2 animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
                                            <Textarea
                                                placeholder="Yanıt..."
                                                value={replyText}
                                                onChange={(e) => setReplyText(e.target.value)}
                                                className="min-h-[60px] text-xs resize-none mb-2"
                                                autoFocus
                                            />
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 text-xs"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setReplyingToId(null);
                                                    }}
                                                >
                                                    İptal
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    className="h-7 text-xs"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleReply(comment.id);
                                                    }}
                                                >
                                                    Yanıtla
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 text-xs text-muted-foreground px-0 hover:bg-transparent hover:text-primary w-full justify-start"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setReplyingToId(comment.id);
                                            }}
                                        >
                                            <MaterialIcon icon="reply" size={14} className="mr-1" />
                                            Yanıtla
                                        </Button>
                                    )
                                )}
                            </div>
                        </Card>
                        );
                    })}
                </div>
            </ScrollArea>
        </div>
    );
};

export default CommentPanel;
