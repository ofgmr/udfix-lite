import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { Editor } from '@tiptap/react';
import { useHeaderFooterStore, scheduleSyncHfToEditor } from '../../stores/useHeaderFooterStore';
import {
    applyPaginationMargins,
    applyPaginationMarginsVisualOnly,
    getPaginationMargins,
    getPaginationPageHeight,
} from '../../utils/paginationMarginSync';
import {
    EDITOR_CM_TO_PX,
    EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX,
    EDITOR_PAGINATION_VERTICAL_RESERVE_PX,
    EDITOR_PAGE_HEIGHT_PX,
    EDITOR_RULER_LEFT_CONTROLS_WIDTH_PX,
    EDITOR_RULER_VERTICAL_MARGIN_SPINNER_RANGE_CM,
    EDITOR_RULER_VERTICAL_MARGIN_SPINNER_RANGE_PX,
    EDITOR_SNAP_STEP_PX,
    editorClampHorizontalPageMargins,
    editorClampVerticalPageMargins,
    editorMaxVerticalMarginTotalPx,
    editorSnapRulerPx,
} from '../../utils/editorLayout';
import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import {
    LIST_ITEM_DEFAULT_MARGIN_LEFT,
    LIST_ITEM_DEFAULT_TEXT_INDENT,
} from '../../extensions/Indent';

/** Pagination gövde tabanı (HF ile uyumlu); üst marj `marginTop`, alt marj `marginBottom` */
const PAGINATION_BODY_BASE = EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX;

const DEFAULT_PAGE_WIDTH_PX = 794;
const THROTTLE_MS = 70;

/** Gövde üstüne eklenebilir marj için cetvel iz uzunluğu (px) — `editorLayout` ile aynı (≈4 cm) */
const VERT_SPINNER_TRACK_PX = EDITOR_RULER_VERTICAL_MARGIN_SPINNER_RANGE_PX;
/** Yatay cetvel şeridi yüksekliği (px) — kılavuz çizgisi bunun altından başlar */
const RULER_HORIZONTAL_HEIGHT = 23;

type DragTarget =
    | 'firstLine'
    | 'hanging'
    | 'paragraphRight'
    | 'pageLeft'
    | 'pageRight'
    | 'pageTop'
    | 'pageBottom';

export interface RulerProps {
    editor: Editor | null;
    /** PaginationPlus `pageWidth` ile aynı (794 A4) */
    pageWidthPx?: number;
    /** Kağıt yüksekliği — dikey marj sütunu bu yükseklikte; UdfixEditor `pageSize` ile senkron (A3/Letter vb.). */
    pageHeightPx?: number;
    showRuler: boolean;
    onToggleRuler: () => void;
}

/** TipTap v3: `updateMargins` komutu `options` getter’ına yazar — metin/CSS güncellenmez; storage + CSS burada. */
function runUpdateMargins(
    editor: Editor,
    m: { top: number; bottom: number; left: number; right: number },
) {
    return applyPaginationMargins(editor, m);
}

/**
 * Persist extra top/bottom (above PaginationPlus body base) into the HF store.
 *
 * Margins are already committed by `applyPaginationMargins` / `flushMarginApplyQueue`.
 * When PaginationPlus storage is readable, skip `scheduleSyncHfToEditor` — that path
 * would compile HF HTML and rebuild decorations a second time (vertical ruler jitter).
 * If storage is missing (plugin not ready / editor gone), schedule HF sync as a
 * fallback so store offsets still reach the editor when it mounts.
 */
function persistVerticalMarginsToHeaderFooter(editor: Editor | null, topPx: number, bottomPx: number) {
    const hf = useHeaderFooterStore.getState();
    hf.updateSettings({
        headerMarginTop: Math.max(0, Math.round(topPx - PAGINATION_BODY_BASE)),
        footerMarginBottom: Math.max(0, Math.round(bottomPx - PAGINATION_BODY_BASE)),
    });
    hf.save();
    const canReadPaginationStorage = Boolean(
        editor && !editor.isDestroyed && getPaginationMargins(editor),
    );
    if (canReadPaginationStorage) return;
    scheduleSyncHfToEditor();
}

const snapPx = editorSnapRulerPx;
const pxToCm = (px: number) => px / EDITOR_CM_TO_PX;
const fmtCm = (px: number) => `${pxToCm(px).toFixed(2)} cm`;

function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
}

/** Ek marj (40 üstü) → 1…5 “satır” göstergesi (spinner ölçeği boyunca) */
function extraPxToLineDisplay(extraPx: number, extraMaxPx: number) {
    if (extraMaxPx <= 0) return 1;
    return 1 + (clamp(extraPx, 0, extraMaxPx) / extraMaxPx) * 4;
}

function selectionHasListItem(editor: Editor): boolean {
    const $from = editor.state.selection.$from;
    for (let d = 1; d <= $from.depth; d++) {
        if ($from.node(d).type.name === 'listItem') return true;
    }
    return false;
}

/** Cetvel üzerinde gösterilen gerçek ek marj aralığı (cm). 1 cm = EDITOR_CM_TO_PX. */
const RULER_EXTRA_CM_MIN = 0;
const RULER_EXTRA_CM_MAX = EDITOR_RULER_VERTICAL_MARGIN_SPINNER_RANGE_CM;

const CM_TICKS_TR = (() => {
    const out: number[] = [];
    for (let v = RULER_EXTRA_CM_MIN; v <= RULER_EXTRA_CM_MAX + 1e-9; v += 0.25) {
        out.push(Math.round(v * 100) / 100);
    }
    return out;
})();

const fmtCmTrShort = (cm: number) =>
    new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(cm);

/** Sadece bu cm değerlerinde sayı göster (çentikler aynı 0,25 adımda kalır) */
const VERT_RULER_VISIBLE_LABEL_CM = new Set([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]);
function shouldShowVertRulerLabel(cm: number): boolean {
    for (const v of VERT_RULER_VISIBLE_LABEL_CM) {
        if (Math.abs(cm - v) < 1e-4) return true;
    }
    return false;
}

function verticalTrackTopPx(cm: number, flipVertical: boolean): number {
    const y = clamp(cm * EDITOR_CM_TO_PX, 0, VERT_SPINNER_TRACK_PX);
    return flipVertical ? VERT_SPINNER_TRACK_PX - y : y;
}

/** Üst/alt ek marj üst sınırı (px): cetvel tavanı + üst+alt toplamı Pagination ile uyumlu */
function verticalExtraMaxPxForEdge(
    pageHeight: number,
    edge: 'top' | 'bottom',
    marginTop: number,
    marginBottom: number,
): number {
    const maxEach = editorMaxVerticalMarginTotalPx(pageHeight);
    const maxSum = Math.max(80, pageHeight - EDITOR_PAGINATION_VERTICAL_RESERVE_PX);
    if (edge === 'top') {
        const maxTop = Math.min(maxEach, maxSum - marginBottom);
        return Math.min(
            EDITOR_RULER_VERTICAL_MARGIN_SPINNER_RANGE_PX,
            Math.max(0, maxTop - PAGINATION_BODY_BASE),
        );
    }
    const maxBottom = Math.min(maxEach, maxSum - marginTop);
    return Math.min(
        EDITOR_RULER_VERTICAL_MARGIN_SPINNER_RANGE_PX,
        Math.max(0, maxBottom - PAGINATION_BODY_BASE),
    );
}

/** Yatay cetvel (RulerScale) ile aynı çentik mantığı — uzunluk px */
function verticalTickWidthPx(i: number): number {
    if (i % 4 === 0) return 11;
    if (i % 2 === 0) return 7;
    return 4;
}

function verticalTickColor(i: number): string {
    if (i % 4 === 0) return 'var(--muted-foreground)';
    if (i % 2 === 0) return 'color-mix(in srgb, var(--muted-foreground) 60%, transparent)';
    return 'color-mix(in srgb, var(--muted-foreground) 35%, transparent)';
}

const HORIZONTAL_HANDLE_FILL = 'color-mix(in srgb, var(--primary) 74%, var(--foreground) 26%)';
const HORIZONTAL_HANDLE_STROKE = 'color-mix(in srgb, var(--foreground) 34%, transparent)';
const HORIZONTAL_HANDLE_HILITE = 'color-mix(in srgb, white 42%, transparent)';

function handleFilter(active: boolean) {
    return active
        ? 'drop-shadow(0 0 0.18rem color-mix(in srgb, var(--primary) 60%, transparent)) drop-shadow(0 0.08rem 0.12rem color-mix(in srgb, var(--foreground) 22%, transparent))'
        : 'drop-shadow(0 0.06rem 0.1rem color-mix(in srgb, var(--foreground) 18%, transparent))';
}

function PageMarginHandle({ active }: { active: boolean }) {
    return (
        <svg width="15" height="14" viewBox="0 0 15 14" aria-hidden style={{ display: 'block', filter: handleFilter(active) }}>
            <path
                d="M7.5 1.15 13.25 5.8h-2.05v6.05c0 .62-.5 1.12-1.12 1.12H4.92c-.62 0-1.12-.5-1.12-1.12V5.8H1.75L7.5 1.15Z"
                fill={HORIZONTAL_HANDLE_FILL}
                stroke={HORIZONTAL_HANDLE_STROKE}
                strokeWidth="0.7"
                strokeLinejoin="round"
            />
            <path d="M5.15 6.25h4.7" stroke={HORIZONTAL_HANDLE_HILITE} strokeWidth="0.8" strokeLinecap="round" />
        </svg>
    );
}

function RightIndentHandle({ active }: { active: boolean }) {
    return (
        <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden style={{ display: 'block', filter: handleFilter(active) }}>
            <path
                d="M12.2 1.45v9.1c0 .72-.8 1.16-1.41.78L2.55 6.8a.92.92 0 0 1 0-1.6L10.79.67c.61-.38 1.41.06 1.41.78Z"
                fill={HORIZONTAL_HANDLE_FILL}
                stroke={HORIZONTAL_HANDLE_STROKE}
                strokeWidth="0.7"
                strokeLinejoin="round"
            />
            <path d="M10.25 3.45v5.1" stroke={HORIZONTAL_HANDLE_HILITE} strokeWidth="0.8" strokeLinecap="round" />
        </svg>
    );
}

function FirstLineHandle({ active }: { active: boolean }) {
    return (
        <svg width="15" height="12" viewBox="0 0 15 12" aria-hidden style={{ display: 'block', filter: handleFilter(active) }}>
            <path
                d="M7.5 10.55 2.02 2.77c-.42-.6.01-1.42.75-1.42h9.46c.74 0 1.17.82.75 1.42L7.5 10.55Z"
                fill={HORIZONTAL_HANDLE_FILL}
                stroke={HORIZONTAL_HANDLE_STROKE}
                strokeWidth="0.7"
                strokeLinejoin="round"
            />
            <path d="M4.65 2.95h5.7" stroke={HORIZONTAL_HANDLE_HILITE} strokeWidth="0.8" strokeLinecap="round" />
        </svg>
    );
}

function HangingIndentHandle({ active }: { active: boolean }) {
    return (
        <svg width="15" height="13" viewBox="0 0 15 13" aria-hidden style={{ display: 'block', filter: handleFilter(active) }}>
            <path
                d="M7.5 1.3 13.05 6.95c.43.44.12 1.18-.5 1.18H2.45c-.62 0-.93-.74-.5-1.18L7.5 1.3Z"
                fill={HORIZONTAL_HANDLE_FILL}
                stroke={HORIZONTAL_HANDLE_STROKE}
                strokeWidth="0.7"
                strokeLinejoin="round"
            />
            <rect
                x="4.1"
                y="7.45"
                width="6.8"
                height="4.25"
                rx="1.25"
                fill={HORIZONTAL_HANDLE_FILL}
                stroke={HORIZONTAL_HANDLE_STROKE}
                strokeWidth="0.7"
            />
            <path d="M5.25 8.65h4.5" stroke={HORIZONTAL_HANDLE_HILITE} strokeWidth="0.75" strokeLinecap="round" />
        </svg>
    );
}

/** İnce dikey marj cetveli: etiketler tick ile aynı eksende (yatay cetvel ile uyumlu dil) */
const TuneKnobSpinner = memo(
    React.forwardRef<
        HTMLDivElement,
        {
            displayLine: number;
            extraPx: number;
            extraMaxPx: number;
            ariaLabel: string;
            isDragging: boolean;
            /** Üst: 0→4 cm üstten aşağı. Alt: 0→4 cm alttan yukarı. */
            flipVertical?: boolean;
            onMouseDown: React.MouseEventHandler<HTMLDivElement>;
        }
    >(function TuneKnobSpinner(
        { displayLine, extraPx, extraMaxPx, ariaLabel, isDragging, flipVertical = false, onMouseDown },
        ref,
    ) {
        const clampedExtraPx = clamp(extraPx, 0, Math.min(extraMaxPx, VERT_SPINNER_TRACK_PX));
        const scaleCm = pxToCm(clampedExtraPx);
        const knobTopPx = flipVertical ? VERT_SPINNER_TRACK_PX - clampedExtraPx : clampedExtraPx;

        return (
            <div
                ref={ref}
                role="slider"
                tabIndex={0}
                className="group relative mx-auto flex w-full shrink-0 cursor-ns-resize touch-none select-none px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                aria-label={ariaLabel}
                aria-valuemin={RULER_EXTRA_CM_MIN}
                aria-valuemax={RULER_EXTRA_CM_MAX}
                aria-valuenow={Math.round(scaleCm * 100) / 100}
                aria-valuetext={`Yaklaşık ${displayLine.toFixed(1)} satır`}
                onMouseDown={onMouseDown}
            >
                <div
                    className="flex w-full gap-0.5"
                    style={{ height: VERT_SPINNER_TRACK_PX }}
                >
                    {/* Sayılar — sabit dar sütun; tick ile aynı px ekseninde. */}
                    <div className="relative w-[22px] shrink-0" aria-hidden>
                        {CM_TICKS_TR.map((cm) =>
                            shouldShowVertRulerLabel(cm) ? (
                                <span
                                    key={cm}
                                    className="absolute right-0 block text-[8px] font-medium leading-none tabular-nums text-muted-foreground"
                                    style={{
                                        top: verticalTrackTopPx(cm, flipVertical),
                                        transform: 'translateY(-50%)',
                                        fontFeatureSettings: '"tnum"',
                                    }}
                                >
                                    {fmtCmTrShort(cm)}
                                </span>
                            ) : null,
                        )}
                    </div>

                    {/* Çentik + ince çubuk — RulerScale ile aynı hiyerarşi */}
                    <div className="relative w-[11px] shrink-0">
                        {CM_TICKS_TR.map((cm, i) => (
                            <div
                                key={cm}
                                className="pointer-events-none absolute right-[1px]"
                                style={{
                                    top: verticalTrackTopPx(cm, flipVertical),
                                    transform: 'translateY(-50%)',
                                    width: verticalTickWidthPx(i),
                                    height: 1,
                                    background: verticalTickColor(i),
                                }}
                            />
                        ))}
                        <div
                            className="absolute right-0 top-0 bottom-0 w-[3px] rounded-full border border-border/80 bg-muted/80"
                            style={{
                                boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--foreground) 6%, transparent)',
                            }}
                        />
                        <div
                            className="absolute right-[-2px] z-[1] h-2 w-2 rounded-full border border-background bg-primary shadow-sm"
                            style={{
                                top: knobTopPx,
                                transform: 'translateY(-50%)',
                                transition: isDragging
                                    ? 'none'
                                    : 'top 220ms cubic-bezier(0.34, 1.25, 0.64, 1), box-shadow 180ms ease-out',
                                boxShadow: isDragging
                                    ? '0 0 0 2px color-mix(in srgb, var(--primary) 35%, transparent)'
                                    : '0 1px 2px color-mix(in srgb, var(--foreground) 20%, transparent)',
                            }}
                        />
                    </div>
                </div>

                <div
                    className={`pointer-events-none absolute left-1/2 top-full z-20 mt-1 w-[max-content] max-w-[130px] -translate-x-1/2 transition-opacity duration-150 ${isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                >
                    <div className="rounded-md border border-border/70 bg-popover/95 px-2 py-1 text-[9px] font-medium leading-snug text-primary shadow-sm">
                        Yaklaşık {displayLine.toFixed(1)} satır
                    </div>
                </div>
            </div>
        );
    }),
);
TuneKnobSpinner.displayName = 'TuneKnobSpinner';

export const Ruler: React.FC<RulerProps> = ({
    editor,
    pageWidthPx = DEFAULT_PAGE_WIDTH_PX,
    pageHeightPx,
    showRuler: _showRuler,
    onToggleRuler,
}) => {
    const rulerRef = useRef<HTMLDivElement>(null);
    const topTrackRef = useRef<HTMLDivElement>(null);
    const bottomTrackRef = useRef<HTMLDivElement>(null);
    const lastApplyRef = useRef(0);
    const parentMarginsRef = useRef(0);
    const marginsRafRef = useRef(0);
    const selectionRafRef = useRef(0);

    const [pageML, setPageML] = useState(50);
    const [pageMR, setPageMR] = useState(50);
    const [pageMT, setPageMT] = useState(PAGINATION_BODY_BASE);
    const [pageMB, setPageMB] = useState(PAGINATION_BODY_BASE);

    const [absLeftMargin, setAbsLeftMargin] = useState(0);
    const [firstLine, setFirstLine] = useState(0);
    const [paraRight, setParaRight] = useState(0);

    const [drag, setDrag] = useState<DragTarget | null>(null);
    /** transaction dinleyicileri stale closure kullanmasın — sürükleme bitene kadar pull/sync atla */
    const dragRef = useRef<DragTarget | null>(null);
    const beginDrag = useCallback((d: DragTarget) => {
        dragRef.current = d;
        setDrag(d);
    }, []);
    const endDrag = useCallback(() => {
        dragRef.current = null;
        setDrag(null);
    }, []);
    const [guidePos, setGuidePos] = useState<{ x: number; y: number } | null>(null);
    const [tooltip, setTooltip] = useState<{ x: number; label: string } | null>(null);
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; rulerX: number } | null>(null);
    const [paraStyleOpen, setParaStyleOpen] = useState(false);
    const [paraStyleAnchor, setParaStyleAnchor] = useState({ x: 0, y: 0 });
    const [fMl, setFMl] = useState('');
    const [fMr, setFMr] = useState('');
    const [fMt, setFMt] = useState('');
    const [fMb, setFMb] = useState('');
    const [fFirst, setFFirst] = useState('');
    const [fPara, setFPara] = useState('');

    /** Dikey marj sürüklemesinde aktif cam iz kutusu */
    const vertMarginTrackActiveRef = useRef<HTMLDivElement | null>(null);
    /** Fare başlangıcından biriken ekstra marj (px) — konum yerine delta ile "valf" hissi
     *  startOtherEdgeMargin: sürükleme başlangıcındaki karşıt kenar marjı (race condition önlemi)
     */
    const vertMarginDragRef = useRef({ startY: 0, startExtra: 0, startOtherEdgeMargin: 0 });

    /** Sayfa marjı sürüklemesi: başlangıç cetvel X ve margin değerleri */
    const pageHDragRef = useRef({ rawX: 0, ml: 0, mr: 0 });
    const listHangLastAbs = useRef(0);
    const isListHang = useRef(false);
    const isListSelectionRef = useRef(false);

    const pageMTRef = useRef(pageMT);
    const pageMBRef = useRef(pageMB);
    pageMTRef.current = pageMT;
    pageMBRef.current = pageMB;

    /** Sayfa marjı sürüklerken: en fazla 1×/kare `applyPaginationMargins` (titreme / CPU) */
    const marginApplyRafRef = useRef(0);
    const pendingMarginsRef = useRef<{
        editor: Editor;
        m: { top: number; bottom: number; left: number; right: number };
    } | null>(null);

    const flushMarginApplyQueue = useCallback(() => {
        if (marginApplyRafRef.current) {
            cancelAnimationFrame(marginApplyRafRef.current);
            marginApplyRafRef.current = 0;
        }
        const p = pendingMarginsRef.current;
        pendingMarginsRef.current = null;
        const ed = p?.editor ?? editor;
        if (!ed || ed.isDestroyed) return null;
        const m =
            p?.m ??
            (() => {
                const pm = getPaginationMargins(ed);
                return pm
                    ? {
                        top: pm.marginTop,
                        bottom: pm.marginBottom,
                        left: pm.marginLeft,
                        right: pm.marginRight,
                    }
                    : null;
            })();
        if (!m) return null;
        const applied = applyPaginationMargins(ed, m);
        if (!applied) return null;
        setPageML(applied.left);
        setPageMR(applied.right);
        setPageMT(applied.top);
        setPageMB(applied.bottom);
        pageMTRef.current = applied.top;
        pageMBRef.current = applied.bottom;
        return applied;
    }, [editor]);

    const queueMarginApply = useCallback((ed: Editor, m: { top: number; bottom: number; left: number; right: number }) => {
        pendingMarginsRef.current = { editor: ed, m };
        if (marginApplyRafRef.current) return;
        marginApplyRafRef.current = requestAnimationFrame(() => {
            marginApplyRafRef.current = 0;
            const q = pendingMarginsRef.current;
            pendingMarginsRef.current = null;
            if (!q || q.editor.isDestroyed) return;
            const applied = applyPaginationMarginsVisualOnly(q.editor, q.m);
            if (!applied) return;
            setPageML(applied.left);
            setPageMR(applied.right);
            setPageMT(applied.top);
            setPageMB(applied.bottom);
            pageMTRef.current = applied.top;
            pageMBRef.current = applied.bottom;
        });
    }, []);

    useEffect(() => {
        return () => {
            if (marginApplyRafRef.current) {
                cancelAnimationFrame(marginApplyRafRef.current);
                marginApplyRafRef.current = 0;
            }
            pendingMarginsRef.current = null;
        };
    }, []);

    /** Kağıt yüksekliği: UdfixEditor `pageHeightPx` öncelikli (A3/Letter geçişi); yoksa storage. */
    const pageHForRuler =
        pageHeightPx != null && pageHeightPx > 0
            ? pageHeightPx
            : editor && !editor.isDestroyed
                ? getPaginationPageHeight(editor)
                : EDITOR_PAGE_HEIGHT_PX;

    // Pagination marginLeft/Right/Top/Bottom — belge geneli
    useEffect(() => {
        if (!editor) return;
        const pull = () => {
            const d = dragRef.current;
            if (d === 'pageLeft' || d === 'pageRight' || d === 'pageTop' || d === 'pageBottom') return;
            const o = getPaginationMargins(editor);
            if (!o) return;
            setPageML((prev) => (Math.abs(prev - o.marginLeft) < 0.01 ? prev : o.marginLeft));
            setPageMR((prev) => (Math.abs(prev - o.marginRight) < 0.01 ? prev : o.marginRight));
            setPageMT((prev) => (Math.abs(prev - o.marginTop) < 0.01 ? prev : o.marginTop));
            setPageMB((prev) => (Math.abs(prev - o.marginBottom) < 0.01 ? prev : o.marginBottom));
        };
        pull();
        const onTransaction = () => {
            if (marginsRafRef.current) return;
            marginsRafRef.current = window.requestAnimationFrame(() => {
                marginsRafRef.current = 0;
                pull();
            });
        };
        editor.on('transaction', onTransaction);
        return () => {
            if (marginsRafRef.current) window.cancelAnimationFrame(marginsRafRef.current);
            editor.off('transaction', onTransaction);
        };
    }, [editor]);

    // Paragraf / liste girintisi — seçim
    useEffect(() => {
        if (!editor) return;
        const sync = () => {
            const d = dragRef.current;
            if (
                d === 'firstLine' ||
                d === 'hanging' ||
                d === 'paragraphRight' ||
                d === 'pageLeft' ||
                d === 'pageRight' ||
                d === 'pageTop' ||
                d === 'pageBottom'
            )
                return;
            const { state } = editor;

            let isList = false;
            let currentAttrs: Record<string, unknown> = {};
            let parentMargins = 0;
            let myMargin = 0;

            for (let d = 1; d <= state.selection.$from.depth; d++) {
                const n = state.selection.$from.node(d);
                if (n.type.name === 'listItem') {
                    isList = true;
                    if (d === state.selection.$from.depth - 1 || d === state.selection.$from.depth) {
                        currentAttrs = n.attrs as Record<string, unknown>;
                        myMargin = parseFloat(String(n.attrs.marginLeft ?? '0')) || 0;
                    } else {
                        const pl = n.attrs.marginLeft;
                        parentMargins +=
                            pl == null || pl === undefined
                                ? LIST_ITEM_DEFAULT_MARGIN_LEFT
                                : parseFloat(String(pl)) || LIST_ITEM_DEFAULT_MARGIN_LEFT;
                    }
                } else if (n.type.name === 'paragraph' || n.type.name === 'heading') {
                    if (!isList) {
                        currentAttrs = n.attrs as Record<string, unknown>;
                        myMargin = parseFloat(String(n.attrs.marginLeft ?? '0')) || 0;
                    }
                }
            }

            if (isList && (currentAttrs.marginLeft === null || currentAttrs.marginLeft === undefined)) {
                myMargin = LIST_ITEM_DEFAULT_MARGIN_LEFT;
            }

            isListSelectionRef.current = isList;
            parentMarginsRef.current = parentMargins;
            const nextAbs = parentMargins + myMargin;
            setAbsLeftMargin((prev) => (Math.abs(prev - nextAbs) < 0.01 ? prev : nextAbs));

            const ti = currentAttrs.textIndent;
            const tiNum =
                ti === null || ti === undefined
                    ? isList
                        ? LIST_ITEM_DEFAULT_TEXT_INDENT
                        : 0
                    : parseFloat(String(ti)) || 0;
            setFirstLine((prev) => (Math.abs(prev - tiNum) < 0.01 ? prev : tiNum));

            const mr = currentAttrs.marginRight;
            const nextRight = mr == null || mr === undefined ? 0 : parseFloat(String(mr)) || 0;
            setParaRight((prev) => (Math.abs(prev - nextRight) < 0.01 ? prev : nextRight));
        };
        const onSelectionUpdate = () => sync();
        const onTransaction = () => {
            if (selectionRafRef.current) return;
            selectionRafRef.current = window.requestAnimationFrame(() => {
                selectionRafRef.current = 0;
                sync();
            });
        };
        editor.on('selectionUpdate', onSelectionUpdate);
        editor.on('transaction', onTransaction);
        return () => {
            if (selectionRafRef.current) window.cancelAnimationFrame(selectionRafRef.current);
            editor.off('selectionUpdate', onSelectionUpdate);
            editor.off('transaction', onTransaction);
        };
    }, [editor]);

    const pl = pageML;
    const pr = pageMR;
    const textAreaWidth = pageWidthPx - pl - pr;
    const posHanging = pl + Math.max(0, absLeftMargin);
    const posFirstLine = posHanging + firstLine;
    const posParaRight = pageWidthPx - pr - Math.max(0, paraRight);

    const applyParagraphValues = useCallback(
        (absL: number, fl: number, prVal: number, isFinal = false) => {
            if (!editor) return;
            const now = Date.now();
            if (!isFinal && now - lastApplyRef.current < THROTTLE_MS) return;
            lastApplyRef.current = now;

            const relativeLeft = Math.max(0, absL - parentMarginsRef.current);
            if (isFinal) editor.chain().focus().run();
            editor.commands.setIndentation({
                left: Math.round(relativeLeft),
                right: Math.round(prVal),
                firstLine: Math.round(fl),
            });
        },
        [editor],
    );

    const applyRightIndentOnly = useCallback(
        (rightPx: number, isFinal = false) => {
            if (!editor) return;
            const now = Date.now();
            if (!isFinal && now - lastApplyRef.current < THROTTLE_MS) return;
            lastApplyRef.current = now;
            if (isFinal) editor.chain().focus().run();
            editor.commands.setIndentation({ right: Math.round(rightPx) });
        },
        [editor],
    );

    /** Sayfa marjı daralınca eski paragraf sağ / ilk satır değerleri taşmasın */
    useEffect(() => {
        if (!editor) return;
        const d = dragRef.current;
        if (d === 'paragraphRight' || d === 'firstLine' || d === 'hanging') return;
        const tw = Math.max(0, textAreaWidth);
        const maxPR = Math.max(0, snapPx(Math.max(0, tw - absLeftMargin - EDITOR_SNAP_STEP_PX)));
        let nextPR = paraRight;
        if (paraRight > maxPR + 0.01) {
            nextPR = maxPR;
            setParaRight(maxPR);
            applyRightIndentOnly(maxPR, true);
        }
        const maxFL = tw - absLeftMargin - nextPR;
        if (firstLine > maxFL + 0.01) {
            const nf = snapPx(maxFL);
            setFirstLine(nf);
            applyParagraphValues(absLeftMargin, nf, nextPR, true);
        }
    }, [
        editor,
        pl,
        pr,
        textAreaWidth,
        absLeftMargin,
        paraRight,
        firstLine,
        applyRightIndentOnly,
        applyParagraphValues,
    ]);

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            const d = dragRef.current;
            if (!d || !rulerRef.current) return;
            const rect = rulerRef.current.getBoundingClientRect();
            const rawX = e.clientX - rect.left;

            const setGuide = (rulerRelX: number) => {
                setGuidePos({ x: rulerRelX, y: 0 });
                setTooltip({ x: rulerRelX, label: fmtCm(rulerRelX - pl) });
            };

            if (d === 'pageLeft') {
                const delta = rawX - pageHDragRef.current.rawX;
                const rawML = snapPx(pageHDragRef.current.ml + delta);
                const clamped = editorClampHorizontalPageMargins(pageWidthPx, rawML, pr);
                setPageML(clamped.left);
                setPageMR(clamped.right);
                if (editor) {
                    const pm = getPaginationMargins(editor);
                    queueMarginApply(editor, {
                        top: pm?.marginTop ?? pageMT,
                        bottom: pm?.marginBottom ?? pageMB,
                        left: clamped.left,
                        right: clamped.right,
                    });
                }
                setGuide(clamped.left);
                return;
            }

            if (d === 'pageRight') {
                const delta = rawX - pageHDragRef.current.rawX;
                const rawMR = snapPx(pageHDragRef.current.mr - delta);
                const clamped = editorClampHorizontalPageMargins(pageWidthPx, pl, rawMR);
                setPageML(clamped.left);
                setPageMR(clamped.right);
                if (editor) {
                    const pm = getPaginationMargins(editor);
                    queueMarginApply(editor, {
                        top: pm?.marginTop ?? pageMT,
                        bottom: pm?.marginBottom ?? pageMB,
                        left: clamped.left,
                        right: clamped.right,
                    });
                }
                setGuide(pageWidthPx - clamped.right);
                return;
            }

            if (d === 'hanging') {
                const maxHang = Math.max(0, textAreaWidth - paraRight - EDITOR_SNAP_STEP_PX);
                const val = snapPx(clamp(rawX - pl, 0, maxHang));
                if (isListHang.current && editor) {
                    const delta = val - listHangLastAbs.current;
                    if (delta !== 0) {
                        editor.commands.shiftListIndentByDelta(delta);
                        listHangLastAbs.current = val;
                    }
                    setAbsLeftMargin(val);
                } else {
                    applyParagraphValues(val, Math.max(-val, firstLine), paraRight);
                    setAbsLeftMargin(val);
                }
                setFirstLine((prev) => Math.max(isListHang.current ? 0 : -val, prev));
                setGuide(pl + val);
                return;
            }

            if (d === 'firstLine') {
                const offset = snapPx(rawX - pl - absLeftMargin);
                const maxOffset = Math.max(0, textAreaWidth - absLeftMargin - paraRight);
                const minOffset = isListSelectionRef.current ? 0 : -absLeftMargin;
                const val = clamp(offset, minOffset, maxOffset);
                setFirstLine(val);
                setGuide(pl + absLeftMargin + val);
                applyParagraphValues(absLeftMargin, val, paraRight);
                return;
            }

            if (d === 'paragraphRight') {
                const maxPR = Math.max(0, textAreaWidth - absLeftMargin - EDITOR_SNAP_STEP_PX);
                const dist = snapPx(clamp(pageWidthPx - pr - rawX, 0, maxPR));
                setParaRight(dist);
                setGuide(pageWidthPx - pr - dist);
                applyRightIndentOnly(dist);
            }
        },
        [editor, pl, pr, pageWidthPx, pageMT, pageMB, textAreaWidth, absLeftMargin, firstLine, paraRight, applyParagraphValues, applyRightIndentOnly, queueMarginApply],
    );

    const handleVertTrackMove = useCallback(
        (e: MouseEvent, which: 'pageTop' | 'pageBottom') => {
            const el = vertMarginTrackActiveRef.current;
            if (!el || !editor) return;
            const pageH = pageHForRuler;
            const maxEach = editorMaxVerticalMarginTotalPx(pageH);
            const maxSum = Math.max(80, pageH - EDITOR_PAGINATION_VERTICAL_RESERVE_PX);

            const { startY, startExtra } = vertMarginDragRef.current;

            // Başlangıç anındaki karşıt kenar marjını kullan (sürükleme sırasında sabit kalır)
            // Bu race condition'ı önler - sürükleme boyunca max limit değişmez
            const otherEdgeMargin = which === 'pageTop'
                ? vertMarginDragRef.current.startOtherEdgeMargin ?? pageMBRef.current
                : vertMarginDragRef.current.startOtherEdgeMargin ?? pageMTRef.current;

            /** Alt cetvel ters ölçekli: fare aşağı = tutamak aşağı (0,5 cm'e yakın); yukarı = daha büyük alt marj. */
            const deltaY =
                which === 'pageBottom' ? startY - e.clientY : e.clientY - startY;

            // Ekstra marj hesapla: deltaY doğrudan pixel değerine çevrilir (0.25cm snap ile)
            const rawExtra = clamp(startExtra + deltaY, 0, maxEach - PAGINATION_BODY_BASE);
            const extra = snapPx(rawExtra);

            // Max limit: karşı kenar marjı sabitken ne kadar artırılabilir?
            const maxForThisEdge = Math.min(maxEach, maxSum - otherEdgeMargin);

            let v = clamp(PAGINATION_BODY_BASE + extra, PAGINATION_BODY_BASE, maxForThisEdge);
            v = Math.round(v);

            const pm = getPaginationMargins(editor);
            const curLeft = pm?.marginLeft ?? pl;
            const curRight = pm?.marginRight ?? pr;

            if (which === 'pageTop') {
                setPageMT(v);
                pageMTRef.current = v;
                queueMarginApply(editor, {
                    top: v,
                    bottom: otherEdgeMargin,
                    left: curLeft,
                    right: curRight,
                });
            } else {
                setPageMB(v);
                pageMBRef.current = v;
                queueMarginApply(editor, {
                    top: otherEdgeMargin,
                    bottom: v,
                    left: curLeft,
                    right: curRight,
                });
            }
        },
        [editor, pl, pr, pageHForRuler, queueMarginApply],
    );

    const handleMouseUp = useCallback(() => {
        const d = dragRef.current;
        if (!d) return;
        if (d === 'firstLine' || d === 'hanging') {
            applyParagraphValues(absLeftMargin, firstLine, paraRight, true);
        }
        if (d === 'paragraphRight') {
            applyRightIndentOnly(paraRight, true);
        }
        if ((d === 'pageLeft' || d === 'pageRight') && editor && !editor.isDestroyed) {
            flushMarginApplyQueue();
        }
        // Dikey margin sürüklemesi için de flush yapılması gerekir
        if ((d === 'pageTop' || d === 'pageBottom') && editor && !editor.isDestroyed) {
            flushMarginApplyQueue();
        }
        endDrag();
        setTooltip(null);
        setGuidePos(null);
        document.body.style.cursor = '';
    }, [absLeftMargin, applyParagraphValues, applyRightIndentOnly, editor, endDrag, firstLine, paraRight, flushMarginApplyQueue]);

    useEffect(() => {
        if (!drag) return;

        if (drag === 'pageTop' || drag === 'pageBottom') {
            const which = drag;
            const onMove = (e: MouseEvent) => handleVertTrackMove(e, which);
            const onUp = (e: MouseEvent) => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                // Son mousemove olayı kaçırıldıysa bırakma anındaki gerçek konumu zorla uygula.
                handleVertTrackMove(e, which);
                if (editor && !editor.isDestroyed) {
                    flushMarginApplyQueue();
                }
                persistVerticalMarginsToHeaderFooter(editor, pageMTRef.current, pageMBRef.current);
                const o = editor ? getPaginationMargins(editor) : null;
                if (o) {
                    setPageMT(o.marginTop);
                    setPageMB(o.marginBottom);
                }
                vertMarginTrackActiveRef.current = null;
                endDrag();
                setGuidePos(null);
                setTooltip(null);
                document.body.style.cursor = '';
            };
            document.body.style.cursor = 'ns-resize';
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
            return () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                document.body.style.cursor = '';
            };
        }

        document.body.style.cursor = 'ew-resize';
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
        };
    }, [beginDrag, drag, editor, endDrag, flushMarginApplyQueue, handleVertTrackMove, handleMouseMove, handleMouseUp]);

    const startPageLeft = (e: React.MouseEvent) => {
        e.preventDefault();
        if (!rulerRef.current) return;
        pageHDragRef.current = {
            rawX: e.clientX - rulerRef.current.getBoundingClientRect().left,
            ml: pageML,
            mr: pageMR,
        };
        beginDrag('pageLeft');
    };

    const startPageRight = (e: React.MouseEvent) => {
        e.preventDefault();
        if (!rulerRef.current) return;
        pageHDragRef.current = {
            rawX: e.clientX - rulerRef.current.getBoundingClientRect().left,
            ml: pageML,
            mr: pageMR,
        };
        beginDrag('pageRight');
    };

    const startHanging = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (editor) {
            isListHang.current = selectionHasListItem(editor);
            listHangLastAbs.current = absLeftMargin;
        } else {
            isListHang.current = false;
        }
        beginDrag('hanging');
    };

    const handleRulerContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (!rulerRef.current) return;
        const rect = rulerRef.current.getBoundingClientRect();
        const clamped = snapPx(clamp(e.clientX - rect.left - pl, 0, textAreaWidth));
        setCtxMenu({ x: e.clientX, y: e.clientY, rulerX: clamped });
    };

    useEffect(() => {
        if (!ctxMenu) return;
        const dismiss = () => setCtxMenu(null);
        window.addEventListener('click', dismiss, { once: true });
        return () => window.removeEventListener('click', dismiss);
    }, [ctxMenu]);

    const parseCmField = (s: string) => {
        const n = parseFloat(String(s).trim().replace(',', '.'));
        return Number.isFinite(n) ? n : 0;
    };

    const openParaStylePopover = useCallback(
        (clientX: number, clientY: number) => {
            if (rulerRef.current) {
                const rect = rulerRef.current.getBoundingClientRect();
                setParaStyleAnchor({ x: clientX - rect.left, y: clientY - rect.top });
            } else {
                setParaStyleAnchor({ x: clientX, y: clientY });
            }
            setFMl(pxToCm(pageML).toFixed(2));
            setFMr(pxToCm(pageMR).toFixed(2));
            setFMt(pxToCm(Math.max(0, pageMT - PAGINATION_BODY_BASE)).toFixed(2));
            setFMb(pxToCm(Math.max(0, pageMB - PAGINATION_BODY_BASE)).toFixed(2));
            setFFirst(pxToCm(firstLine).toFixed(2));
            setFPara(pxToCm(absLeftMargin).toFixed(2));
            setParaStyleOpen(true);
        },
        [pageML, pageMR, pageMT, pageMB, firstLine, absLeftMargin],
    );

    const applyParaStyleForm = useCallback(() => {
        if (!editor) return;
        const mlCm = parseCmField(fMl);
        const mrCm = parseCmField(fMr);
        /** Cetvel ile aynı: 40px taban üzeri ek boşluk (cm) */
        const extraTopCm = parseCmField(fMt);
        const extraBottomCm = parseCmField(fMb);
        /** Boş alan: paragraf girintisini sıfırlama (yalnızca sayfa marjı güncellenirken) */
        const firstCm =
            fFirst.trim() === '' ? pxToCm(firstLine) : parseCmField(fFirst);
        const paraCm =
            fPara.trim() === '' ? pxToCm(absLeftMargin) : parseCmField(fPara);

        let newML = snapPx(mlCm * EDITOR_CM_TO_PX);
        let newMR = snapPx(mrCm * EDITOR_CM_TO_PX);
        const clampedH = editorClampHorizontalPageMargins(pageWidthPx, newML, newMR);
        newML = clampedH.left;
        newMR = clampedH.right;

        let newMT = PAGINATION_BODY_BASE + snapPx(extraTopCm * EDITOR_CM_TO_PX);
        let newMB = PAGINATION_BODY_BASE + snapPx(extraBottomCm * EDITOR_CM_TO_PX);
        const vClamped = editorClampVerticalPageMargins(pageHForRuler, newMT, newMB);
        newMT = vClamped.top;
        newMB = vClamped.bottom;

        const applied = runUpdateMargins(editor, {
            top: newMT,
            bottom: newMB,
            left: newML,
            right: newMR,
        });
        if (!applied) return;
        setPageML(applied.left);
        setPageMR(applied.right);
        setPageMT(applied.top);
        setPageMB(applied.bottom);
        pageMTRef.current = applied.top;
        pageMBRef.current = applied.bottom;
        persistVerticalMarginsToHeaderFooter(editor, applied.top, applied.bottom);

        const tw = pageWidthPx - applied.left - applied.right;
        const absP = snapPx(paraCm * EDITOR_CM_TO_PX);
        const fl = snapPx(firstCm * EDITOR_CM_TO_PX);
        const maxPR = Math.max(0, snapPx(Math.max(0, tw - absP - EDITOR_SNAP_STEP_PX)));
        const prVal = clamp(paraRight, 0, maxPR);
        const maxFL = tw - absP - prVal;
        const flClamped = clamp(fl, -absP, maxFL);

        setAbsLeftMargin(absP);
        setFirstLine(flClamped);
        setParaRight(prVal);
        editor.chain().focus().run();
        editor.commands.setIndentation({
            left: Math.round(Math.max(0, absP - parentMarginsRef.current)),
            right: Math.round(prVal),
            firstLine: Math.round(flClamped),
        });
        setParaStyleOpen(false);
    }, [
        editor,
        fMl,
        fMr,
        fMt,
        fMb,
        fFirst,
        fPara,
        pageWidthPx,
        paraRight,
        absLeftMargin,
        firstLine,
        pageHForRuler,
    ]);

    const topExtraMaxPx = verticalExtraMaxPxForEdge(pageHForRuler, 'top', pageMT, pageMB);
    const bottomExtraMaxPx = verticalExtraMaxPxForEdge(pageHForRuler, 'bottom', pageMT, pageMB);
    const topExtraPx = Math.max(0, pageMT - PAGINATION_BODY_BASE);
    const bottomExtraPx = Math.max(0, pageMB - PAGINATION_BODY_BASE);
    const topLineDisplay = extraPxToLineDisplay(topExtraPx, topExtraMaxPx);
    const bottomLineDisplay = extraPxToLineDisplay(bottomExtraPx, bottomExtraMaxPx);

    return (
        <>
            {/* Üst sol köşe + grid: yatay cetvel üst satırda; dikey sürgüler sayfanın solunda — Popover anchor köşe hücresinde (grid düzenini bozmaz) */}
            <div style={{ display: 'contents' }}>
                <div
                    style={{ gridColumn: 1, gridRow: 1 }}
                    className="border-b border-border bg-background/30"
                />

                <div
                    className="relative w-full select-none shrink-0 self-start"
                    style={{
                        gridColumn: 2,
                        gridRow: 1,
                        position: 'sticky',
                        top: 0,
                        zIndex: 40,
                        width: pageWidthPx,
                    }}
                >
                    <Popover open={paraStyleOpen} onOpenChange={setParaStyleOpen}>
                        <PopoverAnchor asChild>
                            <span
                                style={{
                                    position: 'absolute',
                                    left: paraStyleAnchor.x,
                                    top: paraStyleAnchor.y,
                                    width: 1,
                                    height: 1,
                                    pointerEvents: 'none',
                                }}
                                aria-hidden
                            />
                        </PopoverAnchor>
                        <PopoverContent
                            variant="glass"
                            align="start"
                            side="bottom"
                            sideOffset={6}
                            collisionPadding={16}
                            className="z-[1050] w-[min(22rem,calc(100vw-2rem))] max-h-[min(28rem,calc(100vh-2rem))] overflow-y-auto overscroll-contain p-3"
                            onOpenAutoFocus={(e) => e.preventDefault()}
                        >
                            <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-x-3 gap-y-2 items-center text-[11px]">
                                <Label className="text-muted-foreground">Sol boşluk</Label>
                                <Input
                                    variant="glass"
                                    className="h-7 text-xs w-[5.5rem] px-2"
                                    value={fMl}
                                    onChange={(e) => setFMl(e.target.value)}
                                />
                                <Label className="text-muted-foreground">Sağ boşluk</Label>
                                <Input
                                    variant="glass"
                                    className="h-7 text-xs w-[5.5rem] px-2"
                                    value={fMr}
                                    onChange={(e) => setFMr(e.target.value)}
                                />
                                <Label className="text-muted-foreground">Üst ek (cm)</Label>
                                <Input
                                    variant="glass"
                                    className="h-7 text-xs w-[5.5rem] px-2"
                                    value={fMt}
                                    onChange={(e) => setFMt(e.target.value)}
                                    title="40px taban üzeri ek üst boşluk — dikey cetvel ile aynı"
                                />
                                <Label className="text-muted-foreground">Alt ek (cm)</Label>
                                <Input
                                    variant="glass"
                                    className="h-7 text-xs w-[5.5rem] px-2"
                                    value={fMb}
                                    onChange={(e) => setFMb(e.target.value)}
                                    title="40px taban üzeri ek alt boşluk — dikey cetvel ile aynı"
                                />
                                <Label className="text-muted-foreground">İlk satır girintisi</Label>
                                <Input
                                    variant="glass"
                                    className="h-7 text-xs w-[5.5rem] px-2"
                                    value={fFirst}
                                    onChange={(e) => setFFirst(e.target.value)}
                                />
                                <Label className="text-muted-foreground">Paragraf girintisi</Label>
                                <Input
                                    variant="glass"
                                    className="h-7 text-xs w-[5.5rem] px-2"
                                    value={fPara}
                                    onChange={(e) => setFPara(e.target.value)}
                                />
                            </div>
                            <button
                                type="button"
                                className="mt-3 w-full rounded-md border border-white/15 bg-white/5 py-1.5 text-xs font-medium text-foreground hover:bg-white/10"
                                onClick={applyParaStyleForm}
                            >
                                Uygula
                            </button>
                        </PopoverContent>

                        <div
                            ref={rulerRef}
                        className="relative select-none w-full border-b border-border bg-muted/30"
                        style={{
                            height: RULER_HORIZONTAL_HEIGHT,
                            cursor: 'crosshair',
                            overflow: 'visible',
                        }}
                        onContextMenu={handleRulerContextMenu}
                        onDoubleClick={(e) => {
                            e.preventDefault();
                            openParaStylePopover(e.clientX, e.clientY);
                        }}
                    >
                        <RulerScale width={pageWidthPx} paddingLeft={pl} paddingRight={pr} />

                        <div
                            data-marker="pageLeftMargin"
                            title={`Sayfa sol boşluk: ${fmtCm(pageML)}`}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: pl,
                                height: '100%',
                                background: 'color-mix(in srgb, var(--foreground) 10%, transparent)',
                                pointerEvents: 'none',
                            }}
                        />

                        <div
                            data-marker="pageLeftEdge"
                            title="Sayfa sol marjı (tüm belge: metin, liste, tablo, görsel)"
                            style={{
                                position: 'absolute',
                                bottom: -1,
                                left: pl,
                                transform: 'translateX(-50%)',
                                width: 16,
                                height: 15,
                                cursor: 'col-resize',
                                zIndex: 22,
                                display: 'flex',
                                alignItems: 'flex-end',
                                justifyContent: 'center',
                            }}
                            onMouseDown={startPageLeft}
                        >
                            <PageMarginHandle active={drag === 'pageLeft'} />
                        </div>

                        <div
                            data-marker="pageRightMargin"
                            title={`Sayfa sağ boşluk: ${fmtCm(pageMR)}`}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: pageWidthPx - pr,
                                right: 0,
                                height: '100%',
                                background: 'color-mix(in srgb, var(--foreground) 10%, transparent)',
                                pointerEvents: 'none',
                            }}
                        />

                        {/* Sayfa sağ marjı: altta tam yükseklik çubuğu — üstteki ilk satır tutamacıyla çakışmaz */}
                        <div
                            data-marker="pageRightEdge"
                            title="Sayfa sağ marjı (tüm belge: metin, liste, tablo, görsel)"
                            style={{
                                position: 'absolute',
                                bottom: -1,
                                left: pageWidthPx - pr,
                                transform: 'translateX(-50%)',
                                width: 16,
                                height: 15,
                                cursor: 'col-resize',
                                zIndex: 22,
                                display: 'flex',
                                alignItems: 'flex-end',
                                justifyContent: 'center',
                            }}
                            onMouseDown={startPageRight}
                        >
                            <PageMarginHandle active={drag === 'pageRight'} />
                        </div>

                        <div
                            data-marker="paragraphRight"
                            title={`Seçili blok sağ girintisi: ${fmtCm(paraRight)}`}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: posParaRight,
                                transform: 'translateX(-50%)',
                                cursor: 'ew-resize',
                                zIndex: 26,
                            }}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                beginDrag('paragraphRight');
                            }}
                        >
                            <RightIndentHandle active={drag === 'paragraphRight'} />
                        </div>

                        <div
                            data-marker="firstLine"
                            title={`İlk satır / asılı girinti: ${fmtCm(firstLine)}`}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: posFirstLine,
                                transform: 'translateX(-50%)',
                                cursor: 'ew-resize',
                                zIndex: 30,
                            }}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                beginDrag('firstLine');
                            }}
                        >
                            <FirstLineHandle active={drag === 'firstLine'} />
                        </div>

                        <div
                            data-marker="hanging"
                            title="Paragraf sol / liste gövdesi (seçim)"
                            style={{
                                position: 'absolute',
                                bottom: 0,
                                left: posHanging,
                                transform: 'translateX(-50%)',
                                cursor: 'ew-resize',
                                zIndex: 30,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                            }}
                            onMouseDown={startHanging}
                        >
                            <HangingIndentHandle active={drag === 'hanging'} />
                        </div>

                        {tooltip && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: -26,
                                    left: tooltip.x,
                                    transform: 'translateX(-50%)',
                                    background: 'var(--popover)',
                                    color: 'var(--popover-foreground)',
                                    fontSize: 10,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    whiteSpace: 'nowrap',
                                    pointerEvents: 'none',
                                    zIndex: 100,
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                                    border: '1px solid var(--border)',
                                }}
                            >
                                {tooltip.label}
                            </div>
                        )}
                    </div>
                </Popover>

                    {guidePos && (
                        <div
                            style={{
                                position: 'absolute',
                                top: RULER_HORIZONTAL_HEIGHT,
                                left: guidePos.x,
                                width: 1,
                                height: '200vh',
                                borderLeft: '1px dashed var(--primary)',
                                pointerEvents: 'none',
                                zIndex: 9999,
                                opacity: 0.6,
                                transform: 'translateX(-50%)',
                            }}
                        />
                    )}
                </div>

                {/* Üst/alt sayfa boşluğu: 3,71 cm ölçekli cam spinner (marginTop / marginBottom) */}
                <div
                    className="flex shrink-0 flex-col items-center justify-between border-r border-t border-border bg-muted/30"
                    style={{
                        gridColumn: 1,
                        gridRow: 2,
                        width: EDITOR_RULER_LEFT_CONTROLS_WIDTH_PX,
                        height: pageHForRuler,
                        alignSelf: 'start',
                        boxSizing: 'border-box',
                    }}
                >
                    <TuneKnobSpinner
                        ref={topTrackRef}
                        displayLine={topLineDisplay}
                        extraPx={topExtraPx}
                        extraMaxPx={topExtraMaxPx}
                        ariaLabel="Üst Boşluk"
                        isDragging={drag === 'pageTop'}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            vertMarginTrackActiveRef.current = topTrackRef.current;
                            // Başlangıçta karşıt kenar (bottom) marjını sabitle - sürükleme boyunca sabit kalır
                            const startOtherEdge = pageMBRef.current;
                            vertMarginDragRef.current = {
                                startY: e.clientY,
                                startExtra: Math.max(0, pageMTRef.current - PAGINATION_BODY_BASE),
                                startOtherEdgeMargin: startOtherEdge,
                            };
                            beginDrag('pageTop');
                        }}
                    />
                    <TuneKnobSpinner
                        ref={bottomTrackRef}
                        displayLine={bottomLineDisplay}
                        extraPx={bottomExtraPx}
                        extraMaxPx={bottomExtraMaxPx}
                        ariaLabel="Alt Boşluk"
                        flipVertical
                        isDragging={drag === 'pageBottom'}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            vertMarginTrackActiveRef.current = bottomTrackRef.current;
                            // Başlangıçta karşıt kenar (top) marjını sabitle - sürükleme boyunca sabit kalır
                            const startOtherEdge = pageMTRef.current;
                            vertMarginDragRef.current = {
                                startY: e.clientY,
                                startExtra: Math.max(0, pageMBRef.current - PAGINATION_BODY_BASE),
                                startOtherEdgeMargin: startOtherEdge,
                            };
                            beginDrag('pageBottom');
                        }}
                    />
                </div>
            </div>

            {ctxMenu &&
                createPortal(
                    <div
                        style={{
                            position: 'fixed',
                            top: ctxMenu.y,
                            left: ctxMenu.x,
                            background: 'var(--popover)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                            zIndex: 10000,
                            minWidth: 180,
                            padding: '4px 0',
                            fontSize: 13,
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            style={{
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                padding: '7px 14px',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--foreground)',
                            }}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                openParaStylePopover(ctxMenu.x, ctxMenu.y);
                                setCtxMenu(null);
                            }}
                        >
                            Sayfa/Paragraf Boşlukları
                        </button>
                        <button
                            type="button"
                            style={{
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                padding: '7px 14px',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--foreground)',
                            }}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                onToggleRuler();
                                setCtxMenu(null);
                            }}
                        >
                            Cetveli gizle
                        </button>
                    </div>,
                    document.body,
                )}

        </>
    );
};

const RulerScale = memo(
    ({ width, paddingLeft, paddingRight }: { width: number; paddingLeft: number; paddingRight: number }) => {
        const canvasRef = useRef<HTMLCanvasElement>(null);
        const pl = paddingLeft;
        const pr = paddingRight;
        const innerRight = width - pr;

        useEffect(() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.max(1, Math.round(width * dpr));
            canvas.height = Math.max(1, Math.round(RULER_HORIZONTAL_HEIGHT * dpr));
            canvas.style.width = `${width}px`;
            canvas.style.height = `${RULER_HORIZONTAL_HEIGHT}px`;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, width, RULER_HORIZONTAL_HEIGHT);

            const colorMajor = getComputedStyle(document.documentElement)
                .getPropertyValue('--muted-foreground')
                .trim() || '#6b7280';
            const colorHalf = 'rgba(107, 114, 128, 0.6)';
            const colorQuarter = 'rgba(107, 114, 128, 0.35)';

            const drawTick = (x: number, h: number, color: string) => {
                if (x < 0 || x > width) return;
                ctx.fillStyle = color;
                ctx.fillRect(Math.round(x) + 0.5, RULER_HORIZONTAL_HEIGHT - h, 1, h);
            };

            // Sol gri alan
            const jLeftMax = Math.ceil(pl / EDITOR_CM_TO_PX) + 1;
            for (let j = 0; j <= jLeftMax; j++) {
                const x = pl - j * EDITOR_CM_TO_PX;
                if (x < -0.5) break;
                drawTick(x, 11, colorMajor);
                if (j > 0) {
                    const hx = pl - (j - 0.5) * EDITOR_CM_TO_PX;
                    if (hx >= 0 && hx < pl) drawTick(hx, 7, colorHalf);
                    for (const q of [0.25, 0.75]) {
                        const qx = pl - (j - q) * EDITOR_CM_TO_PX;
                        if (qx >= 0 && qx < pl) drawTick(qx, 4, colorQuarter);
                    }
                }
            }

            // Metin alanı
            const innerW = Math.max(0, innerRight - pl);
            const totalCm = Math.ceil(innerW / EDITOR_CM_TO_PX) + 1;
            for (let i = 1; i <= totalCm; i++) {
                const x = pl + i * EDITOR_CM_TO_PX;
                if (x > innerRight + 0.01) break;
                drawTick(x, 11, colorMajor);
                const halfX = pl + (i - 0.5) * EDITOR_CM_TO_PX;
                if (halfX < innerRight) drawTick(halfX, 7, colorHalf);
                for (const q of [0.25, 0.75]) {
                    const qx = pl + (i - 1 + q) * EDITOR_CM_TO_PX;
                    if (qx < innerRight) drawTick(qx, 4, colorQuarter);
                }
            }

            // Sağ gri alan
            const jRightMax = Math.ceil(pr / EDITOR_CM_TO_PX) + 1;
            for (let j = 0; j <= jRightMax; j++) {
                const x = innerRight + j * EDITOR_CM_TO_PX;
                if (x > width + 0.5) break;
                drawTick(x, 11, colorMajor);
                if (j > 0) {
                    const hx = innerRight + (j - 0.5) * EDITOR_CM_TO_PX;
                    if (hx <= width) drawTick(hx, 7, colorHalf);
                    for (const q of [0.25, 0.75]) {
                        const qx = innerRight + (j - q) * EDITOR_CM_TO_PX;
                        if (qx <= width && qx > innerRight - 0.01) drawTick(qx, 4, colorQuarter);
                    }
                }
            }
        }, [width, pl, pr, innerRight]);

        const labelStyle: React.CSSProperties = {
            position: 'absolute',
            bottom: 11,
            transform: 'translateX(-50%)',
            fontSize: 8,
            color: 'var(--muted-foreground)',
            fontFamily: 'system-ui',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            pointerEvents: 'none',
        };

        const labels: React.ReactNode[] = [];
        const jLeftMax = Math.ceil(pl / EDITOR_CM_TO_PX) + 1;
        for (let j = 0; j <= jLeftMax; j++) {
            const x = pl - j * EDITOR_CM_TO_PX;
            if (x < -0.5) break;
            labels.push(
                <span key={`lm-l-${j}`} style={{ ...labelStyle, left: x }}>
                    {j}
                </span>,
            );
        }
        const innerW = Math.max(0, innerRight - pl);
        const totalCm = Math.ceil(innerW / EDITOR_CM_TO_PX) + 1;
        for (let i = 1; i <= totalCm; i++) {
            const x = pl + i * EDITOR_CM_TO_PX;
            if (x > innerRight + 0.01) break;
            labels.push(
                <span key={`lb-${i}`} style={{ ...labelStyle, left: x }}>
                    {i}
                </span>,
            );
        }
        const jRightMax = Math.ceil(pr / EDITOR_CM_TO_PX) + 1;
        for (let j = 0; j <= jRightMax; j++) {
            const x = innerRight + j * EDITOR_CM_TO_PX;
            if (x > width + 0.5) break;
            labels.push(
                <span key={`rm-l-${j}`} style={{ ...labelStyle, left: x }}>
                    {j}
                </span>,
            );
        }

        return (
            <>
                <canvas
                    ref={canvasRef}
                    className="pointer-events-none absolute inset-0"
                    aria-hidden
                />
                {labels}
            </>
        );
    },
);

export default Ruler;
