/**
 * Strip markup tags. Repeats until stable so `<<script>` cannot smuggle a tag
 * through a single replace (CodeQL js/incomplete-multi-character-sanitization).
 */
export function stripHtmlTags(html: string): string {
    let out = String(html ?? '');
    let prev = '';
    while (out !== prev) {
        prev = out;
        out = out.replace(/<[^>]*>/g, '');
    }
    return out;
}

/** Drop `<style` / `</style` tokens so they cannot close an embedding stylesheet. */
export function stripNestedStyleTagTokens(value: string): string {
    let out = String(value ?? '');
    let prev = '';
    while (out !== prev) {
        prev = out;
        out = out.replace(/<\/?style/gi, '');
    }
    return out;
}
