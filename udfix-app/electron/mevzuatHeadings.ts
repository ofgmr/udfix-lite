import type { SplitMadde } from './mevzuatParse';

const HEADING_MAX_CHARS = 100;
const HEADING_MAX_WORDS = 14;
const STRUCTURAL_UNIT =
    'B[Iİ]R[Iİ]NC[Iİ]|[Iİ]K[Iİ]NC[Iİ]|[UÜ][CÇ][UÜ]NC[UÜ]|D[OÖ]RD[UÜ]NC[UÜ]|BE[SŞ][Iİ]NC[Iİ]|ALTINCI|YED[Iİ]NC[Iİ]|SEK[Iİ]Z[Iİ]NC[Iİ]|DOKUZUNCU';
const STRUCTURAL_ORDINAL =
    `${STRUCTURAL_UNIT}|ONUNCU|ON\\s*(?:${STRUCTURAL_UNIT})|Y[Iİ]RM[Iİ]NC[Iİ]`;
const STRUCTURAL_KIND = 'K[Iİ]TAP|K[Iİ]S[Iİ]M|B[OÖ]L[UÜ]M|AY[Iİ]R[Iİ]M|BAP|FASIL';
const STRUCTURAL_RE = new RegExp(
    `^(?:(?:${STRUCTURAL_ORDINAL})\\s+|\\d+\\.?\\s+)?(?:${STRUCTURAL_KIND})\\s*$`,
    'i',
);
const ROMAN_TOKEN = 'XX|XIX|XVIII|XVII|XVI|XV|XIV|XIII|XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I';
const HEADING_DASH = '[-.\u2010-\u2015\u2212]';
const ROMAN_RE = new RegExp(`^(?:${ROMAN_TOKEN})\\.\\s+\\S`);
const ROMAN_DASH_RE = new RegExp(`^(?:${ROMAN_TOKEN})\\s*${HEADING_DASH}\\s+\\S`);
const LETTER_MAJOR_RE = /^[A-H]\.\s+\S/;
const LETTER_MINOR_RE = /^[a-ğıi]\.\s+\S/i;
const NUMBERED_RE = /^\d{1,2}[a-z]?\.\s+\S/;
const NUMBERED_DASH_RE = new RegExp(`^\\d{1,2}[a-z]?\\s*${HEADING_DASH}\\s+\\S`);
const FIKRA_RE = /^\(\d+\)/;
const LETTERED_PAREN_RE = /^([a-ğıi])\s*\)\s*(.*)$/i;
const AMENDMENT_RE = /^\((?:Değişik|Degisik|Ek|Mülga|Mulga|İptal|Iptal)\b/i;
const INSTRUMENT_TITLE_RE = /\b(?:KANUNU|KANUN|Y[OÖ]NETMEL[Iİ][GĞ][Iİ]|Y[OÖ]NETMEL[Iİ]K)\s*$/i;
const FOOTNOTE_TAIL_RE = /(?:\[[\d.,;\s]+\])+\s*$/;
const MADDE_LINE_RE = /^(?:Ek\s+|Geçici\s+)?(?:Madde|MADDE)\s+\d/i;

export type StructuralHeadingKind = 'kitap' | 'kisim' | 'bolum' | 'ayirim';
export type NestedHeadingKind = 'letterMajor' | 'roman' | 'numbered' | 'letterMinor' | 'title';
export type HeadingKind = StructuralHeadingKind | NestedHeadingKind;

export type ClassifiedHeading = {
    kind: HeadingKind;
    text: string;
};

export type MevzuatMaddeSection = {
    kitap: string | null;
    kisim: string | null;
    bolum: string | null;
    ayirim: string | null;
    maddeBaslik: string | null;
    sectionPath: string[];
};

export type SplitMaddeWithSection = SplitMadde & MevzuatMaddeSection;

export type AssignMaddeHeadingsResult = {
    maddeler: SplitMaddeWithSection[];
    peeledAny: boolean;
};

type Hierarchy = {
    kitap: string | null;
    kisim: string | null;
    bolum: string | null;
    ayirim: string | null;
    letterMajor: string | null;
    roman: string | null;
    numbered: string | null;
    letterMinor: string | null;
    maddeBaslik: string | null;
};

function emptyHierarchy(): Hierarchy {
    return {
        kitap: null,
        kisim: null,
        bolum: null,
        ayirim: null,
        letterMajor: null,
        roman: null,
        numbered: null,
        letterMinor: null,
        maddeBaslik: null,
    };
}

function clearNested(h: Hierarchy) {
    h.letterMajor = null;
    h.roman = null;
    h.numbered = null;
    h.letterMinor = null;
    h.maddeBaslik = null;
}

function foldHeading(value: string): string {
    return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');
}

function startsWithTurkishUpper(value: string): boolean {
    const ch = value[0];
    if (!ch) return false;
    return ch === ch.toLocaleUpperCase('tr-TR') && ch !== ch.toLocaleLowerCase('tr-TR');
}

function stripHeadingDecorations(value: string): string {
    return value.replace(FOOTNOTE_TAIL_RE, '').replace(/:\s*$/, '').trim();
}

function isAllCapsShort(value: string): boolean {
    const core = stripHeadingDecorations(value);
    if (core.length < 2 || core.length > HEADING_MAX_CHARS) return false;
    if (INSTRUMENT_TITLE_RE.test(core)) return false;
    const letters = core.replace(/[^A-Za-zÇĞİÖŞÜÂÎÛçğıöşüâîû]/g, '');
    if (letters.length < 2) return false;
    return core === core.toLocaleUpperCase('tr-TR');
}

function looksLikePlainTitle(value: string): boolean {
    const core = stripHeadingDecorations(value);
    if (core.length < 2 || core.length > HEADING_MAX_CHARS) return false;
    if (core.endsWith('.')) return false;
    if (/[,;]$/.test(core)) return false;
    if (!startsWithTurkishUpper(core)) return false;
    if (INSTRUMENT_TITLE_RE.test(core)) return false;
    if (core.includes(';')) return false;
    if (core.includes('. ')) return false;
    if ((core.match(/,/g) ?? []).length > 2) return false;
    if (/\d{1,2}\/\d{1,2}/.test(core)) return false;
    const words = core.split(/\s+/).filter(Boolean);
    if (words.length > HEADING_MAX_WORDS) return false;
    return true;
}

function looksLikeLetteredHeading(text: string): boolean {
    const match = LETTERED_PAREN_RE.exec(text);
    if (!match) return false;
    const rest = (match[2] ?? '').trim();
    if (!rest || AMENDMENT_RE.test(rest)) return false;
    return looksLikePlainTitle(rest);
}

function structuralKindFromLine(value: string): StructuralHeadingKind | null {
    const folded = foldHeading(stripHeadingDecorations(value));
    if (/\bk[iı]tap\b/.test(folded)) return 'kitap';
    if (/\bbap\b/.test(folded)) return 'kitap';
    if (/\bk[iı]s[iı]m\b/.test(folded)) return 'kisim';
    if (/\bfas[iı]l\b/.test(folded)) return 'bolum';
    if (/\bb[oö]l[uü]m\b/.test(folded)) return 'bolum';
    if (/\bay[iı]r[iı]m\b/.test(folded)) return 'ayirim';
    return null;
}

function isTerminatedSentence(text: string): boolean {
    return stripHeadingDecorations(text).endsWith('.');
}

export function classifyHeadingLine(raw: string): ClassifiedHeading | null {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text || text.length > HEADING_MAX_CHARS) return null;
    if (FIKRA_RE.test(text) || AMENDMENT_RE.test(text)) return null;
    if (MADDE_LINE_RE.test(text)) return null;
    if (text.startsWith('[') || text.startsWith('http')) return null;

    if (STRUCTURAL_RE.test(stripHeadingDecorations(text))) {
        const kind = structuralKindFromLine(text);
        if (kind) return { kind, text };
    }
    if (looksLikeLetteredHeading(text)) {
        return { kind: 'letterMinor', text };
    }
    if (LETTERED_PAREN_RE.test(text)) return null;
    if (LETTER_MAJOR_RE.test(text) && !isTerminatedSentence(text)) {
        return { kind: 'letterMajor', text };
    }
    if ((ROMAN_RE.test(text) || ROMAN_DASH_RE.test(text)) && !isTerminatedSentence(text)) {
        return { kind: 'roman', text };
    }
    if (
        (NUMBERED_RE.test(text) || NUMBERED_DASH_RE.test(text)) &&
        !isTerminatedSentence(text) &&
        !/^\d{1,2}\//.test(text)
    ) {
        return { kind: 'numbered', text };
    }
    if (LETTER_MINOR_RE.test(text) && !isTerminatedSentence(text)) {
        return { kind: 'letterMinor', text };
    }
    if (isAllCapsShort(text) || looksLikePlainTitle(text)) {
        return { kind: 'title', text };
    }
    return null;
}

export function isHeadingLine(raw: string): boolean {
    return classifyHeadingLine(raw) !== null;
}

function nonEmptyCount(lines: string[]): number {
    return lines.reduce((n, line) => (line.trim() ? n + 1 : n), 0);
}

export function peelTrailingHeadings(
    text: string,
    options?: { keepBody?: boolean },
): { body: string; headings: string[] } {
    const keepBody = options?.keepBody !== false;
    const lines = text.split('\n');
    let i = lines.length - 1;
    const headings: string[] = [];
    while (i >= 0) {
        const trimmed = lines[i]?.trim() ?? '';
        if (!trimmed) {
            i -= 1;
            continue;
        }
        if (!isHeadingLine(trimmed)) break;
        if (keepBody && nonEmptyCount(lines.slice(0, i)) === 0) break;
        headings.unshift(trimmed.replace(/\s+/g, ' '));
        i -= 1;
    }
    const body = lines.slice(0, i + 1).join('\n').trim();
    return { body, headings };
}

export function peelLeadingHeadings(
    text: string,
    options?: { keepBody?: boolean },
): { body: string; headings: string[] } {
    const keepBody = options?.keepBody !== false;
    const lines = text.split('\n');
    let i = 0;
    const headings: string[] = [];
    while (i < lines.length) {
        const trimmed = lines[i]?.trim() ?? '';
        if (!trimmed) {
            i += 1;
            continue;
        }
        if (!isHeadingLine(trimmed)) break;
        if (keepBody && nonEmptyCount(lines.slice(i + 1)) === 0) break;
        headings.push(trimmed.replace(/\s+/g, ' '));
        i += 1;
    }
    const body = lines.slice(i).join('\n').trim();
    return { body, headings };
}

function joinLabel(label: string | null, title: string): string {
    if (!label) return title;
    return `${label} · ${title}`;
}

function attachStructuralTitle(h: Hierarchy, kind: StructuralHeadingKind, title: string) {
    switch (kind) {
        case 'kitap':
            h.kitap = joinLabel(h.kitap, title);
            return;
        case 'kisim':
            h.kisim = joinLabel(h.kisim, title);
            return;
        case 'bolum':
            h.bolum = joinLabel(h.bolum, title);
            return;
        case 'ayirim':
            h.ayirim = joinLabel(h.ayirim, title);
            return;
        default: {
            const _exhaustive: never = kind;
            return _exhaustive;
        }
    }
}

function applyHeading(
    h: Hierarchy,
    heading: ClassifiedHeading,
    pending: { current: StructuralHeadingKind | null },
) {
    switch (heading.kind) {
        case 'kitap':
            h.kitap = heading.text;
            h.kisim = null;
            h.bolum = null;
            h.ayirim = null;
            clearNested(h);
            pending.current = 'kitap';
            return;
        case 'kisim':
            h.kisim = heading.text;
            h.bolum = null;
            h.ayirim = null;
            clearNested(h);
            pending.current = 'kisim';
            return;
        case 'bolum':
            h.bolum = heading.text;
            h.ayirim = null;
            clearNested(h);
            pending.current = 'bolum';
            return;
        case 'ayirim':
            h.ayirim = heading.text;
            clearNested(h);
            pending.current = 'ayirim';
            return;
        case 'letterMajor':
            pending.current = null;
            h.letterMajor = heading.text;
            h.roman = null;
            h.numbered = null;
            h.letterMinor = null;
            h.maddeBaslik = heading.text;
            return;
        case 'roman':
            pending.current = null;
            h.roman = heading.text;
            h.numbered = null;
            h.letterMinor = null;
            h.maddeBaslik = heading.text;
            return;
        case 'numbered':
            pending.current = null;
            h.numbered = heading.text;
            h.letterMinor = null;
            h.maddeBaslik = heading.text;
            return;
        case 'letterMinor':
            pending.current = null;
            h.letterMinor = heading.text;
            h.maddeBaslik = heading.text;
            return;
        case 'title':
            if (pending.current) {
                attachStructuralTitle(h, pending.current, heading.text);
                pending.current = null;
                return;
            }
            clearNested(h);
            h.maddeBaslik = heading.text;
            return;
        default: {
            const _exhaustive: never = heading.kind;
            return _exhaustive;
        }
    }
}

function applyHeadings(h: Hierarchy, lines: string[]) {
    if (lines.length === 0) return;
    const pending: { current: StructuralHeadingKind | null } = { current: null };
    for (const line of lines) {
        const classified = classifyHeadingLine(line);
        if (!classified) continue;
        applyHeading(h, classified, pending);
    }
}

function pushPath(parts: string[], value: string | null) {
    if (!value) return;
    const prev = parts[parts.length - 1];
    if (prev && foldHeading(prev) === foldHeading(value)) return;
    parts.push(value);
}

export function buildSectionPath(section: MevzuatMaddeSection, nested?: {
    letterMajor: string | null;
    roman: string | null;
    numbered: string | null;
    letterMinor: string | null;
}): string[] {
    const parts: string[] = [];
    pushPath(parts, section.kitap);
    pushPath(parts, section.kisim);
    pushPath(parts, section.bolum);
    pushPath(parts, section.ayirim);
    if (nested) {
        pushPath(parts, nested.letterMajor);
        pushPath(parts, nested.roman);
        pushPath(parts, nested.numbered);
        pushPath(parts, nested.letterMinor);
    }
    pushPath(parts, section.maddeBaslik);
    return parts;
}

function snapshot(h: Hierarchy): MevzuatMaddeSection {
    const section: MevzuatMaddeSection = {
        kitap: h.kitap,
        kisim: h.kisim,
        bolum: h.bolum,
        ayirim: h.ayirim,
        maddeBaslik: h.maddeBaslik,
        sectionPath: [],
    };
    section.sectionPath = buildSectionPath(section, {
        letterMajor: h.letterMajor,
        roman: h.roman,
        numbered: h.numbered,
        letterMinor: h.letterMinor,
    });
    return section;
}

export function formatMaddeSectionPath(
    section: Pick<MevzuatMaddeSection, 'sectionPath' | 'kitap' | 'kisim' | 'bolum' | 'ayirim' | 'maddeBaslik'>,
): string {
    if (section.sectionPath.length) return section.sectionPath.join(' · ');
    return buildSectionPath({
        kitap: section.kitap,
        kisim: section.kisim,
        bolum: section.bolum,
        ayirim: section.ayirim,
        maddeBaslik: section.maddeBaslik,
        sectionPath: [],
    }).join(' · ');
}

export type SectionPathCarrier = SplitMadde & {
    sectionPath?: string[];
};

function headingLinesFromSectionPath(sectionPath: string[] | undefined): string[] {
    const lines: string[] = [];
    for (const part of sectionPath ?? []) {
        for (const piece of part.split(' · ')) {
            const trimmed = piece.replace(/\s+/g, ' ').trim();
            if (trimmed) lines.push(trimmed);
        }
    }
    return lines;
}

function textHasHeadingLine(text: string, line: string): boolean {
    const folded = foldHeading(line);
    return text.split('\n').some((row) => foldHeading(row) === folded);
}

/** Put already-peeled N+1 headings back on N's tail so a wider classifier can re-peel. */
export function restorePeeledTails(maddeler: readonly SectionPathCarrier[]): SplitMadde[] {
    return maddeler.map((madde, index) => {
        const next = maddeler[index + 1];
        if (!next) {
            return {
                maddeKind: madde.maddeKind,
                maddeNo: madde.maddeNo,
                heading: madde.heading,
                text: madde.text,
            };
        }
        const currentLines = headingLinesFromSectionPath(madde.sectionPath);
        const nextLines = headingLinesFromSectionPath(next.sectionPath);
        let prefix = 0;
        while (
            prefix < currentLines.length &&
            prefix < nextLines.length &&
            foldHeading(currentLines[prefix]) === foldHeading(nextLines[prefix])
        ) {
            prefix += 1;
        }
        const restored = nextLines
            .slice(prefix)
            .filter((line) => !textHasHeadingLine(madde.text, line));
        const text = restored.length ? `${madde.text}\n\n${restored.join('\n')}`.trim() : madde.text;
        return {
            maddeKind: madde.maddeKind,
            maddeNo: madde.maddeNo,
            heading: madde.heading,
            text,
        };
    });
}

export function assignMaddeHeadings(
    maddeler: readonly SplitMadde[],
    preamble = '',
): AssignMaddeHeadingsResult {
    const preambleHeadings = peelTrailingHeadings(preamble, { keepBody: false }).headings;
    const hierarchy = emptyHierarchy();
    const out: SplitMaddeWithSection[] = [];
    let nextHeadings = preambleHeadings;
    let peeledAny = preambleHeadings.length > 0;

    for (let i = 0; i < maddeler.length; i += 1) {
        const madde = maddeler[i];
        let text = madde.text;
        if (i === 0) {
            const leading = peelLeadingHeadings(text);
            if (leading.headings.length) {
                nextHeadings = [...nextHeadings, ...leading.headings];
                text = leading.body;
                peeledAny = true;
            }
        }
        const incoming = nextHeadings;
        applyHeadings(hierarchy, incoming);
        const trailing = peelTrailingHeadings(text);
        if (trailing.headings.length) peeledAny = true;
        text = trailing.body;
        nextHeadings = trailing.headings;
        const section = snapshot(hierarchy);
        out.push({
            ...madde,
            text,
            ...section,
        });
    }

    return { maddeler: out, peeledAny };
}
