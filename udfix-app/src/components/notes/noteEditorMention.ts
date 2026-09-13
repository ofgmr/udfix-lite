import Mention from '@tiptap/extension-mention';
import { mergeAttributes } from '@tiptap/core';
import { DataService } from '../../services/dataService';
import { formatWikiLinkNoteRef, findWikiLinkSuggestionMatch } from '../../utils/wikiLinks';
import { findTagSuggestionMatch } from '../../utils/tagSuggestionMatch';
import { turkishIncludes } from '../../utils/turkishSearch';
import { textTemplateHashSuggestion } from '../editor/textTemplateSuggestion';
import { createUdfixSuggestionRender, type MentionAttrsItem } from './udfixSuggestionRender';
import { findAtMentionSuggestionMatch } from '../../utils/atMentionSuggestionMatch';
import { createDebouncedAtMentionItems } from '../../utils/atMentionItems';

const noopSuggestionRender = () => ({
    onStart: () => {},
    onUpdate: () => {},
    onExit: () => {},
    onKeyDown: () => false,
});

const toSuggestMentionItem = (r: {
    id: string;
    label: string;
    entity_type?: string;
    entityType?: string;
    file_path?: string;
}) => ({
    id: r.id,
    label: r.label,
    entityType: r.entity_type ?? r.entityType ?? 'NOTE',
    filePath: r.file_path,
});

/** Shared mention node attrs + markdown render for editor, export, and plain-text pipelines. */
export function createNoteMentionExtension(options?: { interactive?: boolean }) {
    const interactive = options?.interactive ?? true;

    return Mention.extend({
        addAttributes() {
            return {
                ...this.parent?.(),
                entityType: {
                    default: null,
                    parseHTML: (element) => element.getAttribute('data-entity-type'),
                    renderHTML: (attributes) => {
                        if (!attributes.entityType) return {};
                        return { 'data-entity-type': attributes.entityType };
                    },
                },
                filePath: {
                    default: null,
                    parseHTML: (element) => element.getAttribute('data-file-path'),
                    renderHTML: (attributes) => {
                        if (!attributes.filePath) return {};
                        return { 'data-file-path': attributes.filePath };
                    },
                },
                mentionSuggestionChar: {
                    default: '@',
                    parseHTML: (element) => element.getAttribute('data-mention-char') ?? '@',
                    renderHTML: (attributes) => {
                        if (!attributes.mentionSuggestionChar) return {};
                        return { 'data-mention-char': String(attributes.mentionSuggestionChar) };
                    },
                },
            };
        },
        renderMarkdown: (node) => {
            const label = String(node.attrs?.label ?? node.attrs?.id ?? '').trim();
            const char = String(node.attrs?.mentionSuggestionChar ?? '@');
            return label ? `${char}${label}` : char;
        },
    }).configure({
        HTMLAttributes: {},
        renderText: ({ node, suggestion }) =>
            `${suggestion?.char ?? '@'}${node.attrs.label ?? node.attrs.id}`,
        renderHTML: ({ node, options, suggestion }) => {
            return [
                'span',
                mergeAttributes(
                    {
                        class: 'bg-primary/20 text-primary px-1.5 py-0.5 rounded-md font-medium border border-primary/30 shadow-sm backdrop-blur-md',
                    },
                    options.HTMLAttributes,
                    {
                        'data-type': 'mention',
                        'data-id': node.attrs.id,
                        'data-label': node.attrs.label ?? '',
                        'data-entity-type': node.attrs.entityType ?? '',
                        'data-file-path': node.attrs.filePath ?? '',
                        'data-mention-char': node.attrs.mentionSuggestionChar ?? '@',
                    },
                ),
                `${suggestion?.char ?? '@'}${node.attrs.label ?? node.attrs.id}`,
            ];
        },
        suggestions: interactive
            ? [
                  {
                      char: '@',
                      allowSpaces: true,
                      findSuggestionMatch: findAtMentionSuggestionMatch,
                      items: createDebouncedAtMentionItems(32, 80),
                      command: ({ editor, range, props }) => {
                          const p = props as MentionAttrsItem;
                          const nodeAfter = editor.view.state.selection.$to.nodeAfter;
                          const overrideSpace = nodeAfter?.text?.startsWith(' ');
                          const r = { ...range };
                          if (overrideSpace) r.to += 1;
                          editor
                              .chain()
                              .focus()
                              .insertContentAt(r, [
                                  {
                                      type: 'mention',
                                      attrs: {
                                          id: p.id,
                                          label: p.label,
                                          entityType: p.entityType,
                                          filePath: p.filePath ?? null,
                                          mentionSuggestionChar: '@',
                                      },
                                  },
                                  { type: 'text', text: ' ' },
                              ])
                              .run();
                      },
                      render: () =>
                          createUdfixSuggestionRender() as ReturnType<
                              NonNullable<import('@tiptap/suggestion').SuggestionOptions['render']>
                          >,
                  },
                  {
                      char: '[',
                      allowSpaces: true,
                      findSuggestionMatch: findWikiLinkSuggestionMatch,
                      items: async ({ query }) => {
                          const pack = await DataService.suggestNotesAndEntities(query.trim(), 28);
                          return pack.notes.map(toSuggestMentionItem);
                      },
                      command: ({ editor, range, props }) => {
                          const p = props as MentionAttrsItem;
                          const nodeAfter = editor.view.state.selection.$to.nodeAfter;
                          const overrideSpace = nodeAfter?.text?.startsWith(' ');
                          const r = { ...range };
                          if (overrideSpace) r.to += 1;
                          editor
                              .chain()
                              .focus()
                              .insertContentAt(r, [
                                  {
                                      type: 'wikiNoteLink',
                                      attrs: { id: p.id, label: p.label },
                                  },
                                  { type: 'text', text: ' ' },
                              ])
                              .run();
                      },
                      render: () =>
                          createUdfixSuggestionRender() as ReturnType<
                              NonNullable<import('@tiptap/suggestion').SuggestionOptions['render']>
                          >,
                  },
                  {
                      char: '#',
                      allowSpaces: false,
                      findSuggestionMatch: findTagSuggestionMatch,
                      items: async ({ query }) => {
                          const tags = await DataService.getTags();
                          const q = query.trim();
                          return tags
                              .filter((t) => !q || turkishIncludes(t.name, q))
                              .slice(0, 24)
                              .map((t) => ({
                                  id: t.id,
                                  label: t.name,
                                  entity_type: 'TAG',
                              }));
                      },
                      command: ({ editor, range, props }) => {
                          const p = props as MentionAttrsItem;
                          const tagName = (p.label || p.id).replace(/^#+/, '').trim();
                          if (!tagName) return;
                          const nodeAfter = editor.view.state.selection.$to.nodeAfter;
                          const overrideSpace = nodeAfter?.text?.startsWith(' ');
                          const r = { ...range };
                          if (overrideSpace) r.to += 1;
                          editor.chain().focus().insertContentAt(r, `#${tagName} `).run();
                      },
                      render: () =>
                          createUdfixSuggestionRender() as ReturnType<
                              NonNullable<import('@tiptap/suggestion').SuggestionOptions['render']>
                          >,
                  },
                  { ...textTemplateHashSuggestion } as Omit<
                      import('@tiptap/suggestion').SuggestionOptions,
                      'editor'
                  >,
              ]
            : [],
        suggestion: {
            char: '@',
            items: () => [],
            render: noopSuggestionRender,
        },
    });
}
