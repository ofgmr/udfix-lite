import { ReactRenderer } from '@tiptap/react';
import type { Editor, Range } from '@tiptap/core';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import {
    UdfixMentionList,
    isUdfixMentionItem,
    mentionEntityType,
    type UdfixMentionItem,
    type UdfixMentionListRef,
} from './UdfixMentionList';

export type MentionAttrsItem = {
    id: string;
    label: string;
    entityType: string;
    filePath?: string;
};

export function createUdfixSuggestionRender() {
    let component: ReactRenderer | null = null;
    let popup: TippyInstance[] | null = null;
    let cleaned = false;

    const teardown = () => {
        if (cleaned) return;
        cleaned = true;
        try {
            popup?.[0]?.destroy();
        } catch {
            /* noop */
        }
        popup = null;
        try {
            component?.destroy();
        } catch {
            /* noop */
        }
        component = null;
    };

    type MentionSuggestRenderProps = {
        editor: Editor;
        range: Range;
        query: string;
        items: unknown[];
        clientRect?: (() => DOMRect | null) | null;
        command: (p: MentionAttrsItem) => void;
    };

    const plainInserter = (editor: Editor, range: Range) => (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        editor.chain().focus().insertContentAt(range, trimmed).run();
        teardown();
    };

    const listProps = (props: MentionSuggestRenderProps) => ({
        items: (Array.isArray(props.items) ? props.items : []).filter(isUdfixMentionItem),
        suggestionQuery: props.query,
        command: (item: UdfixMentionItem) => {
            if (!item?.id) return;
            props.command({
                id: item.id,
                label: item.label,
                entityType: mentionEntityType(item),
                filePath: (item as MentionAttrsItem).filePath,
            });
        },
        insertPlainAtMention: plainInserter(props.editor, props.range),
    });

    return {
        onStart: (props: MentionSuggestRenderProps) => {
            try {
                popup?.[0]?.destroy();
            } catch {
                /* noop */
            }
            try {
                component?.destroy();
            } catch {
                /* noop */
            }
            popup = null;
            component = null;
            cleaned = false;
            component = new ReactRenderer(UdfixMentionList, {
                editor: props.editor,
                props: listProps(props),
            });

            if (!props.clientRect) return;

            popup = tippy('body', {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
            });
        },
        onUpdate(props: MentionSuggestRenderProps) {
            component?.updateProps(listProps(props));
            if (!props.clientRect) return;
            popup?.[0]?.setProps({
                getReferenceClientRect: props.clientRect as () => DOMRect,
            });
        },
        onKeyDown(props: { event: KeyboardEvent }) {
            if (props.event.key === 'Escape') {
                try {
                    popup?.[0]?.hide();
                } catch {
                    /* noop */
                }
                return true;
            }
            const ref = component?.ref as UdfixMentionListRef | undefined;
            return ref?.onKeyDown(props.event) ?? false;
        },
        onExit() {
            teardown();
        },
    };
}
