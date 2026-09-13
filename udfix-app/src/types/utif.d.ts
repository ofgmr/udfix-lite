declare module 'utif' {
    export function decode(buffer: ArrayBuffer): Record<string, unknown>[];
    export function decodeImage(buffer: ArrayBuffer, ifd: Record<string, unknown>): void;
    export function toRGBA8(ifd: Record<string, unknown>): Uint8Array;
}
