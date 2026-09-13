import StarterKit from '@tiptap/starter-kit'
import { TextAlign } from '@tiptap/extension-text-align'
import { FontFamily } from '@tiptap/extension-font-family'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Highlight } from '@tiptap/extension-highlight'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { TableRowPlus, TableHeaderPlus, TableCellPlus } from 'tiptap-table-plus'
import { ImageExtension } from '../../extensions/ImageExtension'
import { CharacterCount } from '@tiptap/extension-character-count'
import { Typography } from '@tiptap/extension-typography'
import { Placeholder } from '@tiptap/extension-placeholder'
import { getEditorPlaceholderOptions } from '../../utils/editorEmptyPlaceholder'
import { BubbleMenu as BubbleMenuExtension } from '@tiptap/extension-bubble-menu'
import { FileHandler } from '@tiptap/extension-file-handler'
import Comment from '@sereneinserenade/tiptap-comment-extension'
import { CommentHighlight } from '../../extensions/CommentHighlight'
import {
    EDITOR_PAGE_HEIGHT_PX,
    EDITOR_PAGE_MARGIN_LEFT_PX,
    EDITOR_PAGE_MARGIN_RIGHT_PX,
    EDITOR_PAGE_WIDTH_PX,
    EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX,
    EDITOR_PAGINATION_CONTENT_MARGIN_BASE_PX,
} from '../../utils/editorLayout'
import { FontSize } from '../../extensions/FontSize'
import { PageBreak } from '../../extensions/PageBreak'
import { SectionBreakInsert } from '../../extensions/SectionBreakInsert'
import { SectionRegistry } from '../../extensions/SectionRegistry'
import { BreakShortcuts } from '../../extensions/BreakShortcuts'
import Mention, { type MentionNodeAttrs } from '@tiptap/extension-mention'
import { mergeAttributes, type Extensions } from '@tiptap/core'
import { PaginationPlus } from 'tiptap-pagination-plus'
import { Search } from '../../extensions/Search'
import TableOfContents from '@tiptap/extension-table-of-contents'
import { LineHeight } from '../../extensions/LineHeight'
import { Indent } from '../../extensions/Indent'
import { SmartIndent } from '../../extensions/SmartIndent'
import { ExtendedOrderedList } from '../../extensions/ExtendedOrderedList'
import { ExtendedListItem } from '../../extensions/ExtendedListItem'
import { FootnoteExtension } from '../../extensions/FootnoteExtension'
import { ParagraphOptions } from '../../extensions/ParagraphOptions'
import { CustomParagraph, CustomHeading } from '../../extensions/CustomNodes'
import atMentionSuggestion from './suggestion'
import { findAtMentionSuggestionMatch } from '../../utils/atMentionSuggestionMatch'
import { createDebouncedAtMentionItems } from '../../utils/atMentionItems'
import { emptyPlaceholderSuggestion, textTemplateHashSuggestion } from './textTemplateSuggestion'
import { ListMarkerFormat } from '../../extensions/ListMarkerFormat'
import { ParagraphStyleShortcuts } from '../../extensions/ParagraphStyleShortcuts'
import { compileHfHtml } from '../../utils/compileHfHtml'
import { UdfixTable } from '@/extensions/UdfixTable'
import { VariableSlot } from '../../extensions/VariableSlot'
import { useHeaderFooterStore } from '../../stores/useHeaderFooterStore'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import Strike from '@tiptap/extension-strike'
import Underline from '@tiptap/extension-underline'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { createMarkdownExtension } from '../../utils/markdownExtensions'

export const UdfixMention = Mention.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            entityType: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-entity-type'),
                renderHTML: (attributes) => (attributes.entityType ? { 'data-entity-type': attributes.entityType } : {}),
            },
            filePath: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-file-path'),
                renderHTML: (attributes) => (attributes.filePath ? { 'data-file-path': attributes.filePath } : {}),
            },
        };
    },
    renderMarkdown: (node) => {
        const label = String(node.attrs?.label ?? node.attrs?.id ?? '').trim();
        const char = String(node.attrs?.mentionSuggestionChar ?? '@');
        return label ? `${char}${label}` : char;
    },
}).configure({
    renderText: ({ node, suggestion }) =>
        `${suggestion?.char ?? '@'}${node.attrs.label ?? node.attrs.id}`,
    renderHTML: ({ node, options, suggestion }) => {
        return [
            'span',
            mergeAttributes(
                {
                    class:
                        'mention inline align-baseline rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0 font-medium leading-[1.25] text-primary',
                },
                options.HTMLAttributes,
                {
                    'data-type': 'mention',
                    'data-id': node.attrs.id,
                    'data-label': node.attrs.label ?? '',
                    'data-entity-type': node.attrs.entityType ?? '',
                    'data-file-path': node.attrs.filePath ?? '',
                }
            ),
            `${suggestion?.char ?? '@'}${node.attrs.label ?? node.attrs.id}`,
        ];
    },
});

function getInitialHfState(documentId: string): unknown {
    try {
        const raw = localStorage.getItem(`nomai-hf-${documentId}`);
        if (raw) return JSON.parse(raw);
    } catch {
        return null;
    }
    return null;
}

/**
 * Build TipTap extensions for a document. Call inside `useMemo(..., [documentId])` only —
 * do not depend on live HF store updates or the editor will be recreated on every HF edit.
 */
export function createUdfixEditorExtensions(documentId: string): Extensions {
    const store = useHeaderFooterStore.getState();
    const savedHf = getInitialHfState(documentId) as {
        settings?: typeof store.settings;
        sections?: typeof store.sections;
    } | null;
    const initSettings = savedHf?.settings || store.settings;
    const initSections = savedHf?.sections || store.sections;

    const initDefaultHeader = compileHfHtml({
        left: initSections.default.headerLeft,
        center: initSections.default.headerCenter,
        right: initSections.default.headerRight,
        layout: initSettings.headerLayout,
        dateFormat: initSettings.dateFormat,
        docTitle: 'Untitled Document',
        isHeader: true,
    });

    const initDefaultFooter = compileHfHtml({
        left: initSections.default.footerLeft,
        center: initSections.default.footerCenter,
        right: initSections.default.footerRight,
        layout: initSettings.footerLayout,
        dateFormat: initSettings.dateFormat,
        docTitle: 'Untitled Document',
        isHeader: false,
    });

    return [
        StarterKit.configure({
            link: {
                openOnClick: false,
            },
            orderedList: false,
            listItem: false,
            paragraph: false,
            heading: false,
            bold: false,
            italic: false,
            underline: false,
            strike: false,
        }),
        Bold,
        Italic,
        Underline,
        Strike,
        CustomParagraph,
        CustomHeading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
        ExtendedListItem,
        ExtendedOrderedList,
        SmartIndent,
        TextStyle,
        Color,
        FontFamily,
        FontSize,
        ParagraphOptions,
        TextAlign.configure({
            types: ['heading', 'paragraph'],
        }),
        Highlight.configure({ multicolor: true }),
        Subscript,
        Superscript,
        TaskList,
        TaskItem.configure({
            nested: true,
        }),
        UdfixTable.configure({
            resizable: true,
        }),
        TableRowPlus,
        TableHeaderPlus,
        TableCellPlus,
        ImageExtension,
        PageBreak,
        SectionBreakInsert,
        SectionRegistry,
        BreakShortcuts,
        Search.configure({
            searchTerm: '',
            decorationClass: 'search-result',
            activeDecorationClass: 'search-result-active',
        }),
        TableOfContents,
        PaginationPlus.configure({
            pageHeight: EDITOR_PAGE_HEIGHT_PX,
            pageWidth: EDITOR_PAGE_WIDTH_PX,
            headerLeft: initDefaultHeader,
            headerRight: '',
            footerLeft: initDefaultFooter,
            footerRight: '',
            customHeader: {},
            customFooter: {},
            marginTop: EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX + (initSettings.headerMarginTop || 0),
            marginBottom:
                EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX + (initSettings.footerMarginBottom || 0),
            marginLeft: EDITOR_PAGE_MARGIN_LEFT_PX,
            marginRight: EDITOR_PAGE_MARGIN_RIGHT_PX,
            contentMarginTop: EDITOR_PAGINATION_CONTENT_MARGIN_BASE_PX,
            contentMarginBottom: EDITOR_PAGINATION_CONTENT_MARGIN_BASE_PX,
        }),
        Indent,
        ListMarkerFormat,
        ParagraphStyleShortcuts,
        LineHeight,
        FootnoteExtension,
        CharacterCount,
        VariableSlot,
        Typography,
        Placeholder.configure(getEditorPlaceholderOptions('document')),
        BubbleMenuExtension,
        FileHandler.configure({
            allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'],
            onDrop: (currentEditor, files, pos) => {
                files.forEach((file) => {
                    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return;
                    const fileReader = new FileReader();
                    fileReader.readAsDataURL(file);
                    fileReader.onload = () => {
                        currentEditor.chain().insertContentAt(pos, {
                            type: 'image',
                            attrs: {
                                src: fileReader.result,
                            },
                        }).focus().run();
                    };
                });
            },
            onPaste: (currentEditor, files, htmlContent) => {
                files.forEach((file) => {
                    if (htmlContent) {
                        return false;
                    }
                    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return;

                    const fileReader = new FileReader();
                    fileReader.readAsDataURL(file);
                    fileReader.onload = () => {
                        currentEditor.chain().insertContentAt(currentEditor.state.selection.anchor, {
                            type: 'image',
                            attrs: {
                                src: fileReader.result,
                            },
                        }).focus().run();
                    };
                });
            },
        }),
        Comment.configure({
            HTMLAttributes: {
                class: 'comment-highlight',
            },
        }),
        CommentHighlight,
        UdfixMention.configure({
            HTMLAttributes: {
                class: 'mention',
            },
            suggestions: [
                {
                    char: '@',
                    allowSpaces: true,
                    findSuggestionMatch: findAtMentionSuggestionMatch,
                    items: createDebouncedAtMentionItems(36, 80),
                    render: atMentionSuggestion.render as NonNullable<
                        import('@tiptap/suggestion').SuggestionOptions['render']
                    >,
                    command: ({
                        editor: currentEditor,
                        range,
                        props,
                    }: {
                        editor: import('@tiptap/core').Editor;
                        range: import('@tiptap/core').Range;
                        props: MentionNodeAttrs;
                    }) => {
                        const attrs = props as MentionNodeAttrs & { entityType?: string; filePath?: string | null };
                        const nodeAfter = currentEditor.view.state.selection.$to.nodeAfter;
                        const overrideSpace = nodeAfter?.text?.startsWith(' ');
                        const r = { ...range };
                        if (overrideSpace) r.to += 1;
                        currentEditor
                            .chain()
                            .focus()
                            .insertContentAt(r, [
                                {
                                    type: 'mention',
                                    attrs: {
                                        id: attrs.id,
                                        label: attrs.label,
                                        entityType: attrs.entityType,
                                        filePath: attrs.filePath ?? null,
                                        mentionSuggestionChar: '@',
                                    },
                                },
                                { type: 'text', text: ' ' },
                            ])
                            .run();
                    },
                },
                { ...textTemplateHashSuggestion } as Omit<
                    import('@tiptap/suggestion').SuggestionOptions,
                    'editor'
                >,
            ],
            suggestion: emptyPlaceholderSuggestion,
        }),
        createMarkdownExtension(),
    ];
}
