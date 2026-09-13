import { X509Certificate } from 'crypto';

export type DetachedSignatureSignerEntry = {
    signerName: string;
    certificateValidUntilIso: string | null;
};

export type DetachedSignatureSignerInfo = {
    signers: DetachedSignatureSignerEntry[];
    /** All signer display names, joined for legacy consumers. */
    signerName: string | null;
    certificateValidUntilIso: string | null;
};

const EMPTY_SIGNER_INFO: DetachedSignatureSignerInfo = {
    signers: [],
    signerName: null,
    certificateValidUntilIso: null,
};

const SIGNER_NAME_JOINER = ' · ';

function parseSubjectCommonName(subject: string): string | null {
    const match = subject.match(/(?:^|\n)CN=([^,\n]+)/i);
    return match ? match[1].trim() : null;
}

function x509ValidToToIso(validTo: string): string | null {
    const parsed = new Date(validTo);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function isLikelyIssuerCertificate(subject: string): boolean {
    return /(TÜRKTRUST|TURKTRUST|Certificate Authority|Root CA|OCSP|Nitelikli Elektronik Sertifika Hizmetleri)/i.test(
        subject,
    );
}

function pickSignerCertificate(certs: X509Certificate[]): X509Certificate | null {
    if (certs.length === 0) return null;
    const withSerial = certs.filter((cert) => /serialNumber=/i.test(cert.subject));
    if (withSerial.length > 0) return withSerial[0];
    const endEntity = certs.filter((cert) => !isLikelyIssuerCertificate(cert.subject));
    return endEntity[0] ?? certs[0] ?? null;
}

/** Collect every distinct end-entity signer certificate (co-sign / countersign). */
export function collectSignerCertificates(certs: X509Certificate[]): X509Certificate[] {
    const signers: X509Certificate[] = [];
    const seenCn = new Set<string>();

    for (const cert of certs) {
        if (isLikelyIssuerCertificate(cert.subject)) continue;
        if (!/serialNumber=/i.test(cert.subject)) continue;
        const cn = parseSubjectCommonName(cert.subject);
        if (!cn || seenCn.has(cn)) continue;
        seenCn.add(cn);
        signers.push(cert);
    }

    if (signers.length > 0) return signers;

    const fallback = pickSignerCertificate(certs);
    return fallback ? [fallback] : [];
}

function findEmbeddedCertificates(der: Buffer): X509Certificate[] {
    const certs: X509Certificate[] = [];
    const seen = new Set<string>();
    for (let offset = 0; offset < der.length - 64; offset += 1) {
        if (der[offset] !== 0x30) continue;
        try {
            const cert = new X509Certificate(der.subarray(offset));
            if (!cert.subject || seen.has(cert.subject)) continue;
            seen.add(cert.subject);
            certs.push(cert);
        } catch {
            // Not a certificate at this offset.
        }
    }
    return certs;
}

function entriesFromCertificates(certs: X509Certificate[]): DetachedSignatureSignerEntry[] {
    return certs.map((cert) => ({
        signerName: parseSubjectCommonName(cert.subject) ?? 'Bilinmiyor',
        certificateValidUntilIso: x509ValidToToIso(cert.validTo),
    }));
}

/** Extract all signer CNs and cert expiry from detached CMS (`sign.sgn`) bytes. */
export function extractSignerInfoFromDetachedSignature(bytes: Uint8Array): DetachedSignatureSignerInfo {
    if (!bytes || bytes.length < 64) return EMPTY_SIGNER_INFO;
    const der = Buffer.from(bytes);
    const signerCerts = collectSignerCertificates(findEmbeddedCertificates(der));
    if (signerCerts.length === 0) return EMPTY_SIGNER_INFO;

    const signers = entriesFromCertificates(signerCerts);
    const signerNames = signers.map((entry) => entry.signerName);

    return {
        signers,
        signerName: signerNames.length > 0 ? signerNames.join(SIGNER_NAME_JOINER) : null,
        certificateValidUntilIso: signers[0]?.certificateValidUntilIso ?? null,
    };
}
