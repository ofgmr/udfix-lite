export function isMacPlatform(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /Mac|iPhone|iPad|iPod/i.test(ua) || (navigator.platform?.includes('Mac') ?? false);
}

export function hasModKey(e: KeyboardEvent): boolean {
    return e.metaKey || e.ctrlKey;
}
