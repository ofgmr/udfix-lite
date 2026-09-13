import type { ThemePalette } from '../stores/useThemeStore';
import brandingManifest from '../../branding.manifest.json';

/** Vite-served branding assets under `public/branding/`. */
export const UDFIX_BRAND_BASE_URL = `${import.meta.env.BASE_URL}branding/`;

const brand = (file: string) => `${UDFIX_BRAND_BASE_URL}${file}`;

/** Browser tab favicon (SVG mark). */
export const UDFIX_APP_ICON_URL = brand(brandingManifest.faviconSvg);

/**
 * Sidebar rail wordmarks — `l` = light UI, `d` = dark UI.
 * Filenames from `branding.manifest.json`; assets live in `public/branding/`.
 */
export const UDFIX_RAIL_LOGO_BY_THEME = Object.fromEntries(
    Object.entries(brandingManifest.railLogosByTheme).map(([palette, pair]) => [
        palette,
        { light: brand(pair.light), dark: brand(pair.dark) },
    ]),
) as Record<ThemePalette, { light: string; dark: string }>;

/** About dialog — full light wordmark. */
export const UDFIX_ABOUT_LOGO_URL = brand(brandingManifest.aboutLogoSvg);
