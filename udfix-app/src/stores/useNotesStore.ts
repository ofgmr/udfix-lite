import { create } from 'zustand';
import { DataService, type Note, type NoteSummary } from '../services/dataService';

function summaryToListNote(s: NoteSummary): Note {
    return {
        id: s.id,
        title: s.title ?? '',
        content_plain: s.content_preview ?? '',
        content_json: '',
        parent_type: s.parent_type as Note['parent_type'],
        parent_id: s.parent_id ?? undefined,
        is_pinned: !!s.is_pinned,
        created_at: s.created_at,
        updated_at: s.updated_at,
        metadata: s.metadata,
    };
}

/** SQLite returns is_pinned as 0/1; coerce before React `{flag && …}` renders. */
function normalizeNoteRow(n: Note): Note {
    return { ...n, is_pinned: !!n.is_pinned };
}

interface NotesState {
    notes: Note[];
    activeNote: Note | null;
    isLoading: boolean;

    fetchNotes: (filters?: { parentType?: string, parentId?: string, isPinned?: boolean }) => Promise<void>;
    setActiveNote: (note: Note | null) => void;
    addNote: (note: Partial<Note>) => Promise<string | null>;
    updateNote: (note: Partial<Note> & { id: string }) => Promise<void>;
    deleteNote: (id: string) => Promise<void>;
    searchNotes: (query: string, filters?: { parentType?: string; parentId?: string }) => Promise<Note[]>;
    getNote: (id: string) => Promise<Note | null>;
}

export const useNotesStore = create<NotesState>((set, _get) => ({
    notes: [],
    activeNote: null,
    isLoading: false,

    fetchNotes: async (filters) => {
        set({ isLoading: true, notes: [] });
        try {
            const result = await DataService.getNotesSummary(filters);
            const list = Array.isArray(result) ? result.map(summaryToListNote) : [];
            set({ notes: list, isLoading: false });
        } catch (error) {
            console.error("Failed to fetch notes:", error);
            set({ notes: [], isLoading: false });
        }
    },

    setActiveNote: (note) => set({ activeNote: note }),

    addNote: async (note) => {
        try {
            // Ensure ID is generated if not provided, though DB/Service should handle it
            // For now, assume DataService handles basic creation
            const id = (note.id || crypto.randomUUID());
            const newNote = { ...note, id };
            await DataService.addNote(newNote);

            // If we are in a context, we might want to refresh from DB
            // but for simple cases just local update:
            const addedNote = await DataService.getNote(id);
            if (!addedNote) return id;
            const normalized = normalizeNoteRow(addedNote);
            set(state => ({
                notes: [normalized, ...state.notes],
                activeNote: normalized
            }));
            return id;
        } catch (error) {
            console.error("Failed to add note:", error);
            return null;
        }
    },

    updateNote: async (noteUpdate) => {
        try {
            await DataService.updateNote(noteUpdate);
            set(state => ({
                notes: state.notes.map(n => n.id === noteUpdate.id ? { ...n, ...noteUpdate } as Note : n),
                activeNote: state.activeNote?.id === noteUpdate.id ? { ...state.activeNote, ...noteUpdate } as Note : state.activeNote
            }));
        } catch (error) {
            console.error("Failed to update note:", error);
        }
    },

    deleteNote: async (id) => {
        try {
            await DataService.deleteNote(id);
            set(state => ({
                notes: state.notes.filter(n => n.id !== id),
                activeNote: state.activeNote?.id === id ? null : state.activeNote
            }));
        } catch (error) {
            console.error("Failed to delete note:", error);
        }
    },

    searchNotes: async (query, filters) => {
        if (!query) return [];
        try {
            const results = await DataService.searchNotes(query, 80, filters);
            return Array.isArray(results) ? results.map(normalizeNoteRow) : [];
        } catch (error) {
            console.error("Failed to search notes:", error);
            return [];
        }
    },

    getNote: async (id) => {
        try {
            const note = await DataService.getNote(id);
            return note ? normalizeNoteRow(note) : null;
        } catch (error) {
            console.error("Failed to get note:", error);
            return null;
        }
    }
}));
