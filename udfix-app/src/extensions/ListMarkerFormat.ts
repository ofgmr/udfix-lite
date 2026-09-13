import { Extension } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { toggleMarkerFormatOrMark } from '../utils/listFormatUtils'

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        listMarkerFormat: {
            toggleMarkerFormat: (attrName: string, activeVal: unknown, inactiveVal: unknown) => ReturnType
        }
    }
}

export const ListMarkerFormat = Extension.create({
    name: 'listMarkerFormat',

    addGlobalAttributes() {
        return [
            {
                types: ['listItem'],
                attributes: {
                    markerWeight: {
                        default: 500,
                        parseHTML: (element) => {
                            const v = (element as HTMLElement).style?.getPropertyValue('--marker-weight')?.trim();
                            if (!v) return 500;
                            const n = Number.parseInt(v, 10);
                            return Number.isFinite(n) ? n : 500;
                        },
                        renderHTML: attrs => ({ style: `--marker-weight: ${attrs.markerWeight}` })
                    },
                    markerStyle: {
                        default: 'normal',
                        parseHTML: (element) => {
                            const v = (element as HTMLElement).style?.getPropertyValue('--marker-style')?.trim();
                            return v || 'normal';
                        },
                        renderHTML: attrs => ({ style: `--marker-style: ${attrs.markerStyle}` })
                    },
                    markerTextDecoration: {
                        default: 'none',
                        parseHTML: (element) => {
                            const fromVar = (element as HTMLElement).style?.getPropertyValue('--marker-text-decoration')?.trim();
                            if (fromVar === 'underline') return 'underline';
                            const dec = (element as HTMLElement).style?.textDecoration ?? '';
                            return dec.includes('underline') ? 'underline' : 'none';
                        },
                        renderHTML: attrs => ({
                            style: `--marker-text-decoration: ${attrs.markerTextDecoration === 'underline' ? 'underline' : 'none'}`,
                        }),
                    },
                    markerFontFamily: {
                        default: null,
                        parseHTML: (element) => {
                            const v = (element as HTMLElement).style?.getPropertyValue('--marker-font-family')?.trim();
                            return v || null;
                        },
                        renderHTML: attrs =>
                            attrs.markerFontFamily
                                ? { style: `--marker-font-family: ${attrs.markerFontFamily}` }
                                : {},
                    },
                }
            }
        ]
    },

    addCommands() {
        return {
            toggleMarkerFormat: (attrName: string, activeVal: unknown, inactiveVal: unknown) => ({ state, tr, dispatch }) => {
                const { selection } = state
                // Only intercept if the user has clicked specifically on the list bullet
                if (selection instanceof NodeSelection && selection.node.type.name === 'listItem') {
                    if (dispatch) {
                        const current = selection.node.attrs[attrName]
                        const next = current === activeVal ? inactiveVal : activeVal
                        tr.setNodeMarkup(selection.from, undefined, {
                            ...selection.node.attrs,
                            [attrName]: next
                        })
                    }
                    return true
                }
                return false
            }
        }
    },

    addKeyboardShortcuts() {
        return {
            'Mod-b': () => toggleMarkerFormatOrMark(this.editor, 'bold'),
            'Mod-i': () => toggleMarkerFormatOrMark(this.editor, 'italic'),
            'Mod-u': () => toggleMarkerFormatOrMark(this.editor, 'underline'),
        };
    },
})