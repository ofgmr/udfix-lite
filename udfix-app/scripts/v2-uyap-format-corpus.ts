/**
 * Plain Turkish BMP fixtures for the official UYAP editor.
 * No emoji and no CDATA delimiter. The installer is not stored in git.
 *
 * Run: npx tsx scripts/v2-uyap-format-corpus.ts <outdir>
 */
import fs from 'node:fs';
import path from 'node:path';
import type { JSONContent } from '@tiptap/core';
import { UyapIO } from '../src/utils/uyapIO';

const outDir = process.argv[2];
if (!outDir) {
    console.error('usage: npx tsx scripts/v2-uyap-format-corpus.ts <outdir>');
    process.exit(1);
}

const text = (value: string, marks?: JSONContent['marks']): JSONContent => ({
    type: 'text',
    text: value,
    marks,
});

const paragraph = (value: string, attrs?: JSONContent['attrs'], marks?: JSONContent['marks']): JSONContent => ({
    type: 'paragraph',
    attrs,
    content: [text(value, marks)],
});

type Case = {
    name: string;
    doc: JSONContent;
    header?: string;
    footer?: string;
    pageFormat?: { paperOrientation?: string; leftMargin?: string; rightMargin?: string };
};

const cases: Case[] = [
    {
        name: 'runs',
        doc: {
            type: 'doc',
            content: [
                paragraph('HHHH normal'),
                paragraph('HHHH kalin', undefined, [{ type: 'bold' }]),
                paragraph('HHHH yatik', undefined, [{ type: 'italic' }]),
                paragraph('HHHH alti', undefined, [{ type: 'underline' }]),
                paragraph('HHHH cizik', undefined, [{ type: 'strike' }]),
                paragraph('BOYUT kucuk'),
                paragraph('BOYUT buyuk', undefined, [{ type: 'textStyle', attrs: { fontSize: '22pt' } }]),
                paragraph('SANS yazi', undefined, [{ type: 'textStyle', attrs: { fontFamily: 'Liberation Sans' } }]),
                {
                    type: 'paragraph',
                    content: [
                        text('karisik '),
                        text('kalin', [{ type: 'bold' }]),
                        text(' ve '),
                        text('yatik', [{ type: 'italic' }]),
                    ],
                },
            ],
        },
    },
    {
        name: 'para',
        doc: {
            type: 'doc',
            content: [
                paragraph('SOLA hiza', { textAlign: 'left' }),
                paragraph('ORTA hiza', { textAlign: 'center' }),
                paragraph('SAGA hiza', { textAlign: 'right' }),
                paragraph('IKI yana hiza icin uzun bir gerekce satiri yazildi', { textAlign: 'justify' }),
                paragraph('SOL girinti', { marginLeft: 72 }),
                paragraph('SAG girinti', { marginRight: 96 }),
                paragraph('ILK satir girintisi burada', { textIndent: 48 }),
                paragraph('ASKI satir girintisi burada uzuyor', { textIndent: -36, marginLeft: 48 }),
                paragraph('SIK satir araligi', { lineHeight: '1' }),
                paragraph('GEVSEK satir araligi icin ikinci cumle de var', { lineHeight: '2.5' }),
                paragraph('ONCE bosluk', { marginTop: 48 }),
                paragraph('SONRA bosluk', { marginBottom: 48 }),
            ],
        },
    },
    {
        name: 'lists',
        doc: {
            type: 'doc',
            content: [
                { type: 'heading', attrs: { level: 1 }, content: [text('Baslik bir')] },
                { type: 'heading', attrs: { level: 2 }, content: [text('Baslik iki')] },
                {
                    type: 'bulletList',
                    content: [
                        {
                            type: 'listItem',
                            content: [
                                paragraph('dis madde'),
                                {
                                    type: 'bulletList',
                                    content: [
                                        { type: 'listItem', content: [paragraph('ic madde')] },
                                    ],
                                },
                            ],
                        },
                    ],
                },
                {
                    type: 'orderedList',
                    attrs: { start: 4 },
                    content: [
                        { type: 'listItem', content: [paragraph('dortten')] },
                        { type: 'listItem', content: [paragraph('besten')] },
                    ],
                },
                paragraph('ara metin'),
                {
                    type: 'orderedList',
                    attrs: { start: 1 },
                    content: [{ type: 'listItem', content: [paragraph('yeniden bir')] }],
                },
            ],
        },
    },
    {
        name: 'page',
        doc: {
            type: 'doc',
            content: [
                paragraph('sekme once\tsekme sonra', { nomaiUyapTabElements: true }),
                { type: 'pageBreak' },
                paragraph('ikinci sayfa'),
                {
                    type: 'table',
                    content: [
                        {
                            type: 'tableRow',
                            content: [
                                {
                                    type: 'tableCell',
                                    attrs: { textAlign: 'left' },
                                    content: [paragraph('hucre sol', undefined, [{ type: 'bold' }])],
                                },
                                {
                                    type: 'tableCell',
                                    attrs: { textAlign: 'center' },
                                    content: [paragraph('hucre orta')],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        header: 'Ust yazi',
        footer: 'Alt yazi',
        pageFormat: { paperOrientation: '0', leftMargin: '70', rightMargin: '40' },
    },
];

async function main(): Promise<void> {
    fs.mkdirSync(outDir, { recursive: true });
    for (const item of cases) {
        const bytes = await UyapIO.generateUdfBytesFromJson(item.doc, item.header ?? '', item.footer ?? '', {
            pageFormat: item.pageFormat,
        });
        const file = path.join(outDir, `${item.name}.udf`);
        fs.writeFileSync(file, Buffer.from(bytes));
        console.log(`${item.name} ${bytes.byteLength}`);
    }
}

void main();
