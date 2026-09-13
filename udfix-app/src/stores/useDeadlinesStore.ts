import { create } from 'zustand';
import { DataService, type Deadline, type DeadlineFilters } from '../services/dataService';
import { useTasksStore } from './useTasksStore';

async function refreshTasksIfLoaded() {
    const { lastFilters, fetchTasks } = useTasksStore.getState();
    if (lastFilters !== null) {
        await fetchTasks(lastFilters);
    }
}

interface DeadlinesState {
    deadlines: Deadline[];
    isLoading: boolean;
    lastFilters: DeadlineFilters | null;

    fetchDeadlines: (filters?: DeadlineFilters) => Promise<void>;
    addDeadline: (deadline: Partial<Deadline>) => Promise<void>;
    updateDeadline: (deadline: Partial<Deadline> & { id: string }) => Promise<void>;
    deleteDeadline: (id: string) => Promise<void>;
}

export const useDeadlinesStore = create<DeadlinesState>((set, get) => ({
    deadlines: [],
    isLoading: false,
    lastFilters: null,

    fetchDeadlines: async (filters) => {
        set({ isLoading: true, lastFilters: filters ?? null });
        try {
            const result = await DataService.getDeadlines(filters);
            set({ deadlines: Array.isArray(result) ? result : [], isLoading: false });
        } catch (error) {
            console.error('Failed to fetch deadlines:', error);
            set({ deadlines: [], isLoading: false });
        }
    },

    addDeadline: async (deadline) => {
        try {
            await DataService.addDeadline(deadline);
            const { lastFilters } = get();
            await get().fetchDeadlines(lastFilters ?? undefined);
            await refreshTasksIfLoaded();
        } catch (error) {
            console.error('Failed to add deadline:', error);
            throw error;
        }
    },

    updateDeadline: async (deadline) => {
        try {
            await DataService.updateDeadline(deadline);
            const { lastFilters } = get();
            await get().fetchDeadlines(lastFilters ?? undefined);
            await refreshTasksIfLoaded();
        } catch (error) {
            console.error('Failed to update deadline:', error);
            throw error;
        }
    },

    deleteDeadline: async (id) => {
        try {
            await DataService.deleteDeadline(id);
            const { lastFilters } = get();
            await get().fetchDeadlines(lastFilters ?? undefined);
            await refreshTasksIfLoaded();
        } catch (error) {
            console.error('Failed to delete deadline:', error);
            throw error;
        }
    },
}));
