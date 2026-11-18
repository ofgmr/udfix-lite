import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import {
    buildSearchDecorations,
    searchHitRanges,
    updateSearchDecorations,
} from '../utils/searchDecorations'

function marksForReplacedRange(doc: PMNode, from: number, to: number) {
    const slice = doc.slice(from, to)
    const first = slice.content.firstChild
    if (first?.isText) {
        return first.marks
    }
    return doc.resolve(from).marks()
}

export const SEARCH_PLUGIN_KEY = new PluginKey<SearchPluginState>('search')

interface SearchPluginState {
    term: string
    caseSensitive: boolean
    decorations: DecorationSet
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
                if (!term || !pluginState) return false
                const hits = searchHitRanges(pluginState.decorations, state.doc.content.size)
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
                if (!term || !pluginState) return false
                const hits = searchHitRanges(pluginState.decorations, state.doc.content.size)
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
                if (!term || !pluginState) return false

                const hits = searchHitRanges(pluginState.decorations, doc.content.size)
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
                if (!term || !pluginState) return false

                if (dispatch) {
                    let tr = state.tr
                    const matches = searchHitRanges(pluginState.decorations, state.doc.content.size)

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
        return [createSearchPlugin(decorationClass, activeDecorationClass)]
    },
})

export function createSearchPlugin(decorationClass: string, activeDecorationClass: string): Plugin {
    return new Plugin({
                key: SEARCH_PLUGIN_KEY,
                state: {
                    init(): SearchPluginState {
                        return { term: '', caseSensitive: false, decorations: DecorationSet.empty }
                    },
                    apply(tr, prev): SearchPluginState {
                        const meta = tr.getMeta('search') as { term?: unknown; caseSensitive?: unknown } | undefined
                        const term = typeof meta?.term === 'string' ? meta.term : prev.term
                        const caseSensitive =
                            typeof meta?.caseSensitive === 'boolean' ? meta.caseSensitive : prev.caseSensitive
                        const termChanged = term !== prev.term || caseSensitive !== prev.caseSensitive
                        if (!term) {
                            return { term, caseSensitive, decorations: DecorationSet.empty }
                        }
                        const decorations = termChanged
                            ? buildSearchDecorations(tr.doc, term, caseSensitive, decorationClass)
                            : updateSearchDecorations(
                                  prev.decorations,
                                  tr,
                                  term,
                                  caseSensitive,
                                  decorationClass,
                              )
                        return { term, caseSensitive, decorations }
                    },
                },
                props: {
                    decorations(state) {
                        const pluginState = this.getState(state)
                        const base = pluginState?.decorations ?? DecorationSet.empty
                        if (!pluginState?.term) return DecorationSet.empty
                        const { from, to } = state.selection
                        if (from === to) return base
                        const exact = base.find(from, to).some((deco) => deco.from === from && deco.to === to)
                        if (!exact) return base
                        return base.add(state.doc, [
                            Decoration.inline(from, to, { class: activeDecorationClass }),
                        ])
                    },
                },
    })
}
