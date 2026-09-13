/**
 * Curated offline font catalogue — single source for editor toolbar,
 * header/footer panel, and PDF @font-face embedding.
 *
 * System fonts (Arial, Times New Roman, …) rely on the OS; bundled families
 * use @fontsource latin + latin-ext subsets shipped with the app (no Google Fonts).
 */

export type FontCategory = 'sans' | 'serif' | 'mono' | 'display' | 'system';

export interface OfflineFontEntry {
    /** Display name in font picker */
    name: string;
    /** CSS font-family stack */
    stack: string;
    category: FontCategory;
    /** @fontsource package id; omitted for system fonts */
    packageId?: string;
}

export const OFFLINE_FONT_GROUPS: ReadonlyArray<{
    label: string;
    fonts: readonly OfflineFontEntry[];
}> = [
    {
        label: 'Sans-serif',
        fonts: [
            { name: 'Inter', stack: 'Inter, sans-serif', category: 'sans', packageId: 'inter' },
            { name: 'Roboto', stack: 'Roboto, sans-serif', category: 'sans', packageId: 'roboto' },
            { name: 'Open Sans', stack: '"Open Sans", sans-serif', category: 'sans', packageId: 'open-sans' },
            { name: 'Lato', stack: 'Lato, sans-serif', category: 'sans', packageId: 'lato' },
            { name: 'Montserrat', stack: 'Montserrat, sans-serif', category: 'sans', packageId: 'montserrat' },
            { name: 'Poppins', stack: 'Poppins, sans-serif', category: 'sans', packageId: 'poppins' },
            { name: 'DM Sans', stack: '"DM Sans", sans-serif', category: 'sans', packageId: 'dm-sans' },
            { name: 'Google Sans', stack: '"Google Sans", sans-serif', category: 'sans', packageId: 'google-sans' },
            { name: 'Nunito', stack: 'Nunito, sans-serif', category: 'sans', packageId: 'nunito' },
            { name: 'Raleway', stack: 'Raleway, sans-serif', category: 'sans', packageId: 'raleway' },
            { name: 'Source Sans 3', stack: '"Source Sans 3", sans-serif', category: 'sans', packageId: 'source-sans-3' },
            { name: 'Arial', stack: 'Arial, sans-serif', category: 'system' },
            { name: 'Verdana', stack: 'Verdana, sans-serif', category: 'system' },
            { name: 'Tahoma', stack: 'Tahoma, sans-serif', category: 'system' },
        ],
    },
    {
        label: 'Serif',
        fonts: [
            { name: 'Times New Roman', stack: '"Times New Roman", Times, serif', category: 'system' },
            { name: 'Georgia', stack: 'Georgia, serif', category: 'system' },
            { name: 'Merriweather', stack: 'Merriweather, serif', category: 'serif', packageId: 'merriweather' },
            { name: 'Lora', stack: 'Lora, serif', category: 'serif', packageId: 'lora' },
            { name: 'Playfair Display', stack: '"Playfair Display", serif', category: 'serif', packageId: 'playfair-display' },
            { name: 'Cinzel', stack: 'Cinzel, serif', category: 'serif', packageId: 'cinzel' },
            { name: 'Cormorant', stack: 'Cormorant, serif', category: 'serif', packageId: 'cormorant' },
            { name: 'Cormorant Garamond', stack: '"Cormorant Garamond", serif', category: 'serif', packageId: 'cormorant-garamond' },
            { name: 'Cormorant SC', stack: '"Cormorant SC", serif', category: 'serif', packageId: 'cormorant-sc' },
            { name: 'EB Garamond', stack: '"EB Garamond", serif', category: 'serif', packageId: 'eb-garamond' },
            { name: 'Libre Baskerville', stack: '"Libre Baskerville", serif', category: 'serif', packageId: 'libre-baskerville' },
            { name: 'Noto Serif', stack: '"Noto Serif", serif', category: 'serif', packageId: 'noto-serif' },
            { name: 'Source Serif 4', stack: '"Source Serif 4", serif', category: 'serif', packageId: 'source-serif-4' },
        ],
    },
    {
        label: 'Display',
        fonts: [
            { name: 'Abril Fatface', stack: '"Abril Fatface", serif', category: 'display', packageId: 'abril-fatface' },
            { name: 'Monofett', stack: 'Monofett, cursive', category: 'display', packageId: 'monofett' },
        ],
    },
    {
        label: 'Monospace',
        fonts: [
            { name: 'Courier New', stack: '"Courier New", Courier, monospace', category: 'system' },
            { name: 'JetBrains Mono', stack: '"JetBrains Mono", monospace', category: 'mono', packageId: 'jetbrains-mono' },
            { name: 'Fira Code', stack: '"Fira Code", monospace', category: 'mono', packageId: 'fira-code' },
        ],
    },
] as const;

/** Flat list for toolbar font picker */
export const ALL_OFFLINE_FONTS: readonly OfflineFontEntry[] = OFFLINE_FONT_GROUPS.flatMap((g) => g.fonts);

/** Toolbar-compatible shape (name + stack) */
export const FONT_GROUPS = OFFLINE_FONT_GROUPS.map((group) => ({
    label: group.label,
    fonts: group.fonts.map((f) => ({ name: f.name, stack: f.stack })),
}));

export const ALL_FONTS = FONT_GROUPS.flatMap((g) => g.fonts);

const BUNDLED_BY_NAME = new Map(
    ALL_OFFLINE_FONTS.filter((f) => f.packageId).map((f) => [f.name, f] as const),
);

export function getBundledFontByName(name: string): OfflineFontEntry | undefined {
    return BUNDLED_BY_NAME.get(name);
}

export const BUNDLED_FONT_NAMES = [...BUNDLED_BY_NAME.keys()] as const;

/** Weights embedded in PDF when a bundled family is referenced */
export const PDF_FONT_WEIGHTS = [300, 400, 500, 600, 700] as const;
export const PDF_FONT_ITALIC_WEIGHTS = [400] as const;

/** Default body font — always embedded in PDF print HTML */
export const PDF_DEFAULT_FONT_FAMILY = 'Inter';
