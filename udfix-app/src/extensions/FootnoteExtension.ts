import { Mark, mergeAttributes } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import type { AddMarkStep, ReplaceStep, Step } from '@tiptap/pm/transform'

export interface FootnoteOptions {
    HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        footnote: {
            insertFootnote: () => ReturnType
            updateFootnote: (id: string, content: string) => ReturnType
            deleteFootnote: (id: string) => ReturnType
        }
    }
}

/** Nodes visited by the numbering walk. Plain typing should leave this at 0. */
export const footnoteScanStats = { nodes: 0 }

function nodeHasFootnote(node: PmNode): boolean {
    if (node.marks.some((mark) => mark.type.name === 'footnote')) return true
    let found = false
    node.descendants((child) => {
        if (child.marks.some((mark) => mark.type.name === 'footnote')) {
            found = true
            return false
        }
        return !found
    })
    return found
}

function rangeHasFootnote(doc: PmNode, from: number, to: number): boolean {
    if (from === to) return false
    const max = doc.content.size
    const start = Math.max(0, Math.min(from, max))
    const end = Math.max(start, Math.min(to, max))
    if (start === end) return false
    let found = false
    doc.nodesBetween(start, end, (node) => {
        if (node.marks.some((mark) => mark.type.name === 'footnote')) {
            found = true
            return false
        }
        return !found
    })
    return found
}

function stepJsonId(step: Step): string {
    const labeled = step as Step & { jsonID?: string }
    return labeled.jsonID ?? ''
}

/**
 * True when a step adds, removes, or replaces a footnote mark.
 * Step classes are compared by jsonID because the editor and this module
 * can each load their own copy of prosemirror-transform.
 */
export function transactionTouchesFootnote(tr: Transaction): boolean {
    if (!tr.docChanged) return false
    let doc = tr.before
    for (const step of tr.steps) {
        const kind = stepJsonId(step)
        if (kind === 'addMark' || kind === 'removeMark') {
            const mark = (step as AddMarkStep).mark
            if (mark.type.name === 'footnote') return true
        } else if (kind === 'replace' || kind === 'replaceAround') {
            const replace = step as ReplaceStep
            let inserted = false
            replace.slice.content.forEach((node) => {
                if (!inserted && nodeHasFootnote(node)) inserted = true
            })
            if (inserted || rangeHasFootnote(doc, replace.from, replace.to)) return true
        } else if (kind === 'attr') {
            // Footnote numbers live on the mark, not on a node attribute.
        } else {
            return true
        }
        const applied = step.apply(doc)
        if (applied.failed || !applied.doc) return true
        doc = applied.doc
    }
    return false
}

export const FootnoteExtension = Mark.create<FootnoteOptions>({
    name: 'footnote',
    // Superscript also parses every `sup`. This mark must be tried first so
    // `sup[data-footnote-id]` keeps its id and note text on paste.
    priority: 1000,
    inclusive: false,

    addOptions() {
        return {
            HTMLAttributes: {},
        }
    },

    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-footnote-id'),
                renderHTML: attributes => {
                    if (!attributes.id) {
                        return {}
                    }
                    return {
                        'data-footnote-id': attributes.id,
                    }
                },
            },
            content: {
                default: '',
                parseHTML: element => element.getAttribute('data-content') || element.getAttribute('data-footnote-content'),
                renderHTML: attributes => {
                    if (!attributes.content) {
                        return {}
                    }
                    return {
                        'data-content': attributes.content,
                    }
                },
            },
            number: {
                default: 1,
                parseHTML: element => parseInt(element.getAttribute('data-footnote-number') || '1'),
                renderHTML: attributes => {
                    return {
                        'data-footnote-number': attributes.number,
                    }
                },
            },
        }
    },

    parseHTML() {
        return [
            {
                tag: 'sup[data-footnote-id]',
            },
        ]
    },

    renderHTML({ HTMLAttributes }) {
        return [
            'sup',
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
                class: 'footnote-ref',
                'data-type': 'footnote',
            }),
            0,
        ]
    },

    addCommands() {
        return {
            insertFootnote: () => ({ chain, state }) => {
                let maxNumber = 0
                state.doc.descendants((node) => {
                    node.marks.forEach((mark) => {
                        if (mark.type.name === 'footnote' && mark.attrs.number) {
                            maxNumber = Math.max(maxNumber, mark.attrs.number)
                        }
                    })
                })

                const nextNumber = maxNumber + 1
                const footnoteId = `footnote-${Date.now()}-${nextNumber}`

                // 1. Capture the starting position before we insert anything
                const insertPos = state.selection.from

                return chain()
                    .insertContent([
                        {
                            type: 'text',
                            text: '\u200B', // Invisible character
                            marks: [
                                {
                                    type: 'footnote',
                                    attrs: { id: footnoteId, content: '', number: nextNumber },
                                },
                            ],
                        },
                        {
                            type: 'text',
                            text: ' ', // The safe escape space
                        }
                    ])
                    // 2. Move cursor back 1 position so it sits right on the footnote mark
                    .setTextSelection(insertPos + 1)
                    .run()
            },
            updateFootnote:
                (id: string, content: string) =>
                    ({ tr, state, dispatch }) => {
                        let updated = false

                        state.doc.descendants((node, pos) => {
                            if (updated) return false

                            node.marks.forEach((mark) => {
                                if (mark.type.name === 'footnote' && mark.attrs.id === id) {
                                    const newMark = mark.type.create({
                                        ...mark.attrs,
                                        content,
                                    })

                                    tr.removeMark(pos, pos + node.nodeSize, mark.type)
                                    tr.addMark(pos, pos + node.nodeSize, newMark)
                                    updated = true
                                }
                            })
                        })

                        if (dispatch && updated) {
                            dispatch(tr)
                        }

                        return updated
                    },

            deleteFootnote:
                (id: string) =>
                    ({ tr, state, dispatch }) => {
                        let deleted = false

                        state.doc.descendants((node, pos) => {
                            if (deleted) return false

                            node.marks.forEach((mark) => {
                                if (mark.type.name === 'footnote' && mark.attrs.id === id) {
                                    tr.removeMark(pos, pos + node.nodeSize, mark.type)
                                    deleted = true
                                }
                            })
                        })

                        if (dispatch && deleted) {
                            dispatch(tr)
                        }

                        return deleted
                    },
        }
    },

    addKeyboardShortcuts() {
        return {
            // Optional: Add Ctrl+Shift+F to insert footnote
            'Mod-Shift-f': () => this.editor.commands.insertFootnote(),
        }
    },

    // Use ProseMirror plugin to ensure sequential footnote numbering
    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey('footnoteNumbering'),
                appendTransaction(transactions, _oldState, newState) {
                    if (!transactions.some((tr) => transactionTouchesFootnote(tr))) return null

                    const tr = newState.tr
                    let modified = false
                    let counter = 1

                    newState.doc.descendants((node, pos) => {
                        footnoteScanStats.nodes += 1
                        // Check if node has footnote mark
                        const footnoteMark = node.marks.find(m => m.type.name === 'footnote')
                        if (footnoteMark) {
                            const expectedNumber = counter

                            // Only update if number doesn't match expected sequential order
                            if (footnoteMark.attrs.number !== expectedNumber) {
                                const newMark = footnoteMark.type.create({
                                    ...footnoteMark.attrs,
                                    number: expectedNumber,
                                })

                                tr.removeMark(pos, pos + node.nodeSize, footnoteMark.type)
                                tr.addMark(pos, pos + node.nodeSize, newMark)
                                modified = true
                            }
                            counter++
                        }
                    })

                    return modified ? tr : null
                },
            }),
        ]
    },
})
