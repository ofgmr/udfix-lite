import type { EditorTypographyPayload } from '../utils/editorTypography';
import type { BlockStyleKey } from '../utils/blockStyleFormat';
import { getElectronInvoke } from '../utils/electronBridge';

export type {
    UyapYargiBirimiTablo,
    UyapProcessRoleLabel,
    UyapTarafRoleCode,
    UyapAdresTuruId,
    UyapAdresTuruTagKey,
    UyapDosyaTurLabel,
    MatterUyapMetadata,
    OfficeMatterPartyRole,
} from '../data/uyap';

export {
    UYAP_TARAF_ROLES,
    UYAP_ADRES_TURLERI,
    UYAP_DOSYA_TURLERI,
    UYAP_YARGI_BIRIMLERI,
    UYAP_YARGI_BIRIMI_BY_TABLO,
    OFFICE_MATTER_PARTY_ROLES,
    parseMatterUyapMetadata,
    mergeMatterMetadataUyap,
    resolveUyapProcessRoleLabel,
} from '../data/uyap';

// === NEW INTERFACES ===

/** Taraf tipi (UI): kişi / kurum. `type` alanı ile senkron tutulur. */
export type PartyKind = 'KISI' | 'KURUM';

export interface Party {
    id: string;
    type: 'INDIVIDUAL' | 'CORPORATE';
    /** Taraf tipi (KISI/KURUM). Yeni yazımlarda zorunlu; eski kayıtlarda normalize edilir. */
    party_kind?: PartyKind | string | null;
    full_name: string;
    id_number?: string;
    tax_office?: string;
    email?: string;
    phone?: string;
    address?: string;
    postal_address?: string;
    secondary_address?: string;
    property_address?: string;
    power_of_attorney_journal?: string;
    is_client: boolean;
    metadata?: string | null; // JSON string
    created_at: string;
    updated_at: string;
}

/** Geniş dava / dosya türü (hukuk, ceza, idari, UYAP soruşturma vb.) — legacy; prefer MatterMerci. */
export type MatterCategory =
    | MatterMerci
    | 'CIVIL'
    | 'CRIMINAL'
    | 'ADMINISTRATIVE'
    | 'CONSTITUTIONAL'
    | 'PROSECUTION'
    | 'MEDIATION'
    | 'SETTLEMENT'
    | 'ENFORCEMENT_PROCEEDING'
    | 'ADVISORY_WORK'
    | 'OTHER';

/** Merci — stored in `matters.matter_category`. */
export type MatterMerci =
    | 'COURT'
    | 'ENFORCEMENT_OFFICE'
    | 'CBS'
    | 'ADMINISTRATIVE_BODY'
    | 'OTHER';

export interface Matter {
    id: string;
    matter_type:
        | 'LAW_CASE'
        | 'ENFORCEMENT'
        | 'ADVISORY'
        | 'MEDIATION'
        | 'PROSECUTION'
        | 'ARBITRATION';
    matter_category?: MatterCategory | string | null;
    internal_id: string;
    title: string;
    court_name?: string;
    /** Normalized court row when set (SQLite FK); optional free-text remains in `court_name`. */
    court_id?: string | null;
    file_number?: string;
    esas_no?: string;
    dis_no?: string;
    decision_number?: string;
    status: 'OPEN' | 'CLOSED' | 'ARCHIVED' | 'APPEAL';
    opening_date?: string;
    closing_date?: string;
    metadata?: string | null; // JSON string
    created_at: string;
    updated_at: string;
    parties?: Array<Party & { role: string }>;
    parties_list?: string; // Joined field from GROUP_CONCAT
    attributes_search?: string | null;
}

export type ClientReportSummary = {
    matterCount: number;
    davaOpen: number;
    davaTotal: number;
    icraOpen: number;
    icraTotal: number;
    appealCount: number;
    openCount: number;
    closedCount: number;
};

export type ClientReportRow = {
    matterId: string;
    karsiTaraf: string;
    fileNumber: string;
    courtName: string;
    tur: string;
    kayit: string;
    dosyaTuru: string;
    openingDate: string;
    closingDate: string;
    status: string;
    uyapDurum: string;
    sifat: string;
    lastEvrakTur: string;
    lastEvrakDate: string;
    lastOperations: string;
};

export type ClientReport = {
    partyId: string;
    partyName: string;
    generatedAt: string;
    suggestedFileName: string;
    summary: ClientReportSummary;
    rows: ClientReportRow[];
    csvText: string;
};

export interface MatterDecision {
    id: string;
    matter_id: string;
    decision_no?: string | null;
    decision_date?: string | null;
    court_name?: string | null;
    notes?: string | null;
    created_at?: string;
}

export interface Note {
    id: string;
    title: string;
    content_json: string; // Tiptap JSON
    content_plain: string; // Plain text for search / preview
    parent_type: 'MATTER' | 'PARTY' | 'DOCUMENT' | 'GENERAL';
    parent_id?: string;
    is_pinned: boolean;
    created_at: string;
    updated_at: string;
    metadata?: string | null;
    tags?: Tag[];
    rank?: number;
}

/** List row without heavy content_json (lazy-load body on open). */
export interface NoteSummary {
    id: string;
    title: string;
    content_preview: string | null;
    parent_type: string;
    parent_id: string | null;
    is_pinned: number | boolean;
    metadata: string | null;
    created_at: string;
    updated_at: string;
}

export interface NoteLinkRow {
    id: string;
    source_note_id: string;
    target_note_id: string | null;
    unresolved_title: string | null;
    display_text: string | null;
    created_at: string;
    target_title?: string;
    source_title?: string;
    source_parent_type?: string;
    source_parent_id?: string;
}

export interface NoteEntityMentionRow {
    target_id: string;
    target_type: string;
    created_at: string;
    target_label: string | null;
}

export type SuggestEntityType = 'NOTE' | 'MATTER' | 'PARTY' | 'DOCUMENT' | 'KNOWLEDGE' | 'FILE';

export interface SuggestRow {
    id: string;
    label: string;
    entity_type: SuggestEntityType;
    matter_id?: string;
    file_path?: string;
}

export type TextTemplateCategory =
    | 'CONTRACT'
    | 'PETITION'
    | 'LETTER'
    | 'CLAUSE'
    | 'DEFINITION'
    | 'PROCEDURE'
    | 'LEGISLATION'
    | 'CUSTOM';

/** `##` öneri listesi + genişletme (content_json) */
export interface TextTemplateSuggestRow {
    id: string;
    name: string;
    description: string | null;
    category: TextTemplateCategory | string;
    content_json: string;
    placeholder_schema?: string | null;
    sort_order?: number;
    usage_count?: number;
    is_favorite?: number;
    updated_at?: string;
}

/** `##` açılır menü: şablon satırı veya not (mention ekleme). */
export type TextTemplateHashSuggestItem =
    | (TextTemplateSuggestRow & { kind: 'template' })
    | { kind: 'note'; id: string; label: string };

/** Ayrıntı veya kütüphane listesi (Faz 3) — gövde hariç hafif satırlar */
export interface TextTemplateListRow {
    id: string;
    name: string;
    description: string | null;
    category: string;
    content_plain: string | null;
    placeholder_schema?: string | null;
    sort_order: number;
    usage_count: number;
    is_favorite: number;
    created_at?: string;
    updated_at?: string;
}

export interface Tag {
    id: string;
    name: string;
    color: string; // Hex color
    usage_count?: number; // For tag cloud
}

/** Mahkeme kaydı — `matters.court_id` ile bağlanır. */
export interface Court {
    id: string;
    name: string;
    type?: string | null;
    city?: string | null;
    details?: string | null;
    created_at?: string;
    updated_at?: string;
}

export type EntityAttributeType = 'PARTY' | 'MATTER' | 'KNOWLEDGE';

export interface AttributeTagCatalogRow {
    id: string;
    key: string;
    label: string;
    entity_type: EntityAttributeType;
    is_system: number;
    sort_order: number;
    created_at?: string;
    updated_at?: string;
}

export interface EntityAttributeRow {
    id: string;
    entity_type: EntityAttributeType;
    entity_id: string;
    tag_key: string;
    tag_value: string;
    sort_order: number;
    created_at?: string;
    updated_at?: string;
}

export interface EntityAttributeUpsertRow {
    tag_key: string;
    tag_value: string;
    sort_order?: number;
}

export interface Link {
    id: string;
    source_id: string;
    source_type: string;
    target_id: string;
    target_type: string;
    link_context?: string;
    created_at: string;
    source_title?: string; // Joined field
}

export interface Folder {
    id: string;
    matter_id: string;
    name: string;
    parent_id: string | null;
}

export interface Document {
    id: string;
    matter_id: string;
    folder_id?: string | null;
    title: string;
    file_path?: string;
    file_hash?: string;
    doc_type?: string;
    source_system?: string;
    barcode_no?: string;
    incoming_date?: string | null;
    content?: string;
    metadata?: string; // JSON string
    created_at: string;
}

export interface Deadline {
    id: string;
    matter_id?: string | null;
    party_id?: string | null;
    /** Linked Yapılacaklar row when event_type is GOREV (mirror). */
    task_id?: string | null;
    event_type: string;
    event_date: string;
    description?: string;
    is_completed: boolean;
    reminder_date?: string;
    calendar_metadata?: string; // JSON string for external calendar integration
    created_at: string;
}

export type DeadlineFilters = {
    matterId?: string;
    partyId?: string;
    upcoming?: boolean;
    /** Inclusive lower bound (ISO / SQLite datetime string) */
    from?: string;
    /** Inclusive upper bound (ISO / SQLite datetime string) */
    to?: string;
};

export type TaskStatus = 'open' | 'done';

export interface Task {
    id: string;
    title: string;
    status: TaskStatus;
    due_date?: string | null;
    matter_id?: string | null;
    party_id?: string | null;
    source_note_id?: string | null;
    completed_at?: string | null;
    created_at: string;
    updated_at: string;
}

export type TaskFilters = {
    status?: TaskStatus | 'all';
    matterId?: string;
    partyId?: string;
    hasDueDate?: boolean;
    from?: string;
    to?: string;
    includeDone?: boolean;
    sourceNoteId?: string;
};

export interface KnowledgeItem {
    id: string;
    /** `LEGISLATIVE` is leftover-only; writers coerce it to `PRECEDENT` (ADR-0012). */
    type: 'PRECEDENT' | 'BOOK' | 'ARTICLE' | 'LEGISLATIVE';
    title: string;
    author?: string;
    content?: string;
    /** Full body length; list/search rows only send a short `content` preview. */
    content_chars?: number;
    source_url?: string;
    metadata?: string; // JSON string
    tags?: string; // Comma separated tags
    attributes_search?: string | null;
    created_at: string;
}

export type SearchAllScope = 'all' | 'matters' | 'parties' | 'notes' | 'knowledge';

export interface SearchResults {
    notes: Note[];
    parties: Party[];
    matters: Matter[];
    knowledge?: KnowledgeItem[];
}

export interface UyapDavaKonuOption {
    davaKonuId: number;
    yargiTuru: '6' | '7';
    aciklama: string;
    altKategoriler?: string[];
}

export interface UyapDavaTurAltOption {
    davaTurId: number;
    aciklama: string;
}

export interface UyapDavaTurOption {
    davaTurId: number;
    aciklama: string;
    dosyaTurKod?: number;
    mahkemeKod?: string;
    arabuluculukSartiVar?: boolean;
    altTurler: UyapDavaTurAltOption[];
}

export interface UyapDanistayDavaTuruOption {
    kod: number;
    aciklama: string;
}

export interface UyapArabuluculukUzmanlikAlaniOption {
    kod: string;
    kodTuru?: string;
    tktId?: string;
    aciklama: string;
}

export interface UyapFullTaxonomySnapshot {
    schemaVersion: number;
    sourcePath: string;
    davaKonular: UyapDavaKonuOption[];
    davaTurleri: UyapDavaTurOption[];
    danistayDavaTurleri: UyapDanistayDavaTuruOption[];
    arabuluculukUzmanlikAlanlari: UyapArabuluculukUzmanlikAlaniOption[];
}

export interface EditorTypographyDefaultsRow {
    payload: EditorTypographyPayload;
    applyOnOpen: boolean;
}

export interface EditorTypographyPreset {
    id: string;
    name: string;
    payload: EditorTypographyPayload;
    sort_order: number;
    created_at: string;
}

export interface FileTagRow {
    path: string;
    tag: string;
    created_at: string;
}

export interface StarredFileRow {
    path: string;
    pinned_at: string;
}

export interface RecentFileRow {
    path: string;
    opened_at: string;
}

export interface DocumentVersionRow {
    id: string;
    document_id: string;
    version_no: number;
    created_at: string;
    source: 'auto' | 'manual' | 'recovery' | 'import';
    content: string;
    checksum: string;
    size_bytes: number;
    /** Kullanıcı verdiği kısa ad (isteğe bağlı). */
    label?: string | null;
}

export interface DocumentDraftRow {
    document_id: string;
    content: string;
    checksum: string;
    updated_at: string;
}

export interface EditorDocumentRecoveryItem {
    document_id: string;
    title: string;
    kind: 'editor' | 'udf';
    file_path: string | null;
    file_exists: boolean | null;
    created_at: string | null;
    updated_at: string | null;
    last_opened_at: string | null;
    latest_version_at: string | null;
    latest_version_no: number | null;
    version_count: number;
    latest_size_bytes: number | null;
    draft_updated_at: string | null;
    has_draft: boolean;
    is_orphan: boolean;
    sort_at: string | null;
}

export interface DocumentRecoveryContent {
    document_id: string;
    content: string;
    checksum: string;
    source: 'draft' | 'version';
    updated_at: string;
}

const getInvoke = (): (<T>(channel: string, ...args: unknown[]) => Promise<T>) =>
    getElectronInvoke() as (<T>(channel: string, ...args: unknown[]) => Promise<T>);

export const DataService = {
    // === DATA METHODS ===

    // --- Parties ---
    async getParties(filters?: { isClient?: boolean }): Promise<Party[]> {
        const invoke = getInvoke();
        return invoke('db-get-parties', filters);
    },

    async getParty(id: string): Promise<Party> {
        const invoke = getInvoke();
        return invoke('db-get-party', id);
    },

    async addParty(party: Partial<Party>): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-add-party', party);
    },

    async updateParty(party: Party): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-update-party', party);
    },

    async deleteParty(id: string): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-delete-party', id);
    },

    // --- Matters ---
    async getMatters(filters?: {
        status?: string;
        matter_type?: string;
        matter_category?: string;
        party_id?: string;
    }): Promise<Matter[]> {
        const invoke = getInvoke();
        return invoke('db-get-matters', filters);
    },

    async getMatter(id: string): Promise<Matter> {
        const invoke = getInvoke();
        return invoke('db-get-matter', id);
    },

    async addMatter(matter: Partial<Matter>): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-add-matter', matter);
    },

    async updateMatter(matter: Matter): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-update-matter', matter);
    },

    async deleteMatter(id: string): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-delete-matter', id);
    },

    async getMerciNameSuggestions(
        merci: MatterMerci | string,
        query?: string,
        limit?: number,
    ): Promise<string[]> {
        const invoke = getInvoke();
        const raw = await invoke('db-get-merci-name-suggestions', { merci, query, limit });
        return Array.isArray(raw) ? (raw as string[]) : [];
    },

    async listCourts(): Promise<Court[]> {
        const invoke = getInvoke();
        const raw = await invoke('db-list-courts');
        return Array.isArray(raw) ? (raw as Court[]) : [];
    },

    async addCourt(row: Pick<Court, 'name'> & Partial<Pick<Court, 'id' | 'type' | 'city' | 'details'>>): Promise<void> {
        const invoke = getInvoke();
        await invoke('db-add-court', row);
    },

    async linkPartyToMatter(params: { matterId: string, partyId: string, role: string }): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-link-party-to-matter', params);
    },

    async unlinkPartyFromMatter(params: { matterId: string, partyId: string }): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-unlink-party-from-matter', params);
    },

    async getMatterDecisions(matterId: string): Promise<MatterDecision[]> {
        const invoke = getInvoke();
        const raw = await invoke('db-get-matter-decisions', matterId);
        return Array.isArray(raw) ? (raw as MatterDecision[]) : [];
    },

    async addMatterDecision(
        row: Pick<MatterDecision, 'matter_id'> &
            Partial<Pick<MatterDecision, 'id' | 'decision_no' | 'decision_date' | 'court_name' | 'notes'>>
    ): Promise<void> {
        const invoke = getInvoke();
        await invoke('db-add-matter-decision', row);
    },

    async updateMatterDecision(
        row: Pick<MatterDecision, 'id'> & Partial<Pick<MatterDecision, 'decision_no' | 'decision_date' | 'court_name' | 'notes'>>
    ): Promise<void> {
        const invoke = getInvoke();
        await invoke('db-update-matter-decision', row);
    },

    async deleteMatterDecision(id: string): Promise<void> {
        const invoke = getInvoke();
        await invoke('db-delete-matter-decision', id);
    },

    // --- Notes ---
    async getNotes(filters?: { parentType?: string, parentId?: string, isPinned?: boolean }): Promise<Note[]> {
        const invoke = getInvoke();
        return invoke('db-get-notes', filters);
    },

    async getNotesSummary(filters?: { parentType?: string, parentId?: string, isPinned?: boolean }): Promise<NoteSummary[]> {
        const invoke = getInvoke();
        return invoke('db-get-notes-summary', filters);
    },

    async getRecentNoteSummary(): Promise<NoteSummary | null> {
        const invoke = getInvoke();
        return invoke('db-get-recent-note-summary');
    },

    /** Notlar: parent_type=PARTY veya @mention ile tarafa bağlı; dedup party zinciri dahil. */
    async getPartyRelatedNotes(partyId: string, limit?: number): Promise<NoteSummary[]> {
        const invoke = getInvoke();
        const raw = await invoke('db-get-party-related-notes', partyId, limit ?? 5);
        return Array.isArray(raw) ? (raw as NoteSummary[]) : [];
    },

    async getPartyRelatedCounts(
        partyId: string
    ): Promise<{ matter_count: number; note_count: number }> {
        const invoke = getInvoke();
        const raw = (await invoke('db-get-party-related-counts', partyId)) as unknown;
        if (raw == null || typeof raw !== 'object') {
            return { matter_count: 0, note_count: 0 };
        }
        const r = raw as { matter_count?: number; note_count?: number };
        return {
            matter_count: Number(r.matter_count ?? 0),
            note_count: Number(r.note_count ?? 0),
        };
    },

    async getClientReport(partyId: string, lastEvrakLimit?: number): Promise<ClientReport | null> {
        const id = String(partyId ?? '').trim();
        if (!id) return null;
        const invoke = getInvoke();
        const raw = await invoke('db-get-client-report', { partyId: id, lastEvrakLimit });
        if (raw == null || typeof raw !== 'object') return null;
        return raw as ClientReport;
    },

    async showSaveCsvDialog(suggestedFileName: string): Promise<string | null> {
        const invoke = getInvoke();
        const path = await invoke<string | null>('fs-show-save-csv-dialog', {
            suggestedFileName,
        });
        return typeof path === 'string' && path.trim() ? path : null;
    },

    async writeTextFile(filePath: string, contents: string): Promise<boolean> {
        const invoke = getInvoke();
        const result = await invoke<{ ok?: boolean }>('fs-write-text-file', {
            path: filePath,
            contents,
        });
        return Boolean(result?.ok);
    },

    async getNote(id: string): Promise<Note> {
        const invoke = getInvoke();
        return invoke('db-get-note', id);
    },

    async addNote(note: Partial<Note>): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-add-note', note);
    },

    async updateNote(note: Partial<Note> & { id: string }): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-update-note', note);
    },

    async deleteNote(id: string): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-delete-note', id);
    },

    async searchNotes(
        query: string,
        limit?: number,
        filters?: { parentType?: string; parentId?: string }
    ): Promise<Note[]> {
        const invoke = getInvoke();
        return invoke('db-search-notes', query, limit ?? 50, filters);
    },

    async getNoteOutboundNoteLinks(noteId: string): Promise<NoteLinkRow[]> {
        const invoke = getInvoke();
        return invoke('db-get-note-outbound-note-links', noteId);
    },

    async getNoteBacklinksNotes(noteId: string): Promise<NoteLinkRow[]> {
        const invoke = getInvoke();
        return invoke('db-get-note-backlinks-notes', noteId);
    },

    async getNoteOutboundEntityMentions(noteId: string): Promise<NoteEntityMentionRow[]> {
        const invoke = getInvoke();
        return invoke('db-get-note-outbound-entity-mentions', noteId);
    },

    async suggestNotesAndEntities(query: string, limit?: number): Promise<{
        notes: SuggestRow[];
        parties: SuggestRow[];
        matters: SuggestRow[];
        documents: SuggestRow[];
        knowledge: SuggestRow[];
        files: SuggestRow[];
    }> {
        const invoke = getInvoke();
        const raw = await invoke('db-suggest-notes-and-entities', query, limit ?? 24);
        const r = raw as {
            notes?: SuggestRow[];
            parties?: SuggestRow[];
            matters?: SuggestRow[];
            documents?: SuggestRow[];
            knowledge?: SuggestRow[];
            files?: SuggestRow[];
        };
        return {
            notes: Array.isArray(r.notes) ? r.notes : [],
            parties: Array.isArray(r.parties) ? r.parties : [],
            matters: Array.isArray(r.matters) ? r.matters : [],
            documents: Array.isArray(r.documents) ? r.documents : [],
            knowledge: Array.isArray(r.knowledge) ? r.knowledge : [],
            files: Array.isArray(r.files) ? r.files : [],
        };
    },

    /** @ mention — notlar hariç (IPC `db-suggest-entities-only`). */
    async suggestEntitiesOnly(
        query: string,
        limit?: number
    ): Promise<{
        parties: SuggestRow[];
        matters: SuggestRow[];
        documents: SuggestRow[];
        knowledge: SuggestRow[];
        files: SuggestRow[];
    }> {
        const invoke = getInvoke();
        const raw = await invoke('db-suggest-entities-only', query, limit ?? 32);
        const r = raw as {
            parties?: SuggestRow[];
            matters?: SuggestRow[];
            documents?: SuggestRow[];
            knowledge?: SuggestRow[];
            files?: SuggestRow[];
        };
        return {
            parties: Array.isArray(r.parties) ? r.parties : [],
            matters: Array.isArray(r.matters) ? r.matters : [],
            documents: Array.isArray(r.documents) ? r.documents : [],
            knowledge: Array.isArray(r.knowledge) ? r.knowledge : [],
            files: Array.isArray(r.files) ? r.files : [],
        };
    },

    /** ## menüsü — yalnız not başlıkları. */
    async suggestNoteTitles(query: string, limit?: number): Promise<SuggestRow[]> {
        const invoke = getInvoke();
        const raw = await invoke('db-suggest-note-titles', query, limit ?? 20);
        return Array.isArray(raw) ? (raw as SuggestRow[]) : [];
    },

    async suggestTextTemplates(query: string, limit: number = 20): Promise<TextTemplateSuggestRow[]> {
        const invoke = getInvoke();
        const raw = (await invoke('db-suggest-text-templates', query, limit)) as unknown;
        return Array.isArray(raw) ? (raw as TextTemplateSuggestRow[]) : [];
    },

    async getTextTemplate(id: string): Promise<(TextTemplateSuggestRow & { content_json: string }) | null> {
        const invoke = getInvoke();
        const row = (await invoke('db-get-text-template', id)) as
            | (TextTemplateSuggestRow & { content_json: string; created_at?: string })
            | null
            | undefined;
        return row ?? null;
    },

    async incrementTextTemplateUsage(id: string): Promise<void> {
        const invoke = getInvoke();
        try {
            await invoke('db-increment-text-template-usage', id);
        } catch {
            /* noop: IPC yok / test */
        }
    },

    async listTextTemplates(filters?: { category?: string; limit?: number }): Promise<TextTemplateListRow[]> {
        const invoke = getInvoke();
        const raw = (await invoke('db-list-text-templates', filters)) as unknown;
        return Array.isArray(raw) ? (raw as TextTemplateListRow[]) : [];
    },

    async addTextTemplate(payload: {
        name: string;
        category: TextTemplateCategory;
        content_json: string;
        content_plain?: string | null;
        placeholder_schema?: string | null;
        description?: string | null;
        sort_order?: number;
    }): Promise<{ ok: boolean; id?: string; error?: string }> {
        const invoke = getInvoke();
        const raw = (await invoke('db-add-text-template', payload)) as unknown;
        if (raw == null || typeof raw !== 'object' || !('ok' in raw)) {
            return { ok: false as const, error: 'ipc_unavailable' };
        }
        return raw as { ok: boolean; id?: string; error?: string };
    },

    async updateTextTemplate(payload: {
        id: string;
        name?: string;
        category?: TextTemplateCategory | string;
        description?: string | null;
        placeholder_schema?: string | null;
        sort_order?: number;
        is_favorite?: number | boolean;
        content_json?: string;
        content_plain?: string | null;
    }): Promise<{ ok: boolean; error?: string }> {
        const invoke = getInvoke();
        const raw = (await invoke('db-update-text-template', payload)) as unknown;
        if (raw == null || typeof raw !== 'object' || !('ok' in raw)) {
            return { ok: false as const, error: 'ipc_unavailable' };
        }
        return raw as { ok: boolean; error?: string };
    },

    async deleteTextTemplate(id: string): Promise<{ ok: boolean; error?: string }> {
        const invoke = getInvoke();
        const raw = (await invoke('db-delete-text-template', id)) as unknown;
        if (raw == null || typeof raw !== 'object' || !('ok' in raw)) {
            return { ok: false as const, error: 'ipc_unavailable' };
        }
        return raw as { ok: boolean; error?: string };
    },

    /** @ mention düz metin paneli — veri hattı denetimi (SQLite `mention_lineage_log`). */
    async logMentionLineage(payload: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }> {
        const invoke = getInvoke();
        const raw = (await invoke('db-log-mention-lineage', payload)) as unknown;
        if (raw == null || typeof raw !== 'object' || !('ok' in raw)) {
            return { ok: false as const, error: 'ipc_unavailable' };
        }
        return raw as { ok: boolean; id?: string; error?: string };
    },

    // --- Tags ---
    async getTags(): Promise<Tag[]> {
        const invoke = getInvoke();
        return invoke('db-get-tags');
    },

    async getTagCloud(): Promise<Tag[]> {
        const invoke = getInvoke();
        return invoke('db-get-tag-cloud');
    },

    async addTag(tag: Partial<Tag>): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-add-tag', tag);
    },

    async updateTag(tag: Tag): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-update-tag', tag);
    },

    async deleteTag(id: string): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-delete-tag', id);
    },

    async linkTagToEntity(params: { tagId: string, entityId: string, entityType: string }): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-link-tag-to-entity', params);
    },

    async unlinkTagFromEntity(params: { tagId: string, entityId: string }): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-unlink-tag-from-entity', params);
    },

    async getEntityTags(params: { entityId: string, entityType: string }): Promise<Tag[]> {
        const invoke = getInvoke();
        return invoke('db-get-entity-tags', params);
    },

    // --- Links ---
    async createLink(link: Partial<Link>): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-create-link', link);
    },

    async getBacklinks(params: { entityId: string, entityType: string }): Promise<Link[]> {
        const invoke = getInvoke();
        return invoke('db-get-backlinks', params);
    },

    async deleteLink(id: string): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-delete-link', id);
    },

    // --- Structured entity attributes (tag + value rows) ---
    async listAttributeTags(entityType: EntityAttributeType): Promise<AttributeTagCatalogRow[]> {
        const invoke = getInvoke();
        const raw = (await invoke('db-list-attribute-tags', entityType)) as unknown;
        return Array.isArray(raw) ? (raw as AttributeTagCatalogRow[]) : [];
    },

    async addAttributeTag(payload: {
        entity_type: EntityAttributeType;
        key: string;
        label?: string;
        sort_order?: number;
    }): Promise<{ ok: boolean; row?: AttributeTagCatalogRow; error?: string }> {
        const invoke = getInvoke();
        const raw = (await invoke('db-add-attribute-tag', payload)) as unknown;
        if (raw == null || typeof raw !== 'object' || !('ok' in raw)) {
            return { ok: false as const, error: 'ipc_unavailable' };
        }
        return raw as { ok: boolean; row?: AttributeTagCatalogRow; error?: string };
    },

    async getEntityAttributes(
        entityType: EntityAttributeType,
        entityId: string
    ): Promise<EntityAttributeRow[]> {
        const invoke = getInvoke();
        const raw = (await invoke('db-get-entity-attributes', {
            entity_type: entityType,
            entity_id: entityId,
        })) as unknown;
        return Array.isArray(raw) ? (raw as EntityAttributeRow[]) : [];
    },

    async upsertEntityAttributes(params: {
        entity_type: EntityAttributeType;
        entity_id: string;
        rows: EntityAttributeUpsertRow[];
    }): Promise<{ ok: boolean; count?: number; error?: string }> {
        const invoke = getInvoke();
        const raw = (await invoke('db-upsert-entity-attributes', params)) as unknown;
        if (raw == null || typeof raw !== 'object' || !('ok' in raw)) {
            return { ok: false as const, error: 'ipc_unavailable' };
        }
        return raw as { ok: boolean; count?: number; error?: string };
    },

    // --- Documents ---
    async getDocuments(matterId: string): Promise<Document[]> {
        const invoke = getInvoke();
        return invoke('db-get-documents', matterId);
    },

    async getFolders(matterId: string): Promise<Folder[]> {
        const invoke = getInvoke();
        return invoke('db-get-folders', matterId);
    },

    async addDocument(document: Partial<Document>): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-add-document', document);
    },

    async updateDocument(document: Partial<Document> & { id: string }): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-update-document', document);
    },

    async deleteDocument(id: string): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-delete-document', id);
    },

    // --- Deadlines ---
    async getDeadlines(filters?: DeadlineFilters): Promise<Deadline[]> {
        const invoke = getInvoke();
        const rows = (await invoke('db-get-deadlines', filters)) as Array<
            Omit<Deadline, 'is_completed'> & { is_completed: number | boolean }
        >;
        return (Array.isArray(rows) ? rows : []).map((row) => ({
            ...row,
            is_completed: row.is_completed === true || row.is_completed === 1,
        }));
    },

    async addDeadline(deadline: Partial<Deadline>): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-add-deadline', deadline);
    },

    async updateDeadline(deadline: Partial<Deadline> & { id: string }): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-update-deadline', deadline);
    },

    async deleteDeadline(id: string): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-delete-deadline', id);
    },

    // --- Tasks (Yapılacaklar) ---
    async getTasks(filters?: TaskFilters): Promise<Task[]> {
        const invoke = getInvoke();
        const rows = (await invoke('db-get-tasks', filters)) as Task[];
        return Array.isArray(rows) ? rows : [];
    },

    async addTask(task: Partial<Task>): Promise<Task> {
        const invoke = getInvoke();
        return invoke('db-add-task', task) as Promise<Task>;
    },

    async updateTask(task: Partial<Task> & { id: string }): Promise<Task | null> {
        const invoke = getInvoke();
        return invoke('db-update-task', task) as Promise<Task | null>;
    },

    async deleteTask(id: string): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-delete-task', id);
    },

    // --- Knowledge Base ---
    async getKnowledgeBase(filters?: {
        type?: string;
        linked_party_id?: string;
        linked_matter_id?: string;
        query?: string;
    }): Promise<KnowledgeItem[]> {
        const invoke = getInvoke();
        return invoke('db-get-knowledge-base', filters);
    },

    async getKnowledgeItem(id: string): Promise<KnowledgeItem | null> {
        const invoke = getInvoke();
        const rid = String(id || '').trim();
        if (!rid) return null;
        const row = await invoke('db-get-knowledge-item', rid);
        return (row as KnowledgeItem | null) ?? null;
    },

    async addKnowledgeBase(item: Partial<KnowledgeItem>): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-add-knowledge-base', item);
    },

    async updateKnowledgeBase(item: Partial<KnowledgeItem> & { id: string }): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-update-knowledge-base', item);
    },

    async deleteKnowledgeBase(id: string): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-delete-knowledge-base', id);
    },

    async getUyapFullTaxonomy(): Promise<UyapFullTaxonomySnapshot | null> {
        const invoke = getInvoke();
        const raw = (await invoke('db-get-uyap-full-taxonomy')) as unknown;
        if (!raw || typeof raw !== 'object') return null;
        const r = raw as Record<string, unknown>;
        if (r.ok !== true) return null;
        return {
            schemaVersion: Number(r.schemaVersion || 0),
            sourcePath: String(r.sourcePath || ''),
            davaKonular: Array.isArray(r.davaKonular) ? (r.davaKonular as UyapDavaKonuOption[]) : [],
            davaTurleri: Array.isArray(r.davaTurleri) ? (r.davaTurleri as UyapDavaTurOption[]) : [],
            danistayDavaTurleri: Array.isArray(r.danistayDavaTurleri)
                ? (r.danistayDavaTurleri as UyapDanistayDavaTuruOption[])
                : [],
            arabuluculukUzmanlikAlanlari: Array.isArray(r.arabuluculukUzmanlikAlanlari)
                ? (r.arabuluculukUzmanlikAlanlari as UyapArabuluculukUzmanlikAlaniOption[])
                : [],
        };
    },

    // --- Global Search ---
    async searchAll(query: string, limit?: number, scope: SearchAllScope = 'all'): Promise<SearchResults> {
        const invoke = getInvoke();
        return invoke('db-search-all', query, limit, scope);
    },

    // --- Editor typography (defaults + presets) ---
    async getEditorTypographyDefaults(): Promise<EditorTypographyDefaultsRow> {
        const invoke = getInvoke();
        return invoke('db-get-editor-typography-defaults');
    },

    async setEditorTypographyDefaults(data: {
        payload: EditorTypographyPayload;
        applyOnOpen?: boolean;
    }): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-set-editor-typography-defaults', data);
    },

    async listEditorTypographyPresets(): Promise<EditorTypographyPreset[]> {
        const invoke = getInvoke();
        const rows = (await invoke('db-list-editor-typography-presets')) as Array<{
            id: string;
            name: string;
            payload: string;
            sort_order: number;
            created_at: string;
        }>;
        return rows.map((r) => ({
            ...r,
            payload: (() => {
                try {
                    return JSON.parse(r.payload || '{}') as EditorTypographyPayload;
                } catch {
                    return {} as EditorTypographyPayload;
                }
            })(),
        }));
    },

    async addEditorTypographyPreset(row: {
        name: string;
        payload: EditorTypographyPayload;
    }): Promise<{ id: string }> {
        const invoke = getInvoke();
        return invoke('db-add-editor-typography-preset', row);
    },

    async updateEditorTypographyPreset(row: {
        id: string;
        name?: string;
        payload?: EditorTypographyPayload;
        sort_order?: number;
    }): Promise<{ ok: boolean }> {
        const invoke = getInvoke();
        return invoke('db-update-editor-typography-preset', row);
    },

    async deleteEditorTypographyPreset(id: string): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-delete-editor-typography-preset', id);
    },

    async getEditorBlockStyleDefaults(): Promise<Partial<Record<BlockStyleKey, EditorTypographyPayload>>> {
        const invoke = getInvoke();
        const raw = (await invoke('db-get-editor-block-style-defaults')) as Record<string, EditorTypographyPayload>;
        return raw && typeof raw === 'object' ? raw : {};
    },

    async setEditorBlockStyleDefaults(
        payload: Partial<Record<BlockStyleKey, EditorTypographyPayload>>,
    ): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-set-editor-block-style-defaults', payload);
    },

    async getHeaderFooterLibrary(): Promise<{
        presets: unknown[];
        assets: Record<string, Record<string, string>>;
    }> {
        const invoke = getInvoke();
        const raw = (await invoke('db-get-header-footer-library')) as {
            presets?: unknown[];
            assets?: Record<string, Record<string, string>>;
        };
        return {
            presets: Array.isArray(raw?.presets) ? raw.presets : [],
            assets: raw?.assets && typeof raw.assets === 'object' ? raw.assets : {},
        };
    },

    async setHeaderFooterLibrary(data: {
        presets: unknown[];
        assets?: Record<string, Record<string, string>>;
        allowEmpty?: boolean;
    }): Promise<{ ok: boolean; skippedEmpty?: boolean }> {
        const invoke = getInvoke();
        return invoke('db-set-header-footer-library', data);
    },

    async getDocumentHeaderFooter(documentId: string): Promise<unknown | null> {
        const invoke = getInvoke();
        const raw = await invoke('db-get-document-hf', documentId);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        return raw;
    },

    async setDocumentHeaderFooter(data: {
        documentId: string;
        payload: unknown;
        allowEmpty?: boolean;
    }): Promise<{ ok: boolean; skippedEmpty?: boolean }> {
        const invoke = getInvoke();
        return invoke('db-set-document-hf', data);
    },

    // --- Filesystem metadata (optional SQLite layer) ---
    async getFileTags(path: string): Promise<FileTagRow[]> {
        const invoke = getInvoke();
        return invoke('db-get-file-tags', path);
    },

    async addFileTag(path: string, tag: string): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-add-file-tag', { path, tag });
    },

    async removeFileTag(path: string, tag: string): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-remove-file-tag', { path, tag });
    },

    async getStarredFiles(limit = 100): Promise<StarredFileRow[]> {
        const invoke = getInvoke();
        return invoke('db-get-starred-files', limit);
    },

    async setFileStarred(path: string, starred: boolean): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-set-file-starred', { path, starred });
    },

    async touchRecentFile(path: string): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-touch-recent-file', path);
    },

    async getRecentFiles(limit = 40): Promise<RecentFileRow[]> {
        const invoke = getInvoke();
        return invoke('db-get-recent-files', limit);
    },

    // --- Editor document history + recovery ---
    async upsertEditorDocument(params: {
        documentId: string;
        title?: string;
        kind?: 'editor' | 'udf';
        filePath?: string | null;
        touchOpened?: boolean;
    }): Promise<{ ok: boolean }> {
        const invoke = getInvoke();
        return invoke('db-upsert-editor-document', params);
    },

    async listDocumentRecoveryItems(limit = 20): Promise<EditorDocumentRecoveryItem[]> {
        const invoke = getInvoke();
        const rows = await invoke<EditorDocumentRecoveryItem[]>('db-list-document-recovery-items', limit);
        return Array.isArray(rows) ? rows : [];
    },

    async getDocumentRecoveryContent(documentId: string): Promise<DocumentRecoveryContent | null> {
        const invoke = getInvoke();
        const row = await invoke<DocumentRecoveryContent | null>('db-get-document-recovery-content', documentId);
        return row ?? null;
    },

    async upsertDocumentDraft(documentId: string, content: string): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-upsert-document-draft', { documentId, content });
    },

    async getDocumentDraft(documentId: string): Promise<DocumentDraftRow | null> {
        const invoke = getInvoke();
        const row = await invoke<DocumentDraftRow | null>('db-get-document-draft', documentId);
        return row ?? null;
    },

    async clearDocumentDraft(documentId: string): Promise<void> {
        const invoke = getInvoke();
        return invoke('db-clear-document-draft', documentId);
    },

    async createDocumentVersion(params: {
        documentId: string;
        content: string;
        source?: 'auto' | 'manual' | 'recovery' | 'import';
    }): Promise<{ created: boolean; id?: string; createdAt?: string }> {
        const invoke = getInvoke();
        return invoke('db-create-document-version', params);
    },

    async listDocumentVersions(
        documentId: string,
        limit = 50,
        offset = 0
    ): Promise<DocumentVersionRow[]> {
        const invoke = getInvoke();
        return invoke('db-list-document-versions', documentId, limit, offset);
    },

    async getDocumentVersion(versionId: string): Promise<DocumentVersionRow | null> {
        const invoke = getInvoke();
        const row = await invoke<DocumentVersionRow | null>('db-get-document-version', versionId);
        return row ?? null;
    },

    async updateDocumentVersionLabel(versionId: string, label: string | null): Promise<{ ok: boolean }> {
        const invoke = getInvoke();
        return invoke('db-update-document-version-label', { versionId, label });
    },

    async restoreDocumentVersion(params: {
        documentId: string;
        versionId: string;
    }): Promise<{ ok: boolean; content?: string }> {
        const invoke = getInvoke();
        return invoke('db-restore-document-version', params);
    },

    async pruneDocumentVersions(documentId: string, maxCount = 300): Promise<{ deleted: number }> {
        const invoke = getInvoke();
        return invoke('db-prune-document-versions', documentId, maxCount);
    },

    async getEntitlements(): Promise<{
        edition: 'lite' | 'katir';
        katirLive: boolean;
        accountPlan: 'lite' | 'katir';
        upgradePending: boolean;
        hasAccountToken: boolean;
        accountEmail: string | null;
        signedIn: boolean;
        phase: 'anonymous' | 'authenticated' | 'entitled' | 'grace' | 'expired' | 'revoked';
        periodEndsAt: string | null;
        graceEndsAt: string | null;
        reason: string;
        source: string;
        seatBound: boolean;
        boundLawyerName: string | null;
    }> {
        try {
            const invoke = getInvoke();
            const row = await invoke<{
                edition?: 'lite' | 'katir';
                katirLive?: boolean;
                accountPlan?: 'lite' | 'katir';
                upgradePending?: boolean;
                hasAccountToken?: boolean;
                accountEmail?: string | null;
                signedIn?: boolean;
                phase?: 'anonymous' | 'authenticated' | 'entitled' | 'grace' | 'expired' | 'revoked';
                periodEndsAt?: string | null;
                graceEndsAt?: string | null;
                reason?: string;
                source?: string;
                seatBound?: boolean;
                boundLawyerName?: string | null;
            }>('app-entitlements-get');
            const phase = row?.phase;
            return {
                edition: row?.edition === 'katir' ? 'katir' : 'lite',
                katirLive: row?.katirLive === true,
                accountPlan: row?.accountPlan === 'katir' ? 'katir' : 'lite',
                upgradePending: row?.upgradePending === true,
                hasAccountToken: row?.hasAccountToken === true,
                accountEmail: row?.accountEmail ?? null,
                signedIn: row?.signedIn === true,
                phase:
                    phase === 'authenticated' ||
                    phase === 'entitled' ||
                    phase === 'grace' ||
                    phase === 'expired' ||
                    phase === 'revoked'
                        ? phase
                        : 'anonymous',
                periodEndsAt: row?.periodEndsAt ?? null,
                graceEndsAt: row?.graceEndsAt ?? null,
                reason: typeof row?.reason === 'string' ? row.reason : '',
                source: typeof row?.source === 'string' ? row.source : 'none',
                seatBound: row?.seatBound === true,
                boundLawyerName: typeof row?.boundLawyerName === 'string' ? row.boundLawyerName : null,
            };
        } catch {
            return {
                edition: 'lite',
                katirLive: false,
                accountPlan: 'lite',
                upgradePending: false,
                hasAccountToken: false,
                accountEmail: null,
                signedIn: false,
                phase: 'anonymous',
                periodEndsAt: null,
                graceEndsAt: null,
                reason: 'Lisans yok.',
                source: 'none',
                seatBound: false,
                boundLawyerName: null,
            };
        }
    },

    async activateLicenseKey(licenseKey: string): Promise<{ ok: boolean; error?: string }> {
        try {
            const invoke = getInvoke();
            const trimmed = licenseKey.trim();
            return await invoke('app-account-activate-katir', { activationCode: trimmed, licenseKey: trimmed });
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    },

    async signOutAccount(): Promise<{ ok: boolean; error?: string }> {
        try {
            const invoke = getInvoke();
            return await invoke('app-account-sign-out');
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    },

    async activateKatirAccount(payload: { token: string; periodEndsAt: string }): Promise<{
        ok: boolean;
        error?: string;
    }> {
        try {
            const invoke = getInvoke();
            return await invoke('app-account-activate-katir', payload);
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    },

    async openExternalUrl(url: string): Promise<{ ok: boolean; error?: string }> {
        try {
            const invoke = getInvoke();
            return await invoke<{ ok: boolean; error?: string }>('app-open-external-url', url);
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    },

    async getUyapBridgeStatus(): Promise<UyapBridgeStatus> {
        try {
            const invoke = getInvoke();
            return await invoke('uyap-bridge-status');
        } catch (err) {
            return {
                up: false,
                sessionReady: false,
                sessionHost: null,
                sessionCookieCount: 0,
                walkRunning: false,
                lastWalk: null,
                lastInteractiveWalk: null,
                scanningQuietly: false,
                ingestCount: 0,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    },

    async startUyapWalk(payload?: {
        job?: UyapWalkJob;
        dosya?: string;
        downloadNew?: boolean;
        hesap?: boolean;
        keys?: string[];
        stale?: boolean;
        preview?: boolean;
        force?: boolean;
        destDir?: string;
        interactive?: boolean;
    }): Promise<{
        ok: boolean;
        error?: string;
        started?: boolean;
    }> {
        try {
            const invoke = getInvoke();
            const result = await invoke<{ ok?: boolean; error?: string; started?: boolean }>(
                'uyap-bridge-walk-start',
                payload,
            );
            if (!result?.ok) {
                return { ok: false, error: result?.error || 'İş başlatılamadı' };
            }
            return { ok: true, started: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    },

    async stopUyapWalk(): Promise<{ ok: boolean; error?: string }> {
        try {
            const invoke = getInvoke();
            return await invoke('uyap-bridge-walk-stop');
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    },

    async setUyapSchedule(enabled: boolean): Promise<{ ok: boolean; enabled?: boolean; error?: string }> {
        try {
            const invoke = getInvoke();
            return await invoke('uyap-bridge-schedule-set', enabled);
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    },

    async getUyapEvrakStats(): Promise<UyapEvrakStats> {
        try {
            const invoke = getInvoke();
            return await invoke('db-get-uyap-evrak-stats');
        } catch {
            return { matters: 0, mattersWithEvrak: 0, documents: 0, downloaded: 0 };
        }
    },

    async getUyapDashboard(): Promise<UyapDashboardStats | null> {
        try {
            const invoke = getInvoke();
            return await invoke('db-get-uyap-dashboard');
        } catch {
            return null;
        }
    },

    async setMatterHareketsizSnooze(matterId: string, untilIso: string | null): Promise<boolean> {
        const id = String(matterId || '').trim();
        if (!id) return false;
        try {
            const invoke = getInvoke();
            const result = await invoke<{ ok?: boolean }>('db-set-matter-hareketsiz-snooze', {
                matterId: id,
                untilIso,
            });
            return Boolean(result?.ok);
        } catch {
            return false;
        }
    },

    async searchUyapMatters(query?: string): Promise<UyapMatterPick[]> {
        const needle = String(query || '').trim();
        if (!needle) return [];
        try {
            const invoke = getInvoke();
            const rows = await invoke<UyapMatterPick[]>('db-search-uyap-matters', needle);
            return Array.isArray(rows) ? rows : [];
        } catch {
            return [];
        }
    },

    async getUyapEvrakTree(matterId: string): Promise<UyapEvrakTree> {
        try {
            const invoke = getInvoke();
            const tree = await invoke<UyapEvrakTree>('db-get-uyap-evrak-tree', matterId);
            return {
                folders: Array.isArray(tree?.folders) ? tree.folders : [],
                docs: Array.isArray(tree?.docs) ? tree.docs : [],
            };
        } catch {
            return { folders: [], docs: [] };
        }
    },

    async listRecentUyapEvrak(limit = 100): Promise<UyapRecentEvrak[] | null> {
        try {
            const invoke = getInvoke();
            const rows = await invoke<UyapRecentEvrak[]>('db-list-recent-uyap-evrak', limit);
            return Array.isArray(rows) ? rows : [];
        } catch {
            return null;
        }
    },

    async listNotifications(opts?: { unreadOnly?: boolean; limit?: number }): Promise<AppNotification[]> {
        try {
            const invoke = getInvoke();
            const rows = await invoke<AppNotification[]>('db-list-notifications', opts);
            return Array.isArray(rows) ? rows : [];
        } catch {
            return [];
        }
    },

    async markNotificationRead(id: string): Promise<{ ok: boolean }> {
        try {
            const invoke = getInvoke();
            return await invoke('db-mark-notification-read', id);
        } catch {
            return { ok: false };
        }
    },

    async markAllNotificationsRead(): Promise<{ ok: boolean }> {
        try {
            const invoke = getInvoke();
            return await invoke('db-mark-notifications-read-all');
        } catch {
            return { ok: false };
        }
    },

    async showNativeNotification(payload: { title: string; body?: string }): Promise<void> {
        try {
            const invoke = getInvoke();
            await invoke('app-show-native-notification', payload);
        } catch {
            /* ignore */
        }
    },

    async fileUrlForPath(filePath: string): Promise<string | null> {
        try {
            const invoke = getInvoke();
            return await invoke('fs-file-url', filePath);
        } catch {
            return null;
        }
    },

    async selectUyapEvrakDirectory(): Promise<{
        ok: boolean;
        path?: string;
        cancelled?: boolean;
        error?: string;
    }> {
        try {
            const invoke = getInvoke();
            return await invoke('fs-select-uyap-evrak-directory');
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    },

    async focusMainWindow(): Promise<boolean> {
        try {
            const invoke = getInvoke();
            return Boolean(await invoke('focus-main-window'));
        } catch {
            return false;
        }
    },

    async clearUyapPreview(documentId: string): Promise<{ ok: boolean; deleted?: boolean }> {
        try {
            const invoke = getInvoke();
            return await invoke('db-clear-uyap-preview', documentId);
        } catch {
            return { ok: false };
        }
    },
};

export type UyapWalkJob = 'katir' | 'hesap' | 'detail' | 'inventory' | 'evrak' | 'download';

export type UyapBridgeWalkProgress = {
    phase?: string;
    current?: number;
    total?: number;
    file_number?: string;
    job?: UyapWalkJob;
    result?: string;
    message?: string;
    level?: 'info' | 'warn' | 'error';
};

export type UyapWalkRecent = {
    file_number: string;
    result?: string;
    at?: string;
};

export type UyapWalkLogEvent = {
    at: string;
    level?: 'info' | 'warn' | 'error' | string;
    message: string;
    job?: UyapWalkJob | string | null;
    file_number?: string | null;
    phase?: string | null;
};

export type UyapBridgeLastWalk = {
    ok?: boolean;
    started?: boolean;
    finished?: boolean;
    stopped?: boolean;
    preempted?: boolean;
    error?: string;
    warning?: string;
    lawyer?: string;
    at?: string;
    job?: UyapWalkJob;
    class?: 'interactive' | 'background';
    scheduled?: boolean;
    dosyaNo?: string | null;
    stats?: Record<string, unknown>;
    progress?: UyapBridgeWalkProgress | null;
    recent?: UyapWalkRecent[];
    events?: UyapWalkLogEvent[];
};

export type UyapBridgeStatus = {
    up: boolean;
    sessionReady: boolean;
    sessionHost: string | null;
    sessionCookieCount: number;
    walkRunning: boolean;
    scanningQuietly?: boolean;
    lastWalk: UyapBridgeLastWalk | null;
    lastInteractiveWalk?: UyapBridgeLastWalk | null;
    ingestCount: number;
    scheduleEnabled?: boolean;
    lastEvrakScanAt?: string | null;
    catalogCoverage?: string | null;
    activity?: UyapWalkLogEvent[];
    seat?: {
        bound?: boolean;
        fullName?: string | null;
        verified?: boolean;
        mismatch?: boolean;
        seenFullName?: string | null;
        error?: string | null;
    };
    error?: string;
};

export type UyapEvrakStats = {
    matters: number;
    mattersWithEvrak: number;
    documents: number;
    downloaded: number;
};

export type UyapDosyaTurBucket = 'icra' | 'hukuk' | 'ceza' | 'idare' | 'other';

export type UyapBreakdownRow = {
    label: string;
    count: number;
    open?: number;
};

export type UyapOpeningMonthRow = {
    month: string;
    count: number;
    byType: Record<UyapDosyaTurBucket, number>;
    icraAlacak: number;
    icraAlacakAlacakli?: number;
    icraAlacakBorclu?: number;
    icraWithAmount: number;
    closed: number;
    stillOpen: number;
    unknown: number;
    closedThisMonth?: number;
    topLabels: UyapBreakdownRow[];
};

export type UyapIdleOpenMatter = {
    id: string;
    file_number: string;
    court_name: string | null;
    snoozeUntil?: string | null;
};

export type UyapTrailingWindowMetrics = {
    count: number;
    byType: Record<UyapDosyaTurBucket, number>;
    icraAlacak: number;
    icraAlacakAlacakli: number;
    icraAlacakBorclu: number;
};

export type UyapTrailingOpenings = {
    months12: number;
    months24: number;
    months36: number;
    months48?: number;
    months60?: number;
    window12?: UyapTrailingWindowMetrics;
    window24?: UyapTrailingWindowMetrics;
    window36?: UyapTrailingWindowMetrics;
    window48?: UyapTrailingWindowMetrics;
    window60?: UyapTrailingWindowMetrics;
};

export type UyapDashboardStats = {
    icra: number;
    icraAlacakli?: number;
    icraAlacakliOpen?: number;
    icraBorclu?: number;
    icraBorcluOpen?: number;
    icraUcuncu?: number;
    hukuk: number;
    ceza: number;
    idare: number;
    other: number;
    appeal: number;
    open: number;
    closed: number;
    total: number;
    statusByType?: Record<UyapDosyaTurBucket, { open: number; closed: number }>;
    allMatters: number;
    withFileNumber: number;
    uyapLinked: number;
    openingDated: number;
    openingWindow: number;
    /** Opening totals in the last 12/24/36/48/60 calendar months from today (includes the current month). */
    trailingOpenings?: UyapTrailingOpenings;
    /** Stored icra TL totals — chart overlay only; not a Katır KPI card. */
    alacak?: number;
    alacakOpen?: number;
    alacakAlacakli?: number;
    alacakAlacakliOpen?: number;
    alacakBorclu?: number;
    alacakBorcluOpen?: number;
    bakiye: number;
    evrakCards: number;
    evrakLast14Days?: number;
    /** Documents inserted in SQLite in the last 24h (`documents.created_at`), not portal date. */
    evrakAddedLast24Hours?: number;
    /** `app_meta.katir_last_evrak_scan_at` — last drip progress stamp, not a full-office dump. */
    lastEvrakScanAt?: string | null;
    /** Share of scannable file-numbered matters with catalog P < 1.0 (DLQ excluded). */
    inventoryCurrentPercent?: number | null;
    inventoryCurrentCount?: number;
    inventoryEligibleCount?: number;
    idleOpenCount?: number;
    idleSnoozedCount?: number;
    idleOpenMatters?: UyapIdleOpenMatter[];
    idleSnoozedMatters?: UyapIdleOpenMatter[];
    idleUsesTasks?: boolean;
    openingByMonth: UyapOpeningMonthRow[];
    breakdowns: Record<UyapDosyaTurBucket, UyapBreakdownRow[]>;
};

export type UyapMatterPick = {
    id: string;
    title: string;
    file_number: string;
    court_name: string | null;
    matter_type: string | null;
    status: string;
};

export type UyapEvrakFolder = {
    id: string;
    name: string;
    parent_id: string | null;
};

export type UyapEvrakDoc = {
    id: string;
    folder_id: string | null;
    title: string;
    file_path: string | null;
    barcode_no?: string | null;
    incoming_date?: string | null;
    metadata?: string | null;
};

export type UyapEvrakTree = {
    folders: UyapEvrakFolder[];
    docs: UyapEvrakDoc[];
};

export type UyapRecentEvrak = {
    id: string;
    matter_id: string;
    title: string;
    incoming_date: string | null;
    portal_date?: string | null;
    created_at: string;
    metadata?: string | null;
    file_path?: string | null;
    file_number: string;
    court_name: string | null;
    /** Same court string as `court_name` (`matters.court_name` / `metadata.uyap.birimAdi`). */
    birimAdi?: string | null;
    matter_title: string;
    matter_type: string | null;
    status: string;
    parties_line?: string | null;
    /** Matter-card UYAP label: `uyap_icra_takip_yolu` or `uyap_dava_turu`, never coarse `dosyaTur`. */
    dosya_tur_label?: string | null;
};

export type AppNotification = {
    id: string;
    kind: string;
    title: string;
    body: string | null;
    matter_id: string | null;
    read_at: string | null;
    payload_json: string | null;
    created_at: string;
    parties_line?: string | null;
    /** Matter-card UYAP label: `uyap_icra_takip_yolu` or `uyap_dava_turu`, never coarse `dosyaTur`. */
    dosya_tur_label?: string | null;
};
