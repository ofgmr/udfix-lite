import { create } from 'zustand';
import { DataService, type Task, type TaskFilters } from '../services/dataService';

interface TasksState {
    tasks: Task[];
    isLoading: boolean;
    lastFilters: TaskFilters | null;

    fetchTasks: (filters?: TaskFilters) => Promise<void>;
    addTask: (task: Partial<Task>) => Promise<Task>;
    updateTask: (task: Partial<Task> & { id: string }) => Promise<void>;
    deleteTask: (id: string) => Promise<void>;
}

export const useTasksStore = create<TasksState>((set, get) => ({
    tasks: [],
    isLoading: false,
    lastFilters: null,

    fetchTasks: async (filters) => {
        set({ isLoading: true, lastFilters: filters ?? null });
        try {
            const result = await DataService.getTasks(filters);
            set({ tasks: Array.isArray(result) ? result : [], isLoading: false });
        } catch (error) {
            console.error('Failed to fetch tasks:', error);
            set({ tasks: [], isLoading: false });
        }
    },

    addTask: async (task) => {
        try {
            const created = await DataService.addTask(task);
            const { lastFilters } = get();
            await get().fetchTasks(lastFilters ?? undefined);
            return created;
        } catch (error) {
            console.error('Failed to add task:', error);
            throw error;
        }
    },

    updateTask: async (task) => {
        try {
            await DataService.updateTask(task);
            const { lastFilters } = get();
            await get().fetchTasks(lastFilters ?? undefined);
        } catch (error) {
            console.error('Failed to update task:', error);
            throw error;
        }
    },

    deleteTask: async (id) => {
        try {
            await DataService.deleteTask(id);
            const { lastFilters } = get();
            await get().fetchTasks(lastFilters ?? undefined);
        } catch (error) {
            console.error('Failed to delete task:', error);
            throw error;
        }
    },
}));
