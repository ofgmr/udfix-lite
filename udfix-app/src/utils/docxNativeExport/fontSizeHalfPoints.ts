/** docx TextRun `size` is in half-points (12pt → 24). Editor stores `fontSize` as `"Npt"`. */
export function fontSizeHalfPointsFromEditor(raw: unknown): number | undefined {
    if (raw == null) return undefined;
    const s = String(raw).trim();
    if (!s) return undefined;

    const ptMatch = s.match(/^([\d.]+)\s*pt$/i);
    if (ptMatch) {
        const pt = Number.parseFloat(ptMatch[1]);
        if (Number.isFinite(pt) && pt > 0) return Math.round(pt * 2);
        return undefined;
    }

    const pxMatch = s.match(/^([\d.]+)\s*px$/i);
    if (pxMatch) {
        const px = Number.parseFloat(pxMatch[1]);
        if (Number.isFinite(px) && px > 0) return Math.round(px * 0.75 * 2);
        return undefined;
    }

    const n = Number.parseFloat(s);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 2);
    return undefined;
}

/** CSS font-size (`Npx` / `Npt`) → docx half-points. */
export function fontSizeHalfPointsFromCssPx(raw: string | undefined): number | undefined {
    return fontSizeHalfPointsFromCssLength(raw);
}

/** CSS font-size length → docx half-points (`12pt` → 24, `16px` → 24). */
export function fontSizeHalfPointsFromCssLength(raw: string | undefined): number | undefined {
    if (!raw?.trim()) return undefined;
    const s = raw.trim().toLowerCase();
    const ptMatch = s.match(/^([\d.]+)\s*pt$/);
    if (ptMatch) {
        const pt = Number.parseFloat(ptMatch[1]);
        if (Number.isFinite(pt) && pt > 0) return Math.round(pt * 2);
        return undefined;
    }
    const pxMatch = s.match(/^([\d.]+)\s*px$/);
    if (pxMatch) {
        const px = Number.parseFloat(pxMatch[1]);
        if (Number.isFinite(px) && px > 0) return Math.round(px * 0.75 * 2);
        return undefined;
    }
    const n = Number.parseFloat(s);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 2);
    return undefined;
}

/** Default body/HF size: 12pt → 24 half-points. */
export const DEFAULT_DOCX_FONT_HALF_POINTS = 24;
