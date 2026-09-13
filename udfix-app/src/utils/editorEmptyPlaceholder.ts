import type { JSONContent } from '@tiptap/core';

/** Boş editör gövdesi — tek boş paragraf (Placeholder + `is-editor-empty` için gerekli). */
export const EMPTY_TIPTAP_DOC: JSONContent = {
    type: 'doc',
    content: [{ type: 'paragraph' }],
};

export function emptyTipTapDocJson(): string {
    return JSON.stringify(EMPTY_TIPTAP_DOC);
}

/** `content: []` veya boş string gibi değerleri boş paragraflı belgeye çevirir. */
export function normalizeTipTapDocContent(input: unknown): JSONContent {
    if (input == null || input === '') {
        return EMPTY_TIPTAP_DOC;
    }
    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (!trimmed) return EMPTY_TIPTAP_DOC;
        try {
            return normalizeTipTapDocContent(JSON.parse(trimmed) as unknown);
        } catch {
            return EMPTY_TIPTAP_DOC;
        }
    }
    if (typeof input === 'object' && 'type' in input && (input as { type: string }).type === 'doc') {
        const content = (input as { content?: unknown }).content;
        if (!Array.isArray(content) || content.length === 0) {
            return EMPTY_TIPTAP_DOC;
        }
        return input as JSONContent;
    }
    return EMPTY_TIPTAP_DOC;
}

/** Boş belge / not editöründe TipTap Placeholder metni (çok satır, `white-space: pre-line`). */
export type EditorEmptyPlaceholderVariant = 'document' | 'note';

/** Editör kapanırken: düz metin bu uzunluğun altındaysa not silinir (başlık sayılmaz). */
export const NOTE_MIN_PLAIN_CONTENT_LENGTH = 3;

export function isNoteBodyTooShortForAutoDelete(plain: string): boolean {
    return plain.trim().length < NOTE_MIN_PLAIN_CONTENT_LENGTH;
}

const MARKDOWN_HINT_LINE =
    '# · ## · ### başlık  ·  **kalın**  ·  *italik*  ·  - liste  ·  - [ ] görev  ·  > alıntı';
const DOCUMENT_PLACEHOLDER_LINES = [
    'Yazmaya başlayın…',
    '',
    '@  — Taraf, dava, evrak veya kayıt ekle',
    '## — Metin şablonu ara ve ekle',
    MARKDOWN_HINT_LINE,
    '',
    '🃂 Üst veya alt bilgiyi düzenlemek için çift tıklayın',
    '🀆 Sayfa düzenini ayarlamak için cetvele çift tıklayın',
] as const;

const NOTE_PLACEHOLDER_LINES = [
    'Not almaya başlayın…',
    '',
    '@  — Taraf, dava veya kayıt ekle',
    '[[ — Başka bir nota bağlantı oluştur',
    '## — Metin şablonu ara ve ekle',
    '# — Etiket (tag) ekle',
    '- [ ] — Görev listesi',
    MARKDOWN_HINT_LINE,
] as const;

export function getEditorEmptyPlaceholderText(variant: EditorEmptyPlaceholderVariant): string {
    const lines = variant === 'document' ? DOCUMENT_PLACEHOLDER_LINES : NOTE_PLACEHOLDER_LINES;
    return lines.join('\n');
}

/** TipTap `Placeholder.configure(...)` için paylaşılan seçenekler. */
export function getEditorPlaceholderOptions(variant: EditorEmptyPlaceholderVariant) {
    const text = getEditorEmptyPlaceholderText(variant);
    return {
        // Yalnızca editör tamamen boşken göster. (Enter ile yeni boş paragraf açınca tekrar görünmesin.)
        placeholder: ({ editor }: { editor: { isEmpty: boolean } }) => (editor.isEmpty ? text : ''),
        emptyEditorClass: 'is-editor-empty',
        emptyNodeClass: 'is-empty',
        showOnlyCurrent: false,
    } as const;
}

/** Eski başlangıç HTML’i — artık boş belge sayılır. */
const LEGACY_STARTER_HTML_MARKERS = ['<h1>Untitled Document</h1>', 'Start typing here'];

export function isLegacyStarterEditorHtml(html: string): boolean {
    const t = html.trim();
    if (!t) return false;
    return LEGACY_STARTER_HTML_MARKERS.every((m) => t.includes(m));
}
