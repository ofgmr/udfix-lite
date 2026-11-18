/**
 * Page-text selection for the universal PDF viewer.
 *
 * macOS Preview selects through PDFKit, which Electron cannot host inside this
 * Chromium page without dropping OCR, search, and the Windows/Linux build.
 * pdf.js already gives glyph positions; this layer uses them the way PDFKit
 * uses line boxes: line bands for hit testing, word and line granularity, and
 * highlight rects clipped so adjacent lines do not paint over each other.
 */
import {
    adjustedScaleX,
    caretOffsetOnLine,
    clipBox,
    clusterPdfLines,
    joinRunPieces,
    mergeLineBoxes,
    pickPdfLine,
    runIndexAtX,
    sliceBox,
    snapLineCaret,
    verticalClipLimits,
    type PdfBox,
    type PdfLayoutLine,
    type SelectionGranularity,
} from './pdfTextLines';

const FONT_FALLBACK = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
const SELECTION_ROOT_CLASS = 'pdf-line-selection-root';
const CLICK_MS = 500;
const CLICK_SLOP = 4;

type DomRun = {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    breakBefore: boolean;
    element: HTMLElement;
    rotated: boolean;
};

type DomLoc = {
    layer: HTMLElement;
    lineIndex: number;
    caret: number;
    runIndex: number;
};

type Drag = {
    pointerId: number;
    granularity: SelectionGranularity;
    anchor: DomLoc;
    layer: HTMLElement;
    originX: number;
    originY: number;
    moved: boolean;
};

type ClickMemory = { time: number; x: number; y: number; count: number; moved: boolean };

type DocState = {
    layers: Set<HTMLElement>;
    drag: Drag | null;
    anchor: DomLoc | null;
    painting: boolean;
    abort: AbortController;
};

type CaretBoundary = { node: Text; offset: number };

const docs = new WeakMap<Document, DocState>();
const measureContexts = new WeakMap<Document, CanvasRenderingContext2D>();

export function preparePdfTextLayer(layer: HTMLElement, viewportScale: number, userUnit = 1): void {
    const unit = Number.isFinite(userUnit) && userUnit > 0 ? userUnit : 1;
    const scale = Number.isFinite(viewportScale) && viewportScale > 0 ? viewportScale : 1;
    layer.style.setProperty('--scale-factor', String(scale));
    layer.style.setProperty('--user-unit', String(unit));
    // pdf.js sizes each run with --total-scale-factor. The stock viewer sets it
    // on .pdfViewer .page; this text layer is not inside that tree.
    layer.style.setProperty('--total-scale-factor', String(scale * unit));
    layer.style.setProperty('--scale-round-x', '1px');
    layer.style.setProperty('--scale-round-y', '1px');
    layer.classList.add('pdf-geom-select');
}

export function settlePdfTextLayer(layer: HTMLElement): void {
    retargetRunFonts(layer);
    clearPdfLineSelection(layer);
}

export function clearPdfLineSelection(layer: HTMLElement): void {
    rootFor(layer)?.replaceChildren();
}

export function bindPdfPageTextLayer(layer: HTMLElement): () => void {
    const doc = layer.ownerDocument;
    const state = ensureDoc(doc);
    state.layers.add(layer);
    layer.tabIndex = -1;
    layer.classList.add('pdf-geom-select');

    let clicks: ClickMemory = { time: 0, x: 0, y: 0, count: 0, moved: false };

    const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) return;
        const located = locate(layer, event.clientX, event.clientY);
        if (!located || located.rotated) return;

        const count = nextClickCount(event, clicks);
        clicks = { time: event.timeStamp, x: event.clientX, y: event.clientY, count, moved: false };
        clickMemory.set(layer, clicks);
        const granularity: SelectionGranularity = count >= 3 ? 'line' : count === 2 ? 'word' : 'char';

        event.preventDefault();
        focusLayer(layer);
        try {
            layer.setPointerCapture(event.pointerId);
        } catch {
            /* capture is optional; document pointermove still tracks the drag */
        }

        const anchor = event.shiftKey && state.anchor?.layer.isConnected
            ? state.anchor
            : snapAnchor(located, granularity);
        if (!event.shiftKey) state.anchor = anchor;
        state.drag = {
            pointerId: event.pointerId,
            granularity,
            anchor,
            layer,
            originX: event.clientX,
            originY: event.clientY,
            moved: false,
        };
        applySelection(doc, anchor, located, granularity);
    };

    layer.addEventListener('pointerdown', onPointerDown);
    return () => {
        layer.removeEventListener('pointerdown', onPointerDown);
        state.layers.delete(layer);
        if (state.drag?.layer === layer) state.drag = null;
        if (state.anchor?.layer === layer) state.anchor = null;
        clearPdfLineSelection(layer);
        rootFor(layer)?.remove();
        if (state.layers.size === 0) {
            state.abort.abort();
            docs.delete(doc);
        }
    };
}

/** Test and keyboard-free entry: select the line/word/caret under a viewport point. */
export function placePdfTextSelection(
    layer: HTMLElement,
    clientX: number,
    clientY: number,
    granularity: SelectionGranularity,
    shift = false,
): boolean {
    const located = locate(layer, clientX, clientY);
    if (!located || located.rotated) return false;
    const doc = layer.ownerDocument;
    const state = ensureDoc(doc);
    state.layers.add(layer);
    const anchor = shift && state.anchor?.layer.isConnected ? state.anchor : snapAnchor(located, granularity);
    if (!shift) state.anchor = anchor;
    applySelection(doc, anchor, located, granularity);
    return true;
}

function snapAnchor(loc: DomLoc, granularity: SelectionGranularity): DomLoc {
    if (granularity === 'char') return loc;
    const line = linesOf(loc.layer)[loc.lineIndex];
    if (!line) return loc;
    const caret = snapLineCaret(line, loc.caret, loc.runIndex, granularity, 'lo');
    return { ...loc, caret, runIndex: runIndexForCaret(line, caret) };
}

function runIndexForCaret(line: PdfLayoutLine, caret: number): number {
    let cursor = 0;
    for (let index = 0; index < line.runs.length; index += 1) {
        cursor += line.runs[index]!.text.length;
        if (caret < cursor || index === line.runs.length - 1) return index;
    }
    return 0;
}

export function pdfSelectionPlainText(doc: Document): string | null {
    const state = docs.get(doc);
    const selection = doc.getSelection();
    if (!state || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
    return plainTextForSelection(state, selection.getRangeAt(0));
}

function ensureDoc(doc: Document): DocState {
    const existing = docs.get(doc);
    if (existing) return existing;
    const state: DocState = {
        layers: new Set(),
        drag: null,
        anchor: null,
        painting: false,
        abort: new AbortController(),
    };
    const { signal } = state.abort;
    doc.addEventListener('selectionchange', () => paintIfRelevant(state, doc), { signal });
    doc.addEventListener('copy', (event) => onCopy(state, doc, event), { capture: true, signal });
    doc.addEventListener('pointermove', (event) => onPointerMove(state, event), { signal });
    doc.addEventListener('pointerup', (event) => endDrag(state, event), { signal });
    doc.addEventListener('pointercancel', (event) => endDrag(state, event), { signal });
    docs.set(doc, state);
    return state;
}

function nextClickCount(event: PointerEvent, previous: ClickMemory): number {
    if (previous.moved) return 1;
    const near = Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= CLICK_SLOP;
    const quick = previous.count > 0 && event.timeStamp - previous.time < CLICK_MS;
    return near && quick ? previous.count + 1 : 1;
}

function onPointerMove(state: DocState, event: PointerEvent): void {
    const drag = state.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) > CLICK_SLOP) {
        drag.moved = true;
    }
    const target = layerAtPoint(state, event.clientX, event.clientY);
    if (!target) return;
    autoScroll(target, event.clientY);
    const located = locate(target, event.clientX, event.clientY);
    if (!located || located.rotated) return;
    applySelection(target.ownerDocument, drag.anchor, located, drag.granularity);
}

function endDrag(state: DocState, event: PointerEvent): void {
    const drag = state.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
        const memory = clickMemory.get(drag.layer);
        if (memory) memory.moved = true;
    }
    state.drag = null;
}

const clickMemory = new WeakMap<HTMLElement, ClickMemory>();

function focusLayer(layer: HTMLElement): void {
    try {
        layer.focus({ preventScroll: true });
    } catch {
        layer.focus();
    }
}

function layerAtPoint(state: DocState, x: number, y: number): HTMLElement | null {
    for (const layer of state.layers) {
        if (!layer.isConnected) continue;
        const rect = layer.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return layer;
    }
    return null;
}

function autoScroll(layer: HTMLElement, clientY: number): void {
    const scroller = layer.closest('.overflow-auto');
    if (!(scroller instanceof HTMLElement)) return;
    const rect = scroller.getBoundingClientRect();
    if (clientY > rect.bottom - 28) scroller.scrollTop += 18;
    else if (clientY < rect.top + 28) scroller.scrollTop -= 18;
}

function locate(layer: HTMLElement, clientX: number, clientY: number): (DomLoc & { rotated: boolean }) | null {
    if (!layer.isConnected) return null;
    const rect = layer.getBoundingClientRect();
    const lines = linesOf(layer);
    const lineIndex = pickPdfLine(lines, clientX - rect.left, clientY - rect.top);
    if (lineIndex < 0) return null;
    const line = lines[lineIndex]!;
    const localX = clientX - rect.left;
    return {
        layer,
        lineIndex,
        caret: caretOffsetOnLine(line.runs, localX),
        runIndex: runIndexAtX(line.runs, localX),
        rotated: line.runs.some((run) => (run as DomRun).rotated),
    };
}

function applySelection(
    doc: Document,
    anchor: DomLoc,
    focus: DomLoc,
    granularity: SelectionGranularity,
): void {
    const forward = compareDom(anchor, focus) <= 0;
    const startLoc = forward ? anchor : focus;
    const endLoc = forward ? focus : anchor;
    const collapsed = granularity === 'char' && compareDom(anchor, focus) === 0;
    const start = boundaryAt(startLoc, granularity, 'lo');
    const end = collapsed ? start : boundaryAt(endLoc, granularity, 'hi');
    if (!start || !end) return;
    setRange(doc, start, end);
}

function compareDom(a: DomLoc, b: DomLoc): number {
    if (a.layer !== b.layer) {
        const position = a.layer.compareDocumentPosition(b.layer);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    }
    if (a.lineIndex !== b.lineIndex) return a.lineIndex - b.lineIndex;
    return a.caret - b.caret;
}

function boundaryAt(loc: DomLoc, granularity: SelectionGranularity, edge: 'lo' | 'hi'): CaretBoundary | null {
    const line = linesOf(loc.layer)[loc.lineIndex];
    if (!line) return null;
    const caret = snapLineCaret(line, loc.caret, loc.runIndex, granularity, edge);
    return caretBoundary(charRefs(line), caret);
}

function caretBoundary(refs: readonly CaretBoundary[], caret: number): CaretBoundary | null {
    if (refs.length === 0) return null;
    if (caret <= 0) return { node: refs[0]!.node, offset: refs[0]!.offset };
    if (caret >= refs.length) {
        const last = refs[refs.length - 1]!;
        return { node: last.node, offset: last.offset + 1 };
    }
    const ref = refs[caret]!;
    return { node: ref.node, offset: ref.offset };
}

function charRefs(line: PdfLayoutLine): CaretBoundary[] {
    const refs: CaretBoundary[] = [];
    for (const run of line.runs as DomRun[]) {
        const walker = run.element.ownerDocument.createTreeWalker(run.element, NodeFilter.SHOW_TEXT);
        let current = walker.nextNode();
        while (current) {
            const text = current as Text;
            for (let index = 0; index < text.data.length; index += 1) {
                refs.push({ node: text, offset: index });
            }
            current = walker.nextNode();
        }
    }
    return refs;
}

function setRange(doc: Document, start: CaretBoundary, end: CaretBoundary): void {
    const selection = doc.getSelection();
    if (!selection) return;
    const range = doc.createRange();
    const ordered = orderedBoundaries(start, end);
    range.setStart(ordered.start.node, ordered.start.offset);
    range.setEnd(ordered.end.node, ordered.end.offset);
    selection.removeAllRanges();
    selection.addRange(range);
    const state = docs.get(doc);
    if (state) paintDocument(state, doc);
}

function orderedBoundaries(start: CaretBoundary, end: CaretBoundary): { start: CaretBoundary; end: CaretBoundary } {
    if (start.node === end.node) {
        return start.offset <= end.offset ? { start, end } : { start: end, end: start };
    }
    const position = start.node.compareDocumentPosition(end.node);
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return { start: end, end: start };
    return { start, end };
}

function linesOf(layer: HTMLElement): PdfLayoutLine[] {
    return clusterPdfLines(readRuns(layer));
}

function readRuns(layer: HTMLElement): DomRun[] {
    const layerRect = layer.getBoundingClientRect();
    const runs: DomRun[] = [];
    let breakBefore = false;

    const visit = (parent: Element) => {
        for (const child of Array.from(parent.children)) {
            if (!(child instanceof HTMLElement)) continue;
            if (child.classList.contains(SELECTION_ROOT_CLASS) || child.classList.contains('endOfContent')) continue;
            if (child.tagName === 'BR') {
                breakBefore = true;
                continue;
            }
            if (child.classList.contains('markedContent') || child.querySelector('span, br')) {
                visit(child);
                continue;
            }
            if (child.tagName !== 'SPAN') continue;
            const text = child.textContent ?? '';
            if (!text) continue;
            const rect = child.getBoundingClientRect();
            const rotate = Math.abs(Number.parseFloat(child.style.getPropertyValue('--rotate')) || 0);
            runs.push({
                text,
                x: rect.left - layerRect.left,
                y: rect.top - layerRect.top,
                width: rect.width,
                height: Math.max(rect.height, 1),
                breakBefore,
                element: child,
                rotated: rotate > 1,
            });
            breakBefore = false;
        }
    };

    visit(layer);
    return runs;
}

function paintIfRelevant(state: DocState, doc: Document): void {
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0) {
        paintDocument(state, doc);
        return;
    }
    const anchor = selection.anchorNode;
    const anchorElement = anchor instanceof Element ? anchor : anchor?.parentElement;
    if (anchorElement?.closest('.ProseMirror')) return;
    const range = selection.getRangeAt(0);
    let relevant = false;
    for (const layer of state.layers) {
        if (rangeIntersects(range, layer) || rootFor(layer)?.childElementCount) {
            relevant = true;
            break;
        }
    }
    if (!relevant) return;
    paintDocument(state, doc);
}

function paintDocument(state: DocState, doc: Document): void {
    if (state.painting) return;
    state.painting = true;
    try {
        const selection = doc.getSelection();
        for (const layer of state.layers) paintLayer(layer, selection);
    } finally {
        state.painting = false;
    }
}

function paintLayer(layer: HTMLElement, selection: Selection | null): void {
    if (!layer.isConnected) return;
    const root = ensureRoot(layer);
    root.replaceChildren();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!rangeIntersects(range, layer)) return;

    const lines = linesOf(layer);
    const boxes: PdfBox[] = [];
    let caret: PdfBox | null = null;
    for (const line of lines) {
        const limits = verticalClipLimits(line, lines);
        for (const run of line.runs as DomRun[]) {
            const slice = selectedSlice(range, run);
            if (!slice) continue;
            const widthOf = (text: string) => measuredWidth(run.element, text);
            if (range.collapsed || slice.start === slice.end) {
                const edge = sliceBox(run, slice.start, slice.start, widthOf);
                const clipped = clipBox({ ...edge, width: Math.max(edge.width, 1) }, limits);
                if (clipped) {
                    caret = { x: edge.x, y: clipped.y, width: 1.5, height: clipped.height };
                }
                continue;
            }
            const clipped = clipBox(sliceBox(run, slice.start, slice.end, widthOf), limits);
            if (clipped) boxes.push(clipped);
        }
    }

    const doc = layer.ownerDocument;
    const gap = lines[0]?.height ?? 8;
    for (const box of mergeLineBoxes(boxes, Math.max(4, gap * 0.35))) {
        root.append(boxElement(doc, box, 'pdf-line-selection'));
    }
    if (caret && boxes.length === 0) root.append(boxElement(doc, caret, 'pdf-line-caret'));
}

function boxElement(doc: Document, box: PdfBox, className: string): HTMLElement {
    const node = doc.createElement('div');
    node.className = className;
    node.style.position = 'absolute';
    node.style.pointerEvents = 'none';
    node.style.left = `${box.x}px`;
    node.style.top = `${box.y}px`;
    node.style.width = `${box.width}px`;
    node.style.height = `${box.height}px`;
    return node;
}

function ensureRoot(layer: HTMLElement): HTMLElement {
    const existing = rootFor(layer);
    if (existing) return existing;
    const root = layer.ownerDocument.createElement('div');
    root.className = SELECTION_ROOT_CLASS;
    root.setAttribute('aria-hidden', 'true');
    root.style.position = 'absolute';
    root.style.inset = '0';
    root.style.pointerEvents = 'none';
    root.style.userSelect = 'none';
    root.style.zIndex = '3';
    layer.append(root);
    return root;
}

function rootFor(layer: HTMLElement): HTMLElement | null {
    const root = layer.querySelector(`:scope > .${SELECTION_ROOT_CLASS}`);
    return root instanceof HTMLElement ? root : null;
}

function rangeIntersects(range: Range, layer: HTMLElement): boolean {
    if (!layer.isConnected) return false;
    try {
        return range.intersectsNode(layer);
    } catch {
        return false;
    }
}

function selectedSlice(range: Range, run: DomRun): { start: number; end: number } | null {
    const element = run.element;
    if (!element.isConnected) return null;
    const length = run.text.length;
    if (range.collapsed) {
        if (!element.contains(range.startContainer) && range.startContainer !== element) return null;
        const offset = Math.max(0, Math.min(length, textOffset(element, range.startContainer, range.startOffset)));
        return { start: offset, end: offset };
    }
    let intersects = false;
    try {
        intersects = range.intersectsNode(element);
    } catch {
        return null;
    }
    if (!intersects) return null;

    let start = 0;
    let end = length;
    if (element.contains(range.startContainer)) {
        start = textOffset(element, range.startContainer, range.startOffset);
    }
    if (element.contains(range.endContainer)) {
        end = textOffset(element, range.endContainer, range.endOffset);
    }
    start = Math.max(0, Math.min(length, start));
    end = Math.max(start, Math.min(length, end));
    if (start === end) return null;
    return { start, end };
}

function textOffset(root: HTMLElement, node: Node, offset: number): number {
    if (node === root) {
        let count = 0;
        for (let index = 0; index < offset && index < root.childNodes.length; index += 1) {
            count += root.childNodes[index]?.textContent?.length ?? 0;
        }
        return count;
    }
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let count = 0;
    let current = walker.nextNode();
    while (current) {
        if (current === node) return count + Math.max(0, offset);
        count += current.textContent?.length ?? 0;
        current = walker.nextNode();
    }
    return count;
}

function onCopy(state: DocState, doc: Document, event: ClipboardEvent): void {
    const active = doc.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    const text = pdfSelectionPlainText(doc);
    if (text === null || !event.clipboardData) return;
    if (![...state.layers].some((layer) => layer.isConnected)) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', text);
}

function plainTextForSelection(state: DocState, range: Range): string | null {
    const layers = [...state.layers].filter((layer) => layer.isConnected && rangeIntersects(range, layer));
    layers.sort((a, b) => {
        if (a === b) return 0;
        const position = a.compareDocumentPosition(b);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
    });
    const pages: string[] = [];
    for (const layer of layers) {
        const rows: string[] = [];
        for (const line of linesOf(layer)) {
            const parts: { text: string; gapBefore: number; height: number }[] = [];
            let previousEnd: number | null = null;
            for (const run of line.runs as DomRun[]) {
                const slice = selectedSlice(range, run);
                if (!slice || slice.start === slice.end) continue;
                parts.push({
                    text: run.text.slice(slice.start, slice.end),
                    gapBefore: previousEnd === null ? 0 : run.x - previousEnd,
                    height: run.height,
                });
                previousEnd = run.x + run.width;
            }
            const row = joinRunPieces(parts);
            if (row) rows.push(row);
        }
        if (rows.length > 0) pages.push(rows.join('\n'));
    }
    if (pages.length === 0) return null;
    return pages.join('\n\n');
}

function measuredWidth(element: HTMLElement, text: string): number {
    if (!text) return 0;
    const doc = element.ownerDocument;
    let context = measureContexts.get(doc);
    if (!context) {
        const canvas = doc.createElement('canvas');
        const next = canvas.getContext('2d');
        if (!next) return 0;
        context = next;
        measureContexts.set(doc, context);
    }
    try {
        const computed = doc.defaultView?.getComputedStyle(element);
        if (computed) {
            context.font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
        }
        return context.measureText(text).width;
    } catch {
        return 0;
    }
}

function retargetRunFonts(layer: HTMLElement): void {
    const canvas = layer.ownerDocument.createElement('canvas');
    const context = canvas.getContext('2d');
    for (const node of layer.querySelectorAll('span')) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.classList.contains('ocr-word') || node.classList.contains('markedContent')) continue;
        if (node.querySelector('span, br')) continue;
        const text = node.textContent ?? '';
        if (!text) continue;
        const inline = node.style.fontFamily.trim();
        if (!inline || inline.includes('system-ui')) continue;
        const nextFamily = `${inline}, ${FONT_FALLBACK}`;
        const scaleX = Number.parseFloat(node.style.getPropertyValue('--scale-x'));
        if (Number.isFinite(scaleX) && scaleX > 0) {
            if (!context) continue;
            const adjusted = measureAdjustedScale(context, text, inline, nextFamily, scaleX);
            if (adjusted === null) continue;
            node.style.setProperty('--scale-x', String(adjusted));
        }
        node.style.fontFamily = nextFamily;
    }
}

function measureAdjustedScale(
    context: CanvasRenderingContext2D,
    text: string,
    oldFamily: string,
    newFamily: string,
    scaleX: number,
): number | null {
    try {
        context.font = `100px ${oldFamily}`;
        const oldWidth = context.measureText(text).width;
        context.font = `100px ${newFamily}`;
        const newWidth = context.measureText(text).width;
        return adjustedScaleX(scaleX, oldWidth, newWidth);
    } catch {
        return null;
    }
}
