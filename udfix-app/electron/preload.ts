import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { isAllowedInvokeChannel, isAllowedListenChannel } from './ipcAllowlist';

const listenerWrappers = new Map<string, Map<(...args: unknown[]) => void, (_event: unknown, ...args: unknown[]) => void>>();

function assertInvokeChannel(channel: string): void {
    if (!isAllowedInvokeChannel(channel)) {
        throw new Error(`IPC invoke channel not allowed: ${channel}`);
    }
}

function assertListenChannel(channel: string): void {
    if (!isAllowedListenChannel(channel)) {
        throw new Error(`IPC listen channel not allowed: ${channel}`);
    }
}

contextBridge.exposeInMainWorld('electron', {
    /** Absolute path for a renderer `File` from drag-and-drop (replaces deprecated `File.path`). */
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
    invoke: (channel: string, ...args: unknown[]) => {
        assertInvokeChannel(channel);
        return ipcRenderer.invoke(channel, ...args);
    },
    send: (channel: string, ...args: unknown[]) => {
        assertListenChannel(channel);
        ipcRenderer.send(channel, ...args);
    },
    on: (channel: string, listener: (...args: unknown[]) => void) => {
        assertListenChannel(channel);
        const wrapped = (_event: unknown, ...payload: unknown[]) => listener(...payload);
        let channelMap = listenerWrappers.get(channel);
        if (!channelMap) {
            channelMap = new Map();
            listenerWrappers.set(channel, channelMap);
        }
        channelMap.set(listener, wrapped);
        ipcRenderer.on(channel, wrapped);
    },
    off: (channel: string, listener: (...args: unknown[]) => void) => {
        const channelMap = listenerWrappers.get(channel);
        const wrapped = channelMap?.get(listener);
        if (wrapped) {
            ipcRenderer.removeListener(channel, wrapped);
            channelMap?.delete(listener);
        }
    },
});
