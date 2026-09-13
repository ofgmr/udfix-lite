import { create } from 'zustand';
import { DataService, type Matter } from '../services/dataService';

interface MattersState {
    matters: Matter[];
    activeMatter: Matter | null;
    isLoading: boolean;

    fetchMatters: (filters?: {
        status?: string;
        matter_type?: string;
        matter_category?: string;
        party_id?: string;
    }) => Promise<void>;
    fetchMatter: (id: string) => Promise<void>;
    addMatter: (matter: Partial<Matter>) => Promise<void>;
    updateMatter: (matter: Matter) => Promise<void>;
    deleteMatter: (id: string) => Promise<void>;
    linkParty: (params: { matterId: string, partyId: string, role: string }) => Promise<void>;
    unlinkParty: (params: { matterId: string, partyId: string }) => Promise<void>;
}

export const useMattersStore = create<MattersState>((set, get) => ({
    matters: [],
    activeMatter: null,
    isLoading: false,

    fetchMatters: async (filters) => {
        set({ isLoading: true });
        try {
            const result = await DataService.getMatters(filters);
            set({ matters: Array.isArray(result) ? result : [], isLoading: false });
        } catch (error) {
            console.error("Failed to fetch matters:", error);
            set({ matters: [], isLoading: false });
        }
    },

    fetchMatter: async (id) => {
        set({ isLoading: true });
        try {
            const matter = await DataService.getMatter(id);
            set({ activeMatter: matter, isLoading: false });
        } catch (error) {
            console.error("Failed to fetch matter:", error);
            set({ isLoading: false });
        }
    },

    addMatter: async (matter) => {
        try {
            await DataService.addMatter(matter);
            await get().fetchMatters();
        } catch (error) {
            console.error("Failed to add matter:", error);
        }
    },

    updateMatter: async (matter) => {
        try {
            await DataService.updateMatter(matter);
            if (get().activeMatter?.id === matter.id) {
                await get().fetchMatter(matter.id);
            }
            await get().fetchMatters();
        } catch (error) {
            console.error("Failed to update matter:", error);
        }
    },

    deleteMatter: async (id) => {
        try {
            await DataService.deleteMatter(id);
            if (get().activeMatter?.id === id) {
                set({ activeMatter: null });
            }
            await get().fetchMatters();
        } catch (error) {
            console.error("Failed to delete matter:", error);
        }
    },

    linkParty: async (params) => {
        try {
            await DataService.linkPartyToMatter(params);
            if (get().activeMatter?.id === params.matterId) {
                await get().fetchMatter(params.matterId);
            }
        } catch (error) {
            console.error("Failed to link party:", error);
        }
    },

    unlinkParty: async (params) => {
        try {
            await DataService.unlinkPartyFromMatter(params);
            if (get().activeMatter?.id === params.matterId) {
                await get().fetchMatter(params.matterId);
            }
        } catch (error) {
            console.error("Failed to unlink party:", error);
        }
    }
}));
