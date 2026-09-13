import type { UyapYargiBirimiTablo } from './yargiBirimleri';
import type { UyapDosyaTurLabel } from './uyapDosyaTurleri';
import type { UyapProcessRoleLabel, UyapTarafRoleCode } from './uyapTarafRoles';
import type { UyapIcraMetadata } from './icraTakip';

/** Shape for `matters.metadata` JSON → `uyap` namespace. */
export interface MatterUyapMetadata {
    /** UYAP portal dosyaId — future sync fingerprint */
    dosyaId?: string;
    dosyaTur?: UyapDosyaTurLabel;
    dosyaTurKod?: number;
    yargiBirimTablo?: UyapYargiBirimiTablo;
    yargiAlani?: 'ceza' | 'hukuk' | 'icra' | 'idari' | 'arabuluculuk';
    davaKonuId?: number;
    davaKonuRef?: string;
    davaKonuLabel?: string;
    icra?: UyapIcraMetadata;
    /**
     * UYAP süreç rolü — party_id → label veya tarafRolu kodu.
     * Büro rolü (`matter_parties.role`) ile karıştırılmamalı.
     */
    partyProcessRoles?: Record<string, UyapProcessRoleLabel | UyapTarafRoleCode>;
    /** Static taxonomy bundle version */
    taxonomyVersion?: number;
}

export const MATTER_UYAP_TAXONOMY_VERSION = 1;

export function parseMatterMetadata(raw?: string | null): Record<string, unknown> {
    if (!raw?.trim()) return {};
    try {
        const parsed = JSON.parse(raw) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {};
    } catch {
        return {};
    }
}

export function parseMatterUyapMetadata(raw?: string | null): MatterUyapMetadata {
    const root = parseMatterMetadata(raw);
    const uyap = root.uyap;
    if (!uyap || typeof uyap !== 'object' || Array.isArray(uyap)) return {};
    return uyap as MatterUyapMetadata;
}

export function mergeMatterMetadataUyap(
    existingMetadataJson: string | null | undefined,
    patch: Partial<MatterUyapMetadata>
): string | null {
    const root = parseMatterMetadata(existingMetadataJson);
    const prev = parseMatterUyapMetadata(existingMetadataJson);
    const nextUyap: MatterUyapMetadata = {
        ...prev,
        ...patch,
        icra: patch.icra !== undefined ? { ...prev.icra, ...patch.icra } : prev.icra,
        partyProcessRoles:
            patch.partyProcessRoles !== undefined
                ? { ...prev.partyProcessRoles, ...patch.partyProcessRoles }
                : prev.partyProcessRoles,
        taxonomyVersion: MATTER_UYAP_TAXONOMY_VERSION,
    };

    const cleaned = Object.fromEntries(
        Object.entries(nextUyap).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ) as MatterUyapMetadata;

    if (Object.keys(cleaned).length === 0) {
        delete root.uyap;
    } else {
        root.uyap = cleaned;
    }

    return Object.keys(root).length ? JSON.stringify(root) : null;
}

export function resolveUyapProcessRoleLabel(
    role: UyapProcessRoleLabel | UyapTarafRoleCode | undefined
): UyapProcessRoleLabel | undefined {
    if (role == null) return undefined;
    if (typeof role === 'string') return role;
    const map: Record<UyapTarafRoleCode, UyapProcessRoleLabel> = {
        1: 'Davacı',
        2: 'Davalı',
        3: 'Sanık',
        7: 'Müşteki',
        21: 'Alacaklı',
        22: 'Borçlu',
    };
    return map[role as UyapTarafRoleCode];
}
