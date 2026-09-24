import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { generateHTML } from '@tiptap/core';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { DataService, type TextTemplateCategory, type TextTemplateSuggestRow } from '../../services/dataService';
import { insertTextTemplateAtCursor } from '../editor/textTemplateSuggestion';
import { injectVariableSlotsInDocJson } from '../../utils/variableSlotInContent';
import { priorityToSortOrder, sortOrderToPriority, templatePriorityRankLabel } from '../../utils/templatePriority';
import { VariableSlot } from '../../extensions/VariableSlot';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';
import { debounce } from 'lodash';
import MaterialIcon from '../ui/MaterialIcon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Slider } from '../ui/slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { toast } from 'sonner';

const formFieldLabelClass = 'text-[11px] uppercase tracking-widest text-muted-foreground opacity-80';
import { isTextTemplateDeletable } from '../../utils/textTemplateIds';
import { normaliseTemplateContentString } from '../../utils/textTemplateContent';
import { tiptapToText } from '../../utils/noteTransformers';

const previewExtensions = [StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }), VariableSlot];
const editorExtensions = [StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }), VariableSlot];

const EMPTY_DOC = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });

const EDIT_CATEGORIES: { value: TextTemplateCategory; label: string }[] = [
    { value: 'PETITION', label: 'Dilekçe' },
    { value: 'LETTER', label: 'Yazı' },
    { value: 'CONTRACT', label: 'Sözleşme' },
    { value: 'CLAUSE', label: 'Fıkra / madde' },
    { value: 'DEFINITION', label: 'Tanım' },
    { value: 'PROCEDURE', label: 'İçtihat' },
    { value: 'LEGISLATION', label: 'Kanun / yönetmelik' },
    { value: 'CUSTOM', label: 'Özel' },
];

const categoryLabel = (c: string) => {
    switch (c) {
        case 'PETITION':
            return 'Dilekçe';
        case 'LEGISLATION':
            return 'Kanun / yönetmelik';
        case 'CONTRACT':
            return 'Sözleşme';
        case 'LETTER':
            return 'Yazı';
        default:
            return c || 'Özel';
    }
};

function formatAudit(ts?: string | null): string {
    if (!ts) return '';
    try {
        const d = new Date(ts);
        return Number.isNaN(d.getTime()) ? ts : d.toLocaleString('tr-TR');
    } catch {
        return ts ?? '';
    }
}

type TemplateDraft = {
    id?: string;
    name: string;
    category: TextTemplateCategory;
    priority: number;
    is_favorite: boolean;
    content_json: string;
};

type Props = { onClose: () => void };

/**
 * Komut paleti “Şablonlar” sekmesi: arama, liste, satır-içi düzenleme, imlece ekleme.
 */
export const TemplateLibraryCommandTab: React.FC<Props> = ({ onClose }) => {
    const mainEditor = useLayoutStore((s) => s.editor);
    const [q, setQ] = useState('');
    const [rows, setRows] = useState<TextTemplateSuggestRow[]>([]);
    const [selId, setSelId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [draft, setDraft] = useState<TemplateDraft | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const contentEditor = useEditor({
        extensions: editorExtensions,
        content: normaliseTemplateContentString(EMPTY_DOC),
        editable: false,
        editorProps: {
            attributes: {
                class: 'prose prose-sm dark:prose-invert max-w-none min-h-[200px] px-1 py-1 focus:outline-none',
            },
        },
    });

    const fetchRows = useMemo(
        () =>
            debounce(async (query: string) => {
                setLoading(true);
                try {
                    const r = await DataService.suggestTextTemplates(query.trim(), 80);
                    setRows(Array.isArray(r) ? r : []);
                } catch {
                    setRows([]);
                } finally {
                    setLoading(false);
                }
            }, 220),
        []
    );

    const reloadRowsImmediate = useCallback(async () => {
        try {
            const r = await DataService.suggestTextTemplates(q.trim(), 80);
            setRows(Array.isArray(r) ? r : []);
        } catch {
            setRows([]);
        }
    }, [q]);

    useEffect(() => {
        fetchRows(q);
        return () => fetchRows.cancel();
    }, [q, fetchRows]);

    const selected = useMemo(() => rows.find((r) => r.id === selId) ?? rows[0] ?? null, [rows, selId]);

    useEffect(() => {
        if (isCreating || isEditing) return;
        if (rows.length && !rows.some((r) => r.id === selId)) {
            setSelId(rows[0]!.id);
        }
    }, [rows, selId, isCreating, isEditing]);

    useEffect(() => {
        if (!contentEditor) return;
        contentEditor.setEditable(isEditing);
    }, [contentEditor, isEditing]);

    useEffect(() => {
        if (!contentEditor || !isEditing || !draft) return;
        contentEditor.commands.setContent(normaliseTemplateContentString(draft.content_json));
        queueMicrotask(() => contentEditor.commands.focus('end'));
    }, [contentEditor, isEditing, draft?.id, isCreating]);

    const previewHtml = useMemo(() => {
        if (isEditing || !selected?.content_json) return '';
        try {
            const doc = injectVariableSlotsInDocJson(
                normaliseTemplateContentString(selected.content_json),
                false
            );
            const raw = generateHTML(doc, previewExtensions);
            return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
        } catch {
            return '';
        }
    }, [selected, isEditing]);

    const onInsert = useCallback(async () => {
        if (!mainEditor || !selected || isEditing) return;
        const full = await DataService.getTextTemplate(selected.id);
        if (!full?.content_json) return;
        insertTextTemplateAtCursor(mainEditor, full as TextTemplateSuggestRow);
        onClose();
    }, [mainEditor, selected, onClose, isEditing]);

    const cancelEdit = useCallback(() => {
        setIsEditing(false);
        setIsCreating(false);
        setDraft(null);
        if (isCreating && rows.length) {
            setSelId(rows[0]!.id);
        }
    }, [isCreating, rows]);

    const startEdit = useCallback(async () => {
        if (!selected) return;
        const full = await DataService.getTextTemplate(selected.id);
        if (!full?.content_json) {
            toast.error('Şablon yüklenemedi');
            return;
        }
        setDraft({
            id: full.id,
            name: full.name,
            category: (full.category as TextTemplateCategory) || 'CUSTOM',
            priority: sortOrderToPriority(full.sort_order),
            is_favorite: !!full.is_favorite,
            content_json: full.content_json,
        });
        setIsCreating(false);
        setIsEditing(true);
    }, [selected]);

    const startCreate = useCallback(() => {
        setSelId(null);
        setDraft({
            name: 'Yeni şablon',
            category: 'CUSTOM',
            priority: 3,
            is_favorite: false,
            content_json: EMPTY_DOC,
        });
        setIsCreating(true);
        setIsEditing(true);
    }, []);

    const saveDraft = useCallback(async () => {
        if (!draft || !contentEditor) return;
        const name = draft.name.trim();
        if (!name) {
            toast.error('Ad gerekli');
            return;
        }

        const doc = contentEditor.getJSON();
        const contentJson = JSON.stringify(doc);
        const contentPlain = tiptapToText(doc);

        setSaving(true);
        try {
            if (isCreating) {
                const res = await DataService.addTextTemplate({
                    name,
                    category: draft.category,
                    content_json: contentJson,
                    content_plain: contentPlain || null,
                    sort_order: priorityToSortOrder(draft.priority),
                });
                if (res.ok && res.id) {
                    toast.success('Şablon oluşturuldu');
                    setIsEditing(false);
                    setIsCreating(false);
                    setDraft(null);
                    await reloadRowsImmediate();
                    setSelId(res.id);
                } else {
                    toast.error('Kaydedilemedi', { description: res.error ?? '' });
                }
            } else if (draft.id) {
                const res = await DataService.updateTextTemplate({
                    id: draft.id,
                    name,
                    category: draft.category,
                    sort_order: priorityToSortOrder(draft.priority),
                    is_favorite: draft.is_favorite ? 1 : 0,
                    content_json: contentJson,
                    content_plain: contentPlain || null,
                });
                if (res.ok) {
                    toast.success('Şablon kaydedildi');
                    setIsEditing(false);
                    setDraft(null);
                    await reloadRowsImmediate();
                } else {
                    toast.error('Kaydedilemedi', { description: res.error ?? '' });
                }
            }
        } finally {
            setSaving(false);
        }
    }, [draft, contentEditor, isCreating, reloadRowsImmediate]);

    const handleDeleteTemplate = useCallback(() => {
        if (!selected || isEditing) return;
        if (!isTextTemplateDeletable(selected.id)) {
            toast.error('Bu sistem şablonu silinemez');
            return;
        }
        toast('Şablon silinsin mi?', {
            description: selected.name,
            action: {
                label: 'Sil',
                onClick: () => {
                    void (async () => {
                        setDeleting(true);
                        try {
                            const res = await DataService.deleteTextTemplate(selected.id);
                            if (res.ok) {
                                toast.success('Şablon silindi');
                                setSelId(null);
                                await reloadRowsImmediate();
                            } else {
                                toast.error('Silinemedi', { description: res.error ?? '' });
                            }
                        } finally {
                            setDeleting(false);
                        }
                    })();
                },
            },
            cancel: {
                label: 'Vazgeç',
                onClick: () => undefined,
            },
        });
    }, [selected, isEditing, reloadRowsImmediate]);

    const canDeleteSelected = selected ? isTextTemplateDeletable(selected.id) : false;
    const panelTitle = isEditing ? draft?.name || 'Yeni şablon' : selected?.name;
    const showDetail = isEditing ? !!draft : !!selected;

    return (
        <div className="flex h-[min(560px,78vh)] w-full min-w-0 flex-col gap-0 bg-transparent text-foreground sm:flex-row">
            <div className="flex w-full shrink-0 flex-col border-b border-border sm:w-[38%] sm:border-b-0 sm:border-r">
                <div className="space-y-2 border-b border-border p-3">
                    <div className="relative">
                        <MaterialIcon
                            icon="search"
                            size={18}
                            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                        />
                        <Input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Şablon ara…"
                            className="h-10 border-border bg-card pl-9 text-foreground placeholder:text-muted-foreground"
                            autoFocus={!isEditing}
                            disabled={isEditing}
                        />
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full gap-1.5"
                        onClick={startCreate}
                        disabled={isEditing}
                    >
                        <MaterialIcon icon="add" size={16} />
                        Yeni şablon
                    </Button>
                    {loading ? <p className="text-[11px] text-muted-foreground">Yükleniyor…</p> : null}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-1">
                    {isCreating && isEditing ? (
                        <div className="mx-1 rounded-lg bg-primary/20 px-3 py-2.5 text-sm font-medium">Yeni şablon</div>
                    ) : !rows.length ? (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">Şablon yok veya eşleşme yok.</p>
                    ) : (
                        rows.map((r) => (
                            <button
                                key={r.id}
                                type="button"
                                onClick={() => {
                                    if (isEditing) return;
                                    setSelId(r.id);
                                }}
                                disabled={isEditing}
                                className={cn(
                                    'flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                                    selected?.id === r.id && !isCreating
                                        ? 'bg-primary/20 text-foreground'
                                        : 'text-foreground hover:bg-accent',
                                    isEditing && 'opacity-50 cursor-not-allowed'
                                )}
                            >
                                <span className="font-medium leading-tight">{r.name}</span>
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    {categoryLabel(String(r.category))}
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card/40 text-foreground">
                {showDetail ? (
                    <>
                        <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3">
                            {isEditing && draft ? (
                                <div className="grid gap-2">
                                    <div className="space-y-1">
                                        <Label htmlFor="tpl-inline-name" className={formFieldLabelClass}>
                                            Ad
                                        </Label>
                                        <Input
                                            id="tpl-inline-name"
                                            value={draft.name}
                                            onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                                            className="h-7 border-white/10 text-xs glass-input"
                                        />
                                    </div>
                                    <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(108px,1.35fr)]">
                                        <div className="space-y-1">
                                            <Label className={formFieldLabelClass}>Kategori</Label>
                                            <Select
                                                value={draft.category}
                                                onValueChange={(v) =>
                                                    setDraft((d) =>
                                                        d ? { ...d, category: v as TextTemplateCategory } : d
                                                    )
                                                }
                                            >
                                                <SelectTrigger className="h-7 border-white/10 text-xs glass-input">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="glass z-[var(--z-command-palette-floating)] border-white/10">
                                                    {EDIT_CATEGORIES.map((c) => (
                                                        <SelectItem key={c.value} value={c.value}>
                                                            {c.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex h-7 items-center gap-1.5 self-end px-0.5">
                                            <Checkbox
                                                id="tpl-inline-fav"
                                                checked={draft.is_favorite}
                                                onCheckedChange={(c) =>
                                                    setDraft((d) => (d ? { ...d, is_favorite: c === true } : d))
                                                }
                                            />
                                            <Label
                                                htmlFor="tpl-inline-fav"
                                                className="cursor-pointer text-[11px] font-normal text-muted-foreground"
                                            >
                                                Favori
                                            </Label>
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="tpl-inline-priority" className={formFieldLabelClass}>
                                                Öncelik
                                            </Label>
                                            <TooltipProvider delayDuration={120}>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <div
                                                            id="tpl-inline-priority"
                                                            className="flex h-7 items-center gap-1.5"
                                                            aria-label={`Öncelik: ${templatePriorityRankLabel(draft.priority)}`}
                                                        >
                                                            <span className="w-2 shrink-0 text-[10px] tabular-nums text-muted-foreground/80">
                                                                1
                                                            </span>
                                                            <Slider
                                                                min={1}
                                                                max={5}
                                                                step={1}
                                                                value={[draft.priority]}
                                                                onValueChange={(v) =>
                                                                    setDraft((d) =>
                                                                        d ? { ...d, priority: v[0] ?? 3 } : d
                                                                    )
                                                                }
                                                                className="flex-1 [&_[role=slider]]:h-3.5 [&_[role=slider]]:w-3.5 [&_[role=slider]]:border-primary/60"
                                                            />
                                                            <span className="w-2 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/80">
                                                                5
                                                            </span>
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent
                                                        side="top"
                                                        className="z-[var(--z-command-palette-floating)] border-white/10 px-2 py-1 text-[11px] glass-tooltip"
                                                    >
                                                        {templatePriorityRankLabel(draft.priority)}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <h2 className="text-lg font-semibold leading-snug flex-1 min-w-0">{panelTitle}</h2>
                                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="gap-1"
                                                onClick={() => void startEdit()}
                                            >
                                                <MaterialIcon icon="edit" size={16} />
                                                Düzenle
                                            </Button>
                                            {canDeleteSelected ? (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-1 text-destructive hover:text-destructive"
                                                    disabled={deleting}
                                                    onClick={() => void handleDeleteTemplate()}
                                                >
                                                    <MaterialIcon icon="delete" size={16} />
                                                    Sil
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                    {selected && (selected.updated_at || selected.usage_count != null) ? (
                                        <p className="text-[10px] text-muted-foreground">
                                            {selected.updated_at ? (
                                                <>Son güncelleme: {formatAudit(selected.updated_at)}</>
                                            ) : null}
                                            {selected.usage_count != null ? (
                                                <>
                                                    {selected.updated_at ? ' · ' : null}
                                                    Kullanım: {selected.usage_count}
                                                </>
                                            ) : null}
                                        </p>
                                    ) : null}
                                </>
                            )}
                        </div>

                        <div
                            className={cn(
                                'min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm custom-scrollbar',
                                !isEditing && 'prose prose-sm dark:prose-invert max-w-none'
                            )}
                        >
                            {isEditing ? (
                                <EditorContent editor={contentEditor} />
                            ) : (
                                <div
                                    dangerouslySetInnerHTML={{
                                        __html: previewHtml || '<p class="text-muted-foreground">Önizleme yok</p>',
                                    }}
                                />
                            )}
                        </div>

                        <div className="shrink-0 border-t border-border p-3 flex justify-end gap-2">
                            {isEditing ? (
                                <>
                                    <Button type="button" variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                                        İptal
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={saving || !contentEditor}
                                        onClick={() => void saveDraft()}
                                        className="gap-1.5"
                                    >
                                        <MaterialIcon icon="save" size={16} />
                                        {saving ? 'Kaydediliyor…' : 'Kaydet'}
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                                        Kapat
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={!mainEditor}
                                        onClick={() => void onInsert()}
                                        className="gap-1.5"
                                    >
                                        <MaterialIcon icon="add" size={16} />
                                        İmlece ekle
                                    </Button>
                                </>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground text-sm">
                        Soldan bir şablon seçin veya yeni şablon oluşturun.
                    </div>
                )}
            </div>
        </div>
    );
};
