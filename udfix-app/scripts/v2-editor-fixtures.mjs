/**
 * Synthetic editor fixtures. No client, court, or personal data.
 * Run: node scripts/v2-editor-fixtures.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/v2-editor');

function template(cdata, elements) {
    return `<?xml version="1.0" encoding="UTF-8" ?>
<template format_id="1.8">
<content><![CDATA[${cdata}]]></content>
<elements>
${elements}
</elements>
</template>
`;
}

function paragraph(text, attrs = 'Alignment="0"') {
    return { text, xml: `<paragraph ${attrs}><content startOffset="OFFSET" length="${text.length}" /></paragraph>` };
}

function build(parts) {
    let cdata = '';
    const elements = [];
    for (const part of parts) {
        const start = cdata.length;
        cdata += `${part.text}\n`;
        elements.push(part.xml.replace('OFFSET', String(start)));
    }
    return template(cdata, elements.join('\n'));
}

const short = build([paragraph('Örnek kısa metin.')]);
const unicodeBody = 'Türkçe İıŞşĞğÜüÖöÇç ve birleşik cafe\u0301 işareti 📄⚖️';
const unicode = build([paragraph(unicodeBody)]);
const empty = template('', '<paragraph Alignment="0"><content startOffset="0" length="0" /></paragraph>');
const adjacent = `<?xml version="1.0" encoding="UTF-8" ?>
<template format_id="1.8">
<content><![CDATA[Sentetik gövde
]]></content>
<elements>
<paragraph Alignment="0"LeftIndent="1.0"><content startOffset="0" length="15" /></paragraph>
</elements>
</template>
`;
const image = `<?xml version="1.0" encoding="UTF-8" ?>
<template format_id="1.8">
<content><![CDATA[Şekil
]]></content>
<elements>
<paragraph Alignment="1"><content startOffset="0" length="5" /><image imageData="iVBORw0KGgo=" width="16" height="16" /></paragraph>
</elements>
</template>
`;
const table = `<?xml version="1.0" encoding="UTF-8" ?>
<template format_id="1.8">
<content><![CDATA[Sentetik kalem
]]></content>
<elements>
<table tableName="Ornek" columnCount="2" columnSpans="50,50" border="borderCell">
<row rowName="row0" rowType="headerRow"><cell><paragraph Alignment="0"><content startOffset="0" length="8" /></paragraph></cell><cell><paragraph Alignment="0"><content startOffset="9" length="5" /></paragraph></cell></row>
</table>
</elements>
</template>
`;
const largeParts = [];
for (let i = 1; i <= 40; i += 1) {
    const n = String(i).padStart(2, '0');
    largeParts.push(paragraph(`Sentetik paragraf ${n}. Bu satır yalnızca doğrulama içindir.`));
}
const large = build(largeParts);
const truncated = unicode.slice(0, 80);
const wordHtml = [
    '<html><body>',
    '<p class="MsoNormal" style="text-align:justify;font-size:12pt">Örnek gerekçe ve <b>kalın</b> kısım.</p>',
    '<br clear=all style="page-break-before:always">',
    '<ul><li>birinci<ul><li>iç madde</li></ul></li><li>ikinci</li></ul>',
    '<table><tr><td>Kalem</td><td>100</td></tr></table>',
    '<p>cafe\u0301 📄</p>',
    '</body></html>',
].join('');
const plain = 'Düz metin. Türkçe karakter: ğüşıöç.\nİkinci satır.\n';

fs.mkdirSync(outDir, { recursive: true });
const files = {
    'empty.xml': empty,
    'short.xml': short,
    'unicode.xml': unicode,
    'adjacent-attributes.xml': adjacent,
    'image.xml': image,
    'table.xml': table,
    'large-bounded.xml': large,
    'truncated.xml': truncated,
    'word-like.html': wordHtml,
    'plain.txt': plain,
};
for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(outDir, name), contents);
}

const zip = new JSZip();
zip.file('content.xml', short);
const udf = await zip.generateAsync({ type: 'nodebuffer' });
fs.writeFileSync(path.join(outDir, 'short-packaged.udf'), udf);
fs.writeFileSync(path.join(outDir, 'truncated.udf'), Buffer.from('PK\x03\x04truncated'));
fs.writeFileSync(path.join(outDir, 'short-raw.udf'), short);

console.log(`wrote ${Object.keys(files).length + 3} fixtures in ${outDir}`);
