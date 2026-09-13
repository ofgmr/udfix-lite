const TOKEN_TTL_MS = 90_000;

export type UyapMobileOperator = 'turkcell' | 'turktelekom' | 'vodafone';

export type UyapSignTokenRequest = {
    provider: 'token';
    tokenPin: string;
};

export type UyapSignMobileRequest = {
    provider: 'mobile';
    gsmNo: string;
    tcKimlikNo: string;
    operator: UyapMobileOperator;
    displayText?: string;
};

export type UyapSignRequest = UyapSignTokenRequest | UyapSignMobileRequest;

type SessionEntry = {
    request: UyapSignRequest;
    expiresAt: number;
};

const sessionByDocumentId = new Map<string, SessionEntry>();

function cleanupExpiredSessions(now = Date.now()): void {
    for (const [documentId, entry] of sessionByDocumentId.entries()) {
        if (entry.expiresAt <= now) {
            sessionByDocumentId.delete(documentId);
        }
    }
}

export function stageUyapSignRequestForExport(documentId: string, request: UyapSignRequest): void {
    const safeDocumentId = String(documentId ?? '').trim();
    if (!safeDocumentId) {
        return;
    }
    if (request.provider === 'token' && !request.tokenPin) {
        return;
    }
    if (
        request.provider === 'mobile' &&
        (!request.gsmNo || !request.tcKimlikNo || !request.operator)
    ) {
        return;
    }
    cleanupExpiredSessions();
    sessionByDocumentId.set(safeDocumentId, {
        request,
        expiresAt: Date.now() + TOKEN_TTL_MS,
    });
}

export function consumeUyapSignRequestForExport(documentId: string): UyapSignRequest | null {
    const safeDocumentId = String(documentId ?? '').trim();
    if (!safeDocumentId) {
        return null;
    }
    cleanupExpiredSessions();
    const entry = sessionByDocumentId.get(safeDocumentId);
    sessionByDocumentId.delete(safeDocumentId);
    if (!entry || entry.expiresAt <= Date.now()) {
        return null;
    }
    return entry.request;
}

export function stageTokenPinForExport(documentId: string, tokenPin: string): void {
    stageUyapSignRequestForExport(documentId, {
        provider: 'token',
        tokenPin,
    });
}

export function consumeTokenPinForExport(documentId: string): string | null {
    const request = consumeUyapSignRequestForExport(documentId);
    if (!request || request.provider !== 'token') {
        return null;
    }
    return request.tokenPin;
}

export function clearTokenPinForExport(documentId: string): void {
    const safeDocumentId = String(documentId ?? '').trim();
    if (!safeDocumentId) {
        return;
    }
    sessionByDocumentId.delete(safeDocumentId);
}
