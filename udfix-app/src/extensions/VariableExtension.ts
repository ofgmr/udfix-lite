import { mergeAttributes, Node } from '@tiptap/core';

export interface VariableOptions {
    HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        variable: {
            /**
             * Insert a variable node
             */
            setVariable: (options: { id: string; label: string }) => ReturnType;
        };
    }
}

/** Chip text is the compile token. Stored labels like `#` / `##` are not page fields. */
function hfVariableTokenLabel(id: string, label: unknown): string {
    switch (id) {
        case 'page':
            return '{page}';
        case 'total':
        case 'totalPages':
            return '{totalPages}';
        case 'date':
            return '{date}';
        case 'title':
            return '{title}';
        default:
            return (typeof label === 'string' && label.trim()) || id || '?';
    }
}

export const VariableExtension = Node.create<VariableOptions>({
    name: 'variable',
    group: 'inline',
    inline: true,
    selectable: true,
    atom: true, // Acts as a single unit, cannot be partially deleted

    addOptions() {
        return {
            HTMLAttributes: {
                class: 'hf-variable-node',
            },
        };
    },

    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => {
                    if (!attributes.id) return {};
                    return { 'data-id': attributes.id };
                },
            },
            label: {
                default: null,
                parseHTML: element => element.getAttribute('data-label'),
                renderHTML: attributes => {
                    if (!attributes.label) return {};
                    return { 'data-label': attributes.label };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-type="variable"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        // atom nodes must NOT have a 3rd child in renderHTML — it crashes ProseMirror's
        // renderSpec when serialising. All visible content is handled by addNodeView.
        return [
            'span',
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
                'data-type': 'variable',
            }),
        ];
    },

    addNodeView() {
        return ({ node }) => {
            const dom = document.createElement('span');
            const id = String(node.attrs.id ?? '');
            dom.className = 'hf-variable-node';
            dom.setAttribute('data-type', 'variable');
            dom.setAttribute('data-id', id);
            dom.setAttribute('data-label', node.attrs.label ?? '');
            dom.contentEditable = 'false';
            dom.textContent = hfVariableTokenLabel(id, node.attrs.label);
            return { dom };
        };
    },

    addCommands() {
        return {
            setVariable:
                ({ id, label }) =>
                    ({ chain }) => {
                        return chain()
                            .insertContent({
                                type: this.name,
                                attrs: { id, label },
                            })
                            .run();
                    },
        };
    },
});
