import { toast } from 'sonner';

export async function copyTextToClipboard(text: string): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed) return false;

    try {
        await navigator.clipboard.writeText(trimmed);
        return true;
    } catch {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = trimmed;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            return ok;
        } catch {
            return false;
        }
    }
}

export async function copyTextWithToast(
    text: string,
    successMessage = 'İçerik kopyalandı',
): Promise<boolean> {
    const ok = await copyTextToClipboard(text);
    if (ok) {
        toast.success(successMessage);
    } else {
        toast.error('Kopyalama başarısız');
    }
    return ok;
}
