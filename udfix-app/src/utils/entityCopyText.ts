import type { KnowledgeItem, Matter, Party } from '../services/dataService';
import { MATTER_RECORD_TYPE_LABELS } from '../data/matterTaxonomy';
import { OFFICE_MATTER_TYPE_LABELS } from '../data/uyap/uyapDosyaTurMapping';
import { getIcraLawyerSummary } from './matterAttributeSearch';

const MATTER_STATUS_LABELS: Record<Matter['status'], string> = {
    OPEN: 'Açık',
    CLOSED: 'Kapalı',
    ARCHIVED: 'Arşiv',
    APPEAL: 'İstinaf/Temyiz',
};

export function knowledgeTypeLabel(type: KnowledgeItem['type']): string {
    switch (type) {
        case 'PRECEDENT':
            return 'İçtihat';
        case 'BOOK':
            return 'Kitap';
        case 'ARTICLE':
            return 'Makale';
        case 'LEGISLATIVE':
            return 'Mevzuat';
        default: {
            const _exhaustive: never = type;
            return _exhaustive;
        }
    }
}

function joinLines(lines: string[]): string {
    return lines.filter((line) => line.trim().length > 0).join('\n');
}

export function formatMatterCopyText(matter: Matter): string {
    const typeLabel =
        MATTER_RECORD_TYPE_LABELS[matter.matter_type] ??
        OFFICE_MATTER_TYPE_LABELS[matter.matter_type] ??
        matter.matter_type;

    const icraLines =
        matter.matter_type === 'ENFORCEMENT'
            ? getIcraLawyerSummary(matter.attributes_search).map((row) => `${row.label}: ${row.value} ₺`)
            : [];

    return joinLines([
        matter.title,
        matter.internal_id ? `Dosya No: ${matter.internal_id}` : '',
        matter.file_number ? `Esas No: ${matter.file_number}` : '',
        matter.court_name ? `Mahkeme: ${matter.court_name}` : '',
        matter.parties_list ? `Taraflar: ${matter.parties_list}` : '',
        matter.status ? `Durum: ${MATTER_STATUS_LABELS[matter.status] ?? matter.status}` : '',
        typeLabel ? `Tür: ${typeLabel}` : '',
        ...icraLines,
    ]);
}

export function formatPartyCopyText(party: Party): string {
    const kind =
        party.party_kind === 'KURUM' || party.type === 'CORPORATE' ? 'Kurum' : 'Kişi';

    return joinLines([
        party.full_name,
        party.is_client ? 'Rol: Müvekkil' : 'Rol: Taraf',
        `Tür: ${kind}`,
        party.id_number ? `TCKN/VKN: ${party.id_number}` : '',
        party.phone ? `Telefon: ${party.phone}` : '',
        party.email ? `E-posta: ${party.email}` : '',
        party.address ? `Adres: ${party.address}` : '',
    ]);
}

export function formatKnowledgeCopyText(item: KnowledgeItem): string {
    const typeLabel = knowledgeTypeLabel(item.type);

    return joinLines([
        item.title,
        item.author ? `Yazar: ${item.author}` : '',
        `Tür: ${typeLabel}`,
        item.tags ? `Etiketler: ${item.tags}` : '',
        item.content ?? '',
    ]);
}
