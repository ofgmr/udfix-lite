import { TaskItem } from '@tiptap/extension-list';

/** Note checklist item with optional linked Yapılacaklar task id. */
export const NoteTaskItem = TaskItem.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            taskId: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-task-id'),
                renderHTML: (attributes) => {
                    if (!attributes.taskId) return {};
                    return { 'data-task-id': attributes.taskId };
                },
            },
        };
    },
});
