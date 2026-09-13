/**
 * Lazy @font-face registration for editor/header-footer font pickers.
 * Cold start loads only Inter + icons via loadAppFonts.ts.
 *
 * Each family loads latin + latin-ext subsets only (Turkish-safe; no cyrillic/greek/vietnamese).
 */

const loadedPackages = new Set<string>();

const FONT_PACKAGE_LOADERS: Record<string, () => Promise<unknown>> = {
    inter: () =>
        Promise.all([
            import('@fontsource/inter/latin-300.css'),
            import('@fontsource/inter/latin-ext-300.css'),
            import('@fontsource/inter/latin-400.css'),
            import('@fontsource/inter/latin-ext-400.css'),
            import('@fontsource/inter/latin-500.css'),
            import('@fontsource/inter/latin-ext-500.css'),
            import('@fontsource/inter/latin-600.css'),
            import('@fontsource/inter/latin-ext-600.css'),
            import('@fontsource/inter/latin-700.css'),
            import('@fontsource/inter/latin-ext-700.css'),
        ]),
    roboto: () =>
        Promise.all([
            import('@fontsource/roboto/latin-300.css'),
            import('@fontsource/roboto/latin-ext-300.css'),
            import('@fontsource/roboto/latin-400.css'),
            import('@fontsource/roboto/latin-ext-400.css'),
            import('@fontsource/roboto/latin-500.css'),
            import('@fontsource/roboto/latin-ext-500.css'),
            import('@fontsource/roboto/latin-700.css'),
            import('@fontsource/roboto/latin-ext-700.css'),
            import('@fontsource/roboto/latin-400-italic.css'),
            import('@fontsource/roboto/latin-ext-400-italic.css'),
        ]),
    'open-sans': () =>
        Promise.all([
            import('@fontsource/open-sans/latin-300.css'),
            import('@fontsource/open-sans/latin-ext-300.css'),
            import('@fontsource/open-sans/latin-400.css'),
            import('@fontsource/open-sans/latin-ext-400.css'),
            import('@fontsource/open-sans/latin-600.css'),
            import('@fontsource/open-sans/latin-ext-600.css'),
            import('@fontsource/open-sans/latin-700.css'),
            import('@fontsource/open-sans/latin-ext-700.css'),
            import('@fontsource/open-sans/latin-400-italic.css'),
            import('@fontsource/open-sans/latin-ext-400-italic.css'),
        ]),
    lato: () =>
        Promise.all([
            import('@fontsource/lato/latin-300.css'),
            import('@fontsource/lato/latin-ext-300.css'),
            import('@fontsource/lato/latin-400.css'),
            import('@fontsource/lato/latin-ext-400.css'),
            import('@fontsource/lato/latin-700.css'),
            import('@fontsource/lato/latin-ext-700.css'),
            import('@fontsource/lato/latin-400-italic.css'),
            import('@fontsource/lato/latin-ext-400-italic.css'),
        ]),
    montserrat: () =>
        Promise.all([
            import('@fontsource/montserrat/latin-300.css'),
            import('@fontsource/montserrat/latin-ext-300.css'),
            import('@fontsource/montserrat/latin-400.css'),
            import('@fontsource/montserrat/latin-ext-400.css'),
            import('@fontsource/montserrat/latin-500.css'),
            import('@fontsource/montserrat/latin-ext-500.css'),
            import('@fontsource/montserrat/latin-600.css'),
            import('@fontsource/montserrat/latin-ext-600.css'),
            import('@fontsource/montserrat/latin-700.css'),
            import('@fontsource/montserrat/latin-ext-700.css'),
            import('@fontsource/montserrat/latin-400-italic.css'),
            import('@fontsource/montserrat/latin-ext-400-italic.css'),
        ]),
    poppins: () =>
        Promise.all([
            import('@fontsource/poppins/latin-300.css'),
            import('@fontsource/poppins/latin-ext-300.css'),
            import('@fontsource/poppins/latin-400.css'),
            import('@fontsource/poppins/latin-ext-400.css'),
            import('@fontsource/poppins/latin-500.css'),
            import('@fontsource/poppins/latin-ext-500.css'),
            import('@fontsource/poppins/latin-600.css'),
            import('@fontsource/poppins/latin-ext-600.css'),
            import('@fontsource/poppins/latin-700.css'),
            import('@fontsource/poppins/latin-ext-700.css'),
            import('@fontsource/poppins/latin-400-italic.css'),
            import('@fontsource/poppins/latin-ext-400-italic.css'),
        ]),
    'dm-sans': () =>
        Promise.all([
            import('@fontsource/dm-sans/latin-300.css'),
            import('@fontsource/dm-sans/latin-ext-300.css'),
            import('@fontsource/dm-sans/latin-400.css'),
            import('@fontsource/dm-sans/latin-ext-400.css'),
            import('@fontsource/dm-sans/latin-500.css'),
            import('@fontsource/dm-sans/latin-ext-500.css'),
            import('@fontsource/dm-sans/latin-600.css'),
            import('@fontsource/dm-sans/latin-ext-600.css'),
            import('@fontsource/dm-sans/latin-700.css'),
            import('@fontsource/dm-sans/latin-ext-700.css'),
            import('@fontsource/dm-sans/latin-400-italic.css'),
            import('@fontsource/dm-sans/latin-ext-400-italic.css'),
        ]),
    'google-sans': () =>
        Promise.all([
            import('@fontsource/google-sans/latin-400.css'),
            import('@fontsource/google-sans/latin-ext-400.css'),
            import('@fontsource/google-sans/latin-500.css'),
            import('@fontsource/google-sans/latin-ext-500.css'),
            import('@fontsource/google-sans/latin-600.css'),
            import('@fontsource/google-sans/latin-ext-600.css'),
            import('@fontsource/google-sans/latin-700.css'),
            import('@fontsource/google-sans/latin-ext-700.css'),
            import('@fontsource/google-sans/latin-400-italic.css'),
            import('@fontsource/google-sans/latin-ext-400-italic.css'),
        ]),
    nunito: () =>
        Promise.all([
            import('@fontsource/nunito/latin-300.css'),
            import('@fontsource/nunito/latin-ext-300.css'),
            import('@fontsource/nunito/latin-400.css'),
            import('@fontsource/nunito/latin-ext-400.css'),
            import('@fontsource/nunito/latin-600.css'),
            import('@fontsource/nunito/latin-ext-600.css'),
            import('@fontsource/nunito/latin-700.css'),
            import('@fontsource/nunito/latin-ext-700.css'),
            import('@fontsource/nunito/latin-400-italic.css'),
            import('@fontsource/nunito/latin-ext-400-italic.css'),
        ]),
    raleway: () =>
        Promise.all([
            import('@fontsource/raleway/latin-300.css'),
            import('@fontsource/raleway/latin-ext-300.css'),
            import('@fontsource/raleway/latin-400.css'),
            import('@fontsource/raleway/latin-ext-400.css'),
            import('@fontsource/raleway/latin-600.css'),
            import('@fontsource/raleway/latin-ext-600.css'),
            import('@fontsource/raleway/latin-700.css'),
            import('@fontsource/raleway/latin-ext-700.css'),
            import('@fontsource/raleway/latin-400-italic.css'),
            import('@fontsource/raleway/latin-ext-400-italic.css'),
        ]),
    'source-sans-3': () =>
        Promise.all([
            import('@fontsource/source-sans-3/latin-300.css'),
            import('@fontsource/source-sans-3/latin-ext-300.css'),
            import('@fontsource/source-sans-3/latin-400.css'),
            import('@fontsource/source-sans-3/latin-ext-400.css'),
            import('@fontsource/source-sans-3/latin-600.css'),
            import('@fontsource/source-sans-3/latin-ext-600.css'),
            import('@fontsource/source-sans-3/latin-700.css'),
            import('@fontsource/source-sans-3/latin-ext-700.css'),
        ]),
    merriweather: () =>
        Promise.all([
            import('@fontsource/merriweather/latin-300.css'),
            import('@fontsource/merriweather/latin-ext-300.css'),
            import('@fontsource/merriweather/latin-400.css'),
            import('@fontsource/merriweather/latin-ext-400.css'),
            import('@fontsource/merriweather/latin-700.css'),
            import('@fontsource/merriweather/latin-ext-700.css'),
            import('@fontsource/merriweather/latin-400-italic.css'),
            import('@fontsource/merriweather/latin-ext-400-italic.css'),
        ]),
    lora: () =>
        Promise.all([
            import('@fontsource/lora/latin-400.css'),
            import('@fontsource/lora/latin-ext-400.css'),
            import('@fontsource/lora/latin-500.css'),
            import('@fontsource/lora/latin-ext-500.css'),
            import('@fontsource/lora/latin-600.css'),
            import('@fontsource/lora/latin-ext-600.css'),
            import('@fontsource/lora/latin-700.css'),
            import('@fontsource/lora/latin-ext-700.css'),
            import('@fontsource/lora/latin-400-italic.css'),
            import('@fontsource/lora/latin-ext-400-italic.css'),
        ]),
    'playfair-display': () =>
        Promise.all([
            import('@fontsource/playfair-display/latin-400.css'),
            import('@fontsource/playfair-display/latin-ext-400.css'),
            import('@fontsource/playfair-display/latin-600.css'),
            import('@fontsource/playfair-display/latin-ext-600.css'),
            import('@fontsource/playfair-display/latin-700.css'),
            import('@fontsource/playfair-display/latin-ext-700.css'),
            import('@fontsource/playfair-display/latin-400-italic.css'),
            import('@fontsource/playfair-display/latin-ext-400-italic.css'),
        ]),
    cinzel: () =>
        Promise.all([
            import('@fontsource/cinzel/latin-400.css'),
            import('@fontsource/cinzel/latin-ext-400.css'),
            import('@fontsource/cinzel/latin-500.css'),
            import('@fontsource/cinzel/latin-ext-500.css'),
            import('@fontsource/cinzel/latin-600.css'),
            import('@fontsource/cinzel/latin-ext-600.css'),
            import('@fontsource/cinzel/latin-700.css'),
            import('@fontsource/cinzel/latin-ext-700.css'),
        ]),
    cormorant: () =>
        Promise.all([
            import('@fontsource/cormorant/latin-300.css'),
            import('@fontsource/cormorant/latin-ext-300.css'),
            import('@fontsource/cormorant/latin-400.css'),
            import('@fontsource/cormorant/latin-ext-400.css'),
            import('@fontsource/cormorant/latin-500.css'),
            import('@fontsource/cormorant/latin-ext-500.css'),
            import('@fontsource/cormorant/latin-600.css'),
            import('@fontsource/cormorant/latin-ext-600.css'),
            import('@fontsource/cormorant/latin-700.css'),
            import('@fontsource/cormorant/latin-ext-700.css'),
            import('@fontsource/cormorant/latin-400-italic.css'),
            import('@fontsource/cormorant/latin-ext-400-italic.css'),
        ]),
    'cormorant-garamond': () =>
        Promise.all([
            import('@fontsource/cormorant-garamond/latin-300.css'),
            import('@fontsource/cormorant-garamond/latin-ext-300.css'),
            import('@fontsource/cormorant-garamond/latin-400.css'),
            import('@fontsource/cormorant-garamond/latin-ext-400.css'),
            import('@fontsource/cormorant-garamond/latin-500.css'),
            import('@fontsource/cormorant-garamond/latin-ext-500.css'),
            import('@fontsource/cormorant-garamond/latin-600.css'),
            import('@fontsource/cormorant-garamond/latin-ext-600.css'),
            import('@fontsource/cormorant-garamond/latin-700.css'),
            import('@fontsource/cormorant-garamond/latin-ext-700.css'),
            import('@fontsource/cormorant-garamond/latin-400-italic.css'),
            import('@fontsource/cormorant-garamond/latin-ext-400-italic.css'),
        ]),
    'cormorant-sc': () =>
        Promise.all([
            import('@fontsource/cormorant-sc/latin-300.css'),
            import('@fontsource/cormorant-sc/latin-ext-300.css'),
            import('@fontsource/cormorant-sc/latin-400.css'),
            import('@fontsource/cormorant-sc/latin-ext-400.css'),
            import('@fontsource/cormorant-sc/latin-500.css'),
            import('@fontsource/cormorant-sc/latin-ext-500.css'),
            import('@fontsource/cormorant-sc/latin-600.css'),
            import('@fontsource/cormorant-sc/latin-ext-600.css'),
            import('@fontsource/cormorant-sc/latin-700.css'),
            import('@fontsource/cormorant-sc/latin-ext-700.css'),
        ]),
    'eb-garamond': () =>
        Promise.all([
            import('@fontsource/eb-garamond/latin-400.css'),
            import('@fontsource/eb-garamond/latin-ext-400.css'),
            import('@fontsource/eb-garamond/latin-500.css'),
            import('@fontsource/eb-garamond/latin-ext-500.css'),
            import('@fontsource/eb-garamond/latin-600.css'),
            import('@fontsource/eb-garamond/latin-ext-600.css'),
            import('@fontsource/eb-garamond/latin-400-italic.css'),
            import('@fontsource/eb-garamond/latin-ext-400-italic.css'),
        ]),
    'libre-baskerville': () =>
        Promise.all([
            import('@fontsource/libre-baskerville/latin-400.css'),
            import('@fontsource/libre-baskerville/latin-ext-400.css'),
            import('@fontsource/libre-baskerville/latin-700.css'),
            import('@fontsource/libre-baskerville/latin-ext-700.css'),
            import('@fontsource/libre-baskerville/latin-400-italic.css'),
            import('@fontsource/libre-baskerville/latin-ext-400-italic.css'),
        ]),
    'noto-serif': () =>
        Promise.all([
            import('@fontsource/noto-serif/latin-400.css'),
            import('@fontsource/noto-serif/latin-ext-400.css'),
            import('@fontsource/noto-serif/latin-600.css'),
            import('@fontsource/noto-serif/latin-ext-600.css'),
            import('@fontsource/noto-serif/latin-700.css'),
            import('@fontsource/noto-serif/latin-ext-700.css'),
            import('@fontsource/noto-serif/latin-400-italic.css'),
            import('@fontsource/noto-serif/latin-ext-400-italic.css'),
        ]),
    'source-serif-4': () =>
        Promise.all([
            import('@fontsource/source-serif-4/latin-400.css'),
            import('@fontsource/source-serif-4/latin-ext-400.css'),
            import('@fontsource/source-serif-4/latin-600.css'),
            import('@fontsource/source-serif-4/latin-ext-600.css'),
            import('@fontsource/source-serif-4/latin-700.css'),
            import('@fontsource/source-serif-4/latin-ext-700.css'),
        ]),
    'jetbrains-mono': () =>
        Promise.all([
            import('@fontsource/jetbrains-mono/latin-400.css'),
            import('@fontsource/jetbrains-mono/latin-ext-400.css'),
            import('@fontsource/jetbrains-mono/latin-500.css'),
            import('@fontsource/jetbrains-mono/latin-ext-500.css'),
            import('@fontsource/jetbrains-mono/latin-700.css'),
            import('@fontsource/jetbrains-mono/latin-ext-700.css'),
            import('@fontsource/jetbrains-mono/latin-400-italic.css'),
            import('@fontsource/jetbrains-mono/latin-ext-400-italic.css'),
        ]),
    'fira-code': () =>
        Promise.all([
            import('@fontsource/fira-code/latin-400.css'),
            import('@fontsource/fira-code/latin-ext-400.css'),
            import('@fontsource/fira-code/latin-500.css'),
            import('@fontsource/fira-code/latin-ext-500.css'),
            import('@fontsource/fira-code/latin-700.css'),
            import('@fontsource/fira-code/latin-ext-700.css'),
        ]),
    'abril-fatface': () =>
        Promise.all([
            import('@fontsource/abril-fatface/latin-400.css'),
            import('@fontsource/abril-fatface/latin-ext-400.css'),
        ]),
    monofett: () =>
        Promise.all([
            import('@fontsource/monofett/latin-400.css'),
            import('@fontsource/monofett/latin-ext-400.css'),
        ]),
};

export async function ensureBundledFontLoaded(packageId: string): Promise<void> {
    if (loadedPackages.has(packageId)) return;
    const loader = FONT_PACKAGE_LOADERS[packageId];
    if (!loader) return;
    loadedPackages.add(packageId);
    await loader();
}

let preloadAllPromise: Promise<void> | null = null;

/** Fire-and-forget: load all bundled families (when font picker opens). */
export function preloadAllBundledFonts(): Promise<void> {
    if (!preloadAllPromise) {
        preloadAllPromise = Promise.all(
            Object.keys(FONT_PACKAGE_LOADERS).map((id) => ensureBundledFontLoaded(id)),
        ).then(() => undefined);
    }
    return preloadAllPromise;
}
