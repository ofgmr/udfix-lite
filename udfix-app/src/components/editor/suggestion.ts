import type { Editor, Range } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import {
    UdfixMentionList,
    isUdfixMentionItem,
    mentionEntityType,
    type UdfixMentionItem,
    type UdfixMentionListRef,
} from '../notes/UdfixMentionList';

type MentionAttrsItem = {
    id: string;
    label: string;
    entityType: string;
    filePath?: string;
};

function createUdfixSuggestionRender() {
    let component: ReactRenderer | null = null;
    let popup: TippyInstance[] | null = null;

    const teardown = () => {
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

    type SuggestRenderProps = {
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

    const listProps = (props: SuggestRenderProps) => ({
        items: (Array.isArray(props.items) ? props.items : []).filter(isUdfixMentionItem),
        suggestionQuery: props.query,
        command: (item: UdfixMentionItem) => {
            if (!item?.id) return;
            const typed = item as MentionAttrsItem;
            props.command({
                id: item.id,
                label: item.label,
                entityType: mentionEntityType(item),
                filePath: typed.filePath,
            });
        },
        insertPlainAtMention: plainInserter(props.editor, props.range),
    });

    return {
        onStart: (props: SuggestRenderProps) => {
            teardown();
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
        onUpdate(props: SuggestRenderProps) {
            component?.updateProps(listProps(props));
            if (!props.clientRect) return;
            popup?.[0]?.setProps({
                getReferenceClientRect: props.clientRect as () => DOMRect,
            });
        },
        onKeyDown(props: { event: KeyboardEvent }) {
            if (props.event.key === 'Escape') {
                popup?.[0]?.hide();
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

export default {
    render: createUdfixSuggestionRender as () => ReturnType<
        NonNullable<import('@tiptap/suggestion').SuggestionOptions['render']>
    >,
};
