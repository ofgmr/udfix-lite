import { create } from 'zustand';

export type EntityType = 'MATTER' | 'PARTY' | 'DOCUMENT' | 'NOTE' | 'KNOWLEDGE' | 'GENERAL';

interface ContextState {
    activeEntityType: EntityType | null;
    activeEntityId: string | null;
    activeEntityName: string | null;

    setContext: (type: EntityType | null, id: string | null, name?: string | null) => void;
    clearContext: () => void;
}

export const useContextStore = create<ContextState>((set) => ({
    activeEntityType: null,
    activeEntityId: null,
    activeEntityName: null,

    setContext: (type, id, name = null) => set({
        activeEntityType: type,
        activeEntityId: id,
        activeEntityName: name
    }),

    clearContext: () => set({
        activeEntityType: null,
        activeEntityId: null,
        activeEntityName: null
    }),
}));
