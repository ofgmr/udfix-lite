export function getElectronInvoke(): (channel: string, ...args: unknown[]) => Promise<unknown> {
    if (window.electron?.invoke) {
        return window.electron.invoke.bind(window.electron);
    }
    return async () => {
        throw new Error('Electron IPC is not available');
    };
}
