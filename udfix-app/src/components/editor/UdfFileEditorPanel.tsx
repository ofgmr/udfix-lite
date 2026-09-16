import React from 'react';
import type { Editor } from '@tiptap/react';
import UdfixEditor from './UdfixEditor';
import { parseUyapToHtml, parseUyapToTipTap, udfXmlContainsTable, udfXmlHasNestedTable } from '../../utils/converter';
import {
    parseUyapImportMeta,
    UYAP_IMPORT_META_STORAGE_PREFIX,
} from '../../utils/uyapImportMeta';
import {
    buildUyapVerificationMetaFromZipEntries,
    persistUyapVerificationMeta,
    stripUyapVerificationFromHtml,
    type UyapVerificationMeta,
} from '../../utils/uyapVerification';
import UyapVerificationBand from './UyapVerificationBand';
import { UyapIO, buildUdfHfExportOptionsFromStore } from '../../utils/uyapIO';
import { useHeaderFooterStore } from '../../stores/useHeaderFooterStore';
import { FileSystemService } from '../../services/fileSystemService';
import { DataService } from '../../services/dataService';
import { toSystemPath } from '../../utils/localResource';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { consumeUyapSignRequestForExport } from '../../utils/uyapTokenSession';
import { UyapIpcSigner } from '../../utils/uyapIpcSigner';
import { syncUdfSignatureMetadataFromEntries } from '../../utils/udfSignatureFromEntries';
import { readUdfSignatureMetadata, type UdfSignatureMetadata } from '../../utils/udfSignatureState';
import { isUyapDebugEnabled, uyapDebugLog } from '../../utils/uyapDebug';
import { toast, toastUyapSigningError } from '../../lib/glass-utils';
import { mapUyapSigningErrorMessage } from '../../utils/udfSignatureState';
import { formatSaveErrorMessage } from '../../utils/saveErrorMessage';
import { settleUdfSave, settleUdfSaveAs } from '../../utils/udfSaveBus';
import { sanitizeTrustedDocumentHtml } from '../../utils/sanitizeDocumentHtml';

interface UdfFileEditorPanelProps {
    filePath: string;
    fileName: string;
}

function parentDirectory(filePath: string): string | undefined {
    const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return slash > 0 ? filePath.slice(0, slash) : undefined;
}

function basenameFromPath(filePath: string): string {
    const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return slash >= 0 ? filePath.slice(slash + 1) : filePath;
}

const UdfFileEditorPanel: React.FC<UdfFileEditorPanelProps> = ({ filePath, fileName }) => {
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [isSaving, setIsSaving] = React.useState(false);
    const [isUyapTemplateProtected, setIsUyapTemplateProtected] = React.useState(false);
    const [udfSignatureMeta, setUdfSignatureMeta] = React.useState<UdfSignatureMetadata | null>(null);
    const [uyapVerificationMeta, setUyapVerificationMeta] = React.useState<UyapVerificationMeta | null>(null);
    const editorRef = React.useRef<Editor | null>(null);
    const preserveZipEntriesRef = React.useRef<Record<string, Uint8Array>>({});
    const originalContentXmlRef = React.useRef<string | null>(null);
    const setEditorSaveState = useLayoutStore((s) => s.setEditorSaveState);
    const setSignExportOverlay = useLayoutStore((s) => s.setSignExportOverlay);
    const retargetUdfEditorTab = useLayoutStore((s) => s.retargetUdfEditorTab);
    const setEditor = useLayoutStore((s) => s.setEditor);
    const documentId = React.useMemo(() => `udf:${encodeURIComponent(filePath)}`, [filePath]);
    const panelId = React.useMemo(() => `udf-editor:${filePath}`, [filePath]);

    const handleEditorReady = React.useCallback(
        (editor: Editor) => {
            editorRef.current = editor;
            setEditor(editor);
        },
        [setEditor],
    );

    React.useEffect(() => {
        let cancelled = false;
        void (async () => {
            setIsLoading(true);
            setError(null);
            setIsUyapTemplateProtected(false);
            setUdfSignatureMeta(null);
            setUyapVerificationMeta(null);
            preserveZipEntriesRef.current = {};
            originalContentXmlRef.current = null;
            try {
                await DataService.upsertEditorDocument({
                    documentId,
                    title: fileName || 'Belge.udf',
                    kind: 'udf',
                    filePath,
                    touchOpened: true,
                });
                const bytes = await FileSystemService.readFileBinary(toSystemPath(filePath));
                const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
                const file = new File([blob], fileName || 'document.udf');
                const { contentXml, preserveZipEntries } = await UyapIO.readUdfZipParts(file);
                if (cancelled) return;
                preserveZipEntriesRef.current = preserveZipEntries;
                originalContentXmlRef.current = contentXml;
                await syncUdfSignatureMetadataFromEntries(documentId, preserveZipEntries);
                setUdfSignatureMeta(readUdfSignatureMetadata(documentId));
                const verificationMeta = buildUyapVerificationMetaFromZipEntries(
                    contentXml,
                    preserveZipEntries,
                );
                persistUyapVerificationMeta(documentId, verificationMeta);
                setUyapVerificationMeta(verificationMeta);

                const importMeta = await parseUyapImportMeta(contentXml);
                localStorage.setItem(
                    `${UYAP_IMPORT_META_STORAGE_PREFIX}${documentId}`,
                    JSON.stringify(importMeta),
                );

                const templateAnalysis = UyapIO.analyzeContentXmlForUyapTemplate(contentXml);
                const protectTemplate = templateAnalysis.isUyapProtectedTemplate;
                setIsUyapTemplateProtected(protectTemplate);
                if (protectTemplate) {
                    const html = sanitizeTrustedDocumentHtml(
                        stripUyapVerificationFromHtml(
                            (await parseUyapToHtml(contentXml)) || '<p></p>',
                        ),
                    );
                    localStorage.removeItem(`nomai-udf-initial-json-${documentId}`);
                    localStorage.setItem(`nomai-content-${documentId}`, html);
                    return;
                }

                let useStructured = false;
                if (!udfXmlContainsTable(contentXml) || !udfXmlHasNestedTable(contentXml)) {
                    const doc = await parseUyapToTipTap(contentXml);
                    if (doc?.content && doc.content.length > 0) {
                        localStorage.removeItem(`nomai-content-${documentId}`);
                        localStorage.setItem(`nomai-udf-initial-json-${documentId}`, JSON.stringify(doc));
                        useStructured = true;
                    }
                }
                if (!useStructured) {
                    localStorage.removeItem(`nomai-udf-initial-json-${documentId}`);
                    const html = sanitizeTrustedDocumentHtml(
                        stripUyapVerificationFromHtml(
                            (await parseUyapToHtml(contentXml)) || '<p></p>',
                        ),
                    );
                    localStorage.setItem(`nomai-content-${documentId}`, html);
                }
            } catch (e: unknown) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : 'UDF dosyası açılamadı.');
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [documentId, fileName, filePath]);

    const buildSaveBytes = React.useCallback(
        async (signatureOptions?: {
            enabled: boolean;
            signer: UyapIpcSigner;
            writeManifestJson: boolean;
            failOnSigningError: boolean;
        }) => {
            if (isUyapTemplateProtected) {
                if (!originalContentXmlRef.current) {
                    throw new Error('Orijinal UDF içeriği bulunamadı.');
                }
                return UyapIO.generateUdfBytesFromContentXml(originalContentXmlRef.current, {
                    preserveZipEntries: preserveZipEntriesRef.current,
                    signature: signatureOptions,
                });
            }
            if (!editorRef.current) {
                throw new Error('Editör hazır değil.');
            }
            const hf = useHeaderFooterStore.getState();
            const { getPaginationMargins } = await import('../../utils/paginationMarginSync');
            const { buildPageFormatFromMargins } = await import('../../utils/uyapExportBuild');
            const pageFormat = buildPageFormatFromMargins(getPaginationMargins(editorRef.current), hf.settings);
            const hfExtras = await buildUdfHfExportOptionsFromStore(
                hf.settings,
                hf.sections.default,
                {
                    documentTitle: fileName,
                    formattedDate: hf.getFormattedDate(),
                },
                pageFormat,
            );
            return UyapIO.generateUdfBytesFromEditor(editorRef.current, '', '', {
                preserveZipEntries: preserveZipEntriesRef.current,
                signature: signatureOptions,
                pageFormat,
                ...hfExtras,
            });
        },
        [fileName, isUyapTemplateProtected],
    );

    const refreshAfterWrite = React.useCallback(
        async (bytes: Uint8Array, targetDocumentId: string, targetTitle: string, targetFilePath: string) => {
            await DataService.upsertEditorDocument({
                documentId: targetDocumentId,
                title: targetTitle,
                kind: 'udf',
                filePath: targetFilePath,
                touchOpened: false,
            });
            const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/octet-stream' });
            const updatedFile = new File([blob], targetTitle || 'document.udf');
            const { contentXml, preserveZipEntries } = await UyapIO.readUdfZipParts(updatedFile);
            preserveZipEntriesRef.current = preserveZipEntries;
            const nextVerification = buildUyapVerificationMetaFromZipEntries(contentXml, preserveZipEntries);
            persistUyapVerificationMeta(targetDocumentId, nextVerification);
            if (targetDocumentId === documentId) {
                setUyapVerificationMeta(nextVerification);
            }
            await syncUdfSignatureMetadataFromEntries(targetDocumentId, preserveZipEntries);
            setUdfSignatureMeta(readUdfSignatureMetadata(targetDocumentId));
        },
        [],
    );

    const handleSave = React.useCallback(async () => {
        if (isSaving) {
            return;
        }
        if (!editorRef.current) {
            const saveError = new Error('Editör hazır değil; imzalama başlatılamadı.');
            toastUyapSigningError(saveError);
            settleUdfSave(panelId, saveError);
            return;
        }
        setIsSaving(true);
        setEditorSaveState('saving');
        let signingAttempt = false;
        try {
            const stagedSignRequest = consumeUyapSignRequestForExport(documentId);
            signingAttempt = Boolean(stagedSignRequest);
            if (isUyapTemplateProtected && !stagedSignRequest) {
                setEditorSaveState('saved');
                toast.message('UYAP şablon UDF: içerik korunuyor, imzasız kayıtta dosya değiştirilmedi.');
                settleUdfSave(panelId);
                return;
            }
            if (stagedSignRequest) {
                setSignExportOverlay({
                    message:
                        stagedSignRequest.provider === 'mobile'
                            ? 'Mobil imza onayı bekleniyor…'
                            : 'Belge imzalanıyor…',
                    hint: 'İmzalı belge kaydedilene kadar lütfen bekleyin.',
                });
            }
            const signatureOptions = stagedSignRequest
                ? {
                      enabled: true,
                      signer: new UyapIpcSigner(
                          stagedSignRequest,
                          process.env.NODE_ENV === 'development',
                          isUyapDebugEnabled(),
                      ),
                      writeManifestJson: true,
                      failOnSigningError: true,
                  }
                : undefined;
            uyapDebugLog('udf-panel', 'saving UDF file', {
                panelId,
                documentId,
                hasStagedSignRequest: Boolean(stagedSignRequest),
                filePath,
                isUyapTemplateProtected,
            });
            const bytes = await buildSaveBytes(signatureOptions);
            await FileSystemService.writeFileBinary(filePath, bytes);
            await refreshAfterWrite(bytes, documentId, fileName || 'Belge.udf', filePath);
            if (signatureOptions?.enabled) {
                toast.success('e-imzala tamamlandı');
            } else {
                uyapDebugLog('udf-panel', 'save completed without signer (staged pin missing)', {
                    panelId,
                    documentId,
                });
            }
            setEditorSaveState('saved');
            settleUdfSave(panelId);
        } catch (e: unknown) {
            uyapDebugLog('udf-panel', 'save failed', {
                panelId,
                documentId,
                error: e instanceof Error ? e.message : String(e),
            });
            console.warn('UDF save failed', e);
            const message = signingAttempt ? mapUyapSigningErrorMessage(e) : formatSaveErrorMessage(e);
            if (signingAttempt) {
                toastUyapSigningError(e);
            } else {
                toast.error('UDF kaydedilemedi', { description: message });
            }
            setEditorSaveState('error', message);
            settleUdfSave(panelId, e);
        } finally {
            setIsSaving(false);
            setSignExportOverlay(null);
        }
    }, [
        buildSaveBytes,
        documentId,
        fileName,
        filePath,
        isSaving,
        isUyapTemplateProtected,
        panelId,
        refreshAfterWrite,
        setEditorSaveState,
        setSignExportOverlay,
    ]);

    const handleSaveAs = React.useCallback(async () => {
        if (isSaving) {
            settleUdfSaveAs(panelId, new Error('Kayıt zaten devam ediyor.'));
            return;
        }
        if (!editorRef.current && !isUyapTemplateProtected) {
            const saveError = new Error('Editör hazır değil.');
            toast.error(saveError.message);
            settleUdfSaveAs(panelId, saveError);
            return;
        }
        try {
            const targetPath = await FileSystemService.showSaveUdfDialog({
                suggestedFileName: fileName || 'Belge.udf',
                defaultDirectory: parentDirectory(filePath),
            });
            if (!targetPath) {
                settleUdfSaveAs(panelId);
                return;
            }
            if (targetPath === filePath) {
                await handleSave();
                settleUdfSaveAs(panelId);
                return;
            }
            setIsSaving(true);
            setEditorSaveState('saving');
            uyapDebugLog('udf-panel', 'save-as UDF file', { panelId, documentId, filePath, targetPath });
            const bytes = await buildSaveBytes();
            await FileSystemService.writeFileBinary(targetPath, bytes);
            const newName = basenameFromPath(targetPath);
            const newDocumentId = `udf:${encodeURIComponent(targetPath)}`;
            await refreshAfterWrite(bytes, newDocumentId, newName, targetPath);
            retargetUdfEditorTab(filePath, targetPath, newName);
            toast.success('Belge farklı kaydedildi');
            setEditorSaveState('saved');
            settleUdfSaveAs(panelId);
        } catch (e: unknown) {
            uyapDebugLog('udf-panel', 'save-as failed', {
                panelId,
                documentId,
                error: e instanceof Error ? e.message : String(e),
            });
            console.warn('UDF save-as failed', e);
            const message = e instanceof Error ? e.message : 'Farklı kaydet başarısız.';
            toast.error(message);
            setEditorSaveState('error', message);
            settleUdfSaveAs(panelId, e);
        } finally {
            setIsSaving(false);
            setSignExportOverlay(null);
        }
    }, [
        buildSaveBytes,
        documentId,
        fileName,
        filePath,
        handleSave,
        isSaving,
        isUyapTemplateProtected,
        panelId,
        refreshAfterWrite,
        retargetUdfEditorTab,
        setEditorSaveState,
        setSignExportOverlay,
    ]);

    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey)) return;
            if (e.key.toLowerCase() === 's' && e.shiftKey) {
                e.preventDefault();
                void handleSaveAs();
                return;
            }
            if (e.key.toLowerCase() === 's') {
                e.preventDefault();
                void handleSave();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [handleSave, handleSaveAs]);

    React.useEffect(() => {
        const onRequested = (event: Event) => {
            const detail = (event as CustomEvent<{ panelId?: string }>).detail;
            if (detail?.panelId !== panelId) return;
            void handleSave();
        };
        window.addEventListener('udfix:request-save-udf', onRequested as EventListener);
        return () => {
            window.removeEventListener('udfix:request-save-udf', onRequested as EventListener);
        };
    }, [handleSave, panelId]);

    React.useEffect(() => {
        const onRequested = (event: Event) => {
            const detail = (event as CustomEvent<{ panelId?: string }>).detail;
            if (detail?.panelId !== panelId) return;
            void handleSaveAs();
        };
        window.addEventListener('udfix:request-save-as-udf', onRequested as EventListener);
        return () => {
            window.removeEventListener('udfix:request-save-as-udf', onRequested as EventListener);
        };
    }, [handleSaveAs, panelId]);

    if (isLoading) {
        return (
            <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                UDF yükleniyor...
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full w-full flex items-center justify-center text-sm text-destructive">{error}</div>
        );
    }

    return (
        <div className="h-full w-full flex flex-col min-h-0 bg-background">
            {isUyapTemplateProtected ? (
                <div className="px-4 py-2 text-xs border-b border-amber-200/80 bg-amber-50 text-amber-950 dark:border-white/10 dark:bg-amber-500/10 dark:text-amber-100">
                    Bu UDF, UYAP tarafından doldurulan şablon alanları içeriyor. İçerik kilitlendi; belge yalnızca
                    olduğu gibi e-imzalanıp kaydedilir.
                </div>
            ) : null}
            <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0">
                    <UdfixEditor
                        documentId={documentId}
                        readOnly={isUyapTemplateProtected}
                        udfSignatureMeta={udfSignatureMeta}
                        onEditorReady={handleEditorReady}
                    />
                </div>
                {uyapVerificationMeta ? <UyapVerificationBand meta={uyapVerificationMeta} /> : null}
            </div>
        </div>
    );
};

export default UdfFileEditorPanel;
