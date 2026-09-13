/** User-visible message from an unknown save/export failure. */
export function formatSaveErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message.trim();
    }
    if (typeof error === 'string' && error.trim()) {
        return error.trim();
    }
    return 'Kaydetme başarısız';
}
