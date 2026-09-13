export type UyapSignatureStandard = 'CAdES-BES' | 'CAdES-T' | 'CAdES-XL' | 'XAdES-BES' | 'XAdES-T';

export type UyapSignatureLevel = 'baseline-b' | 'timestamped' | 'long-term';

export type UyapSignatureProviderKind = 'local-csp' | 'mobil-imza' | 'java-sidecar' | 'placeholder';

export interface UyapSignatureProfile {
    standard: UyapSignatureStandard;
    level: UyapSignatureLevel;
    detached: true;
    digestAlgorithm: 'SHA-256' | 'SHA-384' | 'SHA-512';
}

export interface UyapSignatureManifest {
    profile: UyapSignatureProfile;
    signerProvider: string;
    signerKind: UyapSignatureProviderKind;
    signerName?: string;
    createdAtIso: string;
    signedAtIso?: string;
    certificateValidUntilIso?: string;
    contentXmlSha256Base64: string;
    signed: boolean;
    notes: string[];
}

export interface UyapDetachedSignRequest {
    contentXml: string;
    contentXmlSha256Base64: string;
    profile: UyapSignatureProfile;
}

export interface UyapDetachedSignResult {
    signatureBytes: Uint8Array | null;
    notes?: string[];
    signerName?: string;
    signedAtIso?: string;
    certificateValidUntilIso?: string;
}

export interface UyapDetachedSignerAdapter {
    providerId: string;
    providerKind: UyapSignatureProviderKind;
    signDetached(request: UyapDetachedSignRequest): Promise<UyapDetachedSignResult>;
}

export interface UyapSignatureExportOptions {
    enabled?: boolean;
    profile?: UyapSignatureProfile;
    signer?: UyapDetachedSignerAdapter;
    writeManifestJson?: boolean;
    failOnSigningError?: boolean;
    keepExistingSignFileWhenUnsigned?: boolean;
    verifyWithOpenSsl?: boolean;
}

const DEFAULT_PROFILE: UyapSignatureProfile = {
    standard: 'CAdES-BES',
    level: 'baseline-b',
    detached: true,
    digestAlgorithm: 'SHA-256',
};

function bytesToBase64(bytes: Uint8Array): string {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes).toString('base64');
    }
    let s = '';
    for (let i = 0; i < bytes.length; i += 1) {
        s += String.fromCharCode(bytes[i]);
    }
    return btoa(s);
}

export async function sha256Base64FromUtf8(input: string): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
        throw new Error('WebCrypto API kullanılamadı; SHA-256 özeti üretilemedi.');
    }
    const data = new TextEncoder().encode(input);
    const digest = await subtle.digest('SHA-256', data);
    return bytesToBase64(new Uint8Array(digest));
}

export function resolveUyapSignatureProfile(
    input?: UyapSignatureProfile | null,
): UyapSignatureProfile {
    return {
        ...DEFAULT_PROFILE,
        ...(input ?? {}),
        detached: true,
    };
}

export class PlaceholderUyapSigner implements UyapDetachedSignerAdapter {
    readonly providerId = 'udfix.placeholder-signer';
    readonly providerKind: UyapSignatureProviderKind = 'placeholder';

    async signDetached(_request: UyapDetachedSignRequest): Promise<UyapDetachedSignResult> {
        return {
            signatureBytes: null,
            notes: [
                'Kriptografik imzalama bu akışta etkin değil.',
                'Üretim için local CSP, mobil imza veya Java sidecar signer adapter bağlanmalı.',
            ],
        };
    }
}

export function createUyapSignatureManifest(input: {
    profile: UyapSignatureProfile;
    signerProvider: string;
    signerKind: UyapSignatureProviderKind;
    signerName?: string;
    signedAtIso?: string;
    certificateValidUntilIso?: string;
    contentXmlSha256Base64: string;
    signed: boolean;
    notes?: string[];
}): UyapSignatureManifest {
    return {
        profile: input.profile,
        signerProvider: input.signerProvider,
        signerKind: input.signerKind,
        signerName: input.signerName,
        createdAtIso: new Date().toISOString(),
        signedAtIso: input.signedAtIso,
        certificateValidUntilIso: input.certificateValidUntilIso,
        contentXmlSha256Base64: input.contentXmlSha256Base64,
        signed: input.signed,
        notes: input.notes ?? [],
    };
}

export function buildOpenSslDetachedVerifyCommand(contentPath: string, signaturePath: string): string {
    return `openssl smime -verify -inform DER -in "${signaturePath}" -content "${contentPath}" -noverify`;
}
