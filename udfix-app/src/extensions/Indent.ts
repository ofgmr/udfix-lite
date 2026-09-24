import { Extension } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import type { Node as PmNode } from '@tiptap/pm/model'
import type { Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'

export interface IndentOptions {
    types: string[]
    defaultStep: number
}

/** Default list-item left margin when `marginLeft` is unset (matches `lists.css` `--t-ml`). */
export const LIST_ITEM_DEFAULT_MARGIN_LEFT = 40

/**
 * Ruler hanging-handle default for list items with unset `textIndent`.
 * `abs(-24) + 10` matches `lists.css` `--list-marker-width: 34px`. Not written as CSS
 * until the user sets indentation (`lists.css` `--t-ti` stays 0).
 */
export const LIST_ITEM_DEFAULT_TEXT_INDENT = -24

/**
 * İmlecin içinde olduğu en içteki `listItem`'ın hemen üstündeki `orderedList` / `bulletList`.
 * Böylece iç içe listelerde yalnızca ilgili seviye kayar.
 */
function findContainingListForCursor($pos: {
    depth: number
    node: (d: number) => PMNode
    before: (d: number) => number
}) {
    let listItemDepth = -1
    for (let d = $pos.depth; d > 0; d--) {
        if ($pos.node(d).type.name === 'listItem') {
            listItemDepth = d
            break
        }
    }
    if (listItemDepth <= 1) return null
    const listDepth = listItemDepth - 1
    const listNode = $pos.node(listDepth)
    if (listNode.type.name !== 'orderedList' && listNode.type.name !== 'bulletList') return null
    return { listPos: $pos.before(listDepth), listNode }
}

function collectListItemsInSubtree(doc: PMNode, listPos: number, listNode: PMNode) {
    const out: { pos: number; node: PMNode }[] = []
    const start = listPos + 1
    const end = listPos + listNode.nodeSize - 1
    doc.nodesBetween(start, end, (node, pos) => {
        if (node.type.name === 'listItem') {
            out.push({ pos, node })
        }
    })
    return out
}

/** Kök `orderedList` / `bulletList`'in yalnızca doğrudan maddeleri (iç içe li'leri iki kez kaydırmamak için) */
function collectDirectListItemsOfList(listPos: number, listNode: PMNode) {
    const out: { pos: number; node: PMNode }[] = []
    let p = listPos + 1
    listNode.content.forEach((child: PMNode) => {
        if (child.type.name === 'listItem') {
            out.push({ pos: p, node: child })
        }
        p += child.nodeSize
    })
    return out
}

function effectiveListItemMarginLeft(node: PMNode): number {
    const v = node.attrs.marginLeft
    if (v === null || v === undefined) return LIST_ITEM_DEFAULT_MARGIN_LEFT
    const n = Number(v)
    return Number.isFinite(n) ? n : LIST_ITEM_DEFAULT_MARGIN_LEFT
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        indent: {
            indent: () => ReturnType
            outdent: () => ReturnType
            setIndentation: (attributes: { left?: number, right?: number, firstLine?: number }) => ReturnType
            /** Dıştaki listenin tüm maddelerine aynı delta; iç göreceli fark korunur */
            shiftListIndentByDelta: (deltaPx: number) => ReturnType
        }
    }
}

export const Indent = Extension.create<IndentOptions>({
    name: 'indent',

    addOptions() {
        return {
            types: ['paragraph', 'heading', 'listItem'],
            defaultStep: 40,
        }
    },

    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    marginLeft: {
                        default: null,
                        parseHTML: element => parseFloat(element.style.marginLeft || '0') || null,
                        renderHTML: attributes => {
                            if (attributes.marginLeft === null || attributes.marginLeft === undefined) return {}
                            return { style: `margin-left: ${attributes.marginLeft}px; --t-ml: ${attributes.marginLeft}px;` }
                        },
                    },
                    marginRight: {
                        default: null,
                        parseHTML: element => parseFloat(element.style.marginRight || '0') || null,
                        renderHTML: attributes => {
                            if (!attributes.marginRight) return {}
                            return { style: `margin-right: ${attributes.marginRight}px;` }
                        },
                    },
                    textIndent: {
                        default: null,
                        parseHTML: element => parseFloat(element.style.textIndent || '0') || null,
                        renderHTML: attributes => {
                            if (attributes.textIndent === null || attributes.textIndent === undefined) return {}
                            const textIndent = Number(attributes.textIndent)
                            const safeIndent = Number.isFinite(textIndent) ? textIndent : 0
                            const markerWidth = Math.max(18, Math.abs(safeIndent) + 10)
                            const styles = [
                                `text-indent: ${safeIndent}px`,
                                `--t-ti: ${safeIndent}px`,
                                `--list-marker-width: ${markerWidth}px`,
                            ]
                            if (safeIndent < 0) {
                                // UYAP hanging indent: first line at block edge, wrapped lines inset by
                                // `padding-left`. Clamp the padding so the wrapped-line column can never
                                // collapse below a readable minimum — otherwise a narrow page/content box
                                // (zoom, narrow dock, large margins) would drive the text column toward 0
                                // and `overflow-wrap` would shred words letter-by-letter down the margin.
                                const pad = Math.abs(safeIndent)
                                styles.push(`padding-left: min(${pad}px, max(0px, calc(100% - 96px)))`)
                                styles.push('box-sizing: border-box')
                            }
                            return { style: `${styles.join('; ')};` }
                        },
                    },
                    marginTop: {
                        default: 0,
                        parseHTML: element => parseFloat(element.style.marginTop || '0') || 0,
                        renderHTML: attributes => {
                            if (!attributes.marginTop) return {}
                            return { style: `margin-top: ${attributes.marginTop}px` }
                        },
                    },
                    marginBottom: {
                        default: 0,
                        parseHTML: element => parseFloat(element.style.marginBottom || '0') || 0,
                        renderHTML: attributes => {
                            if (!attributes.marginBottom) return {}
                            return { style: `margin-bottom: ${attributes.marginBottom}px` }
                        },
                    },
                },
            },
        ]
    },

    addCommands() {
        const getBlocksToUpdate = (state: EditorState, types: string[]) => {
            const { selection } = state;
            const nodesToUpdate = new Map<number, PmNode>();

            state.doc.nodesBetween(selection.from, selection.to, (node: PmNode, pos: number) => {
                if (node.isTextblock) {
                    const $pos = state.doc.resolve(pos);
                    let targetNode = node;
                    let targetPos = pos;

                    for (let d = $pos.depth; d > 0; d--) {
                        if ($pos.node(d).type.name === 'listItem') {
                            targetNode = $pos.node(d);
                            targetPos = $pos.before(d);
                            break;
                        }
                    }

                    if (types.includes(targetNode.type.name)) {
                        nodesToUpdate.set(targetPos, targetNode);
                    }
                }
            });

            // Çökük seçimde nodesBetween hiç textblock vermeyebilir — imleçteki blok
            if (nodesToUpdate.size === 0 && selection.empty) {
                const $pos = selection.$from
                for (let d = $pos.depth; d > 0; d--) {
                    const node = $pos.node(d)
                    const pos = $pos.before(d)
                    if (node.type.name === 'listItem' && types.includes('listItem')) {
                        nodesToUpdate.set(pos, node)
                        break
                    }
                    if (
                        (node.type.name === 'paragraph' || node.type.name === 'heading') &&
                        types.includes(node.type.name)
                    ) {
                        nodesToUpdate.set(pos, node)
                        break
                    }
                }
            }

            return nodesToUpdate;
        };

        return {
            indent: () => ({ tr, state, dispatch }) => {
                const blocks = getBlocksToUpdate(state, this.options.types);
                if (blocks.size === 0) return false;

                if (dispatch) {
                    blocks.forEach((node, pos) => {
                        const newLeft = (node.attrs.marginLeft || 0) + this.options.defaultStep;
                        tr.setNodeMarkup(pos, undefined, { ...node.attrs, marginLeft: newLeft });
                    });
                }
                return true;
            },
            outdent: () => ({ tr, state, dispatch }) => {
                const blocks = getBlocksToUpdate(state, this.options.types);
                if (blocks.size === 0) return false;

                if (dispatch) {
                    blocks.forEach((node, pos) => {
                        const newLeft = Math.max(0, (node.attrs.marginLeft || 0) - this.options.defaultStep);
                        tr.setNodeMarkup(pos, undefined, { ...node.attrs, marginLeft: newLeft });
                    });
                }
                return true;
            },
            setIndentation: (attributes) => ({ tr, state, dispatch }) => {
                const sel = state.selection

                // Tüm liste seçili + ilk satır girintisi → listenin tüm maddelerine uygula
                if (
                    sel instanceof NodeSelection &&
                    attributes.firstLine !== undefined &&
                    attributes.left === undefined &&
                    attributes.right === undefined &&
                    (sel.node.type.name === 'orderedList' || sel.node.type.name === 'bulletList')
                ) {
                    const items = collectListItemsInSubtree(state.doc, sel.from, sel.node)
                    if (items.length === 0) return false
                    if (dispatch) {
                        items.forEach(({ node, pos }) => {
                            tr.setNodeMarkup(pos, undefined, {
                                ...node.attrs,
                                textIndent: attributes.firstLine,
                            })
                        })
                    }
                    return true
                }

                const blocks = getBlocksToUpdate(state, this.options.types);
                if (blocks.size === 0) return false;

                if (dispatch) {
                    blocks.forEach((node, pos) => {
                        const newAttrs = { ...node.attrs };
                        if (attributes.left !== undefined) newAttrs.marginLeft = attributes.left;
                        if (attributes.right !== undefined) newAttrs.marginRight = attributes.right;
                        if (attributes.firstLine !== undefined) newAttrs.textIndent = attributes.firstLine;
                        tr.setNodeMarkup(pos, undefined, newAttrs);
                    });
                }
                return true;
            },

            shiftListIndentByDelta:
                (deltaPx: number) =>
                ({ tr, state, dispatch }) => {
                    if (!deltaPx) return true
                    const found = findContainingListForCursor(state.selection.$from)
                    if (!found) return false
                    const items = collectDirectListItemsOfList(found.listPos, found.listNode)
                    if (items.length === 0) return false
                    if (dispatch) {
                        items.forEach(({ node, pos }) => {
                            const eff = effectiveListItemMarginLeft(node)
                            const next = Math.max(0, Math.round(eff + deltaPx))
                            tr.setNodeMarkup(pos, undefined, {
                                ...node.attrs,
                                marginLeft: next,
                            })
                        })
                    }
                    return true
                },
        }
    },
})