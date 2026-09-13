import { Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import type { Node as PmNode } from '@tiptap/pm/model';

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        variableSlot: {
            goToNextVariableSlot: () => ReturnType;
            goToPreviousVariableSlot: () => ReturnType;
        };
    }
}

/**
 * Şablon değişkeni: `{{anahtar}}` metinden dönüştürülür; Tab / Shift+Tab ile sırayla seçilir.
 */
export const VariableSlot = Node.create({
    name: 'variableSlot',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,
    priority: 102,

    addAttributes() {
        return {
            key: {
                default: '',
                parseHTML: (el) => el.getAttribute('data-variable-key') ?? '',
                renderHTML: (attrs) => (attrs.key ? { 'data-variable-key': String(attrs.key) } : {}),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-variable-slot="1"]' }];
    },

    renderHTML({ node, HTMLAttributes }) {
        const k = String(node.attrs.key ?? '');
        return [
            'span',
            mergeAttributes(HTMLAttributes, {
                'data-variable-slot': '1',
                'data-variable-key': k,
                class:
                    'nomai-variable-slot inline rounded border border-amber-500/35 bg-amber-500/15 px-1 py-0 text-[0.9em] font-medium text-amber-200',
            }),
            k ? `{{${k}}}` : '{{}}',
        ];
    },

    renderMarkdown: (node) => {
        const k = String(node.attrs?.key ?? '').trim();
        return k ? `{{${k}}}` : '{{}}';
    },

    addCommands() {
        return {
            goToNextVariableSlot:
                () =>
                ({ state, dispatch, tr }: CommandProps) => {
                    let start = state.selection.from;
                    if (state.selection instanceof NodeSelection && state.selection.node.type.name === 'variableSlot') {
                        start = state.selection.to;
                    }
                    let hit: number | null = null;
                    state.doc.nodesBetween(start, state.doc.content.size, (node: PmNode, pos: number) => {
                        if (node.type.name === 'variableSlot') {
                            hit = pos;
                            return false;
                        }
                    });
                    if (hit == null) return false;
                    if (dispatch) {
                        dispatch(tr.setSelection(NodeSelection.create(state.doc, hit)).scrollIntoView());
                    }
                    return true;
                },
            goToPreviousVariableSlot:
                () =>
                ({ state, dispatch, tr }: CommandProps) => {
                    const anchor = state.selection.from;
                    let last: number | null = null;
                    state.doc.descendants((node: PmNode, pos: number) => {
                        if (node.type.name === 'variableSlot' && pos < anchor) {
                            last = pos;
                        }
                    });
                    if (last == null) return false;
                    if (dispatch) {
                        dispatch(tr.setSelection(NodeSelection.create(state.doc, last)).scrollIntoView());
                    }
                    return true;
                },
        };
    },

    addKeyboardShortcuts() {
        return {
            Tab: () => {
                const ok = this.editor.commands.goToNextVariableSlot();
                return ok;
            },
            'Shift-Tab': () => {
                const ok = this.editor.commands.goToPreviousVariableSlot();
                return ok;
            },
        };
    },
});
