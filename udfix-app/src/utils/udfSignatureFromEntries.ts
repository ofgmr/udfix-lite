import { FileSystemService } from '../services/fileSystemService';
import {
    clearUdfSignatureMetadata,
    normalizeUdfSignatureMetadata,
    writeUdfSignatureMetadata,
    type UdfSignatureMetadata,
    type UdfSignatureSigner,
} from './udfSignatureState';

const MANIFEST_NAMES = ['udfix-signature-manifest.json', 'nomai-signature-manifest.json'] as const;

function readManifestString(raw: unknown): string | null {
    return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
}

function readManifestSignerNames(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}

function metadataFromManifest(bytes: Uint8Array): Partial<UdfSignatureMetadata> | null {
    try {
        const manifestRaw = new TextDecoder().decode(bytes);
        const manifest = JSON.parse(manifestRaw) as {
            signed?: boolean;
            signerName?: string;
            signerNames?: string[];
            signedAtIso?: string;
            certificateValidUntilIso?: string;
        };
        const signerNames = readManifestSignerNames(manifest.signerNames);
        const legacyName = readManifestString(manifest.signerName);
        return {
            signed: manifest.signed !== false,
            signerName: legacyName,
            signerNames: signerNames.length > 0 ? signerNames : legacyName ? [legacyName] : [],
            signedAtIso: readManifestString(manifest.signedAtIso),
            certificateValidUntilIso: readManifestString(manifest.certificateValidUntilIso),
        };
    } catch {
        return null;
    }
}

async function metadataFromSignSgn(signatureBytes: Uint8Array): Promise<UdfSignatureMetadata> {
    const parsed = await FileSystemService.parseDetachedSignature(signatureBytes);
    const signers: UdfSignatureSigner[] = parsed.signers.map((entry) => ({
        signerName: entry.signerName,
        certificateValidUntilIso: entry.certificateValidUntilIso,
        signedAtIso: null,
    }));
    const signerNames = signers.map((entry) => entry.signerName);

    return normalizeUdfSignatureMetadata({
        signed: true,
        signerNames,
        signerName: parsed.signerName,
        signers,
        signedAtIso: null,
        certificateValidUntilIso: parsed.certificateValidUntilIso,
    });
}

function mergeManifestWithSignSgn(
    fromManifest: Partial<UdfSignatureMetadata>,
    fromSign: UdfSignatureMetadata,
): UdfSignatureMetadata {
    return normalizeUdfSignatureMetadata({
        signed: true,
        signerNames: fromSign.signerNames,
        signerName: fromSign.signerName,
        signers: fromSign.signers,
        signedAtIso: fromManifest.signedAtIso ?? fromSign.signedAtIso,
        certificateValidUntilIso:
            fromManifest.certificateValidUntilIso ?? fromSign.certificateValidUntilIso,
    });
}

/**
 * Learn signature display metadata when a UDF is opened in editor/viewer.
 * All end-entity certificates in `sign.sgn` are collected; manifest only adds dates.
 */
export async function syncUdfSignatureMetadataFromEntries(
    documentId: string | null,
    entries: Record<string, Uint8Array>,
): Promise<void> {
    if (!documentId) return;

    const signatureBytes = entries['sign.sgn'];
    if (!signatureBytes || signatureBytes.length === 0) {
        clearUdfSignatureMetadata(documentId);
        return;
    }

    const fromSign = await metadataFromSignSgn(signatureBytes);

    for (const manifestName of MANIFEST_NAMES) {
        const manifestBytes = entries[manifestName];
        if (!manifestBytes || manifestBytes.length === 0) continue;
        const fromManifest = metadataFromManifest(manifestBytes);
        if (fromManifest) {
            writeUdfSignatureMetadata(documentId, mergeManifestWithSignSgn(fromManifest, fromSign));
            return;
        }
    }

    writeUdfSignatureMetadata(documentId, fromSign);
}
