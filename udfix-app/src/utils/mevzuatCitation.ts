import {
    bundledMevzuatCatalog,
    catalogSearchAliases,
    catalogShortName,
} from '../../electron/mevzuatCatalog';
import type { MevzuatInstrumentKind, MevzuatMaddeKind } from '../../electron/mevzuatCorpusTypes';
import { turkishSearchFold } from './turkishSearch';

export type MevzuatAliasTarget = {
    kind: MevzuatInstrumentKind;
    no: string;
    title: string;
    shortName: string;
};

export type MevzuatCitation = {
    kind: MevzuatInstrumentKind;
    instrumentNo: string;
    shortName: string;
    title: string;
    alias?: string;
    maddeKind: MevzuatMaddeKind;
    maddeNo: string;
    fikra?: number;
    raw: string;
};

export type MevzuatAliasSource = 'shortCode' | 'number' | 'alias' | 'title';

export type MevzuatAliasIndex = {
    aliases: Array<{
        folded: string;
        raw: string;
        target: MevzuatAliasTarget;
        source: MevzuatAliasSource;
    }>;
    byNo: Map<string, MevzuatAliasTarget>;
};

export type MevzuatInstrumentMatch = {
    target: MevzuatAliasTarget;
    source: MevzuatAliasSource;
};

const INSTRUMENT_STOPWORDS = new Set([
    'kanun',
    'kanunu',
    'yonetmelik',
    'yonetmeligi',
    'hakkinda',
    'dair',
    've',
    'ile',
    'bu',
    'madde',
]);

export function instrumentMatchRank(source: MevzuatAliasSource): number {
    switch (source) {
        case 'shortCode':
        case 'number':
            return 0;
        case 'alias':
            return 1;
        case 'title':
            return 2;
        default: {
            const _exhaustive: never = source;
            return _exhaustive;
        }
    }
}

function isDistinctiveToken(token: string): boolean {
    return token.length >= 3 && !INSTRUMENT_STOPWORDS.has(token);
}

function queryIsDistinctive(queryFolded: string): boolean {
    return queryFolded.split(/\s+/).some(isDistinctiveToken);
}

function aliasFuzzyHit(aliasFolded: string, source: MevzuatAliasSource, queryFolded: string): boolean {
    switch (source) {
        case 'shortCode':
        case 'number':
            return false;
        case 'alias':
        case 'title':
            if (aliasFolded.startsWith(`${queryFolded} `)) return true;
            if (queryFolded.includes(' ')) return aliasFolded.includes(queryFolded);
            return aliasFolded.split(/\s+/).includes(queryFolded);
        default: {
            const _exhaustive: never = source;
            return _exhaustive;
        }
    }
}

const MADDE_PREFIX = String.raw`(?:m(?:adde|d)?\.?\s*)`;
const MADDE_NO = String.raw`(\d+[A-Za-z]?)`;
const FIKRA = String.raw`(?:\s*\/\s*(\d+))?`;

function maddeKindFromQuery(raw: string): { kind: MevzuatMaddeKind; rest: string } {
    const trimmed = raw.trim();
    const ek = trimmed.match(/^(?:ek)\s+(.*)$/i);
    if (ek) return { kind: 'ek', rest: ek[1] };
    const gecici = trimmed.match(/^(?:ge[cç]ici)\s+(.*)$/i);
    if (gecici) return { kind: 'gecici', rest: gecici[1] };
    return { kind: 'madde', rest: trimmed };
}

function parseMaddeAndFikra(rest: string): { maddeNo: string; fikra?: number } | null {
    const { kind: _kind, rest: afterKind } = maddeKindFromQuery(rest);
    void _kind;
    const cleaned = afterKind.trim();
    const attached = cleaned.match(new RegExp(`^${MADDE_PREFIX}?${MADDE_NO}${FIKRA}\\s*$`, 'i'));
    if (!attached) return null;
    const maddeNo = attached[1];
    const fikraRaw = attached[2];
    const fikra = fikraRaw ? Number(fikraRaw) : undefined;
    return {
        maddeNo,
        fikra: Number.isFinite(fikra) ? fikra : undefined,
    };
}

function foldAliasName(raw: string): string {
    return turkishSearchFold(raw).replace(/\s+/g, ' ').trim();
}

function pushIndexedAlias(
    aliases: MevzuatAliasIndex['aliases'],
    raw: string,
    target: MevzuatAliasTarget,
    source: MevzuatAliasSource,
) {
    const folded = foldAliasName(raw);
    if (!folded) return;
    const existing = aliases.find(
        (row) => row.folded === folded && row.target.kind === target.kind && row.target.no === target.no,
    );
    if (existing) {
        if (instrumentMatchRank(source) < instrumentMatchRank(existing.source)) {
            existing.source = source;
            existing.raw = raw;
        }
        return;
    }
    aliases.push({ folded, raw, target, source });
}

export function buildMevzuatAliasIndex(
    entries: Array<{
        kind: MevzuatInstrumentKind;
        no: string;
        title: string;
        abbrev: string[];
    }> = bundledMevzuatCatalog(),
): MevzuatAliasIndex {
    const aliases: MevzuatAliasIndex['aliases'] = [];
    const byNo = new Map<string, MevzuatAliasTarget>();

    for (const entry of entries) {
        const target: MevzuatAliasTarget = {
            kind: entry.kind,
            no: entry.no,
            title: entry.title,
            shortName: catalogShortName(entry),
        };
        if (!byNo.has(entry.no)) byNo.set(entry.no, target);
        const shortCode = entry.abbrev[0];
        if (shortCode) pushIndexedAlias(aliases, shortCode, target, 'shortCode');
        for (const extra of entry.abbrev.slice(1)) {
            pushIndexedAlias(aliases, extra, target, 'alias');
        }
        pushIndexedAlias(aliases, catalogShortName(entry), target, shortCode ? 'shortCode' : 'title');
        pushIndexedAlias(aliases, entry.title, target, 'title');
        pushIndexedAlias(aliases, entry.no, target, 'number');
        for (const extra of catalogSearchAliases(entry.no)) {
            pushIndexedAlias(aliases, extra, target, 'alias');
        }
    }

    aliases.sort((a, b) => b.folded.length - a.folded.length || a.folded.localeCompare(b.folded));
    return { aliases, byNo };
}

function rememberInstrumentMatch(
    byKey: Map<string, MevzuatInstrumentMatch>,
    match: MevzuatInstrumentMatch,
) {
    const key = `${match.target.kind}:${match.target.no}`;
    const current = byKey.get(key);
    if (!current || instrumentMatchRank(match.source) < instrumentMatchRank(current.source)) {
        byKey.set(key, match);
    }
}

function compareInstrumentMatches(a: MevzuatInstrumentMatch, b: MevzuatInstrumentMatch): number {
    const rankDiff = instrumentMatchRank(a.source) - instrumentMatchRank(b.source);
    if (rankDiff !== 0) return rankDiff;
    const aNo = Number(a.target.no);
    const bNo = Number(b.target.no);
    if (Number.isFinite(aNo) && Number.isFinite(bNo) && aNo !== bNo) return aNo - bNo;
    return a.target.no.localeCompare(b.target.no);
}

/** Resolve a kanun/yönetmelik from shortCode, MevzuatNo, curated alias, or title — no madde number required. */
export function matchMevzuatInstruments(
    query: string,
    index: MevzuatAliasIndex = buildMevzuatAliasIndex(),
): MevzuatInstrumentMatch[] {
    const folded = foldAliasName(query);
    if (!folded) return [];

    const exact = new Map<string, MevzuatInstrumentMatch>();
    for (const alias of index.aliases) {
        if (alias.folded === folded) {
            rememberInstrumentMatch(exact, { target: alias.target, source: alias.source });
        }
    }
    if (exact.size > 0) {
        return [...exact.values()].sort(compareInstrumentMatches);
    }

    if (!queryIsDistinctive(folded)) return [];

    const fuzzy = new Map<string, MevzuatInstrumentMatch>();
    for (const alias of index.aliases) {
        if (!aliasFuzzyHit(alias.folded, alias.source, folded)) continue;
        rememberInstrumentMatch(fuzzy, { target: alias.target, source: alias.source });
    }
    return [...fuzzy.values()].sort(compareInstrumentMatches);
}

function matchAlias(queryFolded: string, index: MevzuatAliasIndex) {
    for (const alias of index.aliases) {
        if (queryFolded === alias.folded) {
            return { alias, rest: '' };
        }
        if (queryFolded.startsWith(`${alias.folded} `) || queryFolded.startsWith(`${alias.folded}.`)) {
            return { alias, rest: queryFolded.slice(alias.folded.length).replace(/^[.\s]+/, '') };
        }
    }
    return null;
}

export function parseMevzuatCitation(
    query: string,
    index: MevzuatAliasIndex = buildMevzuatAliasIndex(),
): MevzuatCitation | null {
    const raw = query.trim();
    if (!raw) return null;
    const folded = turkishSearchFold(raw).replace(/\s+/g, ' ').trim();
    if (!folded) return null;

    const { kind: maddeKindHint, rest: afterKindQuery } = maddeKindFromQuery(folded);

    const aliasHit = matchAlias(afterKindQuery, index) ?? matchAlias(folded, index);
    if (aliasHit && aliasHit.rest) {
        const parsed = parseMaddeAndFikra(aliasHit.rest);
        if (parsed) {
            const kindFromRest = matchAlias(folded, index) ? maddeKindFromQuery(folded).kind : maddeKindHint;
            const maddeKind =
                aliasHit.rest !== afterKindQuery && maddeKindHint !== 'madde' ? maddeKindHint : kindFromRest;
            return {
                kind: aliasHit.alias.target.kind,
                instrumentNo: aliasHit.alias.target.no,
                shortName: aliasHit.alias.target.shortName,
                title: aliasHit.alias.target.title,
                alias: aliasHit.alias.raw,
                maddeKind: maddeKind === 'madde' ? 'madde' : maddeKind,
                maddeNo: parsed.maddeNo,
                fikra: parsed.fikra,
                raw,
            };
        }
    }

    const numberCite = folded.match(
        new RegExp(`^(\\d{2,5})\\s*(?:\\/|\\s+${MADDE_PREFIX})\\s*${MADDE_NO}${FIKRA}\\s*$`, 'i'),
    );
    if (numberCite) {
        const instrumentNo = numberCite[1];
        const target = index.byNo.get(instrumentNo);
        if (target) {
            const fikra = numberCite[3] ? Number(numberCite[3]) : undefined;
            return {
                kind: target.kind,
                instrumentNo: target.no,
                shortName: target.shortName,
                title: target.title,
                maddeKind: 'madde',
                maddeNo: numberCite[2],
                fikra: Number.isFinite(fikra) ? fikra : undefined,
                raw,
            };
        }
    }

    return null;
}

export function formatMaddeCitation(input: {
    shortName: string;
    maddeKind: MevzuatMaddeKind;
    maddeNo: string;
    fikra?: number;
}): string {
    let heading: string;
    switch (input.maddeKind) {
        case 'ek':
            heading = `Ek m.${input.maddeNo}`;
            break;
        case 'gecici':
            heading = `Geçici m.${input.maddeNo}`;
            break;
        case 'madde':
            heading = `m.${input.maddeNo}`;
            break;
        default: {
            const _exhaustive: never = input.maddeKind;
            heading = _exhaustive;
        }
    }
    const fikra = input.fikra ? `/${input.fikra}` : '';
    return `${input.shortName} ${heading}${fikra}`;
}

export function findFikraRange(
    text: string,
    fikra: number,
): { start: number; end: number } | null {
    if (!Number.isFinite(fikra) || fikra < 1) return null;
    const re = /\((\d+)\)/g;
    const hits: Array<{ n: number; start: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
        hits.push({ n: Number(match[1]), start: match.index });
    }
    const current = hits.find((hit) => hit.n === fikra);
    if (!current) return null;
    const next = hits.find((hit) => hit.start > current.start);
    return { start: current.start, end: next ? next.start : text.length };
}
