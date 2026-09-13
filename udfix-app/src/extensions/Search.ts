import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'

function marksForReplacedRange(doc: PMNode, from: number, to: number) {
    const slice = doc.slice(from, to)
    const first = slice.content.firstChild
    if (first?.isText) {
        return first.marks
    }
    return doc.resolve(from).marks()
}

export const SEARCH_PLUGIN_KEY = new PluginKey('search')

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const createSearchRegex = (term: string, caseSensitive: boolean) => {
    let escaped = escapeRegExp(term)
    if (!caseSensitive) {
        escaped = escaped
            .replace(/i|İ/g, '[iİ]')
            .replace(/ı|I/g, '[ıI]')
            .replace(/ğ|Ğ/g, '[ğĞ]')
            .replace(/ü|Ü/g, '[üÜ]')
            .replace(/ş|Ş/g, '[şŞ]')
            .replace(/ö|Ö/g, '[öÖ]')
            .replace(/ç|Ç/g, '[çÇ]')
    }
    return new RegExp(escaped, caseSensitive ? 'g' : 'gi')
}

function collectSearchMatches(
    doc: PMNode,
    term: string,
    caseSensitive: boolean,
): { from: number; to: number }[] {
    const regex = createSearchRegex(term, caseSensitive)
    const matches: { from: number; to: number }[] = []
    doc.descendants((node, pos) => {
        if (!node.isText) return
        const text = node.text || ''
        if (!text) return
        regex.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = regex.exec(text)) !== null) {
            const from = pos + match.index
            matches.push({ from, to: from + match[0].length })
        }
    })
    return matches
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        search: {
            setSearchTerm: (term: string) => ReturnType
            setCaseSensitive: (caseSensitive: boolean) => ReturnType
            clearSearch: () => ReturnType
            findNext: () => ReturnType
            findPrevious: () => ReturnType
            replace: (replacement: string) => ReturnType
            replaceAll: (replacement: string) => ReturnType
        }
    }
}

interface SearchOptions {
    searchTerm: string
    caseSensitive: boolean
    decorationClass: string
    activeDecorationClass: string
}

export const Search = Extension.create<SearchOptions>({
    name: 'search',

    addOptions() {
        return {
            searchTerm: '',
            caseSensitive: false,
            decorationClass: 'bg-yellow-200 text-black',
            activeDecorationClass: 'search-result-active',
        }
    },

    addCommands() {
        return {
            setSearchTerm: (term: string) => ({ state, dispatch }) => {
                if (dispatch) {
                    const tr = state.tr.setMeta('search', { term })
                    dispatch(tr)
                }
                return true
            },
            setCaseSensitive: (caseSensitive: boolean) => ({ state, dispatch }) => {
                if (dispatch) {
                    const tr = state.tr.setMeta('search', { caseSensitive })
                    dispatch(tr)
                }
                return true
            },
            clearSearch: () => ({ state, dispatch }) => {
                if (dispatch) {
                    const tr = state.tr.setMeta('search', { term: '' })
                    dispatch(tr)
                }
                return true
            },
            findNext: () => ({ state, dispatch }) => {
                const pluginState = SEARCH_PLUGIN_KEY.getState(state)
                const term = String(pluginState?.term || '')
                const caseSensitive = Boolean(pluginState?.caseSensitive || false)
                if (!term) return false
                const hits = collectSearchMatches(state.doc, term, caseSensitive)
                if (!hits.length) return false
                const afterPos = state.selection.to
                const next =
                    hits.find((h) => h.from >= afterPos) ?? hits[0]
                if (dispatch) {
                    dispatch(
                        state.tr
                            .setSelection(TextSelection.create(state.doc, next.from, next.to))
                            .scrollIntoView(),
                    )
                }
                return true
            },
            findPrevious: () => ({ state, dispatch }) => {
                const pluginState = SEARCH_PLUGIN_KEY.getState(state)
                const term = String(pluginState?.term || '')
                const caseSensitive = Boolean(pluginState?.caseSensitive || false)
                if (!term) return false
                const hits = collectSearchMatches(state.doc, term, caseSensitive)
                if (!hits.length) return false
                const beforePos = state.selection.from
                const prev =
                    [...hits].reverse().find((m) => m.from < beforePos) ?? hits[hits.length - 1]
                if (dispatch) {
                    dispatch(
                        state.tr
                            .setSelection(TextSelection.create(state.doc, prev.from, prev.to))
                            .scrollIntoView(),
                    )
                }
                return true
            },
            replace: (replacement: string) => ({ state, dispatch }) => {
                const { selection, doc } = state
                const pluginState = SEARCH_PLUGIN_KEY.getState(state)
                const term = String(pluginState?.term || '')
                const caseSensitive = Boolean(pluginState?.caseSensitive || false)
                if (!term) return false

                const hits = collectSearchMatches(doc, term, caseSensitive)
                if (!hits.length) return false

                const coversHit = hits.some(
                    (h) => h.from === selection.from && h.to === selection.to,
                )

                if (!selection.empty && coversHit) {
                    if (dispatch) {
                        const { from, to } = selection
                        const marks = marksForReplacedRange(doc, from, to)
                        const tr =
                            replacement === ''
                                ? state.tr.delete(from, to)
                                : state.tr.replaceWith(from, to, state.schema.text(replacement, marks))
                        dispatch(tr)
                    }
                    return true
                }

                const afterPos = selection.to
                const next = hits.find((h) => h.from >= afterPos) ?? hits[0]
                if (dispatch) {
                    dispatch(
                        state.tr
                            .setSelection(TextSelection.create(doc, next.from, next.to))
                            .scrollIntoView(),
                    )
                }

                return true
            },
            replaceAll: (replacement: string) => ({ state, dispatch }) => {
                const pluginState = SEARCH_PLUGIN_KEY.getState(state)
                const term = String(pluginState?.term || '')
                const caseSensitive = Boolean(pluginState?.caseSensitive || false)
                if (!term) return false

                const { doc } = state
                const regex = createSearchRegex(term, caseSensitive)

                if (dispatch) {
                    let tr = state.tr
                    const matches: { from: number, to: number }[] = []

                    doc.descendants((node, pos) => {
                        if (node.isText) {
                            const text = node.text
                            if (!text) return

                            regex.lastIndex = 0
                            let match
                            while ((match = regex.exec(text)) !== null) {
                                matches.push({
                                    from: pos + match.index,
                                    to: pos + match.index + match[0].length
                                })
                            }
                        }
                    })

                    // Replace from end to start (preserve marks per range)
                    for (let i = matches.length - 1; i >= 0; i--) {
                        const { from, to } = matches[i]
                        const docBefore = tr.doc
                        const marks = marksForReplacedRange(docBefore, from, to)
                        tr =
                            replacement === ''
                                ? tr.delete(from, to)
                                : tr.replaceWith(from, to, state.schema.text(replacement, marks))
                    }

                    dispatch(tr)
                }
                return true
            },
        }
    },

    addProseMirrorPlugins() {
        const { decorationClass, activeDecorationClass } = this.options

        return [
            new Plugin({
                key: SEARCH_PLUGIN_KEY,
                state: {
                    init() {
                        return { term: '', caseSensitive: false }
                    },
                    apply(tr, prev) {
                        const meta = tr.getMeta('search')
                        if (meta) {
                            return { 
                                term: typeof meta.term === 'string' ? meta.term : prev.term,
                                caseSensitive: typeof meta.caseSensitive === 'boolean' ? meta.caseSensitive : prev.caseSensitive
                            }
                        }
                        return prev
                    },
                },
                props: {
                    decorations(state) {
                        const pluginState = this.getState(state)
                        const term = pluginState?.term
                        const caseSensitive = pluginState?.caseSensitive || false
                        if (!term) return DecorationSet.empty

                        const decorations: Decoration[] = []
                        const regex = createSearchRegex(term, caseSensitive)
                        const { from: selFrom, to: selTo } = state.selection

                        state.doc.descendants((node, pos) => {
                            if (node.isText) {
                                const text = node.text
                                if (!text) return

                                regex.lastIndex = 0
                                let match
                                while ((match = regex.exec(text)) !== null) {
                                    const from = pos + match.index
                                    const to = from + match[0].length
                                    const isActive =
                                        selFrom === from && selTo === to
                                    decorations.push(
                                        Decoration.inline(from, to, {
                                            class: isActive
                                                ? `${decorationClass} ${activeDecorationClass}`.trim()
                                                : decorationClass,
                                        })
                                    )
                                }
                            }
                        })

                        return DecorationSet.create(state.doc, decorations)
                    },
                },
            }),
        ]
    },
})
