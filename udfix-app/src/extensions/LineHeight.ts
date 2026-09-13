import { Extension } from '@tiptap/core'

export interface LineHeightOptions {
    types: string[]
    defaultLineHeight: string
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        lineHeight: {
            setLineHeight: (lineHeight: string) => ReturnType
            unsetLineHeight: () => ReturnType
        }
    }
}

export const LineHeight = Extension.create<LineHeightOptions>({
    name: 'lineHeight',

    addOptions() {
        return {
            types: ['paragraph', 'heading'],
            defaultLineHeight: '1.5',
        }
    },

    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    lineHeight: {
                        default: this.options.defaultLineHeight,
                        parseHTML: element => element.style.lineHeight || this.options.defaultLineHeight,
                        renderHTML: attributes => {
                            if (attributes.lineHeight === this.options.defaultLineHeight) {
                                return {}
                            }
                            return { style: `line-height: ${attributes.lineHeight}` }
                        },
                    },
                },
            },
        ]
    },

    addCommands() {
        return {
            setLineHeight: (lineHeight) => ({ editor, commands }) => {
                const { $from } = editor.state.selection
                for (let d = $from.depth; d > 0; d--) {
                    const name = $from.node(d).type.name
                    if (this.options.types.includes(name)) {
                        return commands.updateAttributes(name, { lineHeight })
                    }
                }
                return false
            },
            unsetLineHeight: () => ({ editor, commands }) => {
                const { $from } = editor.state.selection
                for (let d = $from.depth; d > 0; d--) {
                    const name = $from.node(d).type.name
                    if (this.options.types.includes(name)) {
                        return commands.resetAttributes(name, 'lineHeight')
                    }
                }
                return false
            },
        }
    },
})
