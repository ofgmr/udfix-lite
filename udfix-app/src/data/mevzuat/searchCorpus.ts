import {
    loadAllMevzuatInstruments,
    loadMevzuatInstrument,
    loadMevzuatInstrumentById,
    loadMevzuatManifest,
} from './loadCorpus';
import {
    buildMevzuatAliasIndex,
    matchMevzuatInstruments,
    parseMevzuatCitation,
} from '../../utils/mevzuatCitation';
import { searchLoadedCorpus, type MevzuatSearchHit } from '../../utils/mevzuatSearch';
import type { MevzuatInstrumentFile } from '../../../electron/mevzuatCorpusTypes';

export type { MevzuatSearchHit };

async function loadCatalogInstrument(
    kind: MevzuatInstrumentFile['kind'],
    no: string,
): Promise<MevzuatInstrumentFile | null> {
    const entry = loadMevzuatManifest().instruments.find((row) => row.no === no && row.kind === kind);
    if (!entry) return null;
    return loadMevzuatInstrument(entry.file);
}

/**
 * Chip / flyout search API.
 *
 * `searchMevzuat(query: string, options?: { instrumentId?: string }): Promise<MevzuatSearchHit[]>`
 *
 * Empty query always returns [] — including when `instrumentId` is set (e.g. `kanun:6098`).
 * Chip UI should prompt the user to type a keyword rather than listing maddeler.
 */
export async function searchMevzuat(
    query: string,
    options?: { instrumentId?: string },
): Promise<MevzuatSearchHit[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const aliasIndex = buildMevzuatAliasIndex();

    if (options?.instrumentId) {
        const instrument = await loadMevzuatInstrumentById(options.instrumentId);
        if (!instrument) return [];
        return searchLoadedCorpus(trimmed, [instrument], {
            aliasIndex,
            instrumentId: options.instrumentId,
        });
    }

    const citation = parseMevzuatCitation(trimmed, aliasIndex);
    if (citation) {
        const instrument = await loadCatalogInstrument(citation.kind, citation.instrumentNo);
        if (instrument) {
            const hits = searchLoadedCorpus(trimmed, [instrument], { aliasIndex });
            if (hits.length > 0) return hits;
        }
    }

    const instrumentMatches = matchMevzuatInstruments(trimmed, aliasIndex);
    if (instrumentMatches.length > 0) {
        const loaded: MevzuatInstrumentFile[] = [];
        for (const match of instrumentMatches) {
            const instrument = await loadCatalogInstrument(match.target.kind, match.target.no);
            if (instrument) loaded.push(instrument);
        }
        if (loaded.length > 0) {
            const hits = searchLoadedCorpus(trimmed, loaded, { aliasIndex });
            if (hits.length > 0) return hits;
        }
    }

    await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => setTimeout(resolve, 0));
            return;
        }
        setTimeout(resolve, 0);
    });

    const instruments = await loadAllMevzuatInstruments();
    return searchLoadedCorpus(trimmed, instruments, { aliasIndex });
}

export const searchMevzuatCorpus = searchMevzuat;
