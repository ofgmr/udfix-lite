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
            smartIndent: () => ({ editor, chain }) => {
                // Same transaction as this command. `editor.commands.indent()`
                // dispatches a second transaction and throws
                // "Applying a mismatched transaction" (Shift-Tab / toolbar).
                if (editor.isActive('paragraph') || editor.isActive('heading')) {
                    return chain().indent().run()
                }
                return false
            },
            smartOutdent: () => ({ editor, chain }) => {
                if (editor.isActive('paragraph') || editor.isActive('heading')) {
                    return chain().outdent().run()
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
