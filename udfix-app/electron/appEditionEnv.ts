export function envTriState(key: string, env: NodeJS.ProcessEnv = process.env): boolean | null {
    const raw = String(env[key] ?? '').trim();
    if (!raw) return null;
    if (raw === '0' || /^false$/i.test(raw)) return false;
    if (raw === '1' || /^true$/i.test(raw)) return true;
    return null;
}

export function katirEnvOverride(env: NodeJS.ProcessEnv = process.env): boolean | null {
    return envTriState('UDFIX_KATIR', env);
}
