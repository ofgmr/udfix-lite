import { toTurkishTitleCase } from './turkishTitleCase';

/** Names + office role from SQLite `matter_parties`. No TCKN/VKN. */
export type MatterPartyLineInput = {
    full_name?: string | null;
    role?: string | null;
    is_client?: boolean | number | null;
};

const MAX_PER_SIDE = 2;

function foldRole(role?: string | null): string {
    return String(role || '')
        .trim()
        .toLocaleUpperCase('tr-TR');
}

function isOfficeMuvekkil(role?: string | null, isClient?: boolean | number | null): boolean {
    const value = foldRole(role);
    if (value === 'MÜVEKKİL' || value === 'MUVEKKIL' || value === 'CLIENT') return true;
    return Boolean(isClient);
}

function isOfficeKarsi(role?: string | null): boolean {
    const value = foldRole(role);
    return (
        value === 'KARŞI_TARAF' ||
        value === 'KARSI_TARAF' ||
        value === 'KARŞI TARAF' ||
        value === 'COUNTERPARTY'
    );
}

function isSkippedOfficeRole(role?: string | null): boolean {
    const value = foldRole(role);
    return value === 'VEKİL' || value === 'VEKIL' || value === 'TANIK';
}

function displayPartyName(raw?: string | null): string {
    return toTurkishTitleCase(raw)
        .replace(/\bA\.ş\./g, 'A.Ş.')
        .replace(/\bLtd\.?\s*şti\.?/gi, 'Ltd. Şti.');
}

function takeNames(names: string[], max: number): { shown: string[]; extra: number } {
    if (names.length <= max) return { shown: names, extra: 0 };
    return { shown: names.slice(0, max), extra: names.length - max };
}

function withExtra(core: string, extra: number): string {
    return extra > 0 ? `${core} +${extra}` : core;
}

export function formatCompactMatterPartyLine(
    parties: MatterPartyLineInput[] | null | undefined,
): string {
    if (!parties?.length) return '';

    const clients: string[] = [];
    const counters: string[] = [];
    const others: string[] = [];
    const seen = new Set<string>();

    for (const party of parties) {
        const name = displayPartyName(party.full_name);
        if (!name) continue;
        const key = name.toLocaleLowerCase('tr-TR');
        if (seen.has(key)) continue;
        if (isSkippedOfficeRole(party.role)) continue;
        seen.add(key);
        if (isOfficeKarsi(party.role)) {
            counters.push(name);
            continue;
        }
        if (isOfficeMuvekkil(party.role, party.is_client)) {
            clients.push(name);
            continue;
        }
        others.push(name);
    }

    const farSide = counters.length > 0 ? counters : clients.length > 0 ? others : [];
    const leftover = counters.length > 0 ? others : clients.length > 0 ? [] : others;

    if (clients.length > 0 && farSide.length > 0) {
        const left = takeNames(clients, MAX_PER_SIDE);
        const right = takeNames(farSide, MAX_PER_SIDE);
        const core = `${left.shown.join(', ')} / ${right.shown.join(', ')}`;
        return withExtra(core, left.extra + right.extra + leftover.length);
    }
    if (clients.length > 0) {
        const left = takeNames(clients, MAX_PER_SIDE);
        return withExtra(`Müvekkil: ${left.shown.join(', ')}`, left.extra + leftover.length);
    }
    if (farSide.length > 0) {
        const right = takeNames(farSide, MAX_PER_SIDE);
        return withExtra(`Karşı: ${right.shown.join(', ')}`, right.extra + leftover.length);
    }
    if (leftover.length > 0) {
        const taken = takeNames(leftover, MAX_PER_SIDE);
        return withExtra(taken.shown.join(', '), taken.extra);
    }
    return '';
}
