import { Extension } from '@tiptap/core';
import type { CommandProps, RawCommands } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
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
                key: new PluginKey('commentHighlight'),
                state: {
                    init() {
                        return DecorationSet.empty;
                    },
                    apply(tr, oldSet) {
                        // Check for meta to update active comment
                        const activeId = tr.getMeta('commentHighlight');

                        // If activeId is provided (string or null), recompute decorations
                        if (activeId !== undefined) {
                            if (activeId === null) return DecorationSet.empty;

                            const decorations: Decoration[] = [];
                            tr.doc.descendants((node, pos) => {
                                const mark = node.marks.find(
                                    (m) => m.type.name === 'comment' && m.attrs.commentId === activeId
                                );
                                if (mark) {
                                    decorations.push(
                                        Decoration.inline(pos, pos + node.nodeSize, {
                                            class: highlightClass,
                                        })
                                    );
                                }
                            });
                            return DecorationSet.create(tr.doc, decorations);
                        }

                        // Otherwise, map existing decorations
                        return oldSet.map(tr.mapping, tr.doc);
                    },
                },
                props: {
                    decorations(state) {
                        return this.getState(state);
                    },
                },
            }),
        ];
    },
});
