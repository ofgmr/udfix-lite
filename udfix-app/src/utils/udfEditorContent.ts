import type { JSONContent } from '@tiptap/core';

import { parseUyapToHtml, parseUyapToTipTap, udfXmlContainsTable, udfXmlHasNestedTable } from './converter';
import { parseUyapImportMeta, UYAP_IMPORT_META_STORAGE_PREFIX } from './uyapImportMeta';
import { stripUyapVerificationFromHtml } from './uyapVerification';
import { UyapIO } from './uyapIO';
import type { UyapImportedComment } from './uyapComments';

/** Same content resolution as `UdfFileEditorPanel` (TipTap vs HTML, template guard). */
export async function resolveUdfEditorInitialContent(
    contentXml: string,
    documentId?: string,
    comments?: UyapImportedComment[],
): Promise<JSONContent | string> {
    if (documentId) {
        const importMeta = await parseUyapImportMeta(contentXml);
        localStorage.setItem(
            `${UYAP_IMPORT_META_STORAGE_PREFIX}${documentId}`,
            JSON.stringify(importMeta),
        );
    }

    const templateAnalysis = UyapIO.analyzeContentXmlForUyapTemplate(contentXml);
    if (templateAnalysis.isUyapProtectedTemplate) {
        return stripUyapVerificationFromHtml(
            (await parseUyapToHtml(contentXml, { comments })) || '<p></p>',
        );
    }

    if (!udfXmlContainsTable(contentXml) || !udfXmlHasNestedTable(contentXml)) {
        const doc = await parseUyapToTipTap(contentXml, { comments });
        if (doc?.content && doc.content.length > 0) {
            return doc as JSONContent;
        }
    }

    return stripUyapVerificationFromHtml(
        (await parseUyapToHtml(contentXml, { comments })) || '<p></p>',
    );
}
