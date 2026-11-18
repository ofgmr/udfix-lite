import { TablePlus } from 'tiptap-table-plus'
import { TableCommandExtension } from 'tiptap-table-plus/dist/TableCommandExtension.js'
import { TablePlusNodeView } from 'tiptap-table-plus/dist/pagination/TablePlusNodeView.js'
import type { Node as PmNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/core'
import { tableEditing, mergeCells, splitCell, CellSelection } from '@tiptap/pm/tables'
import { UdfixTableRowGroup } from './UdfixTableRowGroup'
import { createDragFrame, type DragFrame } from '../utils/dragFrame'

export { CellSelection }

/** Sync border attrs to the real DOM table (TablePlus uses a custom node view). */
class UdfixTableNodeView extends TablePlusNodeView {
    declare contentDOM: HTMLTableElement
    private columnDrag: DragFrame<number[]>

    constructor(node: PmNode, getPos: () => number | undefined, editor: Editor, options: Record<string, unknown>) {
        super(node, getPos, editor, options)
        this.columnDrag = createDragFrame((values) => {
            this.commitColumnSizes(values, false)
        })
        this.applyBorderStyles(node)
    }

    /**
     * TablePlus writes column CSS on every mousemove and the node on mouseup.
     * CSS updates share one animation frame. mouseup still commits the final widths.
     */
    updateValues(values: number[], updateNode = false): void {
        if (updateNode) {
            const pending = this.columnDrag.flush()
            this.commitColumnSizes(pending ?? values, true)
            return
        }
        this.columnDrag.push(values)
    }

    private commitColumnSizes(values: number[], updateNode: boolean): void {
        const proto = TablePlusNodeView.prototype as unknown as {
            updateValues: (values: number[], updateNode?: boolean) => void
        }
        proto.updateValues.call(this, values, updateNode)
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

    addExtensions() {
        const inherited = (this.parent?.() ?? []).filter(
            (ext) => ext.name !== 'tableRowGroup' && ext.name !== 'tableCommandExtension',
        )
        return [UdfixTableRowGroup, ...inherited, TableCommandExtension]
    },

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
            tableName: {
                default: null,
                parseHTML: (element: HTMLElement) => element.getAttribute('data-uyap-table-name'),
                renderHTML: (attributes: Record<string, unknown>) => {
                    const v = attributes.tableName;
                    if (typeof v !== 'string' || !v.trim()) return {};
                    return { 'data-uyap-table-name': v };
                },
            },
            columnSpans: {
                default: null,
                parseHTML: (element: HTMLElement) => element.getAttribute('data-uyap-column-spans'),
                renderHTML: (attributes: Record<string, unknown>) => {
                    const v = attributes.columnSpans;
                    if (typeof v !== 'string' || !v.trim()) return {};
                    return { 'data-uyap-column-spans': v };
                },
            },
            border: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-uyap-border') === 'none' ||
                    element.classList.contains('uyap-border-none')
                        ? 'borderNone'
                        : element.getAttribute('data-uyap-border'),
                renderHTML: (attributes: Record<string, unknown>) => {
                    if (attributes.border === 'borderNone') return { 'data-uyap-border': 'none' };
                    return {};
                },
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
            mergeCells: () => ({ state, dispatch }) => mergeCells(state, dispatch),
            splitCell: () => ({ state, dispatch }) => splitCell(state, dispatch),
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
