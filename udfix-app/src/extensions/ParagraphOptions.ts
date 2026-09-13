import { Extension } from '@tiptap/core'

export interface ParagraphOptionsOptions {
    types: string[]
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        paragraphOptions: {
            setMarginTop: (value: string) => ReturnType
            unsetMarginTop: () => ReturnType
            setMarginBottom: (value: string) => ReturnType
            unsetMarginBottom: () => ReturnType
            toggleKeepWithNext: () => ReturnType
            toggleKeepLines: () => ReturnType
            togglePreventSingleLines: () => ReturnType
            togglePageBreakBefore: () => ReturnType
        }
    }
}

export const ParagraphOptions = Extension.create<ParagraphOptionsOptions>({
    name: 'paragraphOptions',

    addOptions() {
        return {
            types: ['paragraph', 'heading'],
        }
    },

    addCommands() {
        return {
            setMarginTop: (value) => ({ commands }) => {
                return this.options.types.map(type => commands.updateAttributes(type, { marginTop: value })).some(res => res)
            },
            unsetMarginTop: () => ({ commands }) => {
                return this.options.types.map(type => commands.updateAttributes(type, { marginTop: null })).some(res => res)
            },
            setMarginBottom: (value) => ({ commands }) => {
                return this.options.types.map(type => commands.updateAttributes(type, { marginBottom: value })).some(res => res)
            },
            unsetMarginBottom: () => ({ commands }) => {
                return this.options.types.map(type => commands.updateAttributes(type, { marginBottom: null })).some(res => res)
            },
            toggleKeepWithNext: () => ({ editor, commands }) => {
                const isActive = editor.getAttributes('paragraph').keepWithNext || editor.getAttributes('heading').keepWithNext
                return this.options.types.map(type => commands.updateAttributes(type, { keepWithNext: !isActive })).some(res => res)
            },
            toggleKeepLines: () => ({ editor, commands }) => {
                const isActive = editor.getAttributes('paragraph').keepLines || editor.getAttributes('heading').keepLines
                return this.options.types.map(type => commands.updateAttributes(type, { keepLines: !isActive })).some(res => res)
            },
            togglePreventSingleLines: () => ({ editor, commands }) => {
                const isActive = editor.getAttributes('paragraph').preventSingleLines || editor.getAttributes('heading').preventSingleLines
                return this.options.types.map(type => commands.updateAttributes(type, { preventSingleLines: !isActive })).some(res => res)
            },
            togglePageBreakBefore: () => ({ editor, commands }) => {
                const isActive = editor.getAttributes('paragraph').pageBreakBefore || editor.getAttributes('heading').pageBreakBefore
                return this.options.types.map(type => commands.updateAttributes(type, { pageBreakBefore: !isActive })).some(res => res)
            },
        }
    },
})
