import { create } from 'zustand';
import { DataService, type Party } from '../services/dataService';

interface PartiesState {
    parties: Party[];
    clients: Party[];
    isLoading: boolean;

    fetchParties: (filters?: { isClient?: boolean }) => Promise<void>;
    addParty: (party: Partial<Party>) => Promise<void>;
    updateParty: (party: Party) => Promise<void>;
    deleteParty: (id: string) => Promise<void>;
    getParty: (id: string) => Promise<Party | null>;
}

export const usePartiesStore = create<PartiesState>((set, get) => ({
    parties: [],
    clients: [],
    isLoading: false,

    fetchParties: async (filters) => {
        set({ isLoading: true });
        try {
            const result = await DataService.getParties(filters);
            const parties = Array.isArray(result) ? result : [];
            set({
                parties,
                clients: parties.filter(p => p.is_client),
                isLoading: false
            });
        } catch (error) {
            console.error("Failed to fetch parties:", error);
            set({ parties: [], clients: [], isLoading: false });
        }
    },

    addParty: async (party) => {
        try {
            await DataService.addParty(party);
            await get().fetchParties();
        } catch (error) {
            console.error("Failed to add party:", error);
        }
    },

    updateParty: async (party) => {
        try {
            await DataService.updateParty(party);
            await get().fetchParties();
        } catch (error) {
            console.error("Failed to update party:", error);
        }
    },

    deleteParty: async (id) => {
        try {
            await DataService.deleteParty(id);
            await get().fetchParties();
        } catch (error) {
            console.error("Failed to delete party:", error);
        }
    },

    getParty: async (id) => {
        try {
            return await DataService.getParty(id);
        } catch (error) {
            console.error("Failed to get party:", error);
            return null;
        }
    }
}));
