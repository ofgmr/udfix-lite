import type { MevzuatInstrumentFile, MevzuatManifest } from '../../../electron/mevzuatCorpusTypes';
import manifestJson from './manifest.json';

const instrumentLoaders = import.meta.glob('./instruments/*.json') as Record<
    string,
    () => Promise<{ default: MevzuatInstrumentFile }>
>;

const instrumentCache = new Map<string, MevzuatInstrumentFile>();
let allInstrumentsPromise: Promise<MevzuatInstrumentFile[]> | null = null;

export function loadMevzuatManifest(): MevzuatManifest {
    return manifestJson as MevzuatManifest;
}

function loaderKey(file: string): string {
    return `./instruments/${file}`;
}

export async function loadMevzuatInstrument(file: string): Promise<MevzuatInstrumentFile | null> {
    const cached = instrumentCache.get(file);
    if (cached) return cached;
    const loader = instrumentLoaders[loaderKey(file)];
    if (!loader) return null;
    const mod = await loader();
    instrumentCache.set(file, mod.default);
    return mod.default;
}

export async function loadAllMevzuatInstruments(): Promise<MevzuatInstrumentFile[]> {
    if (allInstrumentsPromise) return allInstrumentsPromise;
    allInstrumentsPromise = (async () => {
        const manifest = loadMevzuatManifest();
        const rows = await Promise.all(
            manifest.instruments.map(async (entry) => loadMevzuatInstrument(entry.file)),
        );
        return rows.filter((row): row is MevzuatInstrumentFile => Boolean(row));
    })();
    return allInstrumentsPromise;
}

export async function loadMevzuatInstrumentById(id: string): Promise<MevzuatInstrumentFile | null> {
    const entry = loadMevzuatManifest().instruments.find((row) => row.id === id);
    if (!entry) return null;
    return loadMevzuatInstrument(entry.file);
}
