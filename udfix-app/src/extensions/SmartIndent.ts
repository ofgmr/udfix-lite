import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        smartIndent: {
            smartIndent: () => ReturnType
            smartOutdent: () => ReturnType
        }
    }
}

export const SmartIndent = Extension.create({
    name: 'smartIndent',

    addCommands() {
        return {
            smartIndent: () => ({ editor }) => {
                // If inside a paragraph or heading → visual margin indent
                if (editor.isActive('paragraph') || editor.isActive('heading')) {
                    return editor.commands.indent()
                }
                return false
            },
            smartOutdent: () => ({ editor }) => {
                // If inside a paragraph or heading → reduce visual margin
                if (editor.isActive('paragraph') || editor.isActive('heading')) {
                    return editor.commands.outdent()
                }
                return false
            },
        }
    },

    addKeyboardShortcuts() {
        return {
            'Tab': () => {
                // Route directly to standard list commands if in a list
                if (this.editor.isActive('listItem')) {
                    return this.editor.commands.sinkListItem('listItem')
                }
                // Match UYAP's literal tab model outside lists; visual width is CSS-driven.
                return this.editor.commands.insertContent('\t')
            },
            'Shift-Tab': () => {
                // Route directly to standard list commands if in a list
                if (this.editor.isActive('listItem')) {
                    return this.editor.commands.liftListItem('listItem')
                }
                // Otherwise use our smart outdent
                return this.editor.commands.smartOutdent()
            },
        }
    },
})
