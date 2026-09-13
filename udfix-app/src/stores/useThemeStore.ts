import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePalette =
    | 'gavel'
    | 'barrister'
    | 'notary'
    | 'oxford'
    | 'slate'
    | 'verdict'
    | 'chancellor'
    | 'contrast';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeMeta {
    id: ThemePalette;
    name: string;
    description: string;
    lightAccent: string;
    darkAccent: string;
    lightBg: string;
    darkBg: string;
}

export const THEME_PALETTES: ThemeMeta[] = [
    {
        id: 'gavel',
        name: 'Tokmak',
        description: 'Koyu orman yeşili',
        lightAccent: '#294545',
        darkAccent: '#5E8B8B',
        lightBg: '#F4F7F6',
        darkBg: '#1A2424',
    },
    {
        id: 'barrister',
        name: 'Avukat',
        description: 'Gece laciverti',
        lightAccent: '#1B263B',
        darkAccent: '#415A77',
        lightBg: '#F0F2F5',
        darkBg: '#0D131D',
    },
    {
        id: 'notary',
        name: 'Noter',
        description: 'Soluk gül kurusu',
        lightAccent: '#987D7C',
        darkAccent: '#B59A99',
        lightBg: '#FAF7F7',
        darkBg: '#262121',
    },
    {
        id: 'oxford',
        name: 'Bordo',
        description: 'Bordo ve krem',
        lightAccent: '#6B2D2D',
        darkAccent: '#A65D5D',
        lightBg: '#FCF9F2',
        darkBg: '#1F1A1A',
    },
    {
        id: 'slate',
        name: 'Arduvaz',
        description: 'Tek renk',
        lightAccent: '#4A4E69',
        darkAccent: '#9A9DB3',
        lightBg: '#FFFFFF',
        darkBg: '#121212',
    },
    {
        id: 'verdict',
        name: 'Hüküm',
        description: 'Zümrüt ve altın',
        lightAccent: '#15523E',
        darkAccent: '#2D9B78',
        lightBg: '#F2FBF8',
        darkBg: '#0B1411',
    },
    {
        id: 'chancellor',
        name: 'Şansölye',
        description: 'Konyak ve kehribar',
        lightAccent: '#8C5E3C',
        darkAccent: '#D9A066',
        lightBg: '#FDFBF7',
        darkBg: '#1C1917',
    },
    {
        id: 'contrast',
        name: 'Yüksek Kontrast',
        description: 'Siyah ve beyaz',
        lightAccent: '#000000',
        darkAccent: '#FFE500',
        lightBg: '#FFFFFF',
        darkBg: '#000000',
    },
];

interface ThemeState {
    palette: ThemePalette;
    mode: ThemeMode;
    setPalette: (palette: ThemePalette) => void;
    setMode: (mode: ThemeMode) => void;
    applyTheme: () => void;
}

function getSystemDark(): boolean {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyThemeToDOM(palette: ThemePalette, mode: ThemeMode) {
    const root = document.documentElement;

    // Remove all existing theme- classes
    const toRemove = Array.from(root.classList).filter((c) => c.startsWith('theme-'));
    toRemove.forEach((c) => root.classList.remove(c));

    // Apply palette class
    root.classList.add(`theme-${palette}`);

    // Resolve dark mode
    const isDark = mode === 'dark' || (mode === 'system' && getSystemDark());
    root.classList.toggle('dark', isDark);
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            palette: 'gavel',
            mode: 'system',

            setPalette: (palette) => {
                set({ palette });
                applyThemeToDOM(palette, get().mode);
            },

            setMode: (mode) => {
                set({ mode });
                applyThemeToDOM(get().palette, mode);
            },

            applyTheme: () => {
                applyThemeToDOM(get().palette, get().mode);
            },
        }),
        {
            name: 'nomai-theme-storage',
            partialize: (state) => ({
                palette: state.palette,
                mode: state.mode,
            }),
            onRehydrateStorage: () => (state) => {
                if (!state) return;
                if (!THEME_PALETTES.some((p) => p.id === state.palette)) {
                    state.palette = 'gavel';
                }
                applyThemeToDOM(state.palette, state.mode);
            },
        }
    )
);
