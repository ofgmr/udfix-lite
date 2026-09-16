import diff_match_patch, { DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT } from 'diff-match-patch';
import type { DocumentVersionRow } from '../services/dataService';
import { parseHtmlFragment } from './sanitizeDocumentHtml';
import { stripHtmlTags } from './stripHtmlTags';

export function htmlToPlainText(html: string): string {
    const withBreaks = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>|<\/div>|<\/h[1-6]>/gi, '\n');

    if (typeof document === 'undefined') {
        return stripHtmlTags(withBreaks)
            .replace(/[ \t]+/g, ' ')
            .trim();
    }

    const wrap = parseHtmlFragment(withBreaks);
    const text = wrap?.textContent || wrap?.innerText || '';

    return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** İki sürümün düz metin diff’ini, UniversalViewer’da gösterilecek HTML parçaları olarak üretir. */
export function buildVersionPairDiffHtml(rowA: DocumentVersionRow, rowB: DocumentVersionRow): string {
    const dmp = new diff_match_patch();
    const a = htmlToPlainText(rowA.content);
    const b = htmlToPlainText(rowB.content);
    const diffs = dmp.diff_main(a, b);
    dmp.diff_cleanupSemantic(diffs);
    
    const parts: string[] = [];
    for (const [op, text] of diffs) {
        // Güvenlik için tagleri dönüştür ve koruduğumuz \n'leri HTML'in anlayacağı <br/> etiketlerine çevir
        const safe = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br/>'); 

        if (op === DIFF_EQUAL) {
            parts.push(`<span class="text-foreground/90">${safe}</span>`);
        } else if (op === DIFF_DELETE) {
            parts.push(`<span class="bg-red-500/25 text-red-200 line-through">${safe}</span>`);
        } else if (op === DIFF_INSERT) {
            parts.push(`<span class="bg-emerald-500/20 text-emerald-100">${safe}</span>`);
        }
    }
    
    // Yatay scroll'u %100 engellemek için sarmalayıcı (wrapper) bir div ekleyip Tailwind sınıflarıyla uzun kelimeleri de kırmasını sağlıyoruz.
    return `<div class="whitespace-pre-wrap break-words">${parts.join('')}</div>`;
}