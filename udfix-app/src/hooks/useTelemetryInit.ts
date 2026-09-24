import { useEffect } from 'react';

/** Renderer telemetry hooks are unused: weekly db_snapshot is main-process only. */
export function useTelemetryInit(): void {
    useEffect(() => {
        /* no-op */
    }, []);
}
