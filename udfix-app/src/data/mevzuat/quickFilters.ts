import { loadMevzuatManifest } from './loadCorpus';

export type MevzuatQuickFilter = {
    instrumentId: string;
    label: string;
    kanunNo: string;
    title: string;
};

/**
 * High-use bundled kanunlar for the empty-state chip row.
 * Labels are lawyer shorthand; ids must exist in the packaged manifest.
 */
const QUICK_FILTERS: readonly MevzuatQuickFilter[] = [
    { instrumentId: 'kanun:6098', label: 'TBK', kanunNo: '6098', title: 'Türk Borçlar Kanunu' },
    { instrumentId: 'kanun:4721', label: 'TMK', kanunNo: '4721', title: 'Türk Medeni Kanunu' },
    { instrumentId: 'kanun:5237', label: 'TCK', kanunNo: '5237', title: 'Türk Ceza Kanunu' },
    { instrumentId: 'kanun:6102', label: 'TTK', kanunNo: '6102', title: 'Türk Ticaret Kanunu' },
    { instrumentId: 'kanun:6100', label: 'HMK', kanunNo: '6100', title: 'Hukuk Muhakemeleri Kanunu' },
    { instrumentId: 'kanun:5271', label: 'CMK', kanunNo: '5271', title: 'Ceza Muhakemesi Kanunu' },
    { instrumentId: 'kanun:2004', label: 'İİK', kanunNo: '2004', title: 'İcra ve İflas Kanunu' },
    { instrumentId: 'kanun:2577', label: 'İYUK', kanunNo: '2577', title: 'İdari Yargılama Usulü Kanunu' },
    { instrumentId: 'kanun:213', label: 'VUK', kanunNo: '213', title: 'Vergi Usul Kanunu' },
    { instrumentId: 'kanun:4857', label: 'İK (4857)', kanunNo: '4857', title: 'İş Kanunu' },
    { instrumentId: 'kanun:1136', label: 'Avukatlık', kanunNo: '1136', title: 'Avukatlık Kanunu' },
    { instrumentId: 'kanun:1512', label: 'Noterlik', kanunNo: '1512', title: 'Noterlik Kanunu' },
    { instrumentId: 'kanun:7201', label: 'Tebligat', kanunNo: '7201', title: 'Tebligat Kanunu' },
    { instrumentId: 'kanun:2709', label: 'AY', kanunNo: '2709', title: 'Türkiye Cumhuriyeti Anayasası' },
    { instrumentId: 'kanun:6698', label: 'KVKK', kanunNo: '6698', title: 'Kişisel Verilerin Korunması Kanunu' },
    { instrumentId: 'kanun:6502', label: 'TKHK', kanunNo: '6502', title: 'Tüketicinin Korunması Hakkında Kanun' },
    { instrumentId: 'kanun:6325', label: 'HUAK', kanunNo: '6325', title: 'Hukuk Uyuşmazlıklarında Arabuluculuk Kanunu' },
    { instrumentId: 'kanun:2918', label: 'KTK', kanunNo: '2918', title: 'Karayolları Trafik Kanunu' },
    { instrumentId: 'kanun:193', label: 'GVK', kanunNo: '193', title: 'Gelir Vergisi Kanunu' },
    { instrumentId: 'kanun:5718', label: 'MÖHUK', kanunNo: '5718', title: 'Milletlerarası Özel Hukuk ve Usul Hukuku Hakkında Kanun' },
];

export function bundledMevzuatQuickFilters(): MevzuatQuickFilter[] {
    const present = new Set(loadMevzuatManifest().instruments.map((row) => row.id));
    return QUICK_FILTERS.filter((chip) => present.has(chip.instrumentId));
}
