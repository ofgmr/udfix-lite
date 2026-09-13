import {
    formatUdfSignatureSignerNames,
    getUdfSignatureSignerNames,
    type UdfSignatureMetadata,
    type UdfSignatureSigner,
} from './udfSignatureState';

export type UdfSignatureBadgeViewModel = {
    visible: boolean;
    text: string;
    title: string;
};

export type UdfSignatureBadgeSignerRow = {
    signerName: string;
    certificateValidUntilLabel: string | null;
};

export type UdfSignatureBadgeDetailViewModel = {
    visible: boolean;
    signerNames: string[];
    signers: UdfSignatureBadgeSignerRow[];
    signedAtLabel: string | null;
    certificateValidUntilLabel: string | null;
};

function formatSignatureDateTime(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const parsed = new Date(iso);
    if (!Number.isFinite(parsed.getTime())) return null;
    return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

function formatCertificateValidUntil(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const parsed = new Date(iso);
    if (!Number.isFinite(parsed.getTime())) return null;
    return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(parsed);
}

function buildSignerRows(metadata: UdfSignatureMetadata): UdfSignatureBadgeSignerRow[] {
    if (Array.isArray(metadata.signers) && metadata.signers.length > 0) {
        return metadata.signers.map((signer: UdfSignatureSigner) => ({
            signerName: signer.signerName,
            certificateValidUntilLabel: formatCertificateValidUntil(signer.certificateValidUntilIso),
        }));
    }

    return getUdfSignatureSignerNames(metadata).map((signerName) => ({
        signerName,
        certificateValidUntilLabel: formatCertificateValidUntil(metadata.certificateValidUntilIso),
    }));
}

export function getUdfSignatureBadgeDetailViewModel(
    metadata: UdfSignatureMetadata | null,
): UdfSignatureBadgeDetailViewModel {
    const isSigned = metadata?.signed === true;
    if (!isSigned) {
        return {
            visible: false,
            signerNames: [],
            signers: [],
            signedAtLabel: null,
            certificateValidUntilLabel: null,
        };
    }

    const signerNames = getUdfSignatureSignerNames(metadata);
    const signers = buildSignerRows(metadata);
    const singleValidity =
        signers.length === 1 ? signers[0]?.certificateValidUntilLabel ?? null : null;

    return {
        visible: true,
        signerNames: signerNames.length > 0 ? signerNames : ['Bilinmiyor'],
        signers: signers.length > 0 ? signers : [{ signerName: 'Bilinmiyor', certificateValidUntilLabel: null }],
        signedAtLabel: formatSignatureDateTime(metadata?.signedAtIso),
        certificateValidUntilLabel: singleValidity,
    };
}

export function getUdfSignatureBadgeViewModel(
    metadata: UdfSignatureMetadata | null,
): UdfSignatureBadgeViewModel {
    const detail = getUdfSignatureBadgeDetailViewModel(metadata);
    if (!detail.visible) {
        return {
            visible: false,
            text: '',
            title: 'İmzasız',
        };
    }

    const titleParts = [formatUdfSignatureSignerNames(detail.signerNames)];
    if (detail.signedAtLabel) titleParts.push(detail.signedAtLabel);
    if (detail.certificateValidUntilLabel) {
        titleParts.push(`Geçerlilik: ${detail.certificateValidUntilLabel}`);
    }

    return {
        visible: true,
        text: '[e-imzalı]',
        title: titleParts.join(' · '),
    };
}
