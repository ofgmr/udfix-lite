import { Extension } from '@tiptap/core';
import type { CommandProps, RawCommands } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface CommentHighlightOptions {
    highlightClass: string;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        commentHighlight: {
            setCommentHighlight: (commentId: string | null) => ReturnType;
        };
    }
}

export const commentHighlightKey = new PluginKey<DecorationSet>('commentHighlight');

/** Text uses an inline decoration. Any other marked node, including atoms, uses a node decoration. */
export function commentHighlightDecorations(
    doc: PmNode,
    activeId: string,
    highlightClass: string,
): DecorationSet {
    const decorations: Decoration[] = [];
    doc.descendants((node, pos) => {
        const mark = node.marks.find(
            (candidate) => candidate.type.name === 'comment' && candidate.attrs.commentId === activeId,
        );
        if (!mark) return;
        const to = pos + node.nodeSize;
        if (node.isText) {
            decorations.push(
                Decoration.inline(pos, to, { class: highlightClass }, { udfixKind: 'inline' }),
            );
            return;
        }
        decorations.push(
            Decoration.node(pos, to, { class: highlightClass }, { udfixKind: 'node' }),
        );
    });
    return DecorationSet.create(doc, decorations);
}

export function applyCommentHighlight(
    tr: Transaction,
    oldSet: DecorationSet,
    highlightClass: string,
): DecorationSet {
    const activeId = tr.getMeta('commentHighlight') as string | null | undefined;
    if (activeId !== undefined) {
        if (activeId === null) return DecorationSet.empty;
        return commentHighlightDecorations(tr.doc, activeId, highlightClass);
    }
    return oldSet.map(tr.mapping, tr.doc);
}

export const CommentHighlight = Extension.create<CommentHighlightOptions>({
    name: 'commentHighlight',

    addOptions() {
        return {
            highlightClass: 'comment-active-highlight',
        };
    },

    addCommands() {
        return {
            commentHighlight: {
                setCommentHighlight: (commentId: string | null) => ({ tr, dispatch }: CommandProps) => {
                    if (dispatch) {
                        tr.setMeta('commentHighlight', commentId);
                    }
                    return true;
                },
            },
        } as Partial<RawCommands>;
    },

    addProseMirrorPlugins() {
        const { highlightClass } = this.options;

        return [
            new Plugin({
                key: commentHighlightKey,
                state: {
                    init() {
                        return DecorationSet.empty;
                    },
                    apply(tr, oldSet) {
                        return applyCommentHighlight(tr, oldSet, highlightClass);
                    },
                },
                props: {
                    decorations(state) {
                        return commentHighlightKey.getState(state);
                    },
                },
            }),
        ];
    },
});
