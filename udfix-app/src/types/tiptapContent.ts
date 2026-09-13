import type { JSONContent } from '@tiptap/core';

export type { JSONContent };

export type TipTapMark = {
    type: string;
    attrs?: Record<string, unknown>;
};

export type TipTapJsonNode = JSONContent;
