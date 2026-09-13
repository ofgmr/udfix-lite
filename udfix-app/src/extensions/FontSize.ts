import { Extension } from '@tiptap/core'
import '@tiptap/extension-text-style'
import { buildStepFontSizeTransaction } from '../utils/fontSizeStep'

export type FontSizeOptions = {
    types: string[]
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        fontSize: {
            setFontSize: (fontSize: string) => ReturnType
            unsetFontSize: () => ReturnType
            stepFontSize: (direction: 1 | -1) => ReturnType
        }
    }
}

export const FontSize = Extension.create<FontSizeOptions>({
    name: 'fontSize',

    addOptions() {
        return {
            types: ['textStyle'],
        }
    },

    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    fontSize: {
                        default: null,
                        parseHTML: element => element.style.fontSize.replace(/['"]+/g, ''),
                        renderHTML: attributes => {
                            if (!attributes.fontSize) {
                                return {}
                            }

                            return {
                                style: `font-size: ${attributes.fontSize}`,
                            }
                        },
                    },
                },
            },
        ]
    },

    addCommands() {
        return {
            setFontSize: (fontSize) => ({ chain }) => {
                return chain()
                    .setMark('textStyle', { fontSize })
                    .run()
            },
            unsetFontSize: () => ({ chain }) => {
                return chain()
                    .setMark('textStyle', { fontSize: null })
                    .removeEmptyTextStyle()
                    .run()
            },
            stepFontSize: (direction) => ({ tr, state, dispatch }) => {
                const result = buildStepFontSizeTransaction(state, direction, tr)
                if (!result) return false
                if (dispatch) dispatch(result.tr)
                return true
            },
        }
    },
})
