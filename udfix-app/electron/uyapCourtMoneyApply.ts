/**
 * Katır harç/tahsilat anlığını dosyaya ve müvekkile yazar.
 * Aynı external_key güncellenir. Portalda kalkan satır, o sayfa gerçekten
 * geldiyse silinir. Elle girilen satırlara dokunulmaz.
 */

import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import {
    courtFileKey,
    foldTrCourt,
    ledgerEffect,
    parseUyapCourtMoney,
    partyRepresentedFrom,
    payerMatchesPartyName,
    type LedgerEffect,
    type UyapCourtMoneyFile,
    type UyapCourtMoneyLine,
    type UyapCourtMoneyPage,
    type UyapCourtMoneyPageLines,
} from './shared/uyapCourtMoney';

export type ApplyUyapCourtMoneyResult = {
    ok: true;
    inserted: number;
    updated: number;
    removed: number;
    skipped: number;
    files: number;
    unmatched: Array<{ dosyaNo: string; reason: string }>;
};

type MatterHit = {
    id: string;
    file_number: string | null;
    esas_no: string | null;
    court_name: string | null;
    metadata: string | null;
};

type PartyHit = {
    id: string;
    full_name: string;
    role: string;
    is_client: number;
    id_number: string | null;
    metadata: string | null;
};

const CLIENT_ROLES = new Set(['MÜVEKKİL', 'MUVEKKIL']);

export function applyUyapCourtMoney(
    database: Database.Database,
    payload: unknown,
    options?: { seatLawyerName?: string | null },
): ApplyUyapCourtMoneyResult {
    const parsed = parseUyapCourtMoney(payload);
    const result: ApplyUyapCourtMoneyResult = {
        ok: true,
        inserted: 0,
        updated: 0,
        removed: 0,
        skipped: parsed.skipped,
        files: 0,
        unmatched: [],
    };
    const seat = options?.seatLawyerName?.trim() || null;
    const matters = database
        .prepare(
            `SELECT id, file_number, esas_no, court_name, metadata
             FROM matters`,
        )
        .all() as MatterHit[];

    const write = database.transaction(() => {
        for (const file of parsed.files) {
            const matched = matchMatter(matters, file);
            if (!matched.ok) {
                result.unmatched.push({ dosyaNo: file.dosyaNo || file.fileKey || '—', reason: matched.reason });
                continue;
            }
            const parties = database
                .prepare(
                    `SELECT p.id AS id, p.full_name AS full_name, COALESCE(mp.role, '') AS role,
                            COALESCE(p.is_client, 0) AS is_client, p.id_number AS id_number,
                            p.metadata AS metadata
                     FROM matter_parties mp
                     JOIN parties p ON p.id = mp.party_id
                     WHERE mp.matter_id = ?`,
                )
                .all(matched.matter.id) as PartyHit[];
            const clients = parties.filter((party) => party.is_client === 1 || CLIENT_ROLES.has(party.role));
            if (clients.length === 0) {
                result.unmatched.push({ dosyaNo: file.dosyaNo || file.fileKey, reason: 'Dosyada müvekkil yok' });
                continue;
            }
            result.files += 1;
            for (const page of ['harc', 'tahsilat', 'reddiyat'] as const) {
                const slot = file[page];
                if (!slot) continue;
                applyPage(database, result, matched.matter.id, file, page, slot, clients, seat);
            }
            if (file.totals) writeTotals(database, matched.matter, file.totals);
        }
    });
    write();
    return result;
}

function matchMatter(
    matters: MatterHit[],
    file: UyapCourtMoneyFile,
): { ok: true; matter: MatterHit } | { ok: false; reason: string } {
    if (!file.fileKey) return { ok: false, reason: 'Dosya no okunamadı' };
    const hits = matters.filter((matter) => (
        courtFileKey(matter.file_number || '') === file.fileKey
        || courtFileKey(matter.esas_no || '') === file.fileKey
    ));
    if (hits.length === 1) return { ok: true, matter: hits[0] };
    if (hits.length === 0) return { ok: false, reason: 'Dosya bulunamadı' };
    const unit = file.birimAdi;
    const narrowed = unit ? hits.filter((matter) => courtMatches(unit, matter.court_name || '')) : [];
    if (narrowed.length === 1) return { ok: true, matter: narrowed[0] };
    return { ok: false, reason: 'Aynı esas numaralı birden fazla dosya var' };
}

function courtMatches(unit: string, courtName: string): boolean {
    const left = foldTrCourt(unit).replace(/[^a-z0-9]+/g, '');
    const right = foldTrCourt(courtName).replace(/[^a-z0-9]+/g, '');
    if (left.length < 4 || right.length < 4) return false;
    return left.includes(right) || right.includes(left);
}

function preferredClient(clients: PartyHit[], payerName: string): PartyHit {
    const named = payerName
        ? clients.find((party) => payerMatchesPartyName(payerName, party.full_name))
        : undefined;
    if (named) return named;
    return clients.find((party) => CLIENT_ROLES.has(party.role)) ?? clients[0];
}

function applyPage(
    database: Database.Database,
    result: ApplyUyapCourtMoneyResult,
    matterId: string,
    file: UyapCourtMoneyFile,
    page: UyapCourtMoneyPage,
    slot: UyapCourtMoneyPageLines,
    clients: PartyHit[],
    seat: string | null,
): void {
    const prefix = `uyap:${page}:${file.fileKey}:`;
    const keys = new Set<string>();
    const findExisting = database.prepare(
        `SELECT id, party_id, kind, description, amount_minor, entry_date, balance_minor, detail_json
         FROM matter_ledger WHERE source = 'katir' AND external_key = ?`,
    );
    const insert = database.prepare(
        `INSERT INTO matter_ledger (
            id, matter_id, party_id, kind, description, amount_minor, entry_date,
            source, external_key, uyap_page, receipt_no, payer_name, court_unit,
            remaining_minor, balance_minor, detail_json, created_at, updated_at
         ) VALUES (
            @id, @matter_id, @party_id, @kind, @description, @amount_minor, @entry_date,
            'katir', @external_key, @uyap_page, @receipt_no, @payer_name, @court_unit,
            @remaining_minor, @balance_minor, @detail_json, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         )`,
    );
    const update = database.prepare(
        `UPDATE matter_ledger SET
            matter_id = @matter_id,
            party_id = @party_id,
            kind = @kind,
            description = @description,
            amount_minor = @amount_minor,
            entry_date = @entry_date,
            uyap_page = @uyap_page,
            receipt_no = @receipt_no,
            payer_name = @payer_name,
            court_unit = @court_unit,
            remaining_minor = @remaining_minor,
            balance_minor = @balance_minor,
            detail_json = @detail_json,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = @id`,
    );

    for (const line of slot.lines) {
        keys.add(line.externalKey);
        const party = preferredClient(clients, line.payerName);
        const effect = ledgerEffect(line, {
            clientNames: clients.map((client) => client.full_name),
            lawyerNames: [seat],
            harcPageProvided: file.harc != null,
            representedFrom: partyRepresentedFrom(party?.metadata),
        });
        const row = lineParams(matterId, party, line, effect);
        const existing = findExisting.get(line.externalKey) as {
            id: string;
            party_id: string;
            kind: string;
            description: string;
            amount_minor: number;
            entry_date: string;
            balance_minor: number | null;
            detail_json: string | null;
        } | undefined;
        if (existing) {
            const preserved = preserveManualOverride(existing, row);
            update.run({ id: existing.id, ...preserved });
            result.updated += 1;
        } else {
            insert.run({ id: randomUUID(), ...row });
            result.inserted += 1;
        }
    }

    if (!slot.prune) return;
    const stale = database
        .prepare(
            `SELECT id, external_key FROM matter_ledger
             WHERE source = 'katir' AND matter_id = ? AND external_key IS NOT NULL`,
        )
        .all(matterId) as Array<{ id: string; external_key: string }>;
    const remove = database.prepare(`DELETE FROM matter_ledger WHERE id = ?`);
    for (const row of stale) {
        if (!row.external_key.startsWith(prefix) || keys.has(row.external_key)) continue;
        remove.run(row.id);
        result.removed += 1;
    }
}

function lineParams(
    matterId: string,
    party: PartyHit,
    line: UyapCourtMoneyLine,
    effect: LedgerEffect,
) {
    return {
        matter_id: matterId,
        party_id: party.id,
        kind: effect.kind,
        description: line.label,
        amount_minor: line.amountMinor,
        entry_date: line.entryDate,
        external_key: line.externalKey,
        uyap_page: line.page,
        receipt_no: line.receiptNo || null,
        payer_name: line.payerName || null,
        court_unit: line.birimAdi || null,
        remaining_minor: line.remainingMinor,
        balance_minor: effect.balanceMinor,
        detail_json: accountDetail(line, party.id_number, effect),
    };
}

function accountDetail(
    line: UyapCourtMoneyLine,
    idNumber: string | null,
    effect: LedgerEffect,
): string {
    let detail: Record<string, unknown> = {};
    try {
        const parsed = JSON.parse(line.detailJson) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) detail = parsed as Record<string, unknown>;
    } catch {
        detail = {};
    }
    detail.flow = line.flow;
    const uid = (idNumber || '').replace(/\s/g, '');
    if (/^\d{10,11}$/.test(uid)) detail.idNumber = uid;
    if (effect.reddiyatTo) detail.reddiyatTo = effect.reddiyatTo;
    if (effect.pocket) detail.pocket = true;
    if (effect.depositor) detail.depositor = effect.depositor;
    return JSON.stringify(detail);
}

function preserveManualOverride(
    existing: {
        party_id: string;
        kind: string;
        description: string;
        amount_minor: number;
        entry_date: string;
        balance_minor: number | null;
        detail_json: string | null;
    },
    incoming: ReturnType<typeof lineParams>,
): ReturnType<typeof lineParams> {
    let prevDetail: Record<string, unknown> = {};
    try {
        const parsed = JSON.parse(existing.detail_json || '{}') as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) prevDetail = parsed as Record<string, unknown>;
    } catch {
        prevDetail = {};
    }
    if (prevDetail.manualOverride !== true) return incoming;
    let nextDetail: Record<string, unknown> = {};
    try {
        const parsed = JSON.parse(incoming.detail_json || '{}') as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) nextDetail = parsed as Record<string, unknown>;
    } catch {
        nextDetail = {};
    }
    nextDetail.manualOverride = true;
    if (prevDetail.flow) nextDetail.flow = prevDetail.flow;
    if (prevDetail.depositor) nextDetail.depositor = prevDetail.depositor;
    else delete nextDetail.depositor;
    if (prevDetail.reddiyatTo) nextDetail.reddiyatTo = prevDetail.reddiyatTo;
    else delete nextDetail.reddiyatTo;
    if (prevDetail.pocket != null) nextDetail.pocket = prevDetail.pocket;
    else delete nextDetail.pocket;
    return {
        ...incoming,
        party_id: existing.party_id || incoming.party_id,
        kind: (existing.kind as ReturnType<typeof lineParams>['kind']) || incoming.kind,
        description: existing.description || incoming.description,
        amount_minor: existing.amount_minor || incoming.amount_minor,
        entry_date: existing.entry_date || incoming.entry_date,
        balance_minor: existing.balance_minor ?? incoming.balance_minor,
        detail_json: JSON.stringify(nextDetail),
    };
}

function writeTotals(database: Database.Database, matter: MatterHit, totals: UyapCourtMoneyFile['totals']): void {
    if (!totals) return;
    let root: Record<string, unknown> = {};
    if (matter.metadata) {
        try {
            const parsed = JSON.parse(matter.metadata) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                root = parsed as Record<string, unknown>;
            }
        } catch {
            root = {};
        }
    }
    const uyap = root.uyap && typeof root.uyap === 'object' && !Array.isArray(root.uyap)
        ? { ...(root.uyap as Record<string, unknown>) }
        : {};
    const prev = uyap.courtMoney && typeof uyap.courtMoney === 'object' && !Array.isArray(uyap.courtMoney)
        ? { ...(uyap.courtMoney as Record<string, unknown>) }
        : {};
    uyap.courtMoney = { ...prev, totals, syncedAt: new Date().toISOString() };
    root.uyap = uyap;
    const json = JSON.stringify(root);
    database.prepare(`UPDATE matters SET metadata = ? WHERE id = ?`).run(json, matter.id);
    matter.metadata = json;
}
