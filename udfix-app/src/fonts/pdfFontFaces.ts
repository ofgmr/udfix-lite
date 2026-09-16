import {
    BUNDLED_FONT_NAMES,
    getBundledFontByName,
    PDF_DEFAULT_FONT_FAMILY,
    PDF_FONT_ITALIC_WEIGHTS,
    PDF_FONT_WEIGHTS,
} from './offlineFontRegistry';

/** Vite resolves woff2 as base64 data URLs when `?inline` is set (PDF weights only) */
const LATIN_WOFF2 = {
    ...import.meta.glob<string>('/node_modules/@fontsource/*/files/*-latin-{300,400,500,600,700}-normal.woff2', {
        query: '?inline',
        import: 'default',
    }),
    ...import.meta.glob<string>('/node_modules/@fontsource/*/files/*-latin-400-italic.woff2', {
        query: '?inline',
        import: 'default',
    }),
    ...import.meta.glob<string>('/node_modules/@fontsource/*/files/*-latin-ext-{300,400,500,600,700}-normal.woff2', {
        query: '?inline',
        import: 'default',
    }),
    ...import.meta.glob<string>('/node_modules/@fontsource/*/files/*-latin-ext-400-italic.woff2', {
        query: '?inline',
        import: 'default',
    }),
};

const PACKAGE_TO_FAMILY = new Map(
    [...BUNDLED_FONT_NAMES]
        .map((name) => {
            const entry = getBundledFontByName(name);
            return entry?.packageId ? ([entry.packageId, name] as const) : null;
        })
        .filter((x): x is readonly [string, string] => x !== null),
);

type ParsedFace = {
    packageId: string;
    subset: 'latin' | 'latin-ext';
    weight: number;
    style: 'normal' | 'italic';
    loader: () => Promise<string>;
};

function parseWoff2Path(path: string): Omit<ParsedFace, 'loader'> | null {
    const m = path.match(
        /(?:@fontsource|node_modules\/@fontsource)\/([^/]+)\/files\/[^/]+-(latin-ext|latin)-(\d+)-(normal|italic)\.woff2$/,
    );
    if (!m) return null;
    const [, packageId, subset, weightStr, style] = m;
    const weight = Number(weightStr);
    if (!Number.isFinite(weight)) return null;
    if (subset !== 'latin' && subset !== 'latin-ext') return null;
    if (style !== 'normal' && style !== 'italic') return null;
    return { packageId, subset, weight, style };
}

const FACE_INDEX = new Map<string, ParsedFace>();

for (const [path, loader] of Object.entries(LATIN_WOFF2)) {
    const parsed = parseWoff2Path(path);
    if (!parsed || !PACKAGE_TO_FAMILY.has(parsed.packageId)) continue;
    const key = `${parsed.packageId}:${parsed.weight}:${parsed.style}:${parsed.subset}`;
    FACE_INDEX.set(key, {
        ...parsed,
        loader: loader as () => Promise<string>,
    });
}

const UNICODE_RANGE: Record<ParsedFace['subset'], string> = {
    latin:
        'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
    'latin-ext':
        'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
};

const faceCssCache = new Map<string, string>();
const builtFamiliesCache = new Map<string, string>();

/** Families that only ship regular (400) from @fontsource */
const PDF_SINGLE_WEIGHT_PACKAGES = new Set(['abril-fatface', 'monofett']);

function wantedVariantsForFamily(familyName: string): Array<{ weight: number; style: 'normal' | 'italic' }> {
    const entry = getBundledFontByName(familyName);
    if (entry?.packageId && PDF_SINGLE_WEIGHT_PACKAGES.has(entry.packageId)) {
        return [{ weight: 400, style: 'normal' }];
    }

    const weights =
        entry?.packageId === 'google-sans'
            ? ([400, 500, 600, 700] as const)
            : PDF_FONT_WEIGHTS;
    const italics = [...PDF_FONT_ITALIC_WEIGHTS];
    const variants: Array<{ weight: number; style: 'normal' | 'italic' }> = [...weights].map((w) => ({
        weight: w,
        style: 'normal' as const,
    }));
    for (const w of italics) {
        variants.push({ weight: w, style: 'italic' });
    }
    return variants;
}

async function loadFaceCss(packageId: string, weight: number, style: 'normal' | 'italic'): Promise<string> {
    const cacheKey = `${packageId}:${weight}:${style}`;
    const cached = faceCssCache.get(cacheKey);
    if (cached) return cached;

    const family = PACKAGE_TO_FAMILY.get(packageId);
    if (!family) return '';

    const subsets: ParsedFace['subset'][] = ['latin-ext', 'latin'];
    const rules: string[] = [];

    for (const subset of subsets) {
        const face = FACE_INDEX.get(`${packageId}:${weight}:${style}:${subset}`);
        if (!face) continue;
        const dataUrl = await face.loader();
        rules.push(`@font-face {
  font-family: ${JSON.stringify(family)};
  font-style: ${style};
  font-weight: ${weight};
  font-display: swap;
  src: url(${dataUrl}) format('woff2');
  unicode-range: ${UNICODE_RANGE[subset]};
}`);
    }

    const css = rules.join('\n');
    faceCssCache.set(cacheKey, css);
    return css;
}

async function buildFamilyCss(familyName: string): Promise<string> {
    const cached = builtFamiliesCache.get(familyName);
    if (cached) return cached;

    const entry = getBundledFontByName(familyName);
    if (!entry?.packageId) {
        builtFamiliesCache.set(familyName, '');
        return '';
    }

    const chunks: string[] = [];
    for (const { weight, style } of wantedVariantsForFamily(familyName)) {
        const block = await loadFaceCss(entry.packageId, weight, style);
        if (block) chunks.push(block);
    }

    const css = chunks.join('\n');
    builtFamiliesCache.set(familyName, css);
    return css;
}

const QUOTED_FONT_RE = /font-family:\s*([^;}"']+)/gi;
const INLINE_STYLE_RE = /style="([^"]*)"/gi;

/** Collect primary font-family names referenced in export HTML / inline styles */
export function collectFontFamiliesFromHtml(html: string): Set<string> {
    const found = new Set<string>();
    const addFromList = (raw: string) => {
        const first = raw.split(',')[0]?.trim().replace(/^["']|["']$/g, '');
        if (first) found.add(first);
    };

    let m: RegExpExecArray | null;
    QUOTED_FONT_RE.lastIndex = 0;
    while ((m = QUOTED_FONT_RE.exec(html)) !== null) {
        addFromList(m[1]);
    }

    INLINE_STYLE_RE.lastIndex = 0;
    while ((m = INLINE_STYLE_RE.exec(html)) !== null) {
        const inner = m[1];
        const ff = /font-family:\s*([^;]+)/i.exec(inner);
        if (ff) addFromList(ff[1]);
    }

    return found;
}

export interface BuildPdfFontFaceCssOptions {
    /** Extra families from computed editor styles */
    extraFamilies?: Iterable<string>;
    /** When true, embed every bundled catalogue family (larger HTML) */
    embedAllBundled?: boolean;
}

/**
 * Builds inline `@font-face` CSS (base64 woff2) for the headless print window.
 * No network — required because PDF loads via `data:text/html`.
 */
export async function buildPdfFontFaceCss(
    bodyHtml: string,
    options: BuildPdfFontFaceCssOptions = {},
): Promise<string> {
    const families = new Set<string>([PDF_DEFAULT_FONT_FAMILY]);
    for (const name of collectFontFamiliesFromHtml(bodyHtml)) {
        if (getBundledFontByName(name)) families.add(name);
    }
    if (options.extraFamilies) {
        for (const name of options.extraFamilies) {
            if (getBundledFontByName(name)) families.add(name);
        }
    }
    if (options.embedAllBundled) {
        for (const name of BUNDLED_FONT_NAMES) families.add(name);
    }

    const parts: string[] = [];
    for (const family of families) {
        const block = await buildFamilyCss(family);
        if (block) parts.push(block);
    }
    return parts.join('\n');
}
