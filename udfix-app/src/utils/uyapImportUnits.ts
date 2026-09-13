/** UYAP `pageFormat` / paragraf ölçüleri: pt ↔ px (96dpi). */
export const UYAP_PT_TO_PX = 96 / 72;

export function uyapPtToPx(pt: number): number {
    if (!Number.isFinite(pt)) return 0;
    return pt * UYAP_PT_TO_PX;
}

export function uyapPtStringToPx(value: string | undefined): number | null {
    if (value == null || value === '') return null;
    const n = Number.parseFloat(String(value));
    return Number.isFinite(n) ? uyapPtToPx(n) : null;
}

/** First TabSet stop from UYAP `TabSet="74.0:0:0,360.0:0:0"` → CSS `tab-size` px (UYAP pt × 4/3). */
export function uyapTabSetFirstStopCssPx(tabSet: string | undefined): number | null {
    if (tabSet == null || String(tabSet).trim() === '') return null;
    const firstToken = String(tabSet).split(',')[0]?.split(':')[0]?.trim() ?? '';
    const pt = Number.parseFloat(firstToken);
    if (!Number.isFinite(pt) || pt <= 0) return null;
    return pt * (4 / 3);
}

export function uyapPtToMarginPxString(pt: number): string {
    const px = uyapPtToPx(pt);
    if (Math.abs(px - Math.round(px)) < 0.01) return `${Math.round(px)}px`;
    return `${px.toFixed(2)}px`;
}

/** `buildPageFormatFromMargins` tersi: headerFOffset ≈ headerMarginTop + 20 pt */
/** UYAP export/import’ta yaygın gövde varsayılanı (`uyapExportBuild` / `hvl-default`). */
export const UYAP_DEFAULT_SPACE_BELOW_PT = 10;
/** `nmr` stil örneği ve bazı şablon paragrafları. */
export const UYAP_DEFAULT_SPACE_ABOVE_PT = 8.503938;

function uyapSpacePtIsSchemaDefault(kind: 'above' | 'below', pt: number): boolean {
    if (kind === 'below' && Math.abs(pt - UYAP_DEFAULT_SPACE_BELOW_PT) < 0.02) return true;
    if (
        kind === 'above' &&
        (Math.abs(pt - UYAP_DEFAULT_SPACE_BELOW_PT) < 0.02 ||
            Math.abs(pt - UYAP_DEFAULT_SPACE_ABOVE_PT) < 0.02)
    ) {
        return true;
    }
    return false;
}

/** `SpaceBelow` / `SpaceAbove` yalnızca şema varsayılanından farklıysa CSS marjına çevrilir. */
export function uyapSpaceToCssMargin(
    kind: 'above' | 'below',
    spacePt: string | undefined,
): string | null {
    if (spacePt == null || String(spacePt).trim() === '') return null;
    const pt = Number.parseFloat(String(spacePt).trim());
    if (!Number.isFinite(pt) || pt <= 0 || uyapSpacePtIsSchemaDefault(kind, pt)) return null;
    return uyapPtToMarginPxString(pt);
}

/** Export: CSS marjı → UYAP pt; şema varsayılanındaysa `null` (XML’e yazma). */
export function cssMarginToUyapSpacePt(
    kind: 'above' | 'below',
    cssMargin: string | number | null | undefined,
): string | null {
    if (cssMargin == null || cssMargin === '') return null;
    let px: number;
    if (typeof cssMargin === 'number') {
        px = cssMargin;
    } else {
        const raw = String(cssMargin).trim();
        const m = raw.match(/^(-?\d+(?:\.\d+)?)(px|pt)?$/i);
        if (!m) return null;
        const n = Number.parseFloat(m[1]);
        if (!Number.isFinite(n)) return null;
        px = (m[2] ?? 'px').toLowerCase() === 'pt' ? n * UYAP_PT_TO_PX : n;
    }
    if (!Number.isFinite(px) || px <= 0) return null;
    const pt = px / UYAP_PT_TO_PX;
    if (uyapSpacePtIsSchemaDefault(kind, pt)) return null;
    if (Math.abs(pt - Math.round(pt)) < 1e-6) return String(Math.round(pt));
    return pt.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

/** UYAP `Hanging` / `HangingIndent`: sıfır veya boş = şema varsayılanı. */
export function uyapHangingPtIsSchemaDefault(pt: number): boolean {
    return !Number.isFinite(pt) || Math.abs(pt) < 0.02;
}

export function uyapHeaderFooterOffsetsToMarginPx(headerFOffsetPt?: string, footerFOffsetPt?: string): {
    headerMarginTop: number;
    footerMarginBottom: number;
} {
    const hPt = headerFOffsetPt != null ? Number.parseFloat(headerFOffsetPt) : 20;
    const fPt = footerFOffsetPt != null ? Number.parseFloat(footerFOffsetPt) : 20;
    const hBase = Number.isFinite(hPt) ? hPt : 20;
    const fBase = Number.isFinite(fPt) ? fPt : 20;
    return {
        headerMarginTop: Math.max(0, Math.round(uyapPtToPx(hBase - 20))),
        footerMarginBottom: Math.max(0, Math.round(uyapPtToPx(fBase - 20))),
    };
}
