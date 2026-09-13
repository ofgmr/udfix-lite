export { };

interface ElectronBridge {
    getPathForFile?: (file: File) => string;
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    send?: (channel: string, ...args: unknown[]) => void;
    on?: (channel: string, func: (...args: unknown[]) => void) => void;
    off?: (channel: string, func: (...args: unknown[]) => void) => void;
}

declare global {
    interface Window {
        electron?: ElectronBridge;
    }
}
