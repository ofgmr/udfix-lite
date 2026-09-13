/** User-facing Turkish for Katır / UYAP errors. Never surface CLI, HTTP stacks, or ports. */

const BRIDGE_DOWN = 'Katır bağlı değil. Chrome’da Avukat Portal açık olsun.';
const NO_SESSION = 'UYAP oturumu yok.';
const SESSION_INVALID = 'UYAP oturumu geçersiz. Avukat Portal’ı yenileyin.';
const FALLBACK = 'İş tamamlanamadı.';

function stripJargon(text: string): string {
    return text
        .replace(/\bCLI\b/gi, '')
        .replace(/node\s+uyap-import\S*/gi, '')
        .replace(/\bnode\s+\S+/gi, '')
        .replace(/\.{0,2}\/?[\w.-]*\.sh\b/gi, '')
        .replace(/\s*HTTP\s+\d{3}\b/gi, '')
        .replace(/\s*\.?HTTP\s+\d+\s+çağrı\.?/gi, '')
        .replace(/127\.0\.0\.1:\d+/g, '')
        .replace(/at\s+.*:\d+:\d+/gi, '')
        .replace(/Error:\s*/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

export function humanizeUyapMessage(raw?: string | null, fallback = FALLBACK): string {
    const text = String(raw || '').trim();
    if (!text) return fallback;

    if (
        /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|fetch failed|ERR_CONNECTION|net::ERR|abort/i.test(
            text,
        ) ||
        /Köprü kapalı|uyap-import\.mjs|bridge\s+-v|127\.0\.0\.1:17821/i.test(text)
    ) {
        return BRIDGE_DOWN;
    }

    if (/PRTL_GNL_10001|doğrulama hatası/i.test(text)) {
        return SESSION_INVALID;
    }

    if (/Katır canlı yolu bu sürümde kapalı/i.test(text)) {
        return 'Katır canlı yolu bu sürümde kapalı.';
    }

    if (/yetkiniz yok/i.test(text)) {
        return 'Bu evrak için yetkiniz yok.';
    }

    if (/oturum geçersiz|401\b/i.test(text)) {
        return SESSION_INVALID;
    }

    if (
        /oturum yok|oturum henüz|oturum gerekli|oturum doğrulanamadı|oturum\/HTML|login|giriş/i.test(
            text,
        )
    ) {
        return NO_SESSION;
    }

    if (/kuyruk boş/i.test(text)) {
        if (/eşleşmedi/i.test(text)) return 'Bu künye bulunamadı.';
        if (/künye seç/i.test(text)) return 'İndirmek için bir dosya seçin.';
        return 'Yapılacak eksik yok.';
    }

    if (/künyede birim yok/i.test(text)) {
        return 'Bu dosyada mahkeme bilgisi yok.';
    }

    if (/Canlı dosyaId|dosyaId yok/i.test(text)) {
        return 'UYAP bu dosyayı bulamadı.';
    }

    if (/arama bu künyeyi döndürmedi/i.test(text)) {
        return 'UYAP bu dosyayı bulamadı.';
    }

    if (/İndirilen evrak yok/i.test(text)) {
        return 'İndirilecek evrak yok.';
    }

    if (/zaten çalışıyor/i.test(text)) {
        return 'Katır zaten çalışıyor.';
    }

    if (/Katır çalışmıyor/i.test(text)) {
        return 'Durdurulacak iş yok.';
    }

    if (/Dosyayı indir için|künye seçin/i.test(text)) {
        return 'İndirmek için bir dosya seçin.';
    }

    if (/İndirme klasörü seçin/i.test(text)) {
        return 'İndirme klasörü seçin.';
    }

    if (/uygulama veri klasörü|kendi klasörünüzü/i.test(text)) {
        return 'Dosyalar uygulama klasörüne kaydedilmez. Kendi klasörünüzü seçin.';
    }

    if (/İndirme klasörü bulunamadı/i.test(text)) {
        return 'İndirme klasörü bulunamadı.';
    }

    if (/İndirme durdu/i.test(text)) {
        return 'İndirme durduruldu.';
    }

    if (/itemKey|kart anahtarı yok/i.test(text)) {
        return 'Bu kart görüntülenemiyor.';
    }

    if (/^künye yok$/i.test(text)) {
        return 'Önce bir dosya seçin.';
    }

    if (/^HTTP\s+\d{3}$/i.test(text) || /^not found$/i.test(text)) {
        return BRIDGE_DOWN;
    }

    const cleaned = stripJargon(text);
    if (!cleaned) return fallback;
    if (cleaned.length > 160) return `${cleaned.slice(0, 157)}…`;
    return cleaned;
}

export function humanizeWalkEventLine(message: string): string {
    let text = String(message || '').trim();
    if (!text) return '';
    text = text.replace(/^CLI iş başladı:\s*/i, '');
    text = text.replace(/Bu iş yalnızca eksikleri sorar[^.]*\./gi, '');
    text = stripJargon(text);
    text = text.replace(/^[·,.\s]+|[·,.\s]+$/g, '').trim();
    if (!text) return '';
    return humanizeUyapMessage(text, text);
}
