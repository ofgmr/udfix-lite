/**
 * UYAP inline colors use Java-style signed 32-bit ARGB integers
 * (e.g. `-16777216` = 0xFF000000 = opaque black).
 * Inverse: `cssColorToUyapForeground` in `udfHfExportSegments.ts`.
 */

function channelHex(n: number): string {
    return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
}

/**
 * Convert UYAP `foreground` / `background` / `bgColor` to `#rrggbb`.
 * Returns `null` for empty, non-numeric, or sentinel `-256` (default highlight).
 */
export function uyapArgbToCssColor(value: string | undefined | null): string | null {
    if (value == null) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    if (trimmed === '-256') return null;

    if (trimmed.startsWith('#')) return trimmed;
    if (/^rgba?\(/i.test(trimmed)) return trimmed;

    if (!/^-?\d+$/.test(trimmed)) return null;

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;

    const argb = parsed >>> 0;
    const r = (argb >>> 16) & 0xff;
    const g = (argb >>> 8) & 0xff;
    const b = argb & 0xff;

    return `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`;
}
