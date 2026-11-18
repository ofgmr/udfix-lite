/**
 * Signed UDF files must not be rewritten by autosave.
 * Unsigned export drops `sign.sgn`, so a normal save erases the signature.
 * Edits stay in memory until the user works on a copy or confirms overwrite.
 */

type GateState = {
    protected: boolean;
    allowOriginalOverwrite: boolean;
};

const gates = new Map<string, GateState>();

export const SIGNED_UDF_EDIT_REVERTED_EVENT = 'udfix:signed-udf-edit-reverted';

function documentKey(documentId: string): string {
    return String(documentId ?? '').trim();
}

/** Arm protection for a UDF whose on-disk package still contains a signature. */
export function armSignedUdfProtection(documentId: string): void {
    const key = documentKey(documentId);
    if (!key) return;
    gates.set(key, { protected: true, allowOriginalOverwrite: false });
}

export function allowSignedUdfOriginalOverwrite(documentId: string): void {
    const key = documentKey(documentId);
    if (!key) return;
    gates.set(key, { protected: true, allowOriginalOverwrite: true });
}

export function releaseSignedUdfProtection(documentId: string): void {
    const key = documentKey(documentId);
    if (!key) return;
    gates.delete(key);
}

export function isSignedUdfWriteBlocked(documentId: string): boolean {
    const gate = gates.get(documentKey(documentId));
    return Boolean(gate?.protected && !gate.allowOriginalOverwrite);
}

export class SignedUdfWriteDeferredError extends Error {
    readonly code = 'SIGNED_UDF_WRITE_DEFERRED';

    constructor() {
        super('E-imzalı UDF kaydı onay bekliyor.');
        this.name = 'SignedUdfWriteDeferredError';
    }
}

export function isSignedUdfWriteDeferred(error: unknown): boolean {
    return error instanceof SignedUdfWriteDeferredError;
}

export function dispatchSignedUdfEditReverted(documentId: string): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
        new CustomEvent<{ documentId: string }>(SIGNED_UDF_EDIT_REVERTED_EVENT, {
            detail: { documentId },
        }),
    );
}

export function signedUdfCopyFileName(fileName: string, takenNames: ReadonlySet<string>): string {
    const trimmed = fileName.trim() || 'Belge.udf';
    const match = trimmed.match(/^(.*)(\.udf)$/i);
    const stem = match ? match[1] : trimmed;
    const ext = match ? match[2] : '.udf';
    const candidate = (index: number) =>
        index <= 1 ? `${stem} (kopya)${ext}` : `${stem} (kopya ${index})${ext}`;
    let index = 1;
    while (takenNames.has(candidate(index))) {
        index += 1;
    }
    return candidate(index);
}

export function joinUdfDirectory(directory: string | undefined, fileName: string): string {
    if (!directory) return fileName;
    const sep = directory.includes('\\') ? '\\' : '/';
    const base = directory.replace(/[\\/]+$/, '');
    return `${base}${sep}${fileName}`;
}
