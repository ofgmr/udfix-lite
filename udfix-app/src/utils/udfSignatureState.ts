export type UdfSignatureSigner = {
    signerName: string;
    certificateValidUntilIso?: string | null;
    signedAtIso?: string | null;
};

export type UdfSignatureMetadata = {
    signed: boolean;
    /** Joined display string for tooltips (all signers). */
    signerName: string | null;
    /** Every certificate holder found in `sign.sgn` (or manifest). */
    signerNames: string[];
    signers?: UdfSignatureSigner[];
    signedAtIso: string | null;
    certificateValidUntilIso: string | null;
    invalidatedAtIso?: string | null;
};

const STORAGE_PREFIX = 'udfix-udf-signature-meta-';
const SIGNER_NAME_JOINER = ' · ';

function keyForDocument(documentId: string): string {
    return `${STORAGE_PREFIX}${documentId}`;
}

function emitSignatureStateChange(documentId: string): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
        new CustomEvent<{ documentId: string }>('udfix:signature-meta-updated', {
            detail: { documentId },
        }),
    );
}

function readManifestSignerNames(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}

export function formatUdfSignatureSignerNames(names: string[]): string {
    return names.join(SIGNER_NAME_JOINER);
}

export function getUdfSignatureSignerNames(metadata: UdfSignatureMetadata | null | undefined): string[] {
    if (!metadata?.signed) return [];

    if (Array.isArray(metadata.signerNames) && metadata.signerNames.length > 0) {
        return metadata.signerNames.map((name) => name.trim()).filter((name) => name.length > 0);
    }

    if (Array.isArray(metadata.signers) && metadata.signers.length > 0) {
        return metadata.signers
            .map((signer) => signer.signerName?.trim() ?? '')
            .filter((name) => name.length > 0);
    }

    const legacy = metadata.signerName?.trim();
    return legacy ? [legacy] : [];
}

export function normalizeUdfSignatureMetadata(
    partial: Partial<UdfSignatureMetadata> & { signed: boolean },
): UdfSignatureMetadata {
    const fromSignersArray =
        Array.isArray(partial.signers) && partial.signers.length > 0
            ? partial.signers
                  .map((signer) => ({
                      signerName: signer.signerName?.trim() ?? '',
                      certificateValidUntilIso: signer.certificateValidUntilIso ?? null,
                      signedAtIso: signer.signedAtIso ?? null,
                  }))
                  .filter((signer) => signer.signerName.length > 0)
            : [];

    let signerNames = readManifestSignerNames(partial.signerNames);
    if (signerNames.length === 0 && fromSignersArray.length > 0) {
        signerNames = fromSignersArray.map((signer) => signer.signerName);
    }
    if (signerNames.length === 0 && typeof partial.signerName === 'string' && partial.signerName.trim()) {
        signerNames = [partial.signerName.trim()];
    }

    const signers =
        fromSignersArray.length > 0
            ? fromSignersArray
            : signerNames.map((signerName) => ({
                  signerName,
                  certificateValidUntilIso: partial.certificateValidUntilIso ?? null,
                  signedAtIso: partial.signedAtIso ?? null,
              }));

    const signerName =
        signerNames.length > 0 ? formatUdfSignatureSignerNames(signerNames) : partial.signerName?.trim() ?? null;

    return {
        signed: partial.signed === true,
        signerName,
        signerNames,
        signers: signers.length > 0 ? signers : undefined,
        signedAtIso: typeof partial.signedAtIso === 'string' ? partial.signedAtIso : null,
        certificateValidUntilIso:
            typeof partial.certificateValidUntilIso === 'string' ? partial.certificateValidUntilIso : null,
        invalidatedAtIso: typeof partial.invalidatedAtIso === 'string' ? partial.invalidatedAtIso : null,
    };
}

export function readUdfSignatureMetadata(documentId: string): UdfSignatureMetadata | null {
    const safeId = String(documentId ?? '').trim();
    if (!safeId) return null;
    const raw = localStorage.getItem(keyForDocument(safeId));
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<UdfSignatureMetadata>;
        return normalizeUdfSignatureMetadata({
            signed: parsed.signed === true,
            signerName: typeof parsed.signerName === 'string' ? parsed.signerName : null,
            signerNames: Array.isArray(parsed.signerNames) ? parsed.signerNames : [],
            signers: Array.isArray(parsed.signers) ? parsed.signers : undefined,
            signedAtIso: typeof parsed.signedAtIso === 'string' ? parsed.signedAtIso : null,
            certificateValidUntilIso:
                typeof parsed.certificateValidUntilIso === 'string' ? parsed.certificateValidUntilIso : null,
            invalidatedAtIso: typeof parsed.invalidatedAtIso === 'string' ? parsed.invalidatedAtIso : null,
        });
    } catch {
        return null;
    }
}

export function writeUdfSignatureMetadata(documentId: string, metadata: UdfSignatureMetadata): void {
    const safeId = String(documentId ?? '').trim();
    if (!safeId) return;
    const normalized = normalizeUdfSignatureMetadata(metadata);
    localStorage.setItem(keyForDocument(safeId), JSON.stringify(normalized));
    emitSignatureStateChange(safeId);
}

export function clearUdfSignatureMetadata(documentId: string): void {
    const safeId = String(documentId ?? '').trim();
    if (!safeId) return;
    localStorage.removeItem(keyForDocument(safeId));
    emitSignatureStateChange(safeId);
}

export function invalidateUdfSignatureIfPresent(documentId: string): boolean {
    const current = readUdfSignatureMetadata(documentId);
    if (!current?.signed) return false;
    writeUdfSignatureMetadata(documentId, {
        ...current,
        signed: false,
        invalidatedAtIso: new Date().toISOString(),
    });
    return true;
}

/** IPC-safe tag prefix for UyapSigningError codes (see electron/main.ts). */
export const UYAP_SIGN_ERROR_TAG = '[[UYAP_SIGN:';

export type UyapSigningErrorCode =
    | 'SIGNER_NOT_CONFIGURED'
    | 'SIGNER_NOT_FOUND'
    | 'INVALID_TOKEN_PIN'
    | 'TOKEN_NOT_PRESENT'
    | 'TOKEN_LOCKED'
    | 'CERTIFICATE_NOT_FOUND'
    | 'CERTIFICATE_INVALID'
    | 'CERTIFICATE_EXPIRED'
    | 'MOBILE_APPROVAL_REJECTED'
    | 'MOBILE_TIMEOUT'
    | 'MOBILE_OPERATOR_UNREACHABLE'
    | 'MOBILE_CONFIG_INVALID'
    | 'LICENSE_INVALID'
    | 'SIGN_OUTPUT_MISSING'
    | 'SIGN_COMMAND_FAILED';

const UYAP_SIGN_CODE_MESSAGES: Record<UyapSigningErrorCode, string> = {
    SIGNER_NOT_CONFIGURED: 'İmzalayıcı yapılandırılmamış',
    SIGNER_NOT_FOUND: 'İmzalayıcı bulunamadı',
    INVALID_TOKEN_PIN: 'Şifre yanlış',
    TOKEN_NOT_PRESENT: 'Cihaz Bulunamadı',
    TOKEN_LOCKED: 'Token kilitli. Kart üzerinden PIN kilidini açın.',
    CERTIFICATE_NOT_FOUND: 'Sertifika bulunamadı',
    CERTIFICATE_INVALID: 'Sertifika geçersiz',
    CERTIFICATE_EXPIRED: 'Sertifika tarihi geçmiş',
    MOBILE_APPROVAL_REJECTED: 'Mobil imza reddedildi',
    MOBILE_TIMEOUT: 'Mobil imza zaman aşımına uğradı',
    MOBILE_OPERATOR_UNREACHABLE: 'Operatör servisine erişilemiyor',
    MOBILE_CONFIG_INVALID: 'Telefon numarası yanlış',
    LICENSE_INVALID: 'MA3 lisansı geçersiz veya eksik',
    SIGN_OUTPUT_MISSING: 'İmza dosyası üretilemedi',
    SIGN_COMMAND_FAILED: 'İmzalama başarısız',
};

export function formatUyapSigningIpcError(code: UyapSigningErrorCode, message: string): string {
    return `${UYAP_SIGN_ERROR_TAG}${code}]] ${message}`;
}

function includesAny(text: string, patterns: string[]): boolean {
    return patterns.some((pattern) => text.includes(pattern));
}

function extractRawErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim().length > 0) {
            return message;
        }
    }
    return 'İmzalama hatası';
}

/** Normalize Electron `ipcRenderer.invoke` rejections into a standard Error with UYAP tag preserved. */
export function normalizeUyapSigningInvokeError(error: unknown): Error {
    const raw = extractRawErrorMessage(error);
    if (error instanceof Error && error.message === raw) {
        return error;
    }
    return new Error(raw);
}

export function parseUyapSigningErrorCode(error: unknown): UyapSigningErrorCode | null {
    if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as { code?: unknown }).code;
        if (typeof code === 'string' && code in UYAP_SIGN_CODE_MESSAGES) {
            return code as UyapSigningErrorCode;
        }
    }
    const raw = extractRawErrorMessage(error);
    const match = raw.match(/\[\[UYAP_SIGN:([A-Z_]+)\]\]/);
    if (match && match[1] in UYAP_SIGN_CODE_MESSAGES) {
        return match[1] as UyapSigningErrorCode;
    }
    return null;
}

function stripUyapSigningErrorTag(raw: string): string {
    return raw.replace(/\[\[UYAP_SIGN:[A-Z_]+\]\]\s*/i, '').trim();
}

function mapUyapSigningErrorMessageFromPatterns(lowered: string): string | null {
    if (
        includesAny(lowered, [
            'pin yanlış',
            'pin yanlis',
            'şifre yanlış',
            'sifre yanlis',
            'invalid pin',
            'wrong pin',
            'incorrect pin',
            'ma3_err_pin',
            'token şifresi hatalı',
            'token sifresi hatali',
        ])
    ) {
        return 'Şifre yanlış';
    }

    if (
        includesAny(lowered, [
            'ckr_pin_locked',
            'pin locked',
            'pin kilit',
            'pin blocked',
        ])
    ) {
        return 'Token kilitli. Kart üzerinden PIN kilidini açın.';
    }

    if (
        includesAny(lowered, [
            'ma3_err_mobile_reject',
            'approval rejected',
            'kullanici reddetti',
            'kullanıcı reddetti',
            'mobil imza onayi reddedildi',
        ])
    ) {
        return 'Mobil imza reddedildi';
    }

    if (
        includesAny(lowered, [
            'ma3_err_mobile_timeout',
            'mobil imza onayi zaman asimina ugradi',
            'mobile approval timed out',
        ])
    ) {
        return 'Mobil imza zaman aşımına uğradı';
    }

    if (
        includesAny(lowered, [
            'ma3_err_mobile_operator',
            'operator endpoint',
            'operator mssp',
            'mssp unreachable',
            'connection refused',
            'could not send message',
        ])
    ) {
        return 'Operatör servisine erişilemiyor';
    }

    if (
        includesAny(lowered, [
            'ma3_err_mobile_config',
            'msisdn',
            'gsm',
            'telefon',
            'phone number',
            'invalid number',
            'numara',
            'unknown mobile operator',
            'operator required',
        ])
    ) {
        return 'Telefon numarası yanlış';
    }

    if (
        includesAny(lowered, [
            'token bulunamad',
            'token not found',
            'no terminal found',
            'no card',
            'kart bulunamad',
            'smartcard',
            'pkcs11',
            'turktrust',
            'akis',
            'ma3_err_token',
            'cihaz bulunamad',
            'okuyucu bulunamad',
        ])
    ) {
        return 'Cihaz Bulunamadı';
    }

    if (
        includesAny(lowered, [
            'certificate expired',
            'cert_expired',
            'ma3_err_certificate_expired',
            'notafter',
            'validity period',
            'tarihi geçmiş',
            'süresi dol',
        ])
    ) {
        return 'Sertifika tarihi geçmiş';
    }

    if (
        includesAny(lowered, [
            'no qualified certificate',
            'no certificate in smartcard',
            'certificate not found',
            'sertifika bulunamad',
        ])
    ) {
        return 'Sertifika bulunamadı';
    }

    if (
        includesAny(lowered, [
            'ma3_err_certificate',
            'certificate validation',
            'sertifika geçersiz',
            'sertifika gecersiz',
        ])
    ) {
        return 'Sertifika geçersiz';
    }

    if (includesAny(lowered, ['ma3_err_license', 'license xml', 'lisans'])) {
        return 'MA3 lisansı geçersiz veya eksik';
    }

    if (includesAny(lowered, ['signer not configured', 'imzalayıcı yapılandırılmamış'])) {
        return 'İmzalayıcı yapılandırılmamış';
    }

    if (includesAny(lowered, ['enoent', 'signer not found', 'imzalayıcı komut bulunamadı'])) {
        return 'İmzalayıcı bulunamadı';
    }

    if (includesAny(lowered, ['sign.sgn', 'sign_output_missing'])) {
        return 'İmza dosyası üretilemedi';
    }

    return null;
}

export type UyapSigningErrorPresentation = {
    summary: string;
    detail: string | null;
};

function cleanSigningDetailText(text: string): string {
    return text
        .replace(/^Error invoking remote method[^:]*:\s*/i, '')
        .replace(/^Error:\s*/i, '')
        .replace(/^java\.lang\.\w+:\s*/i, '')
        .replace(/\[\[UYAP_SIGN:[A-Z_]+\]\]\s*/i, '')
        .trim();
}

function extractSigningApiDetail(raw: string, stripped: string): string | null {
    const ma3Match = stripped.match(/MA3_ERR_[A-Z_]+:\s*(.+)/i) ?? raw.match(/MA3_ERR_[A-Z_]+:\s*(.+)/i);
    if (ma3Match?.[1]) {
        const cleaned = cleanSigningDetailText(ma3Match[1].split(/\r?\n/)[0] ?? '');
        if (cleaned.length > 0) {
            return cleaned;
        }
    }

    const signerExitMatch = raw.match(/Signer exited with code \d+\.\s*(.+)/is);
    if (signerExitMatch?.[1]) {
        const cleaned = cleanSigningDetailText(signerExitMatch[1].split(/\r?\n/)[0] ?? '');
        if (cleaned.length > 0 && !cleaned.toLowerCase().startsWith('signer exited with code')) {
            return cleaned;
        }
    }

    const cleanedStripped = cleanSigningDetailText(stripped);
    if (cleanedStripped.length > 0 && cleanedStripped !== stripped) {
        return cleanedStripped;
    }

    return null;
}

function resolveSigningSummary(error: unknown, raw: string, stripped: string): string | null {
    const code = parseUyapSigningErrorCode(error);
    if (code) {
        return UYAP_SIGN_CODE_MESSAGES[code];
    }

    const fromPatterns = mapUyapSigningErrorMessageFromPatterns(stripped.toLowerCase());
    if (fromPatterns) {
        return fromPatterns;
    }

    return null;
}

function pickSigningDetailForPresentation(summary: string, candidates: Array<string | null | undefined>): string | null {
    for (const candidate of candidates) {
        if (!candidate) continue;
        const cleaned = cleanSigningDetailText(candidate);
        if (!cleaned) continue;
        const loweredSummary = summary.toLowerCase();
        const loweredDetail = cleaned.toLowerCase();
        if (loweredDetail === loweredSummary) continue;
        if (loweredSummary.includes(loweredDetail)) continue;
        return cleaned;
    }
    return null;
}

function composeSigningUserMessage(summary: string, detail: string | null): string {
    if (!detail) {
        return summary;
    }
    return `${summary} — ${detail}`;
}

export function resolveUyapSigningErrorPresentation(error: unknown): UyapSigningErrorPresentation {
    const raw = extractRawErrorMessage(error);
    const stripped = stripUyapSigningErrorTag(raw);
    const apiDetail = extractSigningApiDetail(raw, stripped);
    const summary = resolveSigningSummary(error, raw, stripped);

    if (summary) {
        return {
            summary,
            detail: pickSigningDetailForPresentation(summary, [apiDetail, stripped, raw]),
        };
    }

    const fallbackDetail = pickSigningDetailForPresentation('', [apiDetail, stripped, raw]);
    if (fallbackDetail) {
        return {
            summary: fallbackDetail,
            detail: null,
        };
    }

    return {
        summary: raw.trim() || 'İmzalama hatası',
        detail: null,
    };
}

export function mapUyapSigningErrorMessage(error: unknown): string {
    const { summary, detail } = resolveUyapSigningErrorPresentation(error);
    return composeSigningUserMessage(summary, detail);
}
