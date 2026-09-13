import type { JSONContent } from '@tiptap/core';

import { parseUyapToHtml, parseUyapToTipTap, udfXmlContainsTable } from './converter';
import { parseUyapImportMeta, UYAP_IMPORT_META_STORAGE_PREFIX } from './uyapImportMeta';
import { stripUyapVerificationFromHtml } from './uyapVerification';
import { UyapIO } from './uyapIO';

/** Same content resolution as `UdfFileEditorPanel` (TipTap vs HTML, template guard). */
export async function resolveUdfEditorInitialContent(
    contentXml: string,
    documentId?: string,
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
        return stripUyapVerificationFromHtml((await parseUyapToHtml(contentXml)) || '<p></p>');
    }

    if (!udfXmlContainsTable(contentXml)) {
        const doc = await parseUyapToTipTap(contentXml);
        if (doc?.content && doc.content.length > 0) {
            return doc as JSONContent;
        }
    }

    return stripUyapVerificationFromHtml((await parseUyapToHtml(contentXml)) || '<p></p>');
}
