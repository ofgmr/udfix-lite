/** A4 @ 96dpi — PaginationPlus `pageWidth` ve cetvel genişliği (210mm) */
export const EDITOR_PAGE_WIDTH_PX = 794

/** A4 @ 96dpi — PaginationPlus `pageHeight` (297mm) */
export const EDITOR_PAGE_HEIGHT_PX = 1123

/** Çoklu kağıt formatları (96 DPI yaklaşımı) */
export type EditorPaperKey = 'A4'

export interface EditorPaperPreset {
    key: EditorPaperKey
    label: string
    widthPx: number
    heightPx: number
}

export const EDITOR_PAPER_PRESETS: Record<EditorPaperKey, EditorPaperPreset> = {
    A4: { key: 'A4', label: 'A4', widthPx: 794, heightPx: 1123 },
}

/**
 * PaginationPlus üst/alt gövde kenarı: `marginTop` ve `marginBottom` (HF + cetvel ile uyum).
 * `contentMarginTop/Bottom` header/footer ile içerik arası sabit boşluk için taban olarak kullanılır.
 */
export const EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX = 40

/** Gövde ile header/footer arası taban (PaginationPlus `contentMarginTop` / `contentMarginBottom`) */
export const EDITOR_PAGINATION_CONTENT_MARGIN_BASE_PX = 10

/** Varsayılan sayfa kenar boşlukları (px); ruler + PaginationPlus ile senkron */
export const EDITOR_PAGE_MARGIN_LEFT_PX = 50
export const EDITOR_PAGE_MARGIN_RIGHT_PX = 50

/** Metin alanı = pageWidth - marginLeft - marginRight */
export const EDITOR_CONTENT_INNER_WIDTH_PX =
    EDITOR_PAGE_WIDTH_PX - EDITOR_PAGE_MARGIN_LEFT_PX - EDITOR_PAGE_MARGIN_RIGHT_PX

/** 96 DPI yaklaşımı (Pagination / cetvel ile aynı ölçek) */
export const EDITOR_CM_TO_PX = 37.7952755906

/** 0,25 cm adımı — tam sayı px (sub-pixel cetvel titremesini önler) */
export const EDITOR_SNAP_STEP_PX = Math.round(EDITOR_CM_TO_PX * 0.25)

/** Cetvel / sayfa marjı snap — her zaman tam px */
export function editorSnapRulerPx(px: number): number {
    const step = EDITOR_SNAP_STEP_PX
    if (step <= 0) return Math.round(px)
    return Math.round(px / step) * step
}

/**
 * Sol+sağ marj sonrası minimum metin sütunu genişliği.
 * Çok yüksek tutulduğunda (ör. 8.5cm+) cetvel ile 5cm+5cm marj istenince clamp metni
 * beklenenden dar “varsayılan” sütuna sıkıştırıyordu. ~5.5cm alt sınır, A4’te geniş
 * kenar boşluklarına izin verir; tablolar için yine makul bir taban.
 */
export const EDITOR_PAGINATION_MIN_INNER_WIDTH_CM = 5.5
export const EDITOR_PAGINATION_MIN_INNER_WIDTH_PX = Math.round(
    EDITOR_PAGINATION_MIN_INNER_WIDTH_CM * EDITOR_CM_TO_PX,
)

/**
 * Üst/alt Pagination marj toplamı için rezerv (HF + contentMargin + minimum gövde).
 * Aşılınca eklenti / CSS hesapları taşıyor; cetvel üst sınırı buna göre.
 */
export const EDITOR_PAGINATION_VERTICAL_RESERVE_PX = 140

const PAGE_MARGIN_HARD_MIN = 16

/** Tek kenar için güvenli üst sınır: iki kenar da bu değerde olsa iç sütun ≥ min inner */
export function editorMaxHorizontalPageMarginPx(pageWidth: number): number {
    const w = Math.max(pageWidth, EDITOR_PAGINATION_MIN_INNER_WIDTH_PX + 2 * PAGE_MARGIN_HARD_MIN)
    return Math.max(PAGE_MARGIN_HARD_MIN, Math.floor((w - EDITOR_PAGINATION_MIN_INNER_WIDTH_PX) / 2))
}

/**
 * Sol/sağ sayfa marjını birlikte sıkıştırır; iç sütun her zaman ≥ EDITOR_PAGINATION_MIN_INNER_WIDTH_PX kalır.
 */
export function editorClampHorizontalPageMargins(
    pageWidth: number,
    left: number,
    right: number,
): { left: number; right: number } {
    const min = PAGE_MARGIN_HARD_MIN
    const maxSum = pageWidth - EDITOR_PAGINATION_MIN_INNER_WIDTH_PX
    const maxEach = editorMaxHorizontalPageMarginPx(pageWidth)
    let L = Math.min(maxEach, Math.max(min, left))
    let R = Math.min(maxEach, Math.max(min, right))
    if (L + R > maxSum) {
        const s = maxSum / (L + R)
        L = Math.max(min, Math.floor(L * s))
        R = Math.max(min, maxSum - L)
    }
    return { left: L, right: R }
}

/** Cetvel: gövde tabanı (40 px) üzerine en fazla ≈5 cm ek üst/alt marj */
export const EDITOR_RULER_VERTICAL_EXTRA_MAX_PX = Math.round(5 * EDITOR_CM_TO_PX)

/** Üst veya alt tek marj için cetvel üst sınırı (px, Pagination marginTop/Bottom toplam değeri) */
export function editorMaxVerticalMarginTotalPx(pageHeight: number): number {
    const band = pageHeight - EDITOR_PAGINATION_VERTICAL_RESERVE_PX
    const half = Math.floor(Math.max(0, band) / 2)
    const cap5cm = 40 + EDITOR_RULER_VERTICAL_EXTRA_MAX_PX
    return Math.max(40, Math.min(half, cap5cm))
}

/** Üst+alt birlikte sayfa yüksekliğini aşmasın */
export function editorClampVerticalPageMargins(
    pageHeight: number,
    top: number,
    bottom: number,
): { top: number; bottom: number } {
    const maxEach = editorMaxVerticalMarginTotalPx(pageHeight)
    const maxSum = Math.max(80, pageHeight - EDITOR_PAGINATION_VERTICAL_RESERVE_PX)
    let t = Math.min(maxEach, Math.max(40, top))
    let b = Math.min(maxEach, Math.max(40, bottom))
    if (t + b > maxSum) {
        const scale = maxSum / (t + b)
        t = Math.max(40, Math.round(t * scale))
        b = Math.max(40, maxSum - t)
        if (t + b > maxSum) b = Math.max(40, maxSum - t)
    }
    return { top: t, bottom: b }
}

export const EDITOR_RULER_MAX_HORIZONTAL_MARGIN_PX = editorMaxHorizontalPageMarginPx(EDITOR_PAGE_WIDTH_PX)
export const EDITOR_RULER_MAX_VERTICAL_MARGIN_TOTAL_PX = editorMaxVerticalMarginTotalPx(EDITOR_PAGE_HEIGHT_PX)

/**
 * Dikey marj cetveli: gövde tabanı (40px) üzerine eklenebilir ek marj üst sınırı (cetvel ≈0,5–4 cm ile uyumlu).
 */
export const EDITOR_RULER_VERTICAL_MARGIN_SPINNER_RANGE_CM = 4
export const EDITOR_RULER_VERTICAL_MARGIN_SPINNER_RANGE_PX = Math.round(
    EDITOR_RULER_VERTICAL_MARGIN_SPINNER_RANGE_CM * EDITOR_CM_TO_PX,
)

/** Sol sütun — spinner + hizalama (px) */
export const EDITOR_RULER_LEFT_CONTROLS_WIDTH_PX = 140

/** İnce cam “hap” genişliği (sütun içinde ortalanır) */
export const EDITOR_RULER_VERTICAL_SPINNER_PILL_W_PX = 44
