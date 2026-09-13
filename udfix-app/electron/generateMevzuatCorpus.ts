/**
 * Fetch kanun + yönetmelik HTML from mevzuat.gov.tr and write a read-only
 * madde-level JSON corpus under src/data/mevzuat/.
 *
 *   npm run mevzuat:fetch
 *   npm run mevzuat:fetch -- --only 4721,6098,15828
 *   npm run mevzuat:fetch -- --yonetmelik-only
 *   npm run mevzuat:fetch -- --kanun-only --limit 3
 *   npm run mevzuat:reindex
 *
 * `--reindex` rewrites existing instruments/*.json (heading peel + sectionPath)
 * without a network fetch. Previously peeled tails are stitched back so a wider
 * classifier can re-apply. Empty incoming headings are a no-op (carry-forward).
 */

import fs from 'fs';
import path from 'path';
import { bundledMevzuatCatalog, catalogShortName, type BundledMevzuatCatalogEntry } from './mevzuatCatalog';
import type { MevzuatInstrumentFile, MevzuatMaddeRecord, MevzuatManifest, MevzuatManifestEntry } from './mevzuatCorpusTypes';
import { fetchInstrumentHtml, sleep } from './mevzuatFetch';
import { assignMaddeHeadings, restorePeeledTails } from './mevzuatHeadings';
import {
    extractKabulTarihi,
    extractPreamble,
    htmlToPlainText,
    instrumentId,
    maddePreview,
    maddeRecordId,
    normalizeMaddeHeadings,
    publicMevzuatUrl,
    splitMaddeler,
} from './mevzuatParse';

function parseArgs(argv: string[]) {
    let only = '';
    let limit = 0;
    let sleepMs = 280;
    let kanunOnly = false;
    let yonetmelikOnly = false;
    let outDir = '';
    let reindex = false;
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--kanun-only') kanunOnly = true;
        else if (a === '--yonetmelik-only') yonetmelikOnly = true;
        else if (a === '--reindex') reindex = true;
        else if (a === '--only' && argv[i + 1]) only = argv[++i];
        else if (a === '--limit' && argv[i + 1]) limit = Number(argv[++i]) || 0;
        else if (a === '--sleep-ms' && argv[i + 1]) sleepMs = Number(argv[++i]) || 280;
        else if (a === '--out-dir' && argv[i + 1]) outDir = argv[++i];
    }
    return { only, limit, sleepMs, kanunOnly, yonetmelikOnly, outDir, reindex };
}

function defaultOutDir(): string {
    return path.resolve(process.cwd(), 'src/data/mevzuat');
}

function selectCatalog(args: ReturnType<typeof parseArgs>): BundledMevzuatCatalogEntry[] {
    let rows = bundledMevzuatCatalog();
    if (args.kanunOnly) rows = rows.filter((row) => row.kind === 'kanun');
    if (args.yonetmelikOnly) rows = rows.filter((row) => row.kind === 'yonetmelik');
    const wanted = new Set(
        args.only
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
    );
    if (wanted.size) rows = rows.filter((row) => wanted.has(row.no));
    if (args.limit > 0) rows = rows.slice(0, args.limit);
    return rows;
}

function instrumentFileName(entry: BundledMevzuatCatalogEntry): string {
    switch (entry.kind) {
        case 'kanun':
            return `kanun-${entry.no}.json`;
        case 'yonetmelik':
            return `yonetmelik-${entry.no}.json`;
        default: {
            const _exhaustive: never = entry.kind;
            return _exhaustive;
        }
    }
}

function toMaddeRecords(
    entry: Pick<BundledMevzuatCatalogEntry, 'kind' | 'no'>,
    maddeler: ReturnType<typeof splitMaddeler>,
    preamble = '',
): MevzuatMaddeRecord[] {
    const assigned = assignMaddeHeadings(maddeler, preamble);
    return assigned.maddeler.map((madde) => ({
        id: maddeRecordId(entry.kind, entry.no, madde.maddeKind, madde.maddeNo),
        maddeKind: madde.maddeKind,
        maddeNo: madde.maddeNo,
        heading: madde.heading,
        text: madde.text,
        preview: maddePreview(madde.text),
        kitap: madde.kitap,
        kisim: madde.kisim,
        bolum: madde.bolum,
        ayirim: madde.ayirim,
        maddeBaslik: madde.maddeBaslik,
        sectionPath: madde.sectionPath,
    }));
}

function hasAssignedHeadings(instrument: MevzuatInstrumentFile): boolean {
    return instrument.maddeler.some(
        (madde) =>
            Boolean(madde.maddeBaslik) ||
            Boolean(madde.kitap) ||
            Boolean(madde.kisim) ||
            Boolean(madde.bolum) ||
            Boolean(madde.ayirim) ||
            (madde.sectionPath?.length ?? 0) > 0,
    );
}

function reindexInstrumentFile(instrument: MevzuatInstrumentFile): MevzuatInstrumentFile {
    const split = restorePeeledTails(instrument.maddeler);
    const { peeledAny } = assignMaddeHeadings(split);
    if (!peeledAny && hasAssignedHeadings(instrument)) {
        return instrument;
    }
    const maddeler = toMaddeRecords({ kind: instrument.kind, no: instrument.no }, split);
    return {
        ...instrument,
        maddeCount: maddeler.length,
        maddeler: maddeler.map((madde, index) => ({
            ...madde,
            id: instrument.maddeler[index]?.id ?? madde.id,
        })),
    };
}

function buildInstrument(
    entry: BundledMevzuatCatalogEntry,
    html: string,
    tertip: number,
    tur: number,
): MevzuatInstrumentFile {
    const body = normalizeMaddeHeadings(htmlToPlainText(html));
    const split = splitMaddeler(body);
    const maddeler = toMaddeRecords(entry, split, extractPreamble(body));
    const shortName = catalogShortName(entry);
    const aliases = [...entry.abbrev, shortName, entry.title, entry.no].filter(
        (value, index, all) => value.trim() && all.indexOf(value) === index,
    );
    return {
        id: instrumentId(entry.kind, entry.no),
        kind: entry.kind,
        no: entry.no,
        title: entry.title,
        shortName,
        aliases,
        tur,
        tertip,
        sourceUrl: publicMevzuatUrl(entry.no, tertip, tur),
        kabulTarihi: extractKabulTarihi(body),
        maddeCount: maddeler.length,
        maddeler,
    };
}

function writeJson(filePath: string, value: unknown) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function runGenerateMevzuatCorpus(argv: string[] = process.argv.slice(2)) {
    const args = parseArgs(argv);
    const outDir = path.resolve(args.outDir.trim() || defaultOutDir());
    const instrumentsDir = path.join(outDir, 'instruments');
    fs.mkdirSync(instrumentsDir, { recursive: true });

    console.log(`Out: ${outDir}`);

    const existingManifestPath = path.join(outDir, 'manifest.json');
    const existingById = new Map<string, MevzuatManifestEntry>();
    if (fs.existsSync(existingManifestPath)) {
        try {
            const previous = JSON.parse(fs.readFileSync(existingManifestPath, 'utf8')) as MevzuatManifest;
            for (const row of previous.instruments ?? []) {
                existingById.set(row.id, row);
            }
        } catch {
            existingById.clear();
        }
    }

    if (args.reindex) {
        const files = fs.readdirSync(instrumentsDir).filter((name) => name.endsWith('.json'));
        console.log(`Reindex: ${files.length} instrument file(s)\n`);
        let updated = 0;
        for (const name of files) {
            const filePath = path.join(instrumentsDir, name);
            const instrument = JSON.parse(fs.readFileSync(filePath, 'utf8')) as MevzuatInstrumentFile;
            writeJson(filePath, reindexInstrumentFile(instrument));
            updated += 1;
            process.stdout.write(`  ${name}\n`);
        }
        console.log(`\nDone: reindexed ${updated} file(s).`);
        return { written: updated, failed: 0, outDir };
    }

    const catalog = selectCatalog(args);
    console.log(`Catalog: ${catalog.length} instrument(s)\n`);

    const isPartial = Boolean(args.only || args.limit || args.kanunOnly || args.yonetmelikOnly);
    const writtenFiles = new Set<string>();
    const failed: Array<{ no: string; title: string; error: string }> = [];

    for (let i = 0; i < catalog.length; i += 1) {
        const entry = catalog[i];
        process.stdout.write(`[${i + 1}/${catalog.length}] ${entry.kind} ${entry.no} ${entry.title} … `);
        try {
            const { html, tertip, tur } = await fetchInstrumentHtml(entry.no, entry.turCandidates, args.sleepMs);
            const instrument = buildInstrument(entry, html, tertip, tur);
            if (instrument.maddeler.length === 0) {
                throw new Error('HTML resolved but no madde headings found');
            }
            const file = instrumentFileName(entry);
            writeJson(path.join(instrumentsDir, file), instrument);
            writtenFiles.add(file);
            const manifestRow: MevzuatManifestEntry = {
                id: instrument.id,
                file,
                kind: instrument.kind,
                no: instrument.no,
                title: instrument.title,
                shortName: instrument.shortName,
                aliases: instrument.aliases,
                tur: instrument.tur,
                tertip: instrument.tertip,
                maddeCount: instrument.maddeCount,
            };
            existingById.set(instrument.id, manifestRow);
            console.log(`tur ${tur} tertip ${tertip}, ${instrument.maddeCount} madde`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            failed.push({ no: entry.no, title: entry.title, error: message });
            console.log(`FAIL ${message}`);
        }
        if (args.sleepMs > 0 && i < catalog.length - 1) await sleep(args.sleepMs);
    }

    if (!isPartial) {
        for (const name of fs.readdirSync(instrumentsDir)) {
            if (!name.endsWith('.json')) continue;
            if (!writtenFiles.has(name)) {
                fs.unlinkSync(path.join(instrumentsDir, name));
            }
        }
        for (const id of [...existingById.keys()]) {
            const row = existingById.get(id);
            if (row && !writtenFiles.has(row.file)) existingById.delete(id);
        }
    }

    const manifestEntries = [...existingById.values()].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'kanun' ? -1 : 1;
        return Number(a.no) - Number(b.no) || a.no.localeCompare(b.no, 'tr');
    });
    const manifest: MevzuatManifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        instruments: manifestEntries,
    };
    writeJson(path.join(outDir, 'manifest.json'), manifest);

    const yonetmelikOk = manifestEntries.filter((row) => row.kind === 'yonetmelik');
    console.log(
        `\nDone: ${manifestEntries.length} instruments, ${failed.length} failed. Yönetmelik OK: ${yonetmelikOk.length}.`,
    );
    for (const row of yonetmelikOk) {
        console.log(`  • ${row.no}  ${row.title}  (tur ${row.tur}, tertip ${row.tertip}, ${row.maddeCount} madde)`);
    }
    if (failed.length) {
        console.log('Failures:');
        for (const f of failed) console.log(`  - ${f.no} ${f.title}: ${f.error}`);
    }
    return { written: manifestEntries.length, failed: failed.length, outDir };
}

if (require.main === module) {
    runGenerateMevzuatCorpus().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
