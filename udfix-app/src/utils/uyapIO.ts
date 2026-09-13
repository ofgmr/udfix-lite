import type { Editor } from '@tiptap/core';
import type { JSONContent } from '../types/tiptapContent';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { parseUyapToTipTap, parseUyapToHtml, type TiptapDoc } from './converter';
import { sanitizeExportBaseName } from './sanitizeExportBaseName';
import type { HeaderFooterSection, HeaderFooterSettings } from '../stores/useHeaderFooterStore';
import { preprocessHfExportImages } from './udfHfExportSegments';
import { preprocessTipTapImagesForUyapExport } from './uyapBodyImageExport';
import { flushAllHfEditors } from './hfEditorFlushRegistry';
import { useHeaderFooterStore } from '../stores/useHeaderFooterStore';
import { compileHfColumnsForUdfExport, headerFooterSectionHasExportableContent } from './udfHfExportColumns';
import { getPaginationMargins } from './paginationMarginSync';
import {
    buildPageFormatFromMargins,
    buildUyapContentXml,
    type UyapHeaderFooterAppearance,
    type UyapHfExportInput,
    type UyapPageFormatInput,
    type UyapPageNumberFontAttrs,
    type UyapPropertiesInput,
    type UyapTemplateMetaInput,
    uyapContentWidthPt,
} from './uyapExportBuild';
import {
    createUyapSignatureManifest,
    PlaceholderUyapSigner,
    resolveUyapSignatureProfile,
    sha256Base64FromUtf8,
    type UyapSignatureExportOptions,
} from './uyapSignature';

/** Optional UDF/XML extras (ZIP `preserveZipEntries` is handled only in byte generators). */
export interface UdfExportOptions {
    preserveZipEntries?: Record<string, Uint8Array>;
    /**
     * UYAP tarafından doldurulan şablon/form UDF'lerde (`<field>` + `<data>`),
     * orijinal `content.xml` birebir korunur; editörden yeniden üretim yapılmaz.
     */
    preserveOriginalContentXml?: string;
    /**
     * Legacy: tek HTML bloğu (sütunlar birleşik). `hfExport` verilmişse header için kullanılmaz.
     * Görseller için hâlâ `<img src="data:image…">` içerebilir.
     */
    headerHtml?: string;
    /**
     * Sol / orta / sağ slot HTML’i + layout; UYAP’taki gibi `Alignment` 0/1/2 ile ayrı paragraflar üretilir.
     */
    hfExport?: UyapHfExportInput;
    /**
     * `{page}` hangi üst/alt bilgi hücresindeyse UYAP `pageNumber-spec` buna göre ayarlanır
     * (sol `BSP32_08`, orta `BSP32_40`, sağ `BSP32_72` — Deneme Belgesi örnekleri).
     * Önek metni kullanıcı HTML’inde bırakılır (`pageNumber-foreStr` boş).
     */
    uyapPageNumber?: UyapPageNumberPlacement;
    /**
     * Yorumlar `comments.xml` içine yazılır (`getCommentIdsInDocumentOrder` sırası).
     * Gövde `content.xml` CDATA’sındaki `strtOffs` / `endOffs` ile eşlenir.
     */
    commentsForXml?: Array<{
        id: string;
        text: string;
        author?: string;
        resolved?: boolean;
        date?: string;
    }>;
    /**
     * UDF paketinde `sign.sgn` üretimi için detached imza iskeleti.
     * Varsayılan güvenli davranış: yeni içerik üretildiğinde eski `sign.sgn` korunmaz.
     */
    signature?: UyapSignatureExportOptions;
    /** Sayfa düzeni; verilmezse editör PaginationPlus marjlarından türetilir. */
    pageFormat?: UyapPageFormatInput;
    templateMeta?: UyapTemplateMetaInput;
    properties?: UyapPropertiesInput;
    dataSectionXml?: string;
    pageNumberStart?: number;
    /** Imported UYAP page-number font/spec attrs for `pageNumber-*` on header/footer. */
    uyapPageNumberFont?: UyapPageNumberFontAttrs;
    /** `<header startPage="N">` when header band starts after page 1. */
    headerStartPage?: number;
    headerFooterAppearance?: UyapHeaderFooterAppearance;
    /** ZIP içinde ayrı dosya olarak paketlenecek kaynaklar (ör. bgImageSource). */
    zipResources?: Record<string, Uint8Array>;
}

export type UyapXmlExtras = Omit<UdfExportOptions, 'preserveZipEntries'>;

export interface UyapTemplateAnalysis {
    hasFieldElements: boolean;
    hasDataSection: boolean;
    hasFieldTagsInsideElements: boolean;
    isUyapProtectedTemplate: boolean;
}

export type UyapHfLayoutPreset = HeaderFooterSettings['headerLayout'];

export type UyapPageNumberZone = 'header' | 'footer';

/** UYAP hücre hizası: sol=0, orta=1, sağ=2 */
export type UyapPageNumberAlignment = '0' | '1' | '2';

export interface UyapPageNumberPlacement {
    zone: UyapPageNumberZone;
    alignment: UyapPageNumberAlignment;
}

/**
 * `{page}` hangi **export edilen** HF paragrafında (Alignment 0/1/2) — `hfEmitPlan` ile aynı sütun seçimi.
 * Ham şablon metninde `{page}` varken kullanın (token değişimi öncesi).
 */
export function resolveUyapPageNumberPlacementFromRawSections(
    headerLayout: UyapHfLayoutPreset,
    footerLayout: UyapHfLayoutPreset,
    sec: {
        headerLeft: string;
        headerCenter: string;
        headerRight: string;
        footerLeft: string;
        footerCenter: string;
        footerRight: string;
    },
): UyapPageNumberPlacement | undefined {
    const fPlan = hfEmitPlan(footerLayout, sec.footerLeft, sec.footerCenter, sec.footerRight);
    for (const row of fPlan) {
        if (/\{page\}/i.test(row.html)) {
            return { zone: 'footer', alignment: row.alignment as UyapPageNumberAlignment };
        }
    }
    const hPlan = hfEmitPlan(headerLayout, sec.headerLeft, sec.headerCenter, sec.headerRight);
    for (const row of hPlan) {
        if (/\{page\}/i.test(row.html)) {
            return { zone: 'header', alignment: row.alignment as UyapPageNumberAlignment };
        }
    }
    return undefined;
}

export interface BuildUdfHfExportContext {
    documentTitle?: string;
    formattedDate?: string;
}

/** HF store → UDF export extras (DockviewTab `handleUdfixSave` ile aynı kurallar). */
export async function buildUdfHfExportOptionsFromStore(
    _settings: HeaderFooterSettings,
    _section: HeaderFooterSection,
    context?: BuildUdfHfExportContext,
    pageFormat?: UyapPageFormatInput,
): Promise<
    Pick<
        UyapXmlExtras,
        'hfExport' | 'uyapPageNumber' | 'pageNumberStart' | 'uyapPageNumberFont' | 'headerStartPage'
    >
> {
    // Mini editördeki canlı HTML (text-align, logo konumu) store'a yazılmadan export edilmesin.
    flushAllHfEditors();
    const liveHf = useHeaderFooterStore.getState();
    const settings = liveHf.settings;
    const section = liveHf.sections.default;

    if (!headerFooterSectionHasExportableContent(section)) {
        return {};
    }

    const docTitle = (context?.documentTitle ?? '').trim();
    const compiled = compileHfColumnsForUdfExport(settings, section, docTitle || 'Belge');
    const applyHfTokens = (html: string) =>
        html
            .replace(/\{totalPages\}/gi, '')
            .replace(/\{total\}/gi, '');
    const uyapPageNumber = resolveUyapPageNumberPlacementFromRawSections(
        settings.headerLayout,
        settings.footerLayout,
        {
            headerLeft: compiled.header.left,
            headerCenter: compiled.header.center,
            headerRight: compiled.header.right,
            footerLeft: compiled.footer.left,
            footerCenter: compiled.footer.center,
            footerRight: compiled.footer.right,
        },
    );
    const pageToUyapSpace = (html: string) => html.replace(/\{page\}/gi, ' ');
    let headerLeftHtml = applyHfTokens(pageToUyapSpace(compiled.header.left));
    let headerCenterHtml = applyHfTokens(pageToUyapSpace(compiled.header.center));
    let headerRightHtml = applyHfTokens(pageToUyapSpace(compiled.header.right));
    let footerLeftHtml = applyHfTokens(pageToUyapSpace(compiled.footer.left));
    let footerCenterHtml = applyHfTokens(pageToUyapSpace(compiled.footer.center));
    let footerRightHtml = applyHfTokens(pageToUyapSpace(compiled.footer.right));

    const ensurePageSlot = (
        zone: 'header' | 'footer',
        alignment: UyapPageNumberAlignment,
        cell: string,
    ): string => {
        if (!uyapPageNumber || uyapPageNumber.zone !== zone || uyapPageNumber.alignment !== alignment) {
            return cell;
        }
        return cell.trim().length === 0 ? ' ' : cell;
    };
    headerLeftHtml = ensurePageSlot('header', '0', headerLeftHtml);
    headerCenterHtml = ensurePageSlot('header', '1', headerCenterHtml);
    headerRightHtml = ensurePageSlot('header', '2', headerRightHtml);
    footerLeftHtml = ensurePageSlot('footer', '0', footerLeftHtml);
    footerCenterHtml = ensurePageSlot('footer', '1', footerCenterHtml);
    footerRightHtml = ensurePageSlot('footer', '2', footerRightHtml);

    const settingsExt = settings as HeaderFooterSettings & {
        uyapPageNumberFont?: UyapPageNumberFontAttrs;
        headerStartPage?: number;
    };

    const extras: Pick<
        UyapXmlExtras,
        'hfExport' | 'uyapPageNumber' | 'pageNumberStart' | 'uyapPageNumberFont' | 'headerStartPage'
    > = {
        hfExport: {
            mode: 'raster',
            headerLayout: settings.headerLayout,
            footerLayout: settings.footerLayout,
            headerLeftHtml,
            headerCenterHtml,
            headerRightHtml,
            footerLeftHtml,
            footerCenterHtml,
            footerRightHtml,
            showHeaderSeparatorLine: settings.showHeaderSeparatorLine,
            showFooterSeparatorLine: settings.showFooterSeparatorLine,
        },
        pageNumberStart: settings.pageNumberStart,
    };

    if (typeof document !== 'undefined' && pageFormat) {
        try {
            const { buildHfRasterBandsForUdfExport } = await import('./udfHfRasterExport');
            const contentWidthPt = uyapContentWidthPt(pageFormat);
            const { headerRaster, footerRaster } = await buildHfRasterBandsForUdfExport({
                settings,
                section,
                documentTitle: docTitle || 'Belge',
                contentWidthPt,
            });
            if (!headerRaster && !footerRaster) {
                throw new Error('HF raster bands empty');
            }
            extras.hfExport!.headerRaster = headerRaster;
            extras.hfExport!.footerRaster = footerRaster;
        } catch (err) {
            console.warn('UDF HF raster export failed; falling back to native TabSet.', err);
            extras.hfExport!.mode = 'native';
            extras.uyapPageNumber = uyapPageNumber;
        }
    } else {
        extras.hfExport!.mode = 'native';
        extras.uyapPageNumber = uyapPageNumber;
    }

    if (settingsExt.uyapPageNumberFont) {
        extras.uyapPageNumberFont = settingsExt.uyapPageNumberFont;
    }
    if (settingsExt.headerStartPage != null) {
        extras.headerStartPage = settingsExt.headerStartPage;
    }
    return extras;
}

export type { UyapHfExportInput };

/** Standard `.udf` packages are ZIP archives; UYAP portal template downloads are raw `<template>` XML. */
function isZipArchiveBytes(bytes: Uint8Array): boolean {
    return (
        bytes.length >= 4 &&
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b &&
        (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
        (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
    );
}

function isRawUyapTemplateXmlBytes(bytes: Uint8Array): boolean {
    const head = new TextDecoder('utf-8').decode(bytes.slice(0, 512)).trimStart();
    return head.startsWith('<?xml') || head.startsWith('<template');
}

async function readUdfFileBytes(file: File): Promise<Uint8Array> {
    return new Uint8Array(await file.arrayBuffer());
}

type UdfPayloadLoadResult = {
    zip: JSZip | null;
    contentXml: string;
};

async function loadUdfPayload(file: File): Promise<UdfPayloadLoadResult> {
    const bytes = await readUdfFileBytes(file);
    if (isZipArchiveBytes(bytes)) {
        const zip = await new JSZip().loadAsync(bytes);
        const contentFile = zip.file('content.xml');
        if (!contentFile) {
            throw new Error('Geçersiz UYAP Dosyası: content.xml bulunamadı.');
        }
        const contentXml = await contentFile.async('string');
        return { zip, contentXml };
    }
    if (isRawUyapTemplateXmlBytes(bytes)) {
        const contentXml = new TextDecoder('utf-8').decode(bytes);
        if (!/<template\b/i.test(contentXml) || !/<content\b/i.test(contentXml)) {
            throw new Error('Geçersiz UYAP Dosyası: şablon XML yapısı tanınamadı.');
        }
        return { zip: null, contentXml };
    }
    throw new Error('Geçersiz UYAP Dosyası: ZIP arşivi veya UYAP şablon XML\'i tanınamadı.');
}

function hfEmitPlan(
    layout: UyapHfLayoutPreset,
    left: string,
    center: string,
    right: string,
): Array<{ html: string; alignment: string }> {
    const L = (left || '').trim();
    const C = (center || '').trim();
    const R = (right || '').trim();
    switch (layout) {
        case '1-col':
            if (C) return [{ html: center || '', alignment: '1' }];
            if (L) return [{ html: left || '', alignment: '1' }];
            if (R) return [{ html: right || '', alignment: '1' }];
            return [];
        case '2-col-70-30':
        case '2-col-80-20':
        case '2-col-30-70':
        case '2-col-20-80':
            return [
                ...(L ? [{ html: left || '', alignment: '0' }] : []),
                ...(R ? [{ html: right || '', alignment: '2' }] : []),
            ];
        case '3-col-equal':
        default:
            return [
                ...(L ? [{ html: left || '', alignment: '0' }] : []),
                ...(C ? [{ html: center || '', alignment: '1' }] : []),
                ...(R ? [{ html: right || '', alignment: '2' }] : []),
            ];
    }
}

async function packageUdfZipBytes(input: {
    contentXml: string;
    commentsXml?: string | null;
    preserveZipEntries?: Record<string, Uint8Array>;
    zipResources?: Record<string, Uint8Array>;
    signatureOptions?: UyapSignatureExportOptions;
}): Promise<Uint8Array> {
    const zip = new JSZip();
    zip.file('content.xml', input.contentXml);
    if (input.commentsXml) {
        zip.file('comments.xml', input.commentsXml);
    }
    if (input.zipResources) {
        for (const [name, data] of Object.entries(input.zipResources)) {
            zip.file(name, data, { binary: true });
        }
    }
    const signatureOptions = input.signatureOptions;
    const signatureEnabled = Boolean(signatureOptions?.enabled);
    const keepUnsignedSignFile = Boolean(signatureOptions?.keepExistingSignFileWhenUnsigned);
    let generatedSignSgn = false;

    if (signatureEnabled) {
        const signer = signatureOptions?.signer ?? new PlaceholderUyapSigner();
        const profile = resolveUyapSignatureProfile(signatureOptions?.profile);
        try {
            const contentXmlSha256Base64 = await sha256Base64FromUtf8(input.contentXml);
            const signedResult = await signer.signDetached({
                contentXml: input.contentXml,
                contentXmlSha256Base64,
                profile,
            });
            if (signedResult.signatureBytes && signedResult.signatureBytes.length > 0) {
                zip.file('sign.sgn', signedResult.signatureBytes, { binary: true });
                generatedSignSgn = true;
            }
            if (signatureOptions?.writeManifestJson) {
                const manifest = createUyapSignatureManifest({
                    profile,
                    signerProvider: signer.providerId,
                    signerKind: signer.providerKind,
                    signerName: signedResult.signerName,
                    signedAtIso: signedResult.signedAtIso,
                    certificateValidUntilIso: signedResult.certificateValidUntilIso,
                    contentXmlSha256Base64,
                    signed: generatedSignSgn,
                    notes: signedResult.notes,
                });
                zip.file('udfix-signature-manifest.json', JSON.stringify(manifest, null, 2));
            }
            if (signatureOptions?.failOnSigningError && !generatedSignSgn) {
                throw new Error('İmza üretilemedi; sign.sgn dosyası oluşturulamadı.');
            }
        } catch (error) {
            if (signatureOptions?.failOnSigningError) {
                throw error;
            }

            console.warn('UDF imza üretimi başarısız; unsigned devam ediliyor.', error);
        }
    }

    if (input.preserveZipEntries) {
        for (const [name, data] of Object.entries(input.preserveZipEntries)) {
            if (name === 'content.xml') continue;
            if (name === 'comments.xml' && input.commentsXml) continue;
            if (name === 'sign.sgn' && (!keepUnsignedSignFile || generatedSignSgn)) continue;
            if (
                (name === 'udfix-signature-manifest.json' || name === 'nomai-signature-manifest.json') &&
                signatureOptions?.writeManifestJson
            ) {
                continue;
            }
            zip.file(name, data, { binary: true });
        }
    }
    return zip.generateAsync({ type: 'uint8array' });
}

export const UyapIO = {
    analyzeContentXmlForUyapTemplate(contentXml: string): UyapTemplateAnalysis {
        const hasFieldElements = /<field\b/i.test(contentXml);
        const hasDataSection = /<data(?:\s|>)/i.test(contentXml) && /<\/data>/i.test(contentXml);
        const hasFieldTagsInsideElements = /<elements[\s\S]*<field\b[\s\S]*<\/elements>/i.test(contentXml);
        return {
            hasFieldElements,
            hasDataSection,
            hasFieldTagsInsideElements,
            isUyapProtectedTemplate: hasFieldElements && hasDataSection,
        };
    },

    // --- DOSYA OKUMA (IMPORT) ---
    async readUdf(file: File): Promise<TiptapDoc | null> {
        const { contentXml } = await loadUdfPayload(file);
        return parseUyapToTipTap(contentXml);
    },

    async readUdfAsHtml(file: File): Promise<string | null> {
        const { contentXml } = await loadUdfPayload(file);
        return parseUyapToHtml(contentXml);
    },

    /**
     * Viewer-focused ZIP read: `content.xml` plus only lightweight signature markers.
     * This avoids decompressing unrelated preserved entries while still teaching UI
     * counters whether an opened local UDF has `sign.sgn`.
     */
    async readUdfViewerParts(file: File): Promise<{
        contentXml: string;
        signatureEntries: Record<string, Uint8Array>;
        documentPropertiesXml: string | null;
    }> {
        const { zip, contentXml } = await loadUdfPayload(file);
        const signatureEntries: Record<string, Uint8Array> = {};
        let documentPropertiesXml: string | null = null;
        if (zip) {
            for (const path of ['sign.sgn', 'udfix-signature-manifest.json', 'nomai-signature-manifest.json']) {
                const entry = zip.file(path);
                if (entry) signatureEntries[path] = await entry.async('uint8array');
            }
            const docProps = zip.file('documentproperties.xml');
            documentPropertiesXml = docProps ? await docProps.async('string') : null;
        }
        return { contentXml, signatureEntries, documentPropertiesXml };
    },

    /**
     * Single ZIP read: `content.xml` plus every other entry (e.g. sign.sgn, documentproperties.xml)
     * for round-trip preservation.
     */
    async readUdfZipParts(file: File): Promise<{
        contentXml: string;
        preserveZipEntries: Record<string, Uint8Array>;
    }> {
        const { zip, contentXml } = await loadUdfPayload(file);
        const preserveZipEntries: Record<string, Uint8Array> = {};
        if (zip) {
            for (const path of Object.keys(zip.files)) {
                const entry = zip.files[path];
                if (entry.dir || path === 'content.xml') continue;
                preserveZipEntries[path] = await entry.async('uint8array');
            }
        }
        return { contentXml, preserveZipEntries };
    },

    /** Entries other than content.xml, for re-packaging after editing `content.xml`. */
    async readUdfNonContentEntries(file: File): Promise<Record<string, Uint8Array>> {
        const { preserveZipEntries } = await this.readUdfZipParts(file);
        return preserveZipEntries;
    },

    // --- XML OLUŞTURMA (YARDIMCI FONKSİYON) ---
    generateUyapXml(
        json: JSONContent,
        headerText: string = '',
        footerText: string = '',
        extras?: UyapXmlExtras,
    ): { contentXml: string; commentsXml: string | null } {
        return buildUyapContentXml(json, headerText, footerText, extras);
    },

    async generateUdfBytesFromJson(
        json: JSONContent,
        headerText: string = '',
        footerText: string = '',
        options?: UdfExportOptions
    ): Promise<Uint8Array> {
        const { preserveZipEntries, ...xmlExtras } = options ?? {};
        const preservedContentXml = options?.preserveOriginalContentXml;
        let mergedExtras: UyapXmlExtras = xmlExtras;
        if (
            xmlExtras.hfExport &&
            typeof document !== 'undefined' &&
            xmlExtras.hfExport.mode === 'native'
        ) {
            const scaled = await preprocessHfExportImages(xmlExtras.hfExport);
            mergedExtras = { ...xmlExtras, hfExport: { ...xmlExtras.hfExport, ...scaled } };
        }
        const exportJson =
            typeof document !== 'undefined' && !preservedContentXml
                ? await preprocessTipTapImagesForUyapExport(json)
                : json;
        const generated = this.generateUyapXml(exportJson, headerText, footerText, mergedExtras);
        const contentXml = preservedContentXml ?? generated.contentXml;
        const commentsXml = preservedContentXml ? null : generated.commentsXml;
        return packageUdfZipBytes({
            contentXml,
            commentsXml,
            preserveZipEntries,
            zipResources: options?.zipResources,
            signatureOptions: options?.signature,
        });
    },

    async generateUdfBytesFromContentXml(
        contentXml: string,
        options?: Pick<UdfExportOptions, 'preserveZipEntries' | 'signature'>,
    ): Promise<Uint8Array> {
        return packageUdfZipBytes({
            contentXml,
            preserveZipEntries: options?.preserveZipEntries,
            signatureOptions: options?.signature,
        });
    },

    async generateUdfBytesFromEditor(
        editor: Editor,
        headerText: string = '',
        footerText: string = '',
        options?: UdfExportOptions
    ): Promise<Uint8Array> {
        const json = editor.getJSON();
        const margins = getPaginationMargins(editor);
        const merged: UdfExportOptions = {
            ...options,
            pageFormat: options?.pageFormat ?? buildPageFormatFromMargins(margins ?? undefined),
        };
        return this.generateUdfBytesFromJson(json, headerText, footerText, merged);
    },

    async generateEmptyUdfBytes(): Promise<Uint8Array> {
        return this.generateUdfBytesFromJson({
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
        });
    },

    // --- DOSYA KAYDETME (EXPORT) ---
    async saveUdf(
        editor: Editor,
        headerText: string = '',
        footerText: string = '',
        fileBaseName?: string | null,
        options?: UdfExportOptions
    ) {
        const json = editor.getJSON();
        const bytes = await this.generateUdfBytesFromJson(json, headerText, footerText, options);
        const arrayBuffer =
            bytes.buffer instanceof ArrayBuffer
                ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
                : Uint8Array.from(bytes).buffer;
        const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
        const name = `${sanitizeExportBaseName(fileBaseName)}.udf`;
        saveAs(blob, name);
    }
};
