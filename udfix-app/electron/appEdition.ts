export type UdixEdition = 'lite' | 'katir';

export function katirEnvOverride(): boolean | null {
    return false;
}

export function packagedHasKatirBridge(): boolean {
    return false;
}

export function resolvePackagedEdition(): UdixEdition {
    return 'lite';
}

export function isKatirRuntimeEnabled(): boolean {
    return false;
}

export function resolveDevUyapImportEntry(): string | null {
    return null;
}

export function resolvePackagedUyapImportEntry(): string | null {
    return null;
}
