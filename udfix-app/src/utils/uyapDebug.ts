function readBooleanFlag(raw: string | null | undefined): boolean {
    if (!raw) return false;
    const normalized = raw.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isUyapDebugEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const globalFlag = (window as typeof window & { __UDFIX_DEBUG_UYAP_SIGN__?: unknown })
            .__UDFIX_DEBUG_UYAP_SIGN__;
        if (globalFlag === true) return true;
        if (readBooleanFlag(window.localStorage.getItem('UDFIX_DEBUG_UYAP_SIGN'))) return true;
        if (readBooleanFlag(window.localStorage.getItem('NOMAI_DEBUG_UYAP_SIGN'))) return true;
        if (readBooleanFlag((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_UYAP_DEBUG_SIGN)) {
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

export function uyapDebugLog(step: string, message: string, data?: unknown): void {
    if (!isUyapDebugEnabled()) return;
    if (data === undefined) {
         
        console.info(`[uyap-sign][${step}] ${message}`);
        return;
    }
     
    console.info(`[uyap-sign][${step}] ${message}`, data);
}
