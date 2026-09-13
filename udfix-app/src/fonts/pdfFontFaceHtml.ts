/** Wraps pre-built @font-face CSS for insertion into PDF print HTML `<head>`. */
export function getPdfFontFaceStyleBlock(embeddedCss: string): string {
    if (!embeddedCss.trim()) return '';
    return `<style id="nomai-offline-font-faces">\n${embeddedCss}\n</style>`;
}
