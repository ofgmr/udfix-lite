export interface FsEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
    mtimeMs: number;
}

import { getElectronInvoke } from '../utils/electronBridge';

function bytesFromIpcPayload(data: unknown): Uint8Array {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (Array.isArray(data)) return Uint8Array.from(data);
    if (data && typeof data === 'object' && 'type' in data && (data as { type: string }).type === 'Buffer') {
        const buf = data as unknown as { data: number[] };
        return Uint8Array.from(buf.data ?? []);
    }
    return new Uint8Array(0);
}

export const FileSystemService = {
    async selectWorkspaceDirectory(): Promise<string | null> {
        const invoke = getElectronInvoke();
        return invoke('fs-select-workspace-directory') as Promise<string | null>;
    },

    async selectUdfFiles(): Promise<string[]> {
        const invoke = getElectronInvoke();
        const paths = await invoke('fs-select-udf-files');
        return Array.isArray(paths) ? paths.filter((p): p is string => typeof p === 'string') : [];
    },

    async selectOutputDirectory(): Promise<string | null> {
        const invoke = getElectronInvoke();
        return invoke('fs-select-output-directory') as Promise<string | null>;
    },

    async listDirectory(dirPath: string): Promise<FsEntry[]> {
        const invoke = getElectronInvoke();
        return invoke('fs-list-directory', dirPath) as Promise<FsEntry[]>;
    },

    async createDirectory(dirPath: string): Promise<void> {
        const invoke = getElectronInvoke();
        await invoke('fs-create-directory', dirPath);
    },

    async createFile(filePath: string, content?: string): Promise<void> {
        const invoke = getElectronInvoke();
        await invoke('fs-create-file', filePath, content ?? '');
    },

    async renamePath(oldPath: string, newPath: string): Promise<void> {
        const invoke = getElectronInvoke();
        await invoke('fs-rename-path', oldPath, newPath);
    },

    async deletePath(targetPath: string): Promise<void> {
        const invoke = getElectronInvoke();
        await invoke('fs-delete-path', targetPath);
    },

    async showItemInFolder(targetPath: string): Promise<void> {
        const invoke = getElectronInvoke();
        await invoke('fs-show-item-in-folder', targetPath);
    },

    async writeFileBinary(filePath: string, bytes: Uint8Array): Promise<void> {
        const invoke = getElectronInvoke();
        await invoke('fs-write-file-binary', filePath, bytes);
    },

    async readFileBinary(filePath: string): Promise<Uint8Array> {
        const invoke = getElectronInvoke();
        const data = await invoke('fs-read-file-binary', filePath);
        return bytesFromIpcPayload(data);
    },

    async showSaveUdfDialog(options?: {
        suggestedFileName?: string;
        defaultDirectory?: string;
    }): Promise<string | null> {
        const invoke = getElectronInvoke();
        return invoke('fs-show-save-udf-dialog', options ?? {}) as Promise<string | null>;
    },

    async parseDetachedSignature(signatureBytes: Uint8Array): Promise<{
        signers: Array<{ signerName: string; certificateValidUntilIso: string | null }>;
        signerName: string | null;
        certificateValidUntilIso: string | null;
    }> {
        const invoke = getElectronInvoke();
        const data = (await invoke('udf-parse-detached-signature', signatureBytes)) as {
            signers?: Array<{ signerName?: string; certificateValidUntilIso?: string | null }>;
            signerName?: string | null;
            certificateValidUntilIso?: string | null;
        };
        const signers = Array.isArray(data?.signers)
            ? data.signers
                  .map((entry) => ({
                      signerName: typeof entry?.signerName === 'string' ? entry.signerName.trim() : '',
                      certificateValidUntilIso:
                          typeof entry?.certificateValidUntilIso === 'string'
                              ? entry.certificateValidUntilIso
                              : null,
                  }))
                  .filter((entry) => entry.signerName.length > 0)
            : [];
        const legacyName = typeof data?.signerName === 'string' ? data.signerName : null;
        return {
            signers:
                signers.length > 0
                    ? signers
                    : legacyName
                      ? [{ signerName: legacyName, certificateValidUntilIso: data?.certificateValidUntilIso ?? null }]
                      : [],
            signerName: legacyName,
            certificateValidUntilIso:
                typeof data?.certificateValidUntilIso === 'string' ? data.certificateValidUntilIso : null,
        };
    },

    async startWatch(rootPath: string): Promise<void> {
        const invoke = getElectronInvoke();
        await invoke('fs-watch-start', rootPath);
    },

    async stopWatch(rootPath: string): Promise<void> {
        const invoke = getElectronInvoke();
        await invoke('fs-watch-stop', rootPath);
    },
};

