import { useEffect } from 'react';
import { trackEvent } from '../telemetry/trackEvent';

function sanitizeErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message.slice(0, 512);
    if (typeof error === 'string') return error.slice(0, 512);
    return 'unknown_error';
}

/**
 * Renderer-side global error hooks (only active when user opted in via main-process gate).
 */
export function useTelemetryInit(): void {
    useEffect(() => {
        const onError = (event: ErrorEvent) => {
            trackEvent(
                'renderer_uncaught_error',
                {
                    message: sanitizeErrorMessage(event.error ?? event.message),
                    source: event.filename ? 'script' : 'unknown',
                },
                'error',
            );
        };

        const onRejection = (event: PromiseRejectionEvent) => {
            trackEvent(
                'renderer_unhandled_rejection',
                { message: sanitizeErrorMessage(event.reason) },
                'error',
            );
        };

        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);
        return () => {
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
        };
    }, []);
}
