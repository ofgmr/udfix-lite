import { toast } from 'sonner';
import { udfOfficialEditorLimitMessage } from './xmlText';

const WARNED = new Set<string>();

/**
 * One toast per document and message. Save still writes the original characters.
 */
export function warnUdfOfficialEditorLimits(text: string, documentId?: string | null): void {
    const message = udfOfficialEditorLimitMessage(text);
    if (!message) return;
    const key = `${documentId?.trim() || '__active__'}:${message}`;
    if (WARNED.has(key)) return;
    WARNED.add(key);
    toast.warning(message, {
        id: `udf-official-limit:${key}`,
        duration: 8000,
    });
}
