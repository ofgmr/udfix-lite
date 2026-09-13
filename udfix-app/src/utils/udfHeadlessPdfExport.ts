import { Editor } from '@tiptap/core';

import { createUdfixEditorExtensions } from '../components/editor/udfixEditorExtensions';
import { EDITOR_PAGE_HEIGHT_PX, EDITOR_PAGE_WIDTH_PX } from './editorLayout';
import { buildPdfExportPayloadFromEditor } from './exportUtils';
import { resolveUdfEditorInitialContent } from './udfEditorContent';
import { applyUyapImportMetaToEditor } from './uyapImportApply';
import { parseUyapImportMeta } from './uyapImportMeta';
import { getElectronInvoke } from './electronBridge';
import type { UyapVerificationMeta } from './uyapVerification';

const BATCH_EDITOR_HOST_ID = 'udfix-udf-batch-pdf-host';

function waitTwoFrames(): Promise<void> {
    return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
}

function bytesFromIpcPdf(data: unknown): Uint8Array {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (Array.isArray(data)) return Uint8Array.from(data);
    if (data && typeof data === 'object' && 'type' in data && (data as { type: string }).type === 'Buffer') {
        const buf = data as unknown as { data: number[] };
        return Uint8Array.from(buf.data ?? []);
    }
    return new Uint8Array(0);
}

function createHeadlessEditorHost(): HTMLElement {
    const existing = document.getElementById(BATCH_EDITOR_HOST_ID);
    existing?.remove();

    const host = document.createElement('div');
    host.id = BATCH_EDITOR_HOST_ID;
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
        'position:fixed;left:0;top:0;width:960px;height:90vh;overflow:auto;z-index:-1;opacity:0;pointer-events:none;';
    host.innerHTML = `
      <div class="udfix-editor-zoom-shell" style="zoom:1;margin:0 auto;width:${EDITOR_PAGE_WIDTH_PX}px;">
        <div class="a4-page" style="min-height:${EDITOR_PAGE_HEIGHT_PX}px;position:relative;">
          <div class="udfix-batch-editor-slot" style="min-height:${EDITOR_PAGE_HEIGHT_PX}px;"></div>
        </div>
      </div>`;
    document.body.appendChild(host);
    return host;
}

async function waitForEditorView(editor: Editor, maxAttempts = 40): Promise<void> {
    for (let i = 0; i < maxAttempts; i += 1) {
        if (!editor.isDestroyed && editor.view?.dom) {
            await waitTwoFrames();
            return;
        }
        await waitTwoFrames();
    }
    throw new Error('Editör görünümü hazırlanamadı.');
}

/**
 * Renders UDF `content.xml` through the same PaginationPlus + PDF pipeline as manual editor export.
 */
export async function renderUdfContentXmlToPdfBytes(
    contentXml: string,
    options: { title: string; verificationMeta?: UyapVerificationMeta | null },
): Promise<Uint8Array> {
    const initial = await resolveUdfEditorInitialContent(contentXml);
    const host = createHeadlessEditorHost();
    const slot = host.querySelector('.udfix-batch-editor-slot');
    if (!slot) {
        host.remove();
        throw new Error('Toplu PDF editör alanı oluşturulamadı.');
    }

    const element = document.createElement('div');
    slot.appendChild(element);

    const batchDocId = `udf-batch-pdf:${Date.now()}`;
    const editor = new Editor({
        element,
        extensions: createUdfixEditorExtensions(batchDocId),
        editable: false,
        content: initial,
    });

    try {
        await waitForEditorView(editor);
        const importMeta = await parseUyapImportMeta(contentXml);
        await applyUyapImportMetaToEditor(editor, importMeta);
        await waitTwoFrames();
        const { documentHtml, printToPdfOptions } = await buildPdfExportPayloadFromEditor(editor, {
            title: options.title,
            verificationMeta: options.verificationMeta ?? null,
        });
        const invoke = getElectronInvoke();
        const pdfBuffer = await invoke('convert-html-to-pdf', {
            documentHtml,
            printToPdfOptions,
        });
        const pdfBytes = bytesFromIpcPdf(pdfBuffer);
        if (pdfBytes.byteLength === 0) {
            throw new Error('PDF oluşturulamadı (boş çıktı).');
        }
        return pdfBytes;
    } finally {
        editor.destroy();
        host.remove();
    }
}
