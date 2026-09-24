import QRCode from 'qrcode';
import { parseHtmlFragment } from './sanitizeDocumentHtml';
import {
    buildUyapVerificationNoticeText,
    buildUyapVerificationQrPayload,
    countUyapVerificationNoticeOccurrences,
    htmlContainsUyapVerification,
    stripUyapVerificationDom,
    stripUyapVerificationFromHtml,
    type UyapVerificationMeta,
} from './uyapVerification';

/** Marks a QR block temporarily appended to live ProseMirror DOM during PDF export. */
export const PDF_EXPORT_TEMP_VERIFICATION_ATTR = 'data-nomai-pdf-export-verification';

type ProseMirrorDomObserver = {
    stop?: () => void;
    start?: () => void;
    flush?: () => void;
};

/**
 * Pause ProseMirror's mutation observer so a temp export pin is not adopted into
 * the document (which would persist through autosave and stack on re-export).
 */
export function pauseProseMirrorDomObserver(view: { domObserver?: ProseMirrorDomObserver } | null | undefined): () => void {
    const observer = view?.domObserver;
    if (!observer?.stop || !observer?.start) return () => {};
    observer.flush?.();
    observer.stop();
    let resumed = false;
    return () => {
        if (resumed) return;
        resumed = true;
        observer.start();
    };
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export async function uyapVerificationQrDataUrl(meta: UyapVerificationMeta): Promise<string> {
    const payload = buildUyapVerificationQrPayload(meta);
    return QRCode.toDataURL(payload, {
        margin: 1,
        width: 132,
        errorCorrectionLevel: 'M',
    });
}

/**
 * UYAP PDF çıktısındaki gibi metin + QR tablosu (editör, viewer, PDF export).
 */
export async function buildUyapVerificationHtmlBlock(meta: UyapVerificationMeta): Promise<string> {
    const notice = escapeHtml(buildUyapVerificationNoticeText(meta));
    const qrSrc = await uyapVerificationQrDataUrl(meta);
    return `
<section class="uyap-verification-block" data-uyap-verification="true" style="margin-top:2rem;page-break-inside:avoid;">
  <table role="presentation" style="width:100%;border-collapse:collapse;border:none;">
    <tr>
      <td style="vertical-align:middle;padding:8px 12px 8px 0;border:none;font-family:'Times New Roman',Times,serif;font-size:9pt;line-height:1.35;text-align:justify;color:#000;">
        ${notice}
      </td>
      <td style="width:140px;vertical-align:middle;text-align:center;border:none;padding:4px;">
        <img src="${qrSrc}" alt="UYAP belge doğrulama QR kodu" width="120" height="120" style="display:inline-block;width:120px;height:120px;" />
      </td>
    </tr>
  </table>
</section>`;
}

export function htmlHasUyapVerificationQr(html: string): boolean {
    if (countUyapVerificationNoticeOccurrences(html) > 0) return true;
    return /data-uyap-verification\s*=\s*["']true["']/i.test(html) && /data:image\/png;base64,/i.test(html);
}

export async function appendUyapVerificationToHtml(
    html: string,
    meta: UyapVerificationMeta | null | undefined,
): Promise<string> {
    if (!meta?.accessToken?.trim()) return html;
    const block = await buildUyapVerificationHtmlBlock(meta);
    const trimmed = stripUyapVerificationFromHtml(html || '');
    if (!trimmed) return block.trim();
    if (trimmed.endsWith('</div>')) {
        return trimmed.replace(/<\/div>\s*$/, `${block}</div>`);
    }
    return `${trimmed}${block}`;
}

export function removeTemporaryUyapVerificationBlock(pmRoot: HTMLElement | null | undefined): void {
    stripUyapVerificationDom(pmRoot);
    if (!pmRoot) return;
    pmRoot.querySelectorAll(`[${PDF_EXPORT_TEMP_VERIFICATION_ATTR}="true"]`).forEach((el) => el.remove());
}

/**
 * Keep the export-only QR node as `pmRoot.lastElementChild` so PaginationPlus
 * `calculatePageCount` measures overflow against the last breaker.
 */
export function pinTemporaryUyapVerificationBlock(pmRoot: HTMLElement, block: HTMLElement): void {
    if (block.parentNode !== pmRoot || pmRoot.lastElementChild !== block) {
        pmRoot.appendChild(block);
    }
}

/**
 * Parse a verification HTML block and append it to the live ProseMirror root.
 * Caller must pause the PM mutation observer — otherwise ProseMirror adopts the
 * node into document JSON and copies accumulate on re-export.
 * Returns null when the fragment is empty.
 */
export function insertTemporaryUyapVerificationBlock(
    pmRoot: HTMLElement,
    blockHtml: string,
): HTMLElement | null {
    removeTemporaryUyapVerificationBlock(pmRoot);
    if (htmlContainsUyapVerification(pmRoot.innerHTML)) {
        stripUyapVerificationDom(pmRoot);
    }
    const wrap = parseHtmlFragment(blockHtml);
    if (!wrap) return null;
    const block =
        (wrap.querySelector('[data-uyap-verification]') as HTMLElement | null) ??
        (wrap.firstElementChild as HTMLElement | null);
    if (!block) return null;
    block.setAttribute(PDF_EXPORT_TEMP_VERIFICATION_ATTR, 'true');
    block.setAttribute('contenteditable', 'false');
    block.classList.add('ProseMirror-widget');
    pmRoot.appendChild(block);
    return block;
}
