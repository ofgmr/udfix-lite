/**
 * Geometric PDF line selection.
 *
 * Electron renders with Chromium, so AppKit PDFKit (Preview's selector) is not
 * available without replacing the viewer. These helpers are the line model we
 * use instead: cluster pdf.js / OCR runs into visual lines, snap hits to the
 * line band, and clip highlight boxes so neighboring lines do not share ink.
 */

export type PdfLayoutRun = {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    breakBefore: boolean;
};

export type PdfLayoutLine = {
    runs: PdfLayoutRun[];
    x: number;
    y: number;
    width: number;
    height: number;
};

export type PdfBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type SelectionGranularity = 'char' | 'word' | 'line';

const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;

export function isPdfWordChar(ch: string): boolean {
    return WORD_CHAR.test(ch);
}

export function adjustedScaleX(scaleX: number, oldWidth: number, newWidth: number): number | null {
    if (!(scaleX > 0) || !(oldWidth > 0) || !(newWidth > 0)) return null;
    if (!Number.isFinite(scaleX) || !Number.isFinite(oldWidth) || !Number.isFinite(newWidth)) return null;
    return scaleX * (oldWidth / newWidth);
}

export function clusterPdfLines(runs: readonly PdfLayoutRun[]): PdfLayoutLine[] {
    const lines: PdfLayoutRun[][] = [];
    let current: PdfLayoutRun[] = [];

    const flush = () => {
        if (current.length === 0) return;
        lines.push(current);
        current = [];
    };

    for (const run of runs) {
        if (run.breakBefore) flush();
        if (current.length === 0) {
            current.push(run);
            continue;
        }
        const previous = current[current.length - 1]!;
        // Same-baseline runs differ by a pixel or two. A larger jump is the next line,
        // including tight leading where the glyph boxes overlap.
        const ySlack = Math.max(2, previous.height * 0.35);
        const yJump = Math.abs(run.y - previous.y) > ySlack;
        const xReset = run.x < previous.x - Math.max(1, previous.height * 0.25);
        if (yJump || xReset) flush();
        current.push(run);
    }
    flush();

    return lines.map((lineRuns) => {
        const x = Math.min(...lineRuns.map((run) => run.x));
        const y = Math.min(...lineRuns.map((run) => run.y));
        const right = Math.max(...lineRuns.map((run) => run.x + run.width));
        const bottom = Math.max(...lineRuns.map((run) => run.y + run.height));
        return {
            runs: lineRuns,
            x,
            y,
            width: Math.max(0, right - x),
            height: Math.max(1, bottom - y),
        };
    });
}

function verticalReach(lines: readonly PdfLayoutLine[], index: number): number {
    const line = lines[index]!;
    const centerY = line.y + line.height / 2;
    let nearestHalfGap = Infinity;
    for (let otherIndex = 0; otherIndex < lines.length; otherIndex += 1) {
        if (otherIndex === index) continue;
        const other = lines[otherIndex]!;
        const overlapsX =
            other.x < line.x + line.width + line.height &&
            other.x + other.width > line.x - line.height;
        if (!overlapsX) continue;
        const otherCenterY = other.y + other.height / 2;
        const halfGap = Math.abs(otherCenterY - centerY) / 2;
        if (halfGap > 0 && halfGap < nearestHalfGap) nearestHalfGap = halfGap;
    }
    if (!Number.isFinite(nearestHalfGap)) return Math.max(line.height * 0.7, 4);
    return Math.max(nearestHalfGap, 1);
}

/** Index of the visual line under a point, or -1 when the point is away from text. */
export function pickPdfLine(lines: readonly PdfLayoutLine[], x: number, y: number): number {
    let best = -1;
    let bestScore = Infinity;
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!;
        const centerY = line.y + line.height / 2;
        const dy = Math.abs(y - centerY);
        if (dy > verticalReach(lines, index) + 0.01) continue;
        const dx = x < line.x ? line.x - x : x > line.x + line.width ? x - (line.x + line.width) : 0;
        const score = dy + dx * 0.15;
        if (score < bestScore) {
            bestScore = score;
            best = index;
        }
    }
    return best;
}

/** Caret offset in the concatenated line, from 0 through the line length. */
export function caretOffsetOnLine(
    runs: readonly Pick<PdfLayoutRun, 'x' | 'width' | 'text'>[],
    x: number,
): number {
    if (runs.length === 0) return 0;
    const last = runs[runs.length - 1]!;
    const total = runs.reduce((sum, run) => sum + run.text.length, 0);
    if (x >= last.x + last.width) return total;
    if (x <= runs[0]!.x) return 0;

    let cursor = 0;
    for (let index = 0; index < runs.length; index += 1) {
        const run = runs[index]!;
        const length = run.text.length;
        const runEnd = run.x + run.width;
        const next = runs[index + 1];
        if (next && x >= runEnd && x < next.x) return cursor + length;
        if (!next || x <= runEnd) {
            if (x <= run.x) return cursor;
            const ratio = run.width > 0 ? (x - run.x) / run.width : 0;
            const local = Math.round(Math.min(1, Math.max(0, ratio)) * length);
            return cursor + local;
        }
        cursor += length;
    }
    return total;
}

export function wordBoundsAt(text: string, index: number): { start: number; end: number } | null {
    if (text.length === 0) return null;
    let probe = Math.max(0, Math.min(text.length - 1, index));
    if (!isPdfWordChar(text[probe] ?? '') && probe > 0 && isPdfWordChar(text[probe - 1] ?? '')) {
        probe -= 1;
    }
    if (!isPdfWordChar(text[probe] ?? '')) return null;

    let start = probe;
    let end = probe + 1;
    while (start > 0 && isPdfWordChar(text[start - 1] ?? '')) start -= 1;
    while (end < text.length && isPdfWordChar(text[end] ?? '')) end += 1;

    const glue = (ch: string | undefined) => ch === "'" || ch === '’' || ch === '-';
    while (end < text.length - 1 && glue(text[end]) && isPdfWordChar(text[end + 1] ?? '')) {
        end += 1;
        while (end < text.length && isPdfWordChar(text[end] ?? '')) end += 1;
    }
    while (start > 1 && glue(text[start - 1]) && isPdfWordChar(text[start - 2] ?? '')) {
        start -= 1;
        while (start > 0 && isPdfWordChar(text[start - 1] ?? '')) start -= 1;
    }
    return { start, end };
}

/** Nearest run under x, splitting the gap between runs at its midpoint. */
export function runIndexAtX(
    runs: readonly Pick<PdfLayoutRun, 'x' | 'width'>[],
    x: number,
): number {
    if (runs.length === 0) return 0;
    for (let index = 0; index < runs.length; index += 1) {
        const run = runs[index]!;
        const next = runs[index + 1];
        const edge = next ? (run.x + run.width + next.x) / 2 : Number.POSITIVE_INFINITY;
        if (x < edge) return index;
    }
    return runs.length - 1;
}

function runsAreOneWord(left: PdfLayoutRun, right: PdfLayoutRun): boolean {
    if (left.text.endsWith(' ') || right.text.startsWith(' ')) return false;
    const gap = right.x - (left.x + left.width);
    return gap <= Math.max(2, Math.min(left.height, right.height) * 0.25);
}

/**
 * Word bounds in concatenated line text. A wide gap between runs is a word
 * break even when the PDF did not emit a space character.
 */
export function expandWordOnLine(
    line: PdfLayoutLine,
    runIndex: number,
    caret: number,
): { start: number; end: number } | null {
    const runs = line.runs;
    if (runs.length === 0) return null;
    let startRun = Math.max(0, Math.min(runs.length - 1, runIndex));
    let endRun = startRun;
    while (startRun > 0 && runsAreOneWord(runs[startRun - 1]!, runs[startRun]!)) startRun -= 1;
    while (endRun < runs.length - 1 && runsAreOneWord(runs[endRun]!, runs[endRun + 1]!)) endRun += 1;

    let segmentStart = 0;
    for (let index = 0; index < startRun; index += 1) segmentStart += runs[index]!.text.length;
    const segment = runs.slice(startRun, endRun + 1).map((run) => run.text).join('');
    const bounds = wordBoundsAt(segment, caret - segmentStart);
    if (!bounds) return null;
    return { start: segmentStart + bounds.start, end: segmentStart + bounds.end };
}

export function snapLineCaret(
    line: PdfLayoutLine,
    caret: number,
    runIndex: number,
    granularity: SelectionGranularity,
    edge: 'lo' | 'hi',
): number {
    if (granularity !== 'word') return snapCaret(lineText(line), caret, granularity, edge);
    const bounds = expandWordOnLine(line, runIndex, caret);
    if (!bounds) return snapCaret(lineText(line), caret, 'char', edge);
    return edge === 'lo' ? bounds.start : bounds.end;
}

export function snapCaret(
    text: string,
    caret: number,
    granularity: SelectionGranularity,
    edge: 'lo' | 'hi',
): number {
    const clamped = Math.max(0, Math.min(text.length, caret));
    switch (granularity) {
        case 'char':
            return clamped;
        case 'line':
            return edge === 'lo' ? 0 : text.length;
        case 'word': {
            if (text.length === 0) return 0;
            let index = clamped === text.length ? text.length - 1 : clamped;
            if (
                edge === 'hi' &&
                clamped > 0 &&
                (clamped === text.length || !isPdfWordChar(text[clamped] ?? '')) &&
                isPdfWordChar(text[clamped - 1] ?? '')
            ) {
                index = clamped - 1;
            }
            const bounds = wordBoundsAt(text, index);
            if (!bounds) return clamped;
            return edge === 'lo' ? bounds.start : bounds.end;
        }
        default: {
            const unknown: never = granularity;
            return unknown;
        }
    }
}

export function lineText(line: PdfLayoutLine): string {
    return line.runs.map((run) => run.text).join('');
}

export function verticalClipLimits(
    line: PdfLayoutLine,
    others: readonly PdfLayoutLine[],
): { top: number; bottom: number } {
    const centerY = line.y + line.height / 2;
    let top = line.y;
    let bottom = line.y + line.height;
    for (const other of others) {
        if (other === line) continue;
        const overlapsX = other.x < line.x + line.width && other.x + other.width > line.x;
        if (!overlapsX) continue;
        const otherCenterY = other.y + other.height / 2;
        if (otherCenterY === centerY) continue;
        const mid = (centerY + otherCenterY) / 2;
        if (otherCenterY < centerY && mid > top) top = mid;
        if (otherCenterY > centerY && mid < bottom) bottom = mid;
    }
    return { top, bottom };
}

export function clipBox(box: PdfBox, limits: { top: number; bottom: number }): PdfBox | null {
    const top = Math.max(box.y, limits.top);
    const bottom = Math.min(box.y + box.height, limits.bottom);
    const height = bottom - top;
    if (height < 0.5 || box.width < 0.5) return null;
    return { x: box.x, y: top, width: box.width, height };
}

export function sliceBox(
    run: Pick<PdfLayoutRun, 'text' | 'x' | 'y' | 'width' | 'height'>,
    start: number,
    end: number,
    widthOf: (text: string) => number,
): PdfBox {
    const text = run.text;
    const from = Math.max(0, Math.min(text.length, start));
    const to = Math.max(from, Math.min(text.length, end));
    if (from === 0 && to === text.length) {
        return { x: run.x, y: run.y, width: run.width, height: run.height };
    }
    const full = widthOf(text);
    let leftRatio = text.length === 0 ? 0 : from / text.length;
    let rightRatio = text.length === 0 ? 0 : to / text.length;
    if (full > 0) {
        leftRatio = widthOf(text.slice(0, from)) / full;
        rightRatio = widthOf(text.slice(0, to)) / full;
    }
    const left = leftRatio * run.width;
    const right = rightRatio * run.width;
    return {
        x: run.x + left,
        y: run.y,
        width: Math.max(0, right - left),
        height: run.height,
    };
}

export function mergeLineBoxes(boxes: readonly PdfBox[], gap: number): PdfBox[] {
    const sorted = boxes.map((box) => ({ ...box })).sort((a, b) => a.y - b.y || a.x - b.x);
    const merged: PdfBox[] = [];
    for (const box of sorted) {
        const previous = merged[merged.length - 1];
        const touches =
            previous &&
            Math.abs(previous.y - box.y) < 1.5 &&
            Math.abs(previous.height - box.height) < 2 &&
            box.x <= previous.x + previous.width + gap;
        if (previous && touches) {
            const right = Math.max(previous.x + previous.width, box.x + box.width);
            const left = Math.min(previous.x, box.x);
            const top = Math.min(previous.y, box.y);
            const bottom = Math.max(previous.y + previous.height, box.y + box.height);
            previous.x = left;
            previous.y = top;
            previous.width = right - left;
            previous.height = bottom - top;
            continue;
        }
        merged.push(box);
    }
    return merged;
}

export function joinRunPieces(
    parts: readonly { text: string; gapBefore: number; height: number }[],
): string {
    let out = '';
    for (const part of parts) {
        if (!part.text) continue;
        const needsSpace =
            out.length > 0 &&
            !out.endsWith(' ') &&
            !out.endsWith('\n') &&
            !part.text.startsWith(' ') &&
            part.gapBefore > Math.max(2, part.height * 0.25);
        if (needsSpace) out += ' ';
        out += part.text;
    }
    return out;
}
