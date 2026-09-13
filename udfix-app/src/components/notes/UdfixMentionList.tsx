import { useEffect, useImperativeHandle, forwardRef, useMemo, useRef, useState } from 'react';
import type { EntityAttributeRow, Matter, Party, SuggestRow } from '../../services/dataService';
import { DataService } from '../../services/dataService';
import { cn } from '../../lib/utils';
import MaterialIcon from '../ui/MaterialIcon';
import { getPartyAddressTagLabel, isPartyAddressTagKey } from '../../data/uyap/partyAddressTagCatalog';
import {
    buildMentionLineagePayload,
    formatMentionLineageForUi,
    type MentionLineageDetailKind,
} from '../../utils/mentionAdapterLineage';
import { mentionListPointerAction } from '../../utils/atMentionSuggestionMatch';

export type UdfixMentionItem =
    | SuggestRow
    | { id: string; label: string; entityType: string };

export function isUdfixMentionItem(value: unknown): value is UdfixMentionItem {
    return Boolean(value && typeof value === 'object' && 'id' in value);
}

export function mentionEntityType(item: UdfixMentionItem | null | undefined): string {
    if (!item) return 'NOTE';
    if ('entity_type' in item && item.entity_type) return String(item.entity_type);
    if ('entityType' in item && item.entityType) return String(item.entityType);
    return 'NOTE';
}

export type UdfixMentionListProps = {
    items: UdfixMentionItem[];
    command: (item: UdfixMentionItem) => void;
    /** @… aralığını düz metinle değiştirir (TCKN, adres, künye vb.). */
    insertPlainAtMention?: (text: string) => void;
    /** Öneri sorgusu — veri hattı günlüğüne yazılır. */
    suggestionQuery?: string;
};

export type UdfixMentionListRef = {
    onKeyDown: (event: KeyboardEvent) => boolean;
};

function typeIcon(t: string) {
    switch (t) {
        case 'MATTER':
            return 'gavel';
        case 'PARTY':
            return 'person';
        case 'DOCUMENT':
            return 'description';
        case 'KNOWLEDGE':
            return 'local_library';
        case 'NOTE':
        case 'FILE':
            return 'attach_file';
        case 'TAG':
            return 'tag';
        default:
            return 'edit_note';
    }
}

function filePathOf(item: UdfixMentionItem | null | undefined): string | undefined {
    if (!item) return undefined;
    if ('file_path' in item && item.file_path) return String(item.file_path);
    const anyItem = item as { filePath?: string };
    if (anyItem.filePath) return String(anyItem.filePath);
    return undefined;
}

type PlainField = { key: string; label: string; value: string };

function buildPlainFields(
    item: UdfixMentionItem | undefined,
    party: Party | null,
    matter: Matter | null,
    partyAttributes: EntityAttributeRow[],
): PlainField[] {
    if (!item) return [];
    const t = mentionEntityType(item);
    const out: PlainField[] = [];
    const seenValues = new Set<string>();
    const pushField = (field: PlainField) => {
        const value = field.value.trim();
        if (!value || seenValues.has(value)) return;
        seenValues.add(value);
        out.push({ ...field, value });
    };

    if (t === 'PARTY' && party) {
        if (party.full_name?.trim()) pushField({ key: 'name', label: 'Ad soyad', value: party.full_name });
        if (party.id_number?.trim()) pushField({ key: 'id', label: 'TCKN / VKN', value: party.id_number });
        if (party.tax_office?.trim()) pushField({ key: 'taxOffice', label: 'Vergi dairesi', value: party.tax_office });
        const addr = (party.address || party.postal_address || '').trim();
        if (addr) pushField({ key: 'addr', label: 'Adres', value: addr });
        if (party.secondary_address?.trim())
            pushField({ key: 'addr2', label: 'İkincil adres', value: party.secondary_address });
        if (party.property_address?.trim())
            pushField({ key: 'prop', label: 'Taşınmaz', value: party.property_address });
        if (party.power_of_attorney_journal?.trim())
            pushField({
                key: 'poa',
                label: 'Vekalet yevmiye',
                value: party.power_of_attorney_journal,
            });
        if (party.email?.trim()) pushField({ key: 'email', label: 'E-posta', value: party.email });
        if (party.phone?.trim()) pushField({ key: 'tel', label: 'Telefon', value: party.phone });
        for (const attr of [...partyAttributes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
            const key = String(attr.tag_key || '').trim();
            const label = key ? (isPartyAddressTagKey(key) ? getPartyAddressTagLabel(key) : key) : 'Ek veri';
            pushField({ key: `attr:${key}:${attr.id}`, label, value: attr.tag_value });
        }
    } else if (t === 'MATTER' && matter) {
        if (matter.title?.trim()) out.push({ key: 'title', label: 'Dava başlığı', value: matter.title.trim() });
        if (matter.internal_id?.trim())
            out.push({ key: 'internal', label: 'Künye / dahili no', value: matter.internal_id.trim() });
        const esas = (matter.esas_no || matter.file_number || '').trim();
        if (esas) out.push({ key: 'esas', label: 'Esas no', value: esas });
        if (matter.dis_no?.trim()) out.push({ key: 'dis', label: 'Dosya no', value: matter.dis_no.trim() });
        if (matter.file_number?.trim() && matter.file_number.trim() !== esas)
            out.push({ key: 'file', label: 'Dosya no', value: matter.file_number.trim() });
        if (matter.court_name?.trim())
            out.push({ key: 'court', label: 'Mahkeme', value: matter.court_name.trim() });
    } else if (t === 'DOCUMENT') {
        if (item.label?.trim()) out.push({ key: 'lbl', label: 'Dosya adı', value: item.label.trim() });
        const fp = filePathOf(item);
        if (fp?.trim()) out.push({ key: 'path', label: 'Yol', value: fp.trim() });
    } else if (t === 'NOTE' || t === 'KNOWLEDGE') {
        if (item.label?.trim()) out.push({ key: 'lbl', label: 'Metin', value: item.label.trim() });
    } else if (t === 'FILE') {
        const fp = filePathOf(item);
        if (fp?.trim()) out.push({ key: 'path', label: 'Dosya yolu', value: fp.trim() });
        else if (item.label?.trim()) out.push({ key: 'lbl', label: 'Ad', value: item.label.trim() });
    }

    return out;
}

async function copyToClipboard(text: string) {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        /* noop */
    }
}

function typeLabel(t: string) {
    switch (t) {
        case 'MATTER':
            return 'Dava';
        case 'PARTY':
            return 'Taraf';
        case 'DOCUMENT':
            return 'Dosya';
        case 'KNOWLEDGE':
            return 'Bilgi bankası';
        case 'NOTE':
            return 'Not';
        case 'FILE':
            return 'Dosya yolu';
        case 'TAG':
            return 'Etiket';
        default:
            return t;
    }
}
// ... (Önceki type tanımlamaları ve yardımcı fonksiyonlar aynı kalıyor)

export const UdfixMentionList = forwardRef<UdfixMentionListRef, UdfixMentionListProps>(
    ({ items, command, insertPlainAtMention, suggestionQuery = '' }, ref) => {
        const [index, setIndex] = useState(0);
        const [previewOpen, setPreviewOpen] = useState(false);
        const [party, setParty] = useState<Party | null>(null);
        const [partyAttributes, setPartyAttributes] = useState<EntityAttributeRow[]>([]);
        const [matter, setMatter] = useState<Matter | null>(null);
        const [partyMatters, setPartyMatters] = useState<UdfixMentionItem[]>([]);
        const [detailLoading, setDetailLoading] = useState(false);
        const [_lineageLines, setLineageLines] = useState<string[]>([]);
        const [_lineageLogStatus, setLineageLogStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
        const logDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
        const safeItems = useMemo(
            () => (Array.isArray(items) ? items.filter(isUdfixMentionItem) : []),
            [items],
        );
        const selectedIndex =
            safeItems.length === 0 ? 0 : Math.min(Math.max(0, index), safeItems.length - 1);
        const selectedItem = safeItems[selectedIndex];
        const selectedId = selectedItem?.id;
        const selectedKind = mentionEntityType(selectedItem);

        // Scroll takibi için ref
        const activeItemRef = useRef<HTMLButtonElement>(null);

        useEffect(() => {
            setIndex(0);
            setPreviewOpen(false);
        }, [items]);

        // Klavye ile gezinirken otomatik scroll
        useEffect(() => {
            if (activeItemRef.current) {
                activeItemRef.current.scrollIntoView({
                    block: 'nearest',
                    behavior: 'auto',
                });
            }
        }, [selectedIndex]);

        useEffect(() => {
            if (!insertPlainAtMention || !previewOpen) {
                setParty(null);
                setPartyAttributes([]);
                setMatter(null);
                setPartyMatters([]);
                setDetailLoading(false);
                return;
            }
            const item = selectedItem;
            if (!item) {
                setParty(null);
                setPartyAttributes([]);
                setMatter(null);
                return;
            }
            const t = mentionEntityType(item);
            let cancelled = false;
            setParty(null);
            setPartyAttributes([]);
            setMatter(null);
            setPartyMatters([]);
            if (t === 'PARTY') {
                setDetailLoading(true);
                void Promise.all([
                    DataService.getParty(item.id),
                    DataService.getEntityAttributes('PARTY', item.id).catch(() => []),
                    DataService.getMatters({ party_id: item.id }).catch(() => []),
                ])
                    .then(([p, attrs, matters]) => {
                        if (!cancelled) {
                            setParty(p);
                            setPartyAttributes(attrs);
                            setPartyMatters(
                                (Array.isArray(matters) ? matters : []).map((m) => ({
                                    id: m.id,
                                    label:
                                        (m.title || m.internal_id || m.file_number || 'Dava').trim(),
                                    entity_type: 'MATTER',
                                }))
                            );
                        }
                    })
                    .catch(() => {
                        if (!cancelled) {
                            setParty(null);
                            setPartyAttributes([]);
                        }
                    })
                    .finally(() => {
                        if (!cancelled) setDetailLoading(false);
                    });
            } else if (t === 'MATTER') {
                setDetailLoading(true);
                void DataService.getMatter(item.id)
                    .then((m) => {
                        if (!cancelled) setMatter(m);
                    })
                    .catch(() => {
                        if (!cancelled) setMatter(null);
                    })
                    .finally(() => {
                        if (!cancelled) setDetailLoading(false);
                    });
            } else {
                setDetailLoading(false);
            }
            return () => {
                cancelled = true;
            };
        }, [insertPlainAtMention, previewOpen, selectedId, selectedKind]);

        const plainFields = useMemo(
            () => buildPlainFields(selectedItem, party, matter, partyAttributes),
            [selectedItem, party, matter, partyAttributes],
        );

        // Mention inserts raw values only; labels stay as UI hints in the popup.
        const getAllInfoAsText = () => {
            return plainFields.map(f => f.value).join('\n');
        };

        const curEntity = selectedItem ? mentionEntityType(selectedItem) : '';
        const detailKind: MentionLineageDetailKind =
            curEntity === 'PARTY' ? 'PARTY' : curEntity === 'MATTER' ? 'MATTER' : 'NONE';

        useEffect(() => {
            if (!insertPlainAtMention || !previewOpen) {
                setLineageLines([]);
                setLineageLogStatus('idle');
                return;
            }
            const row = selectedItem;
            const sel = row
                ? {
                      id: row.id,
                      label: row.label,
                      entityType: mentionEntityType(row),
                  }
                : null;
            const payload = buildMentionLineagePayload({
                suggestionQuery,
                itemsCount: safeItems.length,
                selectedIndex,
                selection: sel,
                detailLoading,
                detailKind,
                partyLoaded: Boolean(party),
                matterLoaded: Boolean(matter),
                plainFieldKeys: plainFields.map((f) => f.key),
            });
            const lines = formatMentionLineageForUi(payload);
            setLineageLines(lines);
            
            if (logDebounceRef.current) clearTimeout(logDebounceRef.current);
            logDebounceRef.current = setTimeout(() => {
                logDebounceRef.current = null;
                void DataService.logMentionLineage(payload).then((res) => {
                    setLineageLogStatus(res.ok ? 'ok' : 'fail');
                });
            }, 600);
            return () => {
                if (logDebounceRef.current) clearTimeout(logDebounceRef.current);
            };
        }, [insertPlainAtMention, previewOpen, suggestionQuery, safeItems.length, selectedIndex, selectedItem, detailLoading, detailKind, party, matter, plainFields]);

        useImperativeHandle(ref, () => ({
            onKeyDown: (event: KeyboardEvent) => {
                if (safeItems.length === 0) return false;
                if (event.key === 'ArrowDown') {
                    if (!previewOpen) {
                        setPreviewOpen(true);
                        return true;
                    }
                    setIndex((i) => (i + 1) % safeItems.length);
                    return true;
                }
                if (event.key === 'ArrowUp') {
                    if (!previewOpen) {
                        setPreviewOpen(true);
                        return true;
                    }
                    setIndex((i) => (i + safeItems.length - 1) % safeItems.length);
                    return true;
                }
                if (event.key === 'Enter') {
                    const pick = safeItems[selectedIndex];
                    if (pick) command(pick);
                    return true;
                }
                return false;
            },
        }));

        if (!safeItems.length) {
            return (
                <div className="rounded-xl border border-white/10 bg-background/60 text-foreground backdrop-blur-xl px-3 py-2 text-xs text-muted-foreground shadow-2xl">
                    Sonuç yok
                </div>
            );
        }

        const showPlainStrip =
            previewOpen &&
            Boolean(insertPlainAtMention) &&
            (plainFields.length > 0 ||
                detailLoading ||
                selectedKind === 'PARTY' ||
                selectedKind === 'MATTER');

        return (
            <div
                className="max-h-[min(32rem,85vh)] min-w-[280px] max-w-[min(100vw-2rem,24rem)] overflow-hidden rounded-xl border border-white/10 bg-background/80 text-foreground backdrop-blur-xl shadow-2xl flex flex-col transition-all"
                onMouseDown={(event) => {
                    event.preventDefault();
                }}
            >
                {/* 1. ÜST LİSTE (SCROLL EDİLEBİLİR) */}
                <div className="max-h-60 overflow-y-auto py-1 custom-scrollbar shrink-0">
                    {safeItems.map((item, i) => (
                        <button
                            key={`${mentionEntityType(item)}-${item.id}`}
                            ref={i === selectedIndex ? activeItemRef : null}
                            type="button"
                            tabIndex={-1}
                            className={cn(
                                'flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors',
                                i === selectedIndex
                                    ? 'bg-primary/20 text-foreground'
                                    : 'text-foreground/80 hover:bg-white/5'
                            )}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                const action = mentionListPointerAction(i, selectedIndex, previewOpen);
                                if (action === 'insert') {
                                    command(item);
                                    return;
                                }
                                setIndex(i);
                                setPreviewOpen(true);
                            }}
                        >
                            <MaterialIcon
                                icon={typeIcon(mentionEntityType(item))}
                                size={18}
                                className={cn("mt-0.5 shrink-0", i === selectedIndex ? "text-primary" : "text-primary/60")}
                            />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{item.label}</span>
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                    {typeLabel(mentionEntityType(item))}
                                </span>
                            </span>
                        </button>
                    ))}
                </div>
                {!previewOpen ? (
                    <div className="border-t border-white/10 px-3 py-1.5 text-[10px] text-muted-foreground/70 shrink-0">
                        Tıklayın: kart · tekrar tıklayın veya Enter: ekle
                    </div>
                ) : null}

                {/* 2. DETAY PANELİ (PLAIN STRIP) */}
                {showPlainStrip && (
                    <div className="border-t border-white/10 px-3 py-3 shrink-0 bg-white/5 shadow-inner">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                                Metin Bilgileri
                            </div>
                            {plainFields.length > 0 && (
                                <div className="flex gap-1">
                                    <button
                                        type="button"
                                        tabIndex={-1}
                                        title="Tümünü Metin Olarak Ekle"
                                        className="flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
                                        onClick={() => insertPlainAtMention?.(getAllInfoAsText())}
                                    >
                                        <MaterialIcon icon="playlist_add" size={14} />
                                        Tümünü Ekle
                                    </button>
                                    <button
                                        type="button"
                                        tabIndex={-1}
                                        title="Tümünü Panoya Kopyala"
                                        className="flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground"
                                        onClick={() => void copyToClipboard(getAllInfoAsText())}
                                    >
                                        <MaterialIcon icon="copy_all" size={14} />
                                        Kopyala
                                    </button>
                                </div>
                            )}
                        </div>
                        
                        {detailLoading && (selectedKind === 'PARTY' || selectedKind === 'MATTER') ? (
                            <div className="text-[11px] text-muted-foreground py-2 italic animate-pulse">Bilgiler getiriliyor…</div>
                        ) : plainFields.length === 0 ? (
                            <div className="text-[11px] text-muted-foreground/80 py-1">
                                Bu kayıt için kopyalanabilir alan bulunamadı.
                            </div>
                        ) : (
                            <ul className="flex flex-col gap-1.5 overflow-y-auto max-h-40 pr-1 custom-scrollbar">
                                {plainFields.map((f) => (
                                    <li
                                        key={f.key}
                                        className="group flex items-center gap-2 rounded-md bg-black/20 border border-white/5 px-2 py-1.5 transition-all hover:border-white/20"
                                    >
                                        <button
                                            type="button"
                                            tabIndex={-1}
                                            className="min-w-0 flex-1 text-left text-[11px] leading-relaxed"
                                            onClick={() => insertPlainAtMention?.(f.value)}
                                        >
                                            <span className="block text-[9px] uppercase font-bold text-muted-foreground/70">{f.label}</span>
                                            <span className="text-foreground/90 font-medium break-words">{f.value}</span>
                                        </button>
                                        <button
                                            type="button"
                                            tabIndex={-1}
                                            className="shrink-0 rounded p-1.5 text-muted-foreground opacity-50 group-hover:opacity-100 hover:bg-white/10 hover:text-foreground transition-all"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void copyToClipboard(f.value);
                                            }}
                                        >
                                            <MaterialIcon icon="content_copy" size={14} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {selectedKind === 'PARTY' && partyMatters.length > 0 && (
                            <div className="mt-2 border-t border-white/10 pt-2">
                                <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/80 mb-1.5">
                                    İlişkili dosyalar
                                </div>
                                <ul className="flex flex-col gap-1 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                                    {partyMatters.map((m) => (
                                        <li key={m.id}>
                                            <button
                                                type="button"
                                                tabIndex={-1}
                                                className="flex w-full items-center gap-2 rounded-md border border-white/5 bg-black/15 px-2 py-1.5 text-left text-[11px] hover:border-primary/25 hover:bg-primary/10"
                                                onClick={() => command(m)}
                                            >
                                                <MaterialIcon icon="gavel" size={14} className="text-primary/70 shrink-0" />
                                                <span className="truncate font-medium">{m.label}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }
);
UdfixMentionList.displayName = 'UdfixMentionList';
