import { ReactRenderer } from '@tiptap/react';
import type { Editor, Range } from '@tiptap/core';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import {
    DataService,
    type TextTemplateHashSuggestItem,
    type TextTemplateSuggestRow,
} from '../../services/dataService';
import { findTemplateHashSuggestionMatch } from '../../utils/templateSuggestionMatch';
import { normaliseTemplateContentString } from '../../utils/textTemplateContent';
import { injectVariableSlotsInDocJson } from '../../utils/variableSlotInContent';
import type { JSONContent } from '@tiptap/core';
import { TemplateSuggestList, type TemplateSuggestListRef } from './TemplateSuggestList';

export type { TextTemplateSuggestRow, TextTemplateHashSuggestItem } from '../../services/dataService';

const noopSuggestionRender = () => ({
    onStart: () => {},
    onUpdate: () => {},
    onExit: () => {},
    onKeyDown: () => false,
});

/** @ mention tek tetikte kullanılır; çoklu `suggestions` açıkken tiptap boş `suggestion` ister. */
export const emptyPlaceholderSuggestion = {
    char: '@' as const,
    items: () => [],
    render: noopSuggestionRender,
};

export function createTextTemplateSuggestionRender() {
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

    return {
        onStart: (props: {
            editor: Editor;
            items: unknown[];
            clientRect?: (() => DOMRect) | null;
            command: (row: TextTemplateHashSuggestItem) => void;
        }) => {
            teardown();
            component = new ReactRenderer(TemplateSuggestList, {
                editor: props.editor,
                props: {
                    items: props.items as TextTemplateHashSuggestItem[],
                    command: (row: TextTemplateHashSuggestItem) => {
                        props.command(row);
                    },
                },
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
        onUpdate: (props: {
            items: unknown[];
            clientRect?: (() => DOMRect) | null;
            command: (row: TextTemplateHashSuggestItem) => void;
        }) => {
            component?.updateProps({
                items: props.items as TextTemplateHashSuggestItem[],
                command: (row: TextTemplateHashSuggestItem) => {
                    props.command(row);
                },
            });
            if (!props.clientRect) return;
            popup?.[0]?.setProps({
                getReferenceClientRect: props.clientRect as () => DOMRect,
            });
        },
        onKeyDown: (props: { event: KeyboardEvent }) => {
            if (props.event.key === 'Escape') {
                popup?.[0]?.hide();
                return true;
            }
            const r = component?.ref as TemplateSuggestListRef | undefined;
            return r?.onKeyDown(props.event) ?? false;
        },
        onExit: () => {
            teardown();
        },
    };
}

async function textTemplateItems({
    query,
}: {
    query: string;
    editor: Editor;
}): Promise<TextTemplateHashSuggestItem[]> {
    const q = query.trim();
    const [templateRows, noteRows] = await Promise.all([
        DataService.suggestTextTemplates(q, 18),
        DataService.suggestNoteTitles(q, 16),
    ]);
    const templates = (templateRows as TextTemplateSuggestRow[])
        .filter((r) => r && r.id && r.content_json)
        .map((r) => ({ ...r, kind: 'template' as const }));
    const notes = noteRows.map((n) => ({
        kind: 'note' as const,
        id: n.id,
        label: n.label,
    }));
    return [...templates, ...notes];
}

/** Şablon JSON → editöre yapıştırma: yerleşik `{{date}}` vb. çözülür, diğerleri `variableSlot`. */
export function buildInsertedTemplateDoc(contentJson: string): JSONContent {
    const base = normaliseTemplateContentString(contentJson);
    return injectVariableSlotsInDocJson(base, true);
}

/** İmleçte şablon ekle (komut paleti / dış tetikleyiciler). */
export function insertTextTemplateAtCursor(editor: Editor, t: TextTemplateSuggestRow) {
    if (!t?.content_json) return;
    const doc = buildInsertedTemplateDoc(t.content_json);
    void DataService.incrementTextTemplateUsage(t.id);
    editor.chain().focus().insertContent(doc).run();
}

/**
 * `##` tetik metnini siler: şablon → Tiptap `content_json`; not → `mention` (wiki `[` ile aynı hedef, farklı kök).
 */
export function createTextTemplateExpandCommand() {
    return (props: {
        editor: Editor;
        range: Range;
        props: TextTemplateHashSuggestItem | Record<string, unknown>;
    }) => {
        const raw = props.props;
        const { editor, range: r0 } = props;
        const nodeAfter = editor.view.state.selection.$to.nodeAfter;
        const insertRange: Range = { ...r0, to: nodeAfter?.text?.startsWith(' ') ? r0.to + 1 : r0.to };

        if (raw && typeof raw === 'object' && 'kind' in raw && (raw as { kind: string }).kind === 'note') {
            const n = raw as { kind: 'note'; id: string; label: string };
            editor
                .chain()
                .focus()
                .insertContentAt(insertRange, [
                    {
                        type: 'mention',
                        attrs: {
                            id: n.id,
                            label: n.label,
                            entityType: 'NOTE',
                            filePath: null,
                            mentionSuggestionChar: '##',
                        },
                    },
                    { type: 'text', text: ' ' },
                ])
                .run();
            return;
        }

        const t = raw as TextTemplateSuggestRow & { kind?: string };
        if (t.kind !== 'template' || !t.content_json) return;
        const doc = buildInsertedTemplateDoc(t.content_json);
        void DataService.incrementTextTemplateUsage(t.id);
        editor.chain().focus().insertContentAt(insertRange, doc).run();
    };
}

/**
 * Tiptap Mention `suggestions` dizisine eklenecek `##` bloğu.
 * `char` tiptap içinde 2 karakter; `findSuggestionMatch` asıl eşleşmeyi sağlar.
 *
 * Ayrım: `@` → dava, taraf, evrak, bilgi bankası, dosya yolu (not yok; notlar `##` veya wiki `[`).
 * `##` → metin şablonları + notlar (şablon: `content_json` genişletme; not: `NOTE` mention).
 */
export const textTemplateHashSuggestion = {
    char: '##',
    allowSpaces: true,
    findSuggestionMatch: findTemplateHashSuggestionMatch,
    allow: (opts: { state: import('@tiptap/pm/state').EditorState; range: Range }) => {
        const { state, range } = opts;
        const $from = state.doc.resolve(range.from);
        return $from.parent.isTextblock;
    },
    items: textTemplateItems,
    command: createTextTemplateExpandCommand(),
    render: createTextTemplateSuggestionRender,
};
