import ListItem from '@tiptap/extension-list-item'

/**
 * Allow headings inside list items without breaking list structure.
 */
export const ExtendedListItem = ListItem.extend({
    content: '(paragraph|heading) block*',
})

