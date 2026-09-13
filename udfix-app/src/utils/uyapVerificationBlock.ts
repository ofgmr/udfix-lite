import QRCode from 'qrcode';
import {
    buildUyapVerificationNoticeText,
    buildUyapVerificationQrPayload,
    stripUyapVerificationFromHtml,
    type UyapVerificationMeta,
} from './uyapVerification';

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
    return /data-uyap-verification\s*=\s*["']true["']/i.test(html) && /data:image\/png;base64,/i.test(html);
}

export async function appendUyapVerificationToHtml(
    html: string,
    meta: UyapVerificationMeta | null | undefined,
): Promise<string> {
    if (!meta?.accessToken?.trim()) return html;
    if (htmlHasUyapVerificationQr(html)) return html;
    const block = await buildUyapVerificationHtmlBlock(meta);
    const trimmed = stripUyapVerificationFromHtml(html || '');
    if (!trimmed) return block.trim();
    if (trimmed.endsWith('</div>')) {
        return trimmed.replace(/<\/div>\s*$/, `${block}</div>`);
    }
    return `${trimmed}${block}`;
}
