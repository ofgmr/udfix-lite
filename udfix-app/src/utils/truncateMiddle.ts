const MIDDLE_ELLIPSIS = '...';

/** Shorten long strings with a middle ellipsis; total length never exceeds `maxLength`. */
export function truncateMiddle(text: string, maxLength = 61): string {
    if (text.length <= maxLength) return text;
    const keep = maxLength - MIDDLE_ELLIPSIS.length;
    if (keep <= 0) return text.slice(0, maxLength);
    const head = Math.ceil(keep / 2);
    const tail = Math.floor(keep / 2);
    return `${text.slice(0, head)}${MIDDLE_ELLIPSIS}${text.slice(text.length - tail)}`;
}
