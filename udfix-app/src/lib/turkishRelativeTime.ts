/** Turkish relative past for a known timestamp. Never invents a clock when `atMs` is null. */
export function formatTurkishRelativePast(atMs: number, nowMs: number = Date.now()): string {
    const delta = Math.max(0, nowMs - atMs);
    if (delta < 45_000) return 'az önce';
    const minutes = Math.round(delta / 60_000);
    if (minutes < 60) return `${minutes} dk önce`;
    const hours = Math.round(delta / 3_600_000);
    if (hours < 24) return `${hours} sa önce`;
    const days = Math.round(delta / 86_400_000);
    if (days === 1) return 'dün';
    if (days < 30) return `${days} gün önce`;
    const months = Math.round(days / 30);
    if (months < 12) return `${months} ay önce`;
    const years = Math.round(days / 365);
    return `${years} yıl önce`;
}
