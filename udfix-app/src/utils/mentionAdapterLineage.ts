/**
 * @ mention "Düz metin" paneli için veri hattı özeti (SQLite / IPC).
 * Hassas alan değerleri yerine yalnızca kanal, tablo ve alan anahtarları kaydedilir.
 */

export type MentionLineageSelection = {
    id: string;
    label: string;
    entityType: string;
};

export type MentionLineageDetailKind = 'PARTY' | 'MATTER' | 'NONE';

export function buildMentionLineagePayload(input: {
    suggestionQuery: string;
    itemsCount: number;
    selectedIndex: number;
    selection: MentionLineageSelection | null;
    detailLoading: boolean;
    detailKind: MentionLineageDetailKind;
    partyLoaded: boolean;
    matterLoaded: boolean;
    plainFieldKeys: string[];
}): Record<string, unknown> {
    const communications: Array<Record<string, unknown>> = [
        {
            layer: 'renderer→main',
            ipc: 'db-suggest-entities-only',
            sqlite: [
                'parties',
                'matters',
                'documents',
                'knowledge_base',
            ],
            note: 'Üst liste: bu IPC + tablolar; düz metin satırları çoğu kayıtta yalnızca bu satırdan türetilir.',
        },
    ];

    const sel = input.selection;
    if (sel && input.detailKind === 'PARTY') {
        communications.push({
            layer: 'renderer→main',
            ipc: 'db-get-party',
            sqlite: ['parties'],
            args: { id: sel.id },
            state: input.detailLoading ? 'loading' : input.partyLoaded ? 'ok' : 'empty_or_error',
        });
    }
    if (sel && input.detailKind === 'MATTER') {
        communications.push({
            layer: 'renderer→main',
            ipc: 'db-get-matter',
            sqlite: ['matters', 'matter_parties (JOIN)', 'parties (rol listesi)'],
            args: { id: sel.id },
            state: input.detailLoading ? 'loading' : input.matterLoaded ? 'ok' : 'empty_or_error',
        });
    }
    if (sel && input.detailKind === 'NONE' && input.plainFieldKeys.length > 0) {
        communications.push({
            layer: 'renderer',
            ipc: null,
            sqlite: [],
            note: 'Düz metin alanları yalnızca öneri satırındaki (db-suggest-*) verilerden türetildi; ek IPC yok.',
        });
    }

    return {
        version: 1,
        at: new Date().toISOString(),
        suggestion_query: input.suggestionQuery,
        items_count: input.itemsCount,
        selected_index: input.selectedIndex,
        selection: sel
            ? {
                  entity_type: sel.entityType,
                  id: sel.id,
                  label_preview: sel.label.slice(0, 160),
              }
            : null,
        communications,
        plain_field_keys: input.plainFieldKeys,
    };
}

export function formatMentionLineageForUi(payload: Record<string, unknown>): string[] {
    const lines: string[] = [];
    const q = typeof payload.suggestion_query === 'string' ? payload.suggestion_query : '';
    if (q) lines.push(`Sorgu: "${q.length > 40 ? `${q.slice(0, 40)}…` : q}"`);
    const sel = payload.selection as { entity_type?: string; id?: string } | null;
    if (sel?.entity_type) lines.push(`Seçim: ${sel.entity_type} · id=${sel.id ?? '—'}`);
    const comm = Array.isArray(payload.communications) ? payload.communications : [];
    for (const c of comm) {
        if (typeof c !== 'object' || !c) continue;
        const row = c as Record<string, unknown>;
        if (row.ipc) {
            const sqlite = Array.isArray(row.sqlite) ? (row.sqlite as string[]).slice(0, 4).join(', ') : '';
            lines.push(
                `IPC: ${String(row.ipc)}${row.state ? ` [${String(row.state)}]` : ''}${sqlite ? ` · ${sqlite}` : ''}`,
            );
        } else if (row.note) {
            lines.push(`Not: ${String(row.note).slice(0, 140)}${String(row.note).length > 140 ? '…' : ''}`);
        }
    }
    const keys = Array.isArray(payload.plain_field_keys) ? (payload.plain_field_keys as string[]) : [];
    if (keys.length) lines.push(`Düz metin alanları: ${keys.join(', ')}`);
    return lines.slice(0, 8);
}
