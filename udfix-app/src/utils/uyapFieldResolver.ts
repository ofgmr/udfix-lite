import type { XmlField, XmlParagraph, XmlTextSpan } from '../types/uyapXml';
import { uyapParagraphPlainText } from './uyapParagraphText';

type DataRecord = Record<string, unknown>;
type XmlOffsetNode = { $: { startOffset?: string; length?: string } & Record<string, string | undefined> };

export interface UyapTemplateContext {
    rawText: string;
    dataRoot: DataRecord | null;
    hasDataSection: boolean;
    /**
     * When expanding a repeating UYAP field group / table row, lookups prefer this
     * scoped record (one instance) instead of always taking the first match in dataRoot.
     */
    scopedGroupRecord?: DataRecord | null;
}

export interface UyapRenderedSpan {
    text: string;
    /** Raw HTML fragment (e.g. imza table) — only used by HTML export path */
    html?: string;
    attrs?: Record<string, string | undefined>;
}

type OffsetSegment =
    | { kind: 'content'; node: XmlTextSpan }
    | { kind: 'field'; node: XmlField }
    | { kind: 'tab'; node: XmlOffsetNode }
    | { kind: 'space'; node: XmlOffsetNode };

const VIRTUAL_EMPTY_FIELDS = new Set(['auto', 'autoa']);

function getStartOffset(node: { $: { startOffset?: string } }): number {
    const parsed = Number.parseInt(node.$.startOffset ?? '0', 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getLength(node: { $: { startOffset?: string; length?: string } }): number {
    const parsed = Number.parseInt(node.$.length ?? '0', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function leafToString(value: unknown): string | null {
    if (value == null) return null;
    if (Array.isArray(value)) {
        if (value.length === 0) return '';
        const first = value[0];
        if (typeof first === 'string' || typeof first === 'number' || typeof first === 'boolean') {
            return String(first);
        }
        return null;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return null;
}

function readAtPath(root: DataRecord | null | undefined, path: string[]): string | null {
    if (!root || path.length === 0) return null;
    let current: unknown = root;
    for (let i = 0; i < path.length; i += 1) {
        const key = path[i];
        if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
        const obj = current as DataRecord;
        const next = obj[key];
        if (next == null) return null;
        if (i === path.length - 1) {
            return leafToString(next);
        }
        if (Array.isArray(next)) {
            if (next.length === 0) return null;
            current = next[0];
        } else if (typeof next === 'object') {
            current = next;
        } else {
            return null;
        }
    }
    return null;
}

/** UYAP `<data>` often nests field groups under template-specific parents (e.g. GroupXfPGrp vs Group5PGrp). */
function findFieldGroupRecord(root: unknown, groupName: string): DataRecord | null {
    const all = collectFieldGroupInstances(root, groupName);
    return all[0] ?? null;
}

/**
 * Collect every instance of a named field group in `<data>`.
 * Takip talebi templates store N creditors as N sibling `<alacakliAdiSoyadiGrp>` nodes
 * (or N parent wrappers each containing one), but the template only has one field block.
 */
export function collectFieldGroupInstances(root: unknown, groupName: string): DataRecord[] {
    if (!root || typeof root !== 'object' || !groupName) return [];
    const results: DataRecord[] = [];

    const walk = (node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            for (const item of node) walk(item);
            return;
        }

        const obj = node as DataRecord;
        if (Object.prototype.hasOwnProperty.call(obj, groupName)) {
            const candidate = obj[groupName];
            if (Array.isArray(candidate)) {
                for (const item of candidate) {
                    if (item && typeof item === 'object' && !Array.isArray(item)) {
                        results.push(item as DataRecord);
                    }
                }
            } else if (candidate && typeof candidate === 'object') {
                results.push(candidate as DataRecord);
            }
            for (const [key, value] of Object.entries(obj)) {
                if (key !== groupName) walk(value);
            }
            return;
        }

        for (const value of Object.values(obj)) walk(value);
    };

    walk(root);
    return results;
}

function lookupFieldInGroupRecord(group: DataRecord, fieldName: string): string | null {
    const direct = leafToString(group[fieldName]);
    if (direct != null) return direct;
    for (const value of Object.values(group)) {
        if (!value || typeof value !== 'object') continue;
        if (Array.isArray(value)) {
            for (const item of value) {
                if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
                const nested = leafToString((item as DataRecord)[fieldName]);
                if (nested != null) return nested;
            }
        } else {
            const nested = leafToString((value as DataRecord)[fieldName]);
            if (nested != null) return nested;
        }
    }
    return null;
}

export function buildUyapDataRoot(templateData: unknown): { root: DataRecord | null; hasDataSection: boolean } {
    if (!templateData) return { root: null, hasDataSection: false };
    if (Array.isArray(templateData)) {
        const first = templateData[0];
        if (first && typeof first === 'object' && !Array.isArray(first)) {
            return { root: first as DataRecord, hasDataSection: true };
        }
        return { root: null, hasDataSection: true };
    }
    if (typeof templateData === 'object') {
        return { root: templateData as DataRecord, hasDataSection: true };
    }
    return { root: null, hasDataSection: false };
}

export function lookupUyapFieldValue(
    ctx: UyapTemplateContext,
    paragraphGroup: string | undefined,
    fieldGroup: string | undefined,
    fieldName: string,
): string | null {
    if (!fieldName || !ctx.dataRoot) return null;

    if (ctx.scopedGroupRecord) {
        const scoped = lookupFieldInGroupRecord(ctx.scopedGroupRecord, fieldName);
        if (scoped != null) return scoped;

        const tryNestedGroup = (groupName: string | undefined): string | null => {
            if (!groupName) return null;
            const nestedGroup = ctx.scopedGroupRecord![groupName];
            if (nestedGroup && typeof nestedGroup === 'object' && !Array.isArray(nestedGroup)) {
                return lookupFieldInGroupRecord(nestedGroup as DataRecord, fieldName);
            }
            if (Array.isArray(nestedGroup) && nestedGroup[0] && typeof nestedGroup[0] === 'object') {
                return lookupFieldInGroupRecord(nestedGroup[0] as DataRecord, fieldName);
            }
            return null;
        };

        const fromFieldGroup = tryNestedGroup(fieldGroup);
        if (fromFieldGroup != null) return fromFieldGroup;
        const fromParagraphGroup = tryNestedGroup(paragraphGroup);
        if (fromParagraphGroup != null) return fromParagraphGroup;

        // Scoped row/group expansion must not leak values from sibling instances.
        if (fieldGroup || paragraphGroup) return null;
    }

    const candidates: string[][] = [];
    if (paragraphGroup && fieldGroup) candidates.push([paragraphGroup, fieldGroup, fieldName]);
    if (paragraphGroup) candidates.push([paragraphGroup, fieldName]);
    if (fieldGroup) candidates.push([fieldGroup, fieldName]);
    candidates.push([fieldName]);

    for (const path of candidates) {
        const value = readAtPath(ctx.dataRoot, path);
        if (value != null) return value;
    }

    if (fieldGroup && ctx.dataRoot) {
        const groupRecord = findFieldGroupRecord(ctx.dataRoot, fieldGroup);
        if (groupRecord) {
            const nested = lookupFieldInGroupRecord(groupRecord, fieldName);
            if (nested != null) return nested;
        }
    }

    if (paragraphGroup && ctx.dataRoot) {
        const paragraphRecord = findFieldGroupRecord(ctx.dataRoot, paragraphGroup);
        if (paragraphRecord) {
            const nested = lookupFieldInGroupRecord(paragraphRecord, fieldName);
            if (nested != null) return nested;
        }
    }

    return null;
}

function isUyapFalse(value: string | null | undefined): boolean {
    if (value == null) return true;
    const normalized = value.trim().toLowerCase();
    return normalized === '' || normalized === 'false' || normalized === '0' || normalized === 'hayır' || normalized === 'hayir';
}

function isUyapTrue(value: string | null | undefined): boolean {
    if (value == null) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'evet';
}

function isTemplatePlaceholder(rawFallback: string, fieldName: string): boolean {
    if (!rawFallback) return true;
    if (rawFallback === fieldName) return true;
    if (VIRTUAL_EMPTY_FIELDS.has(fieldName)) return true;
    if (fieldName === 'ceol' || fieldName === 'eol') return true;
    if (fieldName.startsWith('av.') && rawFallback === fieldName) return true;
    if (rawFallback.startsWith('auto') && (fieldName === 'auto' || fieldName === 'autoa' || rawFallback.includes(fieldName))) {
        return true;
    }
    return false;
}

function decodeUyapStoredHtml(value: string): string {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function htmlToPlainText(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/td>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function collectOffsetSegments(p: XmlParagraph): OffsetSegment[] {
    const segments: OffsetSegment[] = [
        ...(p.content ?? []).map((node) => ({ kind: 'content' as const, node })),
        ...(p.field ?? []).map((node) => ({ kind: 'field' as const, node })),
        ...(p.tab ?? []).map((node) => ({ kind: 'tab' as const, node })),
        ...(p.space ?? []).map((node) => ({ kind: 'space' as const, node })),
    ];
    segments.sort((a, b) => getStartOffset(a.node) - getStartOffset(b.node));
    return segments;
}

interface FieldGroupRange {
    name: string;
    start: number;
    end: number;
    hasData: boolean;
}

function isVirtualFieldName(fieldName: string): boolean {
    return VIRTUAL_EMPTY_FIELDS.has(fieldName) || fieldName === 'ceol' || fieldName === 'eol';
}

function fieldGroupHasVisibleData(
    p: XmlParagraph,
    ctx: UyapTemplateContext,
    paragraphGroup: string | undefined,
    groupName: string,
): boolean {
    for (const field of p.field ?? []) {
        if (field.$.fieldGroupName !== groupName) continue;
        const fieldName = field.$.fieldName ? String(field.$.fieldName) : '';
        if (!fieldName || isVirtualFieldName(fieldName)) continue;
        if (fieldName === 'VEKİLİ' && field.$.fieldType === '2') continue;
        const value = lookupUyapFieldValue(ctx, paragraphGroup, groupName, fieldName);
        if (value != null && value.trim().length > 0) return true;
    }
    return false;
}

function buildFieldGroupRanges(
    p: XmlParagraph,
    ctx: UyapTemplateContext,
    paragraphGroup: string | undefined,
): FieldGroupRange[] {
    const fields = (p.field ?? [])
        .slice()
        .sort((a, b) => getStartOffset(a) - getStartOffset(b));
    if (fields.length === 0) return [];

    const segments = collectOffsetSegments(p);
    const paragraphEnd = segments.reduce(
        (max, segment) => Math.max(max, getStartOffset(segment.node) + getLength(segment.node)),
        0,
    );

    const ranges: FieldGroupRange[] = [];
    let index = 0;
    while (index < fields.length) {
        const groupName = fields[index].$.fieldGroupName ? String(fields[index].$.fieldGroupName) : '';
        if (!groupName) {
            index += 1;
            continue;
        }

        const start = getStartOffset(fields[index]);
        let end = start;
        let cursor = index;
        while (cursor < fields.length && fields[cursor].$.fieldGroupName === groupName) {
            end = Math.max(end, getStartOffset(fields[cursor]) + getLength(fields[cursor]));
            cursor += 1;
        }

        let boundary = paragraphEnd;
        for (let next = cursor; next < fields.length; next += 1) {
            const nextField = fields[next];
            const nextGroup = nextField.$.fieldGroupName ? String(nextField.$.fieldGroupName) : '';
            const nextName = nextField.$.fieldName ? String(nextField.$.fieldName) : '';
            if (nextGroup !== groupName || nextName === 'ceol') {
                boundary = getStartOffset(nextField);
                break;
            }
        }

        ranges.push({
            name: groupName,
            start,
            end: boundary,
            hasData: fieldGroupHasVisibleData(p, ctx, paragraphGroup, groupName),
        });
        index = cursor;
    }

    return ranges;
}

function isOffsetInHiddenFieldGroup(
    offset: number,
    ranges: FieldGroupRange[],
): boolean {
    for (const range of ranges) {
        if (offset >= range.start && offset < range.end && !range.hasData) {
            return true;
        }
    }
    return false;
}

function resolveFieldOutput(
    field: XmlField,
    ctx: UyapTemplateContext,
    paragraphGroup: string | undefined,
    suppressAfterOffset: number,
): { text: string; html?: string; suppressAfterOffset: number } {
    const start = getStartOffset(field);
    if (suppressAfterOffset >= 0 && start > suppressAfterOffset) {
        return { text: '', suppressAfterOffset };
    }

    const fieldName = field.$.fieldName ? String(field.$.fieldName) : '';
    const fieldGroup = field.$.fieldGroupName ? String(field.$.fieldGroupName) : undefined;

    if (VIRTUAL_EMPTY_FIELDS.has(fieldName)) {
        return { text: '', suppressAfterOffset };
    }

    if (fieldName === 'ceol') {
        const ceolValue = lookupUyapFieldValue(ctx, paragraphGroup, fieldGroup, 'ceol');
        if (isUyapFalse(ceolValue)) {
            return { text: '', suppressAfterOffset: start };
        }
        return { text: '', suppressAfterOffset };
    }

    if (fieldName === 'eol') {
        return { text: '\n', suppressAfterOffset };
    }

    if (fieldName === 'VEKİLİ' && field.$.fieldType === '2') {
        const length = getLength(field);
        if (length > 0) {
            return { text: ctx.rawText.substring(start, start + length), suppressAfterOffset };
        }
        return { text: 'VEKİLİ', suppressAfterOffset };
    }

    if (fieldName.startsWith('av.') && paragraphGroup) {
        const vekili = lookupUyapFieldValue(ctx, paragraphGroup, undefined, 'VEKİLİ');
        if (!isUyapTrue(vekili)) {
            return { text: '', suppressAfterOffset };
        }
    }

    const byData = lookupUyapFieldValue(ctx, paragraphGroup, fieldGroup, fieldName);
    if (byData != null && byData.length > 0) {
        if (fieldName === 'imza' && /<table/i.test(byData)) {
            const html = decodeUyapStoredHtml(byData);
            return { text: htmlToPlainText(html), html, suppressAfterOffset };
        }
        return { text: byData, suppressAfterOffset };
    }

    const length = getLength(field);
    if (!ctx.hasDataSection && length > 0) {
        return { text: ctx.rawText.substring(start, start + length), suppressAfterOffset };
    }

    if (ctx.hasDataSection && length > 0) {
        const fallback = ctx.rawText.substring(start, start + length);
        if (isTemplatePlaceholder(fallback, fieldName)) {
            return { text: '', suppressAfterOffset };
        }
        return { text: fallback, suppressAfterOffset };
    }

    return { text: '', suppressAfterOffset };
}

/** Hide vekil-only repeating paragraphs when `<data>` says VEKİLİ=false. */
export function shouldSkipUyapParagraph(p: XmlParagraph, ctx: UyapTemplateContext): boolean {
    const paragraphGroup = p.$?.GroupName ? String(p.$.GroupName) : undefined;
    if (p.$?.RepeatingLabel !== 'true' || !paragraphGroup || !ctx.dataRoot) return false;

    const vekiliField = p.field?.find((field) => field.$.fieldName === 'VEKİLİ');
    if (!vekiliField) return false;

    const vekiliValue = lookupUyapFieldValue(ctx, paragraphGroup, undefined, 'VEKİLİ');
    return isUyapFalse(vekiliValue);
}

function renderSegmentsOnce(
    p: XmlParagraph,
    ctx: UyapTemplateContext,
    paragraphGroup: string | undefined,
    segments: OffsetSegment[],
    groupRanges: FieldGroupRange[],
    rangeStart: number,
    rangeEnd: number,
): UyapRenderedSpan[] {
    const rendered: UyapRenderedSpan[] = [];
    let suppressAfterOffset = -1;

    const reservedRanges = segments
        .filter((s) => s.kind === 'tab' || s.kind === 'space')
        .map((s) => {
            const start = getStartOffset(s.node);
            return { start, end: start + getLength(s.node) };
        });

    const overlapsReserved = (start: number, length: number): boolean => {
        const end = start + length;
        return reservedRanges.some((r) => start < r.end && r.start < end);
    };

    for (const segment of segments) {
        const start = getStartOffset(segment.node);
        if (start < rangeStart || start >= rangeEnd) continue;

        if (suppressAfterOffset >= 0 && start > suppressAfterOffset) {
            // Soft suppress after ceol=false: hide glue/placeholders, but keep fields that have real <data>.
            if (segment.kind !== 'field') continue;
            const fieldName = segment.node.$.fieldName ? String(segment.node.$.fieldName) : '';
            if (!fieldName || isVirtualFieldName(fieldName)) continue;
            const byData = lookupUyapFieldValue(
                ctx,
                paragraphGroup,
                segment.node.$.fieldGroupName ? String(segment.node.$.fieldGroupName) : undefined,
                fieldName,
            );
            if (byData == null || byData.length === 0) continue;
            rendered.push({ text: byData, attrs: segment.node.$ });
            continue;
        }

        if (segment.kind === 'content') {
            const length = getLength(segment.node);
            if (length > 0 && overlapsReserved(start, length)) continue;
        }

        if (segment.kind === 'field') {
            const fieldGroup = segment.node.$.fieldGroupName ? String(segment.node.$.fieldGroupName) : undefined;
            if (fieldGroup && !fieldGroupHasVisibleData(p, ctx, paragraphGroup, fieldGroup)) {
                continue;
            }
            const resolved = resolveFieldOutput(segment.node, ctx, paragraphGroup, suppressAfterOffset);
            suppressAfterOffset = resolved.suppressAfterOffset;
            if (!resolved.text && !resolved.html) continue;
            rendered.push({
                text: resolved.text,
                html: resolved.html,
                attrs: segment.node.$,
            });
            continue;
        }

        if (isOffsetInHiddenFieldGroup(start, groupRanges)) continue;

        const length = getLength(segment.node);
        if (length <= 0) continue;
        const text = ctx.rawText.substring(start, start + length);
        if (!text) continue;
        rendered.push({
            text,
            attrs: segment.node.$,
        });
    }

    return rendered;
}

/**
 * Find repeating row records in `<data>` that match the field groups used by a table row.
 * UYAP encodes table names (Tablo11 → TabloXbXb); we match by nested field-group tags instead.
 */
export function findRepeatingTableRowInstances(
    root: DataRecord | null,
    fieldGroupNames: string[],
): DataRecord[] {
    if (!root || fieldGroupNames.length === 0) return [];
    const groupSet = new Set(fieldGroupNames);
    let best: DataRecord[] = [];

    const rowLooksLikeMatch = (row: DataRecord): boolean => {
        let hits = 0;
        for (const key of Object.keys(row)) {
            if (groupSet.has(key)) hits += 1;
        }
        return hits > 0;
    };

    const walk = (node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            const records = node.filter(
                (item): item is DataRecord =>
                    !!item && typeof item === 'object' && !Array.isArray(item) && rowLooksLikeMatch(item as DataRecord),
            );
            if (records.length > best.length) best = records;
            for (const item of node) walk(item);
            return;
        }
        for (const value of Object.values(node as DataRecord)) walk(value);
    };

    walk(root);
    return best.length > 1 ? best : [];
}

export function renderUyapParagraphSpans(p: XmlParagraph, ctx: UyapTemplateContext): UyapRenderedSpan[] {
    if (shouldSkipUyapParagraph(p, ctx)) return [];

    const paragraphGroup = p.$?.GroupName ? String(p.$.GroupName) : undefined;
    const segments = collectOffsetSegments(p);
    const groupRanges = buildFieldGroupRanges(p, ctx, paragraphGroup);
    if (segments.length === 0) return [];

    const paragraphEnd = segments.reduce(
        (max, segment) => Math.max(max, getStartOffset(segment.node) + getLength(segment.node)),
        0,
    );

    // Expand repeating field groups (N data instances, 1 template field block).
    // When already scoped to a table-row/parent instance, do not re-expand from the global tree.
    const multiGroups = ctx.scopedGroupRecord
        ? []
        : groupRanges
              .map((range) => ({
                  range,
                  instances: ctx.dataRoot ? collectFieldGroupInstances(ctx.dataRoot, range.name) : [],
              }))
              .filter((g) => g.instances.length > 1);

    if (multiGroups.length === 0) {
        return renderSegmentsOnce(p, ctx, paragraphGroup, segments, groupRanges, 0, paragraphEnd + 1);
    }

    const rendered: UyapRenderedSpan[] = [];
    let cursor = 0;
    const sorted = multiGroups.slice().sort((a, b) => a.range.start - b.range.start);

    for (const multi of sorted) {
        if (multi.range.start > cursor) {
            rendered.push(
                ...renderSegmentsOnce(p, ctx, paragraphGroup, segments, groupRanges, cursor, multi.range.start),
            );
        }
        for (let i = 0; i < multi.instances.length; i += 1) {
            if (i > 0) {
                const prev = rendered[rendered.length - 1];
                if (!prev?.text?.endsWith('\n')) {
                    rendered.push({ text: '\n' });
                }
            }
            const scopedCtx: UyapTemplateContext = { ...ctx, scopedGroupRecord: multi.instances[i] };
            rendered.push(
                ...renderSegmentsOnce(
                    p,
                    scopedCtx,
                    paragraphGroup,
                    segments,
                    groupRanges,
                    multi.range.start,
                    multi.range.end,
                ),
            );
        }
        cursor = multi.range.end;
    }

    if (cursor <= paragraphEnd) {
        rendered.push(
            ...renderSegmentsOnce(p, ctx, paragraphGroup, segments, groupRanges, cursor, paragraphEnd + 1),
        );
    }

    return rendered;
}

export function paragraphHasVisibleContent(spans: UyapRenderedSpan[]): boolean {
    return spans.some((span) => span.html) || uyapParagraphPlainText(spans).replace(/\s+/g, '').length > 0;
}
