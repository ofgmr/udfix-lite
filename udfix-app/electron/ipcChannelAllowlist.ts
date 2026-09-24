/** Renderer IPC channel names. Pure module — no Electron imports (preload may copy these checks). */

const INVOKE_EXACT = new Set([
    'app-preferences-get',
    'app-preferences-patch',
    'app-entitlements-get',
    'app-account-get',
    'app-account-sign-out',
    'app-account-activate-katir',
    'app-open-external-url',
    'app-update-get-state',
    'app-update-check',
    'app-update-download',
    'app-update-install',
    'telemetry-track',
    'telemetry-flush',
    'convert-html-to-pdf',
    'convert-html-to-pdf-with-overlay',
    'export-docx',
    'export-pdf-from-html',
    'export-pdf-with-overlay',
    'open-external-viewer',
    'focus-main-window',
    'parse-email',
    'save-attachment-temp',
    'uyap-sign-detached',
    'udf-parse-detached-signature',
    'uyap-bridge-status',
    'uyap-bridge-walk-start',
    'uyap-bridge-walk-stop',
    'uyap-bridge-schedule-set',
    'app-show-native-notification',
    'fs-file-url',
]);

/** `db-` covers library + per-document HF: db-get/set-header-footer-library, db-get/set-document-hf. */
const INVOKE_PREFIXES = ['db-', 'fs-'] as const;

const LISTEN_EXACT = new Set(['app-menu-action', 'app-update-event', 'app-entitlements-changed', 'fs-watch-event']);

export function isAllowedInvokeChannel(channel: string): boolean {
    if (typeof channel !== 'string' || channel.length === 0) return false;
    if (INVOKE_EXACT.has(channel)) return true;
    return INVOKE_PREFIXES.some((prefix) => channel.startsWith(prefix));
}

export function isAllowedListenChannel(channel: string): boolean {
    return typeof channel === 'string' && LISTEN_EXACT.has(channel);
}
