import Comment from '@sereneinserenade/tiptap-comment-extension';

/** Document-editor comment mark. Payload rides along so a pasted comment can be restored. */
export const UdfixComment = Comment.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            commentPayload: {
                default: null,
                parseHTML: (element: HTMLElement) => element.getAttribute('data-comment-payload'),
                renderHTML: (attributes: { commentPayload?: string | null }) =>
                    attributes.commentPayload
                        ? { 'data-comment-payload': attributes.commentPayload }
                        : {},
            },
        };
    },
    parseHTML() {
        return [
            {
                tag: 'span[data-comment-id]',
                getAttrs: (el: HTMLElement | string) => {
                    if (typeof el === 'string') return false;
                    const commentId = el.getAttribute('data-comment-id')?.trim();
                    if (!commentId) return false;
                    return {
                        commentId,
                        commentPayload: el.getAttribute('data-comment-payload'),
                    };
                },
            },
        ];
    },
});
