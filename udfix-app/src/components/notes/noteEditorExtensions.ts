import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extension-placeholder';
import type { Extensions } from '@tiptap/core';
import { VariableSlot } from '../../extensions/VariableSlot';
import { WikiLinkDecoration } from '../../extensions/WikiLinkDecoration';
import { WikiNoteLink } from '../../extensions/WikiNoteLink';
import { createMarkdownExtension } from '../../utils/markdownExtensions';
import { getEditorPlaceholderOptions } from '../../utils/editorEmptyPlaceholder';
import { createNoteMentionExtension } from './noteEditorMention';
import { NoteTaskItem } from './NoteTaskItem';

/** Live note editor TipTap extensions (suggestions enabled). */
export function createNoteEditorExtensions(): Extensions {
    return [
        StarterKit.configure({ link: false }),
        Link.configure({
            openOnClick: false,
            HTMLAttributes: {
                class: 'text-primary underline underline-offset-2 cursor-pointer',
            },
        }),
        TaskList,
        NoteTaskItem.configure({ nested: true }),
        Placeholder.configure(getEditorPlaceholderOptions('note')),
        createNoteMentionExtension({ interactive: true }),
        WikiNoteLink,
        VariableSlot,
        WikiLinkDecoration,
        createMarkdownExtension(),
    ];
}

/** Headless / export extension set (no suggestion UI). */
export function createNoteContentExtensions(): Extensions {
    return [
        StarterKit.configure({ link: false }),
        Link.configure({ openOnClick: false }),
        TaskList,
        NoteTaskItem.configure({ nested: true }),
        createNoteMentionExtension({ interactive: false }),
        WikiNoteLink,
        VariableSlot,
        createMarkdownExtension(),
    ];
}
