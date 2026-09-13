type NoteEditorFinalizeFn = () => Promise<void>;

const finalizeByNoteId = new Map<string, NoteEditorFinalizeFn>();

/** NoteEditor registers finalize (save / empty-delete) for tab-close interception. */
export function registerNoteEditorFinalize(noteId: string, fn: NoteEditorFinalizeFn): () => void {
    finalizeByNoteId.set(noteId, fn);
    return () => {
        if (finalizeByNoteId.get(noteId) === fn) {
            finalizeByNoteId.delete(noteId);
        }
    };
}

export async function finalizeNoteEditorIfRegistered(noteId: string): Promise<void> {
    const fn = finalizeByNoteId.get(noteId);
    if (fn) await fn();
}
