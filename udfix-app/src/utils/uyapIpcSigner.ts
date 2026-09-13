import type {
    UyapDetachedSignRequest,
    UyapDetachedSignResult,
    UyapDetachedSignerAdapter,
    UyapSignatureProviderKind,
} from './uyapSignature';
import type { UyapSignRequest } from './uyapTokenSession';
import { normalizeUyapSigningInvokeError } from './udfSignatureState';

export class UyapIpcSigner implements UyapDetachedSignerAdapter {
    readonly providerId: string;
    readonly providerKind: UyapSignatureProviderKind;
    private readonly signRequest: UyapSignRequest;
    private readonly verifyWithOpenSsl: boolean;
    private readonly debug: boolean;

    constructor(signRequest: UyapSignRequest, verifyWithOpenSsl = false, debug = false) {
        this.signRequest = signRequest;
        this.providerId =
            signRequest.provider === 'mobile'
                ? 'udfix.main-ipc-mobile-signer'
                : 'udfix.main-ipc-command-signer';
        this.providerKind = signRequest.provider === 'mobile' ? 'mobil-imza' : 'java-sidecar';
        this.verifyWithOpenSsl = verifyWithOpenSsl;
        this.debug = debug;
    }

    async signDetached(request: UyapDetachedSignRequest): Promise<UyapDetachedSignResult> {
        if (this.signRequest.provider === 'token' && !this.signRequest.tokenPin) {
            throw new Error('Token PIN bulunamadı. Lütfen tekrar girin.');
        }
        if (
            this.signRequest.provider === 'mobile' &&
            (!this.signRequest.gsmNo || !this.signRequest.tcKimlikNo || !this.signRequest.operator)
        ) {
            throw new Error('Mobil imza bilgileri eksik.');
        }
        if (!window.electron?.invoke) {
            throw new Error('Electron IPC kullanılamadı; imzalama servisine erişilemiyor.');
        }
        let response: {
            signatureBytes?: number[];
            notes?: string[];
            signerName?: string;
            signedAtIso?: string;
            certificateValidUntilIso?: string;
        } | null;
        try {
            response = (await window.electron.invoke('uyap-sign-detached', {
                contentXml: request.contentXml,
                signRequest: this.signRequest,
                profile: {
                    standard: request.profile.standard,
                    digestAlgorithm: request.profile.digestAlgorithm,
                },
                verifyWithOpenSsl: this.verifyWithOpenSsl,
                debug: this.debug,
            })) as typeof response;
        } catch (error) {
            throw normalizeUyapSigningInvokeError(error);
        }

        const signatureBytes = Array.isArray(response?.signatureBytes)
            ? Uint8Array.from(response.signatureBytes)
            : null;
        return {
            signatureBytes,
            notes: Array.isArray(response?.notes) ? response.notes : [],
            signerName: typeof response?.signerName === 'string' ? response.signerName : undefined,
            signedAtIso: typeof response?.signedAtIso === 'string' ? response.signedAtIso : undefined,
            certificateValidUntilIso:
                typeof response?.certificateValidUntilIso === 'string'
                    ? response.certificateValidUntilIso
                    : undefined,
        };
    }
}
