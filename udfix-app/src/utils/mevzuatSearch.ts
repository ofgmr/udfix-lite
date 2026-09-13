import type { MevzuatInstrumentFile, MevzuatMaddeKind } from '../../electron/mevzuatCorpusTypes';
import {
    buildMevzuatAliasIndex,
    matchMevzuatInstruments,
    parseMevzuatCitation,
    type MevzuatAliasIndex,
    type MevzuatAliasSource,
    type MevzuatCitation,
} from './mevzuatCitation';
import { turkishHaystack, turkishHaystackIncludes } from './turkishSearch';

export const MEVZUAT_SEARCH_LIMIT = 40;

export type MevzuatSearchHit = {
    id: string;
    instrumentId: string;
    kind: MevzuatInstrumentFile['kind'];
    instrumentNo: string;
    shortName: string;
    title: string;
    heading: string;
    maddeKind: MevzuatMaddeKind;
    maddeNo: string;
    preview: string;
    text: string;
    kitap: string | null;
    kisim: string | null;
    bolum: string | null;
    ayirim: string | null;
    maddeBaslik: string | null;
    sectionPath: string[];
    fikra?: number;
    matchKind: 'citation' | 'text';
};

function hitFromMadde(
    instrument: MevzuatInstrumentFile,
    madde: MevzuatInstrumentFile['maddeler'][number],
    matchKind: MevzuatSearchHit['matchKind'],
    fikra?: number,
    includeBody = true,
): MevzuatSearchHit {
    return {
        id: madde.id,
        instrumentId: instrument.id,
        kind: instrument.kind,
        instrumentNo: instrument.no,
        shortName: instrument.shortName,
        title: instrument.title,
        heading: madde.heading,
        maddeKind: madde.maddeKind,
        maddeNo: madde.maddeNo,
        preview: madde.preview,
        text: includeBody ? madde.text : '',
        kitap: madde.kitap ?? null,
        kisim: madde.kisim ?? null,
        bolum: madde.bolum ?? null,
        ayirim: madde.ayirim ?? null,
        maddeBaslik: madde.maddeBaslik ?? null,
        sectionPath: madde.sectionPath ?? [],
        fikra,
        matchKind,
    };
}

function findCitedMadde(instrument: MevzuatInstrumentFile, citation: MevzuatCitation) {
    return instrument.maddeler.find(
        (madde) => madde.maddeKind === citation.maddeKind && madde.maddeNo === citation.maddeNo,
    );
}

export type MevzuatSearchOptions = {
    limit?: number;
    aliasIndex?: MevzuatAliasIndex;
    /** When set, only that corpus id is searched (`kanun:6098`). */
    instrumentId?: string;
};

function matchKindFromInstrumentSource(source: MevzuatAliasSource): MevzuatSearchHit['matchKind'] {
    switch (source) {
        case 'shortCode':
        case 'number':
        case 'alias':
            return 'citation';
        case 'title':
            return 'text';
        default: {
            const _exhaustive: never = source;
            return _exhaustive;
        }
    }
}

type MaddeHaystacks = {
    heading: string;
    preview: string;
    text: string | null;
};

const maddeHaystacks = new WeakMap<MevzuatInstrumentFile['maddeler'][number], MaddeHaystacks>();

function haystacksFor(madde: MevzuatInstrumentFile['maddeler'][number]): MaddeHaystacks {
    let cached = maddeHaystacks.get(madde);
    if (!cached) {
        cached = {
            heading: turkishHaystack([
                madde.heading,
                madde.maddeBaslik,
                ...(madde.sectionPath ?? []),
                madde.kitap,
                madde.kisim,
                madde.bolum,
                madde.ayirim,
            ]),
            preview: turkishHaystack([madde.preview]),
            text: null,
        };
        maddeHaystacks.set(madde, cached);
    }
    return cached;
}

function textHaystack(madde: MevzuatInstrumentFile['maddeler'][number]): string {
    const cached = haystacksFor(madde);
    if (cached.text === null) {
        cached.text = turkishHaystack([madde.text]);
    }
    return cached.text;
}

/** Fold heading/preview for every madde so the first typed query is not a 21MB normalize. */
export function warmMevzuatSearchIndex(instruments: readonly MevzuatInstrumentFile[]): void {
    for (const instrument of instruments) {
        for (const madde of instrument.maddeler) {
            haystacksFor(madde);
        }
    }
}

/** Fold madde bodies in idle slices so rare-word global search does not hitch mid-keystroke. */
export function scheduleMevzuatBodyIndex(instruments: readonly MevzuatInstrumentFile[]): () => void {
    let instrumentIndex = 0;
    let maddeIndex = 0;
    let cancelled = false;
    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const enqueue = () => {
        if (typeof globalThis.requestIdleCallback === 'function') {
            idleHandle = globalThis.requestIdleCallback(step, { timeout: 400 });
            return;
        }
        timeoutHandle = setTimeout(step, 16);
    };

    const step = () => {
        idleHandle = null;
        timeoutHandle = null;
        if (cancelled) return;
        const started = Date.now();
        while (instrumentIndex < instruments.length && Date.now() - started < 8) {
            const maddeler = instruments[instrumentIndex]?.maddeler ?? [];
            if (maddeIndex >= maddeler.length) {
                instrumentIndex += 1;
                maddeIndex = 0;
                continue;
            }
            textHaystack(maddeler[maddeIndex]);
            maddeIndex += 1;
        }
        if (instrumentIndex >= instruments.length) return;
        enqueue();
    };

    enqueue();
    return () => {
        cancelled = true;
        if (idleHandle !== null && typeof globalThis.cancelIdleCallback === 'function') {
            globalThis.cancelIdleCallback(idleHandle);
        }
        if (timeoutHandle !== null) clearTimeout(timeoutHandle);
    };
}

function keywordHeadingRank(
    madde: MevzuatInstrumentFile['maddeler'][number],
    query: string,
): number | null {
    const hay = haystacksFor(madde);
    if (turkishHaystackIncludes(hay.heading, query)) return 0;
    if (turkishHaystackIncludes(hay.preview, query)) return 1;
    return null;
}

function instrumentHits(
    instruments: readonly MevzuatInstrumentFile[],
    query: string,
    aliasIndex: MevzuatAliasIndex,
    limit: number,
): MevzuatSearchHit[] {
    const matches = matchMevzuatInstruments(query, aliasIndex);
    if (matches.length === 0) return [];
    const hits: MevzuatSearchHit[] = [];
    for (const match of matches) {
        const instrument = instruments.find(
            (row) => row.no === match.target.no && row.kind === match.target.kind,
        );
        const madde = instrument?.maddeler[0];
        if (!instrument || !madde) continue;
        hits.push(hitFromMadde(instrument, madde, matchKindFromInstrumentSource(match.source)));
        if (hits.length >= limit) break;
    }
    return hits;
}

function pushRanked(
    ranked: Array<{
        hit: MevzuatSearchHit;
        rank: number;
        instrumentIndex: number;
        maddeIndex: number;
    }>,
    seen: Set<string>,
    instrument: MevzuatInstrumentFile,
    madde: MevzuatInstrumentFile['maddeler'][number],
    rank: number,
    instrumentIndex: number,
    maddeIndex: number,
): void {
    if (seen.has(madde.id)) return;
    seen.add(madde.id);
    ranked.push({
        hit: hitFromMadde(instrument, madde, 'text', undefined, false),
        rank,
        instrumentIndex,
        maddeIndex,
    });
}

function keywordHits(
    instruments: readonly MevzuatInstrumentFile[],
    query: string,
    limit: number,
): MevzuatSearchHit[] {
    const ranked: Array<{
        hit: MevzuatSearchHit;
        rank: number;
        instrumentIndex: number;
        maddeIndex: number;
    }> = [];
    const seen = new Set<string>();

    for (let instrumentIndex = 0; instrumentIndex < instruments.length; instrumentIndex += 1) {
        const instrument = instruments[instrumentIndex];
        for (let maddeIndex = 0; maddeIndex < instrument.maddeler.length; maddeIndex += 1) {
            const madde = instrument.maddeler[maddeIndex];
            const rank = keywordHeadingRank(madde, query);
            if (rank === null) continue;
            pushRanked(ranked, seen, instrument, madde, rank, instrumentIndex, maddeIndex);
        }
    }

    if (ranked.length < limit) {
        for (let instrumentIndex = 0; instrumentIndex < instruments.length; instrumentIndex += 1) {
            const instrument = instruments[instrumentIndex];
            for (let maddeIndex = 0; maddeIndex < instrument.maddeler.length; maddeIndex += 1) {
                const madde = instrument.maddeler[maddeIndex];
                if (seen.has(madde.id)) continue;
                if (!turkishHaystackIncludes(textHaystack(madde), query)) continue;
                pushRanked(ranked, seen, instrument, madde, 2, instrumentIndex, maddeIndex);
                if (ranked.length >= limit * 4) break;
            }
            if (ranked.length >= limit * 4) break;
        }
    }

    ranked.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        if (a.instrumentIndex !== b.instrumentIndex) return a.instrumentIndex - b.instrumentIndex;
        return a.maddeIndex - b.maddeIndex;
    });
    return ranked.slice(0, limit).map((row) => row.hit);
}

export function searchLoadedCorpus(
    query: string,
    instruments: readonly MevzuatInstrumentFile[],
    options?: MevzuatSearchOptions,
): MevzuatSearchHit[] {
    const trimmed = query.trim();
    const instrumentId = options?.instrumentId;
    // Empty query returns [] even with instrumentId set — chip UI prompts for a
    // keyword rather than dumping a light madde list.
    if (!trimmed) return [];
    const limit = options?.limit ?? MEVZUAT_SEARCH_LIMIT;
    const aliasIndex = options?.aliasIndex ?? buildMevzuatAliasIndex();
    const scoped = instrumentId
        ? instruments.filter((row) => row.id === instrumentId)
        : instruments;

    const citation = parseMevzuatCitation(trimmed, aliasIndex);
    if (citation) {
        const instrument = scoped.find(
            (row) => row.no === citation.instrumentNo && row.kind === citation.kind,
        );
        if (instrument) {
            const madde = findCitedMadde(instrument, citation);
            if (madde) return [hitFromMadde(instrument, madde, 'citation', citation.fikra)];
        }
        if (instrumentId) return keywordHits(scoped, trimmed, limit);
        // Citation parsed but madde missing from this load: fall through.
    }

    if (!instrumentId) {
        const byInstrument = instrumentHits(scoped, trimmed, aliasIndex, limit);
        if (byInstrument.length > 0) return byInstrument;
    }

    return keywordHits(scoped, trimmed, limit);
}

export function siblingMadde(
    instrument: MevzuatInstrumentFile,
    maddeId: string,
    direction: -1 | 1,
): MevzuatInstrumentFile['maddeler'][number] | null {
    const index = instrument.maddeler.findIndex((madde) => madde.id === maddeId);
    if (index < 0) return null;
    return instrument.maddeler[index + direction] ?? null;
}
