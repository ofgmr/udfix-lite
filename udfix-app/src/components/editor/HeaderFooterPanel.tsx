import React, { useState, useCallback, useEffect, useRef } from 'react';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Switch } from '../../components/ui/switch';
import {
    useHeaderFooterStore,
    type HeaderFooterSection,
    type DateFormatType,
    type HeaderFooterSettings,
} from '../../stores/useHeaderFooterStore';
import { cn } from '../../lib/utils';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { HfHardBreak } from '../../extensions/HfHardBreak';
import { HfImageExtension } from '../../extensions/HfImageExtension';
import { HfParagraph } from '../../extensions/HfParagraph';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import FontFamily from '@tiptap/extension-font-family'
import { Typography } from '@tiptap/extension-typography';
import { VariableExtension } from '../../extensions/VariableExtension';
import { TextStyle } from '@tiptap/extension-text-style';
import { FontSize } from '../../extensions/FontSize';
import { LineHeight } from '../../extensions/LineHeight';
import HeaderFooterMiniToolbar from './HeaderFooterMiniToolbar';
import { HF_PRESET_MAX_IMAGE_BYTES } from '../../utils/hfPresetAssets';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import {
    flushAllHfEditors,
    registerHfEditorFlusher,
    unregisterHfEditorFlusher,
} from '../../utils/hfEditorFlushRegistry';
import { useLayoutStore } from '../../stores/useLayoutStore';
import {
    EDITOR_PAGE_HEIGHT_PX,
    EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX,
    editorMaxVerticalMarginTotalPx,
} from '../../utils/editorLayout';
import { normalizeHfColumnHtml } from '../../utils/normalizeHfColumnHtml';
import { syncHfImageAlignFromParagraphInEditor } from '../../utils/hfImageAlignExport';
import { parseHtmlFragment, sanitizeTrustedDocumentHtml } from '../../utils/sanitizeDocumentHtml';

// ── Variable Definitions ──────────────────────────────────

const VARIABLES = [
    { label: '#', value: '{page}', icon: ' ', tooltip: 'Sayfa No' },
    { label: '##', value: '{totalPages}', icon: ' ', tooltip: 'Toplam Sayfa' },
    { label: ' ', value: '{date}', icon: 'calendar_today', tooltip: 'Tarih' },
    { label: ' ', value: '{title}', icon: 'title', tooltip: 'Belge Başlığı' },
] as const;

const EXPORT_SCOPE_TOOLTIP =
    'İlk/son/tek-çift sadece PDF çıktılarında ve editörde uygulanır. UDF/DOCX çıktılarında varsayılan üst/alt bilgi kullanılır.';

// ── Drag Pill (for Variable Ribbon) ───────────────────────

interface DragPillProps {
    variable: (typeof VARIABLES)[number];
}

const DragPill: React.FC<DragPillProps> = ({ variable }) => {
    return (
        <div
            className="hf-drag-pill"
            draggable
            onDragStart={(e) => {
                const varData = { id: variable.value.replace(/[{}]/g, ''), label: variable.label };
                e.dataTransfer.setData('application/x-nomai-variable', JSON.stringify(varData));
                e.dataTransfer.setData('text/plain', variable.value);
                e.dataTransfer.effectAllowed = 'copy';
            }}
            title={variable.tooltip}
        >
            <MaterialIcon icon={variable.icon} size={13} />
            {variable.label}
        </div>
    );
};

// ── Drop Zone (Input Area) ────────────────────────────────

interface DropZoneProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

const MAX_IMAGE_BYTES = HF_PRESET_MAX_IMAGE_BYTES;

function serializeHfMiniEditorHtml(ed: NonNullable<ReturnType<typeof useEditor>>): string {
    syncHfImageAlignFromParagraphInEditor(ed);
    return normalizeHfColumnHtml(ed.getHTML());
}

const RichDropZone: React.FC<DropZoneProps> = ({ label, value, onChange, placeholder }) => {
    const [isActive, setIsActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // Keep a stable ref to editor so the click-outside handler can call getHTML()
    const editorRef = useRef<ReturnType<typeof useEditor>>(null);
    // Debounce timer for live-sync to store while typing
    const debouncedSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Ref to always hold the latest onChange — prevents stale closure when tabs switch
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    // Skip value→editor sync when the store echo is from this editor (prevents space/mark loss).
    const lastEmittedHtmlRef = useRef<string | null>(null);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                underline: false,
                paragraph: false,
                hardBreak: false,
                heading: false,
                blockquote: false,
                codeBlock: false,
                horizontalRule: false,
                bulletList: false,
                orderedList: false,
                listItem: false,
            }),
            HfParagraph,
            HfHardBreak,
            HfImageExtension,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Underline,
            TextStyle,
            Color,
            Highlight.configure({ multicolor: true }),
            FontFamily,
            FontSize,
            LineHeight.configure({ types: ['paragraph'], defaultLineHeight: '1.4' }),
            Typography,
            VariableExtension,
        ],
        content: value,
        // Debounced live-update: calls onChange (→ updateSection → Zustand → syncHF) on every keystroke
        onUpdate: ({ editor: ed }) => {
            if (debouncedSaveRef.current) clearTimeout(debouncedSaveRef.current);
            debouncedSaveRef.current = setTimeout(() => {
                const html = serializeHfMiniEditorHtml(ed);
                lastEmittedHtmlRef.current = html;
                onChangeRef.current(html);
            }, 80);
        },
        editorProps: {
            handleDrop: (_view, event) => {
                if (event.dataTransfer?.files?.[0]) {
                    const file = event.dataTransfer.files[0];
                    if (file.type.startsWith('image/')) {
                        event.preventDefault();
                        if (file.size > MAX_IMAGE_BYTES) {
                            toast.error('Görsel çok büyük', {
                                description: `${(file.size / 1024).toFixed(0)} KB. Maksimum 500 KB yükleyebilirsiniz.`,
                            });
                            return true;
                        }
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                            const result = ev.target?.result as string;
                            if (result && editor) {
                                editor.chain().focus().setImage({ src: result, width: '64px', hfSized: true }).run();
                            }
                        };
                        reader.readAsDataURL(file);
                        return true;
                    }
                }
                return false;
            },
        },
    });

    // Keep editorRef in sync
    useEffect(() => { (editorRef as React.MutableRefObject<typeof editor>).current = editor; }, [editor]);

    useEffect(() => {
        const flush = () => {
            if (debouncedSaveRef.current) {
                clearTimeout(debouncedSaveRef.current);
                debouncedSaveRef.current = null;
            }
            const ed = editorRef.current;
            if (ed && !ed.isDestroyed) {
                const html = serializeHfMiniEditorHtml(ed);
                lastEmittedHtmlRef.current = html;
                onChangeRef.current(html);
            }
        };
        registerHfEditorFlusher(flush);
        return () => unregisterHfEditorFlusher(flush);
    }, []);

    // Auto-focus when activated (defer — TipTap node views use flushSync)
    useEffect(() => {
        if (!isActive || !editor) return;
        queueMicrotask(() => {
            if (!editor.isDestroyed && isActive) {
                editor.commands.focus('end');
            }
        });
    }, [isActive, editor]);

    // Sync value prop → editor content when it changes externally (e.g. preset load, tab switch)
    // We normalize both HTML strings through a temp div to avoid false mismatches caused by
    // Tiptap's slightly different serialization (e.g. self-closing img tags, attribute order).
    useEffect(() => {
        if (!editor) return;
        if (value === lastEmittedHtmlRef.current) return;
        const current = editor.getHTML();
        if (current === value) return;

        // Normalize via DOM roundtrip to compare semantic content, not string format
        const currentWrap = parseHtmlFragment(current);
        const valueWrap = parseHtmlFragment(value || '');
        if (!currentWrap || !valueWrap) return;
        const normalizedCurrent = currentWrap.innerHTML;
        const normalizedValue = valueWrap.innerHTML;

        if (normalizedCurrent !== normalizedValue) {
            const next = value || '';
            queueMicrotask(() => {
                if (editor.isDestroyed) return;
                const nowWrap = parseHtmlFragment(editor.getHTML());
                const nextWrap = parseHtmlFragment(next);
                if (!nowWrap || !nextWrap) return;
                if (nowWrap.innerHTML === nextWrap.innerHTML) return;
                editor.commands.setContent(next, false);
            });
        }
    }, [editor, value]);

    // Click-outside detection: save + deactivate
    useEffect(() => {
        if (!isActive) return;
        const handleMouseDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (containerRef.current && !containerRef.current.contains(target)) {
                const ed = editorRef.current;
                if (ed) {
                    const html = serializeHfMiniEditorHtml(ed);
                    lastEmittedHtmlRef.current = html;
                    onChange(html);
                }
                setIsActive(false);
            }
        };
        // Use capture so we intercept before anything else
        document.addEventListener('mousedown', handleMouseDown, true);
        return () => document.removeEventListener('mousedown', handleMouseDown, true);
    }, [isActive, onChange]);


    const handleDrop = (e: React.DragEvent) => {
        if (!editor) return;
        const varDataStr = e.dataTransfer.getData('application/x-nomai-variable');
        if (varDataStr) {
            e.preventDefault();
            try {
                const varData = JSON.parse(varDataStr);
                editor.commands.setVariable({ id: varData.id, label: varData.label });
            } catch (err) {
                console.error('Failed to parse variable drop data', err);
            }
            return;
        }
        const data = e.dataTransfer.getData('text/plain');
        if (data) { e.preventDefault(); editor.commands.insertContent(data); }
    };

    // Image upload via file dialog
    const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !editor) return;
        if (file.size > MAX_IMAGE_BYTES) {
            toast.error('Görsel çok büyük', {
                description: `${(file.size / 1024).toFixed(0)} KB. Maksimum 500 KB yükleyebilirsiniz.`,
            });
            e.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const src = ev.target?.result as string;
            if (src) editor.chain().focus().setImage({ src, width: '64px', hfSized: true }).run();
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    // ── Static Preview ───────────────────────────────────────────────────────
    if (!isActive) {
        return (
            <div
                ref={containerRef}
                className="hf-drop-zone"
                onClick={() => setIsActive(true)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    const varDataStr = e.dataTransfer.getData('application/x-nomai-variable');
                    const plainData = e.dataTransfer.getData('text/plain');
                    if (varDataStr || plainData) {
                        e.preventDefault();
                        setIsActive(true);
                        setTimeout(() => {
                            if (varDataStr) {
                                try {
                                    const varData = JSON.parse(varDataStr);
                                    editor?.commands.setVariable({ id: varData.id, label: varData.label });
                                } catch { /* ignore */ }
                            } else { editor?.commands.insertContent(plainData); }
                        }, 50);
                    }
                }}
                title={placeholder || label}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setIsActive(true)}
            >
                <span className="hf-drop-zone__label">{label}</span>
                {value ? (
                    <div
                        className="hf-mini-editor-preview"
                        style={{ fontSize: '11px', color: 'var(--hf-text)', minHeight: '20px' }}
                        dangerouslySetInnerHTML={{ __html: sanitizeTrustedDocumentHtml(value) }}
                    />
                ) : (
                    <span className="hf-drop-zone__placeholder">{placeholder || '—'}</span>
                )}
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="hf-drop-zone hf-drop-zone--focused"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
        >
            <span className="hf-drop-zone__label">{label}</span>

            {editor && (
                <HeaderFooterMiniToolbar
                    editor={editor}
                    onImageClick={() => fileInputRef.current?.click()}
                />
            )}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleImageFileChange}
            />

            <EditorContent
                editor={editor}
                className="hf-mini-editor"
                style={{
                    minHeight: '28px',
                    fontSize: 'var(--hf-font-size, var(--hf-default-font-size, 11px))',
                    outline: 'none',
                    color: 'var(--hf-text)',
                    fontFamily: 'var(--hf-font-family, var(--font-sans, Inter, sans-serif))',
                }}
            />
        </div>
    );
};


// ── Section Editor (Header + Footer) ──────────────────────

interface SectionEditorProps {
    sectionKey: 'default' | 'firstPage' | 'lastPage' | 'oddPage' | 'evenPage';
    section: HeaderFooterSection;
}

const LAYOUT_OPTIONS = [
    { value: '3-col-equal', label: '3 Sütun (Eşit)', icon: 'view_column_3' },
    { value: '2-col-70-30', label: '2 Sütun (70/30)', icon: 'view_column-2' },
    { value: '2-col-80-20', label: '2 Sütun (80/20)', icon: 'view_column-2' },
    { value: '2-col-30-70', label: '2 Sütun (30/70)', icon: 'view_column-2' },
    { value: '2-col-20-80', label: '2 Sütun (20/80)', icon: 'view_column-2' },
    { value: '1-col', label: 'Tek Sütun', icon: 'splitscreen_top' },
] as const;

const SectionEditor: React.FC<SectionEditorProps> = ({ sectionKey, section }) => {
    const { updateSection, settings, updateSettings } = useHeaderFooterStore();

    const update = (field: keyof HeaderFooterSection, value: string) => {

        updateSection(sectionKey, field, value);
    };

    const headerLayout = settings.headerLayout || '3-col-equal';
    const footerLayout = settings.footerLayout || '3-col-equal';

    const getLayoutConfig = (layout: string) => {
        const showLeft = layout !== '1-col';
        const showCenter = layout === '3-col-equal' || layout === '1-col';
        const showRight = layout !== '1-col';
        return { showLeft, showCenter, showRight };
    };

    const headerConfig = getLayoutConfig(headerLayout);
    const footerConfig = getLayoutConfig(footerLayout);

    return (
        <div>
            {/* Header — icon label */}
            <div className="hf-section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MaterialIcon icon="vertical_align_top" size={13} />
                    Üst
                </span>
                <select
                    className="hf-setting-select"
                    value={headerLayout}
                    onChange={(e) => updateSettings({ headerLayout: e.target.value as HeaderFooterSettings['headerLayout'] })}
                    style={{ width: 'auto', fontSize: '10px', padding: '2px 4px' }}
                >
                    {LAYOUT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
            </div>
            <div className={`hf-column-grid hf-layout-${headerLayout}`}>
                {headerConfig.showLeft && (
                    <RichDropZone
                        label="SOL"
                        value={section.headerLeft}
                        onChange={(v) => update('headerLeft', v)}
                        placeholder="Sol..."
                    />
                )}
                {headerConfig.showCenter && (
                    <RichDropZone
                        label={headerLayout === '1-col' ? 'ORTA' : 'ORTA'}
                        value={section.headerCenter}
                        onChange={(v) => update('headerCenter', v)}
                        placeholder="Orta..."
                    />
                )}
                {headerConfig.showRight && (
                    <RichDropZone
                        label="SAĞ"
                        value={section.headerRight}
                        onChange={(v) => update('headerRight', v)}
                        placeholder="Sağ..."
                    />
                )}
            </div>

            {/* Thin divider */}
            <div className="hf-divider" />

            {/* Footer — icon label */}
            <div className="hf-section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MaterialIcon icon="vertical_align_bottom" size={13} />
                    Alt
                </span>
                <select
                    className="hf-setting-select"
                    value={footerLayout}
                    onChange={(e) => updateSettings({ footerLayout: e.target.value as HeaderFooterSettings['footerLayout'] })}
                    style={{ width: 'auto', fontSize: '10px', padding: '2px 4px' }}
                >
                    {LAYOUT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
            </div>
            <div className={`hf-column-grid hf-layout-${footerLayout}`}>
                {footerConfig.showLeft && (
                    <RichDropZone
                        label="SOL"
                        value={section.footerLeft}
                        onChange={(v) => update('footerLeft', v)}
                        placeholder="Sol..."
                    />
                )}
                {footerConfig.showCenter && (
                    <RichDropZone
                        label={footerLayout === '1-col' ? 'ORTA' : 'ORTA'}
                        value={section.footerCenter}
                        onChange={(v) => update('footerCenter', v)}
                        placeholder="Orta..."
                    />
                )}
                {footerConfig.showRight && (
                    <RichDropZone
                        label="SAĞ"
                        value={section.footerRight}
                        onChange={(v) => update('footerRight', v)}
                        placeholder="Sağ..."
                    />
                )}
            </div>
        </div>
    );
};

// ── Compact Settings ──────────────────────────────────────

const CompactSettings: React.FC = () => {
    const { settings, updateSettings } = useHeaderFooterStore();
    const editor = useLayoutStore((s) => s.editor);
    const pageH =
        editor && !editor.isDestroyed
            ? Number((editor.storage as { PaginationPlus?: { pageHeight?: number } })?.PaginationPlus?.pageHeight) ||
              EDITOR_PAGE_HEIGHT_PX
            : EDITOR_PAGE_HEIGHT_PX;
    const maxMarginExtra = Math.max(
        0,
        editorMaxVerticalMarginTotalPx(pageH) - EDITOR_PAGINATION_BODY_VERTICAL_BASE_PX,
    );

    return (
        <div className="hf-compact-settings">
            {/* Row 1: Page Number + Date */}
            <div className="hf-compact-row">
                <div className="hf-compact-row__item">
                    <span className="hf-compact-row__label">Başlangıç No:</span>
                    <input
                        type="number"
                        className="hf-setting-input"
                        style={{ width: 40 }}
                        value={settings.pageNumberStart}
                        min={1}
                        onChange={(e) => updateSettings({ pageNumberStart: parseInt(e.target.value) || 1 })}
                    />
                </div>
                <div className="hf-compact-row__sep" />
                <div className="hf-compact-row__item">
                    <span className="hf-compact-row__label">İlk Sayfada Gizle:</span>
                    <Switch
                        variant="glass"
                        checked={settings.hidePageNumberOnFirstPage}
                        onCheckedChange={(v) => updateSettings({ hidePageNumberOnFirstPage: v })}
                    />
                </div>
                <div className="hf-compact-row__sep" />
                <div className="hf-compact-row__item">
                    <span className="hf-compact-row__label">Tarih:</span>
                    <select
                        className="hf-setting-select"
                        value={settings.dateFormat}
                        onChange={(e) => updateSettings({ dateFormat: e.target.value as DateFormatType })}
                    >
                        <option value="DD.MM.YYYY">25.02.2026</option>
                        <option value="DD MMMM YYYY">25 Şubat 2026</option>
                        <option value="YYYY-MM-DD">2026-02-25</option>
                    </select>
                </div>
            </div>

            {/* Row 2: Separator + spacing */}
            <div className="hf-compact-row hf-compact-row--separator">
                <div className="hf-compact-row__item">
                    <span className="hf-compact-row__label">Üst Çizgi:</span>
                    <Switch
                        variant="glass"
                        checked={settings.showHeaderSeparatorLine}
                        onCheckedChange={(v) => updateSettings({ showHeaderSeparatorLine: v })}
                    />
                </div>
                <div className="hf-compact-row__sep" />
                <div className="hf-compact-row__item">
                    <span className="hf-compact-row__label">Alt Çizgi:</span>
                    <Switch
                        variant="glass"
                        checked={settings.showFooterSeparatorLine}
                        onCheckedChange={(v) => updateSettings({ showFooterSeparatorLine: v })}
                    />
                </div>
                {(settings.showHeaderSeparatorLine || settings.showFooterSeparatorLine) && (
                    <>
                        <div className="hf-compact-row__sep" />
                        <div className="hf-compact-row__item">
                            <span className="hf-compact-row__label">Renk:</span>
                            <input
                                type="color"
                                className="hf-color-input"
                                value={settings.separatorLineColor?.startsWith('#') ? settings.separatorLineColor : '#64748b'}
                                onChange={(e) => updateSettings({ separatorLineColor: e.target.value })}
                            />
                        </div>
                        <div className="hf-compact-row__sep" />
                        <div className="hf-compact-row__item">
                            <span className="hf-compact-row__label">Kalınlık:</span>
                            <input
                                type="number"
                                className="hf-setting-input"
                                style={{ width: 44 }}
                                value={settings.separatorLineWidth}
                                min={0.5}
                                max={5}
                                step={0.5}
                                onChange={(e) => updateSettings({ separatorLineWidth: parseFloat(e.target.value) || 0.5 })}
                            />
                        </div>
                    </>
                )}
            </div>

            {/* Row 3: Margins + Indent */}
            <div className="hf-compact-row">
                <div className="hf-compact-row__item">
                    <span className="hf-compact-row__label">Üst Boşluk:</span>
                    <input
                        type="number"
                        className="hf-setting-input"
                        style={{ width: 44 }}
                        value={settings.headerMarginTop}
                        min={0}
                        max={maxMarginExtra}
                        onChange={(e) =>
                            updateSettings({
                                headerMarginTop: Math.min(
                                    maxMarginExtra,
                                    Math.max(0, parseInt(e.target.value, 10) || 0),
                                ),
                            })
                        }
                    />
                </div>
                <div className="hf-compact-row__sep" />
                <div className="hf-compact-row__item">
                    <span className="hf-compact-row__label">Alt Boşluk:</span>
                    <input
                        type="number"
                        className="hf-setting-input"
                        style={{ width: 44 }}
                        value={settings.footerMarginBottom}
                        min={0}
                        max={maxMarginExtra}
                        onChange={(e) =>
                            updateSettings({
                                footerMarginBottom: Math.min(
                                    maxMarginExtra,
                                    Math.max(0, parseInt(e.target.value, 10) || 0),
                                ),
                            })
                        }
                    />
                </div>
                <div className="hf-compact-row__sep" />
                <div className="hf-compact-row__item">
                    <span className="hf-compact-row__label">Girinti:</span>
                    <input
                        type="number"
                        className="hf-setting-input"
                        style={{ width: 44 }}
                        value={settings.headerIndent}
                        min={0}
                        onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            updateSettings({ headerIndent: val, footerIndent: val });
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

// ── Preset Icons ──────────────────────────────────────────

const PRESET_ICONS = [
    'bookmark', 'business', 'gavel', 'handshake', 'school',
    'description', 'article', 'workspace_premium', 'account_balance',
    'policy', 'badge', 'folder_special', 'star',
];

interface IconPickerProps {
    value: string;
    onChange: (icon: string) => void;
}

const IconPicker: React.FC<IconPickerProps> = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div style={{ position: 'relative' }}>
            <button
                className="hf-btn hf-btn--ghost"
                style={{ padding: '4px 8px', fontSize: 10 }}
                onClick={() => setIsOpen(!isOpen)}
                title="İkon seç"
            >
                <MaterialIcon icon={value} size={14} />
            </button>
            {isOpen && (
                <div style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 4px)',
                    left: 0,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: 2,
                    padding: 6,
                    borderRadius: 8,
                    backdropFilter: 'blur(16px)',
                    background: 'var(--hf-panel-bg)',
                    border: '1px solid var(--hf-border)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    zIndex: 60,
                }}>
                    {PRESET_ICONS.map((icon) => (
                        <button
                            key={icon}
                            onClick={() => { onChange(icon); setIsOpen(false); }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 28,
                                height: 28,
                                borderRadius: 5,
                                border: 'none',
                                background: value === icon ? 'color-mix(in srgb, var(--primary) 20%, transparent)' : 'transparent',
                                color: value === icon ? 'var(--primary)' : 'var(--hf-text-muted)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            <MaterialIcon icon={icon} size={16} />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Preset Library (Compact Cards) ────────────────────────

const PresetLibrary: React.FC = () => {
    const {
        presets,
        loadPreset,
        deletePreset,
        savePreset,
    } = useHeaderFooterStore();
    const [showSaveForm, setShowSaveForm] = useState(false);
    const [presetName, setPresetName] = useState('');
    const [presetDesc, setPresetDesc] = useState('');
    const [presetIcon, setPresetIcon] = useState('bookmark');
    const [isLibraryOpen, setIsLibraryOpen] = useState(true);
    const [hoveredPresetId, setHoveredPresetId] = useState<string | null>(null);

    const handleSave = () => {
        if (presetName.trim()) {
            savePreset(presetName.trim(), presetDesc.trim() || undefined, presetIcon);
            setPresetName('');
            setPresetDesc('');
            setPresetIcon('bookmark');
            setShowSaveForm(false);
        }
    };

    const handleApplyPreset = useCallback((presetId: string) => {
        setHoveredPresetId(null);
        loadPreset(presetId);
    }, [loadPreset]);

    return (
        <div className="hf-settings-group">
            <div
                className="hf-settings-group__title"
                onClick={() => setIsLibraryOpen(!isLibraryOpen)}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MaterialIcon icon="collections_bookmark" size={13} />
                    Antet Kütüphanesi
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                        className="hf-btn hf-btn--ghost"
                        style={{ padding: '2px 8px', fontSize: 10 }}
                        onClick={(e) => { e.stopPropagation(); setShowSaveForm(!showSaveForm); }}
                    >
                        <MaterialIcon icon="add" size={11} /> Kaydet
                    </button>
                    <MaterialIcon icon={isLibraryOpen ? 'expand_less' : 'expand_more'} size={14} />
                </div>
            </div>

            {isLibraryOpen && (
                <div style={{ paddingTop: 6 }}>
                    {/* Save Form */}
                    {showSaveForm && (
                        <div style={{
                            padding: '8px 10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            borderRadius: 7,
                            background: 'var(--hf-surface)',
                            border: '1px solid var(--hf-border)',
                            marginBottom: 8,
                        }}>
                            <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--hf-text-muted)' }}>
                                Yeni Şablon Kaydet
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <IconPicker value={presetIcon} onChange={setPresetIcon} />
                                <input
                                    type="text"
                                    placeholder="Şablon adı..."
                                    value={presetName}
                                    onChange={(e) => setPresetName(e.target.value)}
                                    className="hf-setting-input"
                                    style={{ flex: 1, textAlign: 'left', width: 'auto' }}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                                />
                            </div>
                            <input
                                type="text"
                                placeholder="Açıklama (isteğe bağlı)"
                                value={presetDesc}
                                onChange={(e) => setPresetDesc(e.target.value)}
                                className="hf-setting-input"
                                style={{ width: '100%', textAlign: 'left' }}
                            />
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button className="hf-btn hf-btn--ghost" style={{ padding: '3px 8px', fontSize: 10 }} onClick={() => setShowSaveForm(false)}>İptal</button>
                                <button className="hf-btn hf-btn--primary" style={{ padding: '3px 8px', fontSize: 10 }} onClick={handleSave}>
                                    <MaterialIcon icon="save" size={11} /> Kaydet
                                </button>
                            </div>
                        </div>
                    )}

                    {/* All presets in a single list */}
                    <div className="hf-presets-grid">
                        {presets.map((preset) => (
                            <div
                                key={preset.id}
                                className={cn('hf-preset-card', hoveredPresetId === preset.id && 'hf-preset-card--previewing')}
                                onClick={() => handleApplyPreset(preset.id)}
                                onMouseEnter={() => setHoveredPresetId(preset.id)}
                                onMouseLeave={() => setHoveredPresetId(null)}
                            >
                                <span className="hf-preset-card__icon">
                                    <MaterialIcon icon={preset.icon || 'bookmark'} size={13} />
                                </span>
                                <span className="hf-preset-card__name">{preset.name}</span>
                                {preset.description && <span className="hf-preset-card__desc">{preset.description}</span>}
                                <button
                                    className="hf-preset-card__delete"
                                    onClick={(e) => { e.stopPropagation(); deletePreset(preset.id); }}
                                    title="Sil"
                                >
                                    <MaterialIcon icon="close" size={10} />
                                </button>
                            </div>
                        ))}
                    </div>

                    {presets.length === 0 && (
                        <div style={{ padding: '6px 0', textAlign: 'center', fontSize: 9, color: 'var(--hf-text-muted)', opacity: 0.4 }}>
                            Kaydetmek için "Kaydet" butonuna tıkla
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ── Main Panel Component ──────────────────────────────────

const HeaderFooterPanel: React.FC = () => {
    const {
        panelOpen,
        panelActiveTab,
        setPanelActiveTab,
        differentFirstPage,
        differentLastPage,
        differentOddEvenPages,
        setDifferentFirstPage,
        setDifferentLastPage,
        setDifferentOddEvenPages,
        sections,
        applyChanges,
        discardChanges,
        clearSection,
        loadAllPresets,
    } = useHeaderFooterStore();

    useEffect(() => {
        loadAllPresets();
    }, [loadAllPresets]);

    // Escape to close
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && panelOpen) discardChanges();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [panelOpen, discardChanges]);

    const currentSection = sections[panelActiveTab];

    return (
        <>
            {/* Backdrop */}
            <div
                className={cn('hf-panel-backdrop', panelOpen && 'hf-panel-backdrop--open')}
                onClick={discardChanges}
            />

            {/* Right-side sliding panel */}
            <div className={cn('hf-panel', panelOpen && 'hf-panel--open')}>
                {/* Header */}
                <div className="hf-panel__header">
                    <div className="hf-panel__title">
                        <MaterialIcon icon="edit_document" size={18} />
                        Üst/Alt Bilgi
                    </div>
                    <button className="hf-panel__close" onClick={discardChanges}>
                        <MaterialIcon icon="close" size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="hf-panel__body">
                    {/* Inline toggles — single row */}
                    <TooltipProvider delayDuration={200}>
                        <div className="hf-toggles-inline">
                            <div className="hf-toggle-row">
                                <span className="hf-toggle-row__label">İlk sayfa farklı</span>
                                <Switch
                                    variant="glass"
                                    checked={differentFirstPage}
                                    onCheckedChange={setDifferentFirstPage}
                                />
                            </div>
                            <div className="hf-toggle-row">
                                <span className="hf-toggle-row__label">Son sayfa farklı</span>
                                <Switch
                                    variant="glass"
                                    checked={differentLastPage}
                                    onCheckedChange={setDifferentLastPage}
                                />
                            </div>
                            <div className="hf-toggle-row">
                                <span className="hf-toggle-row__label" title="Tek ve çift sayfaları farklılandır (örn: kitap baskısı)">Tek/Çift farklı</span>
                                <Switch
                                    variant="glass"
                                    checked={differentOddEvenPages}
                                    onCheckedChange={setDifferentOddEvenPages}
                                />
                            </div>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        className="hf-export-scope-info"
                                        aria-label="UDF/DOCX dışa aktarım kapsamı"
                                    >
                                        <MaterialIcon icon="info" size={14} />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="left" align="start" className="z-[9005] max-w-[280px] text-xs leading-snug">
                                    {EXPORT_SCOPE_TOOLTIP}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    </TooltipProvider>

                    {/* Tab switcher (shown only when any custom feature is enabled) */}
                    {(differentFirstPage || differentLastPage || differentOddEvenPages) && (
                        <div className="hf-tabs" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
                            <button
                                className={cn('hf-tab', panelActiveTab === 'default' && 'hf-tab--active')}
                                onClick={() => setPanelActiveTab('default')}
                            >
                                <MaterialIcon icon="description" size={13} />
                                Varsayılan
                            </button>
                            {differentFirstPage && (
                                <button
                                    className={cn('hf-tab', panelActiveTab === 'firstPage' && 'hf-tab--active')}
                                    onClick={() => setPanelActiveTab('firstPage')}
                                >
                                    <MaterialIcon icon="first_page" size={13} />
                                    İlk Sayfa
                                </button>
                            )}
                            {differentLastPage && (
                                <button
                                    className={cn('hf-tab', panelActiveTab === 'lastPage' && 'hf-tab--active')}
                                    onClick={() => setPanelActiveTab('lastPage')}
                                >
                                    <MaterialIcon icon="last_page" size={13} />
                                    Son Sayfa
                                </button>
                            )}
                            {differentOddEvenPages && (
                                <>
                                    <button
                                        className={cn('hf-tab', panelActiveTab === 'oddPage' && 'hf-tab--active')}
                                        onClick={() => setPanelActiveTab('oddPage')}
                                    >
                                        <MaterialIcon icon="format_align_right" size={13} />
                                        Tek Sayfa
                                    </button>
                                    <button
                                        className={cn('hf-tab', panelActiveTab === 'evenPage' && 'hf-tab--active')}
                                        onClick={() => setPanelActiveTab('evenPage')}
                                    >
                                        <MaterialIcon icon="format_align_left" size={13} />
                                        Çift Sayfa
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {/* Section Editor: only the active tab's header+footer */}
                    <SectionEditor sectionKey={panelActiveTab} section={currentSection} />

                    {/* Variable Ribbon — horizontal scroll */}
                    <div className="hf-var-ribbon">
                        {VARIABLES.map((v) => (
                            <DragPill key={v.value} variable={v} />
                        ))}
                    </div>

                    {/* Compact Settings */}
                    <CompactSettings />

                    {/* Preset Library */}
                    <PresetLibrary />
                </div>

                {/* Footer */}
                <div className="hf-panel__footer">
                    <button className="hf-btn hf-btn--danger" onClick={() => clearSection('all')} style={{ marginRight: 'auto' }}>
                        <MaterialIcon icon="delete_forever" size={13} />
                        Temizle
                    </button>
                    <button className="hf-btn hf-btn--ghost" onClick={discardChanges}>
                        İptal
                    </button>
                    <button
                        className="hf-btn hf-btn--primary"
                        onMouseDown={() => flushAllHfEditors()}
                        onClick={applyChanges}
                    >
                        <MaterialIcon icon="check" size={13} />
                        Uygula
                    </button>
                </div>
            </div>
        </>
    );
};

export default HeaderFooterPanel;
