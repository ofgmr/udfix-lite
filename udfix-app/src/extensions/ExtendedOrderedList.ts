import OrderedList from '@tiptap/extension-ordered-list'
import { mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey, NodeSelection, Selection } from '@tiptap/pm/state'
import type { Node as PmNode } from '@tiptap/pm/model'
import { EditorView } from '@tiptap/pm/view'
import { isListMarkerClick } from '../utils/listItemMarkerSelection'

export type ListStyleType = 'default' | 'legal' | 'roman' | 'paren' | 'outline'

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        extendedOrderedList: {
            setListStyle: (style: ListStyleType) => ReturnType
            restartNumbering: () => ReturnType
            setStartNumber: (start: number) => ReturnType
            continueNumbering: () => ReturnType
        }
    }
}

/**
 * Find closest orderedList from current selection (supports text + node selections).
 */
function findListNodeFromSelection(selection: Selection, doc: PmNode, nodeName: string) {
    if (selection instanceof NodeSelection) {
        if (selection.node.type.name === nodeName) {
            return { pos: selection.from, depth: selection.$from.depth + 1 }
        }
        if (selection.node.type.name === 'listItem') {
            const start = selection.$from.pos
            const end = Math.min(selection.$to.pos + selection.node.nodeSize, doc.content.size)
            let foundPos = -1
            doc.nodesBetween(start, end, (node: PmNode, pos: number) => {
                if (foundPos !== -1) return false
                if (node.type.name === nodeName) {
                    foundPos = pos
                    return false
                }
                return true
            })
            if (foundPos !== -1) {
                return { pos: foundPos, depth: selection.$from.depth + 1 }
            }
        }
    }

    const $from = selection.$from
    let depth = $from.depth
    while (depth > 0) {
        const node = $from.node(depth)
        if (node.type.name === nodeName) {
            return { pos: $from.before(depth), depth }
        }
        depth--
    }
    return null
}

/**
 * Helper: find the preceding list of a given node
 */
function findPreviousList(doc: PmNode, startPos: number, listName: string) {
    let resolvePos = startPos
    while (resolvePos > 0) {
        const $pos = doc.resolve(resolvePos)
        const nodeBefore = $pos.nodeBefore
        if (nodeBefore) {
            if (nodeBefore.type.name === listName) {
                return nodeBefore
            }
            resolvePos = resolvePos - nodeBefore.nodeSize
        } else {
            if ($pos.depth === 0) break
            resolvePos = $pos.before()
        }
    }
    return null
}

export const ExtendedOrderedList = OrderedList.extend({
    name: 'orderedList', // Overwrite the default orderedList

    addAttributes() {
        return {
            ...this.parent?.(),
            listTypeName: {
                default: 'default',
                parseHTML: (element: HTMLElement) => element.getAttribute('data-list-type') || 'default',
            },
            start: {
                default: 1,
                parseHTML: element => {
                    return element.hasAttribute('start')
                        ? parseInt(element.getAttribute('start') || '1', 10)
                        : 1
                },
            },
        }
    },

    renderHTML({ HTMLAttributes }) {
        const start = HTMLAttributes.start || 1
        return [
            'ol',
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
                'data-list-type': HTMLAttributes.listTypeName || 'default',
                style: `--start: ${start - 1};`,
            }),
            0,
        ]
    },

    addCommands() {
        return {
            ...this.parent?.(),

            setListStyle:
                (style: ListStyleType) =>
                    ({ tr, dispatch }) => {
                        const foundFromSelection = findListNodeFromSelection(tr.selection, tr.doc, this.name)
                        if (!foundFromSelection) return false

                        if (dispatch) {
                            const listNode = tr.doc.nodeAt(foundFromSelection.pos)
                            if (listNode) {
                                tr.setNodeMarkup(foundFromSelection.pos, undefined, {
                                    ...listNode.attrs,
                                    listTypeName: style,
                                })
                            }
                        }
                        return true
                    },

            restartNumbering:
                () =>
                    ({ tr, dispatch }) => {
                        const foundFromSelection = findListNodeFromSelection(tr.selection, tr.doc, this.name)
                        if (!foundFromSelection) return false

                        if (dispatch) {
                            const listNode = tr.doc.nodeAt(foundFromSelection.pos)
                            if (listNode) {
                                tr.setNodeMarkup(foundFromSelection.pos, undefined, {
                                    ...listNode.attrs,
                                    start: 1,
                                })
                            }
                        }
                        return true
                    },

            setStartNumber:
                (start: number) =>
                    ({ tr, dispatch }) => {
                        const foundFromSelection = findListNodeFromSelection(tr.selection, tr.doc, this.name)
                        if (!foundFromSelection) return false

                        if (dispatch) {
                            const listNode = tr.doc.nodeAt(foundFromSelection.pos)
                            if (listNode) {
                                tr.setNodeMarkup(foundFromSelection.pos, undefined, {
                                    ...listNode.attrs,
                                    start,
                                })
                            }
                        }
                        return true
                    },

            continueNumbering:
                () =>
                    ({ tr, dispatch }) => {
                        const foundFromSelection = findListNodeFromSelection(tr.selection, tr.doc, this.name)
                        if (!foundFromSelection) return false

                        const prevList = findPreviousList(tr.doc, foundFromSelection.pos, this.name)
                        if (prevList) {
                            if (dispatch) {
                                const listNode = tr.doc.nodeAt(foundFromSelection.pos)
                                if (listNode) {
                                    // Count top-level list items in the previous list
                                    const prevCount = prevList.childCount;
                                    const prevStart = prevList.attrs.start || 1;
                                    tr.setNodeMarkup(foundFromSelection.pos, undefined, {
                                        ...listNode.attrs,
                                        start: prevStart + prevCount,
                                        listTypeName: prevList.attrs.listTypeName || 'default'
                                    })
                                }
                            }
                            return true
                        }
                        return false
                    },
        }
    },
    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey('listMarkerSelection'),
                props: {
                    handleDOMEvents: {
                        mousedown: (view: EditorView, event: MouseEvent) => {
                            const target = event.target as HTMLElement | null
                            if (!target) return false

                            const li = target.closest('li')
                            if (!(li instanceof HTMLElement) || !view.dom.contains(li)) return false

                            if (!isListMarkerClick(li, event)) return false

                            let domPos = -1
                            try {
                                domPos = view.posAtDOM(li, 0)
                            } catch {
                                domPos = -1
                            }
                            if (domPos < 0) return false

                            const { state } = view
                            const $pos = state.doc.resolve(domPos)

                            let liPos = -1;
                            let olPos = -1;

                            for (let d = $pos.depth; d >= 0; d--) {
                                const node = $pos.node(d);
                                const name = node.type.name;

                                if (name === 'listItem' && liPos === -1) {
                                    liPos = $pos.before(d);
                                }

                                if (name === 'orderedList' && olPos === -1) {
                                    olPos = $pos.before(d);
                                    break;
                                }
                            }

                            if (olPos !== -1) {
                                event.preventDefault();
                                // Double click selects just the item, Single click selects the whole list
                                const targetPos = (event.detail >= 2 && liPos !== -1) ? liPos : olPos;
                                view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, targetPos)));
                                return true;
                            }

                            return false;
                        }
                    }
                }
            })
        ];
    }
})
