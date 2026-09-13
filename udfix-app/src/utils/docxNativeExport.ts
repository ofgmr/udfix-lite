export {
    buildDocxFromEditor,
    buildDocxBufferFromJson,
    buildDocxDocumentFromJson,
    collectCommentsForDocxExport,
    collectFootnotes,
    numberingReferenceForList,
    parseListStart,
    parseListType,
    formatCommentBody,
} from './docxNativeExport/index';
export type {
    DocxBuildResult,
    DocxCommentForExport,
    DocxNativeExportOptions,
    DocxPageMargins,
} from './docxNativeExport/index';
