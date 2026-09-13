import '@tiptap/core';

declare module '@tiptap/core' {
    interface Storage {
        comment?: {
            comments?: Array<{ id: string; content?: string; text?: string }>;
            commentIds?: string[];
        };
    }
}
