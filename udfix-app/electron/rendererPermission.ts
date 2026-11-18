/**
 * Renderer permission requests are denied unless the editor needs them.
 * Clipboard read/write is required for paste and for copy of a selection.
 * Media, geolocation, display capture, and notifications are not.
 */
const ALLOWED_RENDERER_PERMISSIONS = new Set([
    'clipboard-read',
    'clipboard-sanitized-write',
]);

export function isRendererPermissionAllowed(permission: string): boolean {
    return ALLOWED_RENDERER_PERMISSIONS.has(permission);
}
