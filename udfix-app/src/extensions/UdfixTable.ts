import { TablePlus } from 'tiptap-table-plus'
import { TablePlusNodeView } from 'tiptap-table-plus/dist/pagination/TablePlusNodeView.js'
import type { Node as PmNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/core'
import { tableEditing, mergeCells, splitCell } from '@tiptap/pm/tables'

/** Sync border attrs to the real DOM table (TablePlus uses a custom node view). */
class UdfixTableNodeView extends TablePlusNodeView {
    declare contentDOM: HTMLTableElement

    constructor(node: PmNode, getPos: () => number | undefined, editor: Editor, options: Record<string, unknown>) {
        super(node, getPos, editor, options)
        this.applyBorderStyles(node)
    }

    update(node: PmNode): boolean {
        const ok = super.update(node)
        this.applyBorderStyles(node)
        return ok
    }

    private applyBorderStyles(node: PmNode): void {
        const attrs = node.attrs as { borderWidth?: string; borderStyle?: string; border?: string }
        const bw = attrs.borderWidth != null ? String(attrs.borderWidth) : '1'
        const bs = attrs.borderStyle != null ? String(attrs.borderStyle) : 'solid'
        const table = this.contentDOM
        if (!table) return
        table.style.setProperty('--table-border-width', `${bw}px`)
        table.style.setProperty('--table-border-style', bs)
        this.dom.style.setProperty('--table-border-width', `${bw}px`)
        this.dom.style.setProperty('--table-border-style', bs)
        const borderless = bw === '0' || attrs.border === 'borderNone' || bs === 'none'
        table.classList.toggle('uyap-border-none', borderless)
        if (borderless) table.setAttribute('data-uyap-border', 'none')
        else table.removeAttribute('data-uyap-border')
    }
}

export const UdfixTable = TablePlus.extend({
    name: 'table',

    addOptions() {
        const parentOpts = this.parent?.() || {}
        return {
            ...parentOpts,
            resizable: true,
            handleWidth: 0,
            cellMinWidth: 25,
            lastColumnResizable: true,
            HTMLAttributes: {},
        } as ReturnType<NonNullable<typeof this.parent>>
    },

    addAttributes() {
        return {
            ...this.parent?.(),
            borderWidth: {
                default: '1',
                parseHTML: element => {
                    if (
                        element.getAttribute('data-uyap-border') === 'none' ||
                        element.classList.contains('uyap-border-none')
                    ) {
                        return '0';
                    }
                    const val = element.style.getPropertyValue('--table-border-width');
                    return val ? val.replace('px', '').trim() : '1';
                },
                // Always emit both vars here — borderStyle also has renderHTML; two `style` keys would overwrite.
                renderHTML: attributes => {
                    const bw = attributes.borderWidth != null ? String(attributes.borderWidth) : '1';
                    const bs = attributes.borderStyle != null ? String(attributes.borderStyle) : 'solid';
                    return { style: `--table-border-width: ${bw}px; --table-border-style: ${bs};` };
                },
            },
            borderStyle: {
                default: 'solid',
                parseHTML: element => {
                    if (
                        element.getAttribute('data-uyap-border') === 'none' ||
                        element.classList.contains('uyap-border-none')
                    ) {
                        return 'none';
                    }
                    const val = element.style.getPropertyValue('--table-border-style');
                    return val ? val.trim() : 'solid';
                },
                renderHTML: () => ({}),
            },
        }
    },

    addNodeView() {
        return (props: { node: PmNode; editor: Editor; getPos: () => number | undefined }) =>
            new UdfixTableNodeView(props.node, props.getPos, props.editor, this.options as unknown as Record<string, unknown>)
    },

    addCommands() {
        return {
            ...this.parent?.(),
            mergeCells: () => ({ state, dispatch, editor }) => {
                const result = mergeCells(state, dispatch)
                if (result && dispatch && editor && editor.view) {
                    setTimeout(() => {
                        editor.view.updateState(editor.view.state)
                    }, 0)
                }
                return result
            },
            splitCell: () => ({ state, dispatch, editor }) => {
                const result = splitCell(state, dispatch)
                if (result && dispatch && editor && editor.view) {
                    setTimeout(() => {
                        editor.view.updateState(editor.view.state)
                    }, 0)
                }
                return result
            },
        }
    },

    addProseMirrorPlugins() {
        const parentPlugins = this.parent?.() || []

        return [
            ...parentPlugins,
            tableEditing({
                allowTableNodeSelection: this.options.allowTableNodeSelection || false,
            }),
        ]
    },
})
