/**
 * Write synthetic UDF packages for the official UYAP editor.
 * Output directory is an argument. The installer is not stored in git.
 *
 * Run: npx tsx scripts/v2-uyap-official-fixtures.ts /tmp/uyap-fixtures
 */
import fs from 'node:fs';
import path from 'node:path';
import type { JSONContent } from '@tiptap/core';
import { UyapIO } from '../src/utils/uyapIO';

const PNG_A =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_B =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const outDir = process.argv[2];
if (!outDir) {
    console.error('usage: npx tsx scripts/v2-uyap-official-fixtures.ts <outdir>');
    process.exit(1);
}

const cases: Array<{ name: string; doc: JSONContent }> = [
    {
        name: 'blank',
        doc: { type: 'doc', content: [{ type: 'paragraph' }] },
    },
    {
        name: 'unicode-bmp',
        doc: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Türkçe İıŞşĞğ cafe\u0301 a<b>&"\'c ]]>' }],
                },
            ],
        },
    },
    {
        name: 'unicode-xml',
        doc: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Türkçe İıŞşĞğ cafe\u0301 📄 a<b>&"\'c ]]>' }],
                },
            ],
        },
    },
    {
        name: 'format',
        doc: {
            type: 'doc',
            content: [
                { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Başlık' }] },
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: 'düz ' },
                        { type: 'text', text: 'kalın', marks: [{ type: 'bold' }] },
                    ],
                },
                { type: 'pageBreak' },
                {
                    type: 'paragraph',
                    attrs: { marginLeft: 40 },
                    content: [{ type: 'text', text: 'girintili satır' }],
                },
            ],
        },
    },
    {
        name: 'lists',
        doc: {
            type: 'doc',
            content: [
                {
                    type: 'bulletList',
                    content: [
                        {
                            type: 'listItem',
                            content: [
                                { type: 'paragraph', content: [{ type: 'text', text: 'dış madde' }] },
                                {
                                    type: 'orderedList',
                                    attrs: { start: 4 },
                                    content: [
                                        {
                                            type: 'listItem',
                                            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'dört' }] }],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    },
    {
        name: 'table',
        doc: {
            type: 'doc',
            content: [
                {
                    type: 'table',
                    content: [
                        {
                            type: 'tableRow',
                            content: [
                                { type: 'tableCell', content: [{ type: 'paragraph' }] },
                                {
                                    type: 'tableCell',
                                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hücre' }] }],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    },
    {
        name: 'images',
        doc: {
            type: 'doc',
            content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'önce' }] },
                { type: 'image', attrs: { src: `data:image/png;base64,${PNG_A}` } },
                { type: 'paragraph', content: [{ type: 'text', text: 'ara' }] },
                { type: 'image', attrs: { src: `data:image/png;base64,${PNG_B}` } },
                { type: 'paragraph', content: [{ type: 'text', text: 'sonra' }] },
            ],
        },
    },
    {
        name: 'mixed',
        doc: {
            type: 'doc',
            content: [
                { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Karma' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'İı & café' }] },
                {
                    type: 'bulletList',
                    content: [
                        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'madde' }] }] },
                    ],
                },
                {
                    type: 'table',
                    content: [
                        {
                            type: 'tableRow',
                            content: [
                                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'kalem' }] }] },
                            ],
                        },
                    ],
                },
                { type: 'image', attrs: { src: `data:image/png;base64,${PNG_A}` } },
                ...Array.from({ length: 40 }, (_, index) => ({
                    type: 'paragraph',
                    content: [{ type: 'text', text: `gövde ${String(index + 1).padStart(2, '0')}` }],
                })),
            ],
        },
    },
];

async function main(): Promise<void> {
    fs.mkdirSync(outDir, { recursive: true });
    for (const item of cases) {
        const bytes = await UyapIO.generateUdfBytesFromJson(item.doc);
        const file = path.join(outDir, `${item.name}.udf`);
        fs.writeFileSync(file, Buffer.from(bytes));
        console.log(`${item.name} ${bytes.byteLength}`);
    }
}

void main();
