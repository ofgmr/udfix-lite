import React, { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import MaterialIcon from '../ui/MaterialIcon';
import { cn } from '../../lib/utils';
import { applyEditorTextColor } from '../../utils/editorTextColor';
import { FONT_GROUPS } from '../../fonts/offlineFontRegistry';
import { matchOfflineFont, primaryFontName } from '../../utils/fontFamilyResolve';
import { preloadAllBundledFonts } from '../../fonts/loadBundledFont';
import {
    applyHfMiniEditorTextAlign,
    resolveHfMiniEditorActiveAlign,
    type HfTextAlign,
} from '../../utils/hfImageAlignExport';

const FONT_SIZES_PT = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24] as const;

const LINE_HEIGHTS = [
    { value: '1', label: '1.0' },
    { value: '1.15', label: '1.15' },
    { value: '1.5', label: '1.5' },
    { value: '2', label: '2.0' },
] as const;

function resolveFontStack(raw: string | undefined): string {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return 'Inter, sans-serif';
    return matchOfflineFont(trimmed)?.stack ?? trimmed;
}

function resolveFontName(stack: string): string {
    return matchOfflineFont(stack)?.name ?? primaryFontName(stack) ?? stack;
}

interface HeaderFooterMiniToolbarProps {
    editor: Editor;
    onImageClick: () => void;
}

type OpenMenu = 'font' | 'size' | 'lineHeight' | null;

interface MiniDropdownProps {
    menuKey: Exclude<OpenMenu, null>;
    openMenu: OpenMenu;
    setOpenMenu: (key: OpenMenu) => void;
    triggerClassName?: string;
    triggerStyle?: React.CSSProperties;
    menuClassName?: string;
    title: string;
    label: string;
    labelStyle?: React.CSSProperties;
    children: React.ReactNode;
}

const MiniDropdown: React.FC<MiniDropdownProps> = ({
    menuKey,
    openMenu,
    setOpenMenu,
    triggerClassName,
    triggerStyle,
    menuClassName,
    title,
    label,
    labelStyle,
    children,
}) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const isOpen = openMenu === menuKey;

    useEffect(() => {
        if (!isOpen) return;
        const onDoc = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpenMenu(null);
            }
        };
        document.addEventListener('mousedown', onDoc, true);
        return () => document.removeEventListener('mousedown', onDoc, true);
    }, [isOpen, setOpenMenu]);

    return (
        <div ref={rootRef} className="hf-mini-dropdown">
            <button
                type="button"
                className={cn('hf-mini-select hf-mini-dropdown__trigger', triggerClassName)}
                style={triggerStyle}
                title={title}
                onMouseDown={(e) => {
                    e.preventDefault();
                    setOpenMenu(isOpen ? null : menuKey);
                }}
            >
                <span className="truncate" style={labelStyle}>{label}</span>
            </button>
            {isOpen && (
                <div className={cn('hf-mini-dropdown-menu hf-mini-dropdown-menu--down', menuClassName)}>
                    {children}
                </div>
            )}
        </div>
    );
};

const HeaderFooterMiniToolbar: React.FC<HeaderFooterMiniToolbarProps> = ({ editor, onImageClick }) => {
    const [openMenu, setOpenMenu] = useState<OpenMenu>(null);

    const currentStack = resolveFontStack(editor.getAttributes('textStyle').fontFamily);
    const currentFontName = resolveFontName(currentStack);
    const rawSize = editor.getAttributes('textStyle').fontSize as string | undefined;
    const currentFontSize = rawSize ? rawSize.replace(/pt$/i, '') : '11';
    const currentLineHeight = editor.getAttributes('paragraph').lineHeight || '1.4';
    const activeAlign = resolveHfMiniEditorActiveAlign(editor);

    useEffect(() => {
        if (openMenu === 'font') void preloadAllBundledFonts();
    }, [openMenu]);

    return (
        <div className="hf-mini-toolbar">
            <div className="hf-mini-toolbar__row">
                <button
                    onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
                    className={cn('hf-mini-btn', editor.isActive('bold') && 'is-active')}
                    title="Kalın (Ctrl+B)"
                >
                    <MaterialIcon icon="format_bold" size={13} />
                </button>
                <button
                    onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
                    className={cn('hf-mini-btn', editor.isActive('italic') && 'is-active')}
                    title="İtalik (Ctrl+I)"
                >
                    <MaterialIcon icon="format_italic" size={13} />
                </button>
                <button
                    onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }}
                    className={cn('hf-mini-btn', editor.isActive('underline') && 'is-active')}
                    title="Alt Çizgi (Ctrl+U)"
                >
                    <MaterialIcon icon="format_underlined" size={13} />
                </button>
                <button
                    onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleStrike().run(); }}
                    className={cn('hf-mini-btn', editor.isActive('strike') && 'is-active')}
                    title="Üstü Çizili"
                >
                    <MaterialIcon icon="strikethrough_s" size={13} />
                </button>

                <span className="hf-mini-sep" />

                <MiniDropdown
                    menuKey="font"
                    openMenu={openMenu}
                    setOpenMenu={setOpenMenu}
                    triggerClassName="hf-mini-font-trigger"
                    triggerStyle={{ width: 100, textAlign: 'left' }}
                    menuClassName="hf-mini-dropdown-menu--wide"
                    title="Yazı Tipi"
                    label={currentFontName}
                    labelStyle={{ fontFamily: currentStack }}
                >
                    {FONT_GROUPS.map((group, gi) => (
                        <div key={group.label}>
                            {gi > 0 && <div className="hf-mini-dropdown-menu__sep" />}
                            <p className="hf-mini-dropdown-menu__label">{group.label}</p>
                            {group.fonts.map((font) => (
                                <button
                                    key={font.name}
                                    type="button"
                                    className={cn(
                                        'hf-mini-dropdown-menu__item',
                                        font.stack === currentStack && 'is-active',
                                    )}
                                    style={{ fontFamily: font.stack }}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        editor.chain().focus().setFontFamily(font.stack).run();
                                        setOpenMenu(null);
                                    }}
                                >
                                    {font.name}
                                </button>
                            ))}
                        </div>
                    ))}
                </MiniDropdown>

                <MiniDropdown
                    menuKey="size"
                    openMenu={openMenu}
                    setOpenMenu={setOpenMenu}
                    triggerStyle={{ width: 46 }}
                    menuClassName="hf-mini-dropdown-menu--compact"
                    title="Yazı Boyutu (pt)"
                    label={currentFontSize}
                >
                    {FONT_SIZES_PT.map((s) => (
                        <button
                            key={s}
                            type="button"
                            className={cn(
                                'hf-mini-dropdown-menu__item',
                                String(s) === currentFontSize && 'is-active',
                            )}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                editor.chain().focus().setFontSize(`${s}pt`).run();
                                setOpenMenu(null);
                            }}
                        >
                            {s}
                        </button>
                    ))}
                </MiniDropdown>

                <MiniDropdown
                    menuKey="lineHeight"
                    openMenu={openMenu}
                    setOpenMenu={setOpenMenu}
                    triggerStyle={{ width: 52 }}
                    menuClassName="hf-mini-dropdown-menu--compact"
                    title="Satır Yüksekliği"
                    label={LINE_HEIGHTS.find((lh) => lh.value === currentLineHeight)?.label ?? currentLineHeight}
                >
                    {LINE_HEIGHTS.map((lh) => (
                        <button
                            key={lh.value}
                            type="button"
                            className={cn(
                                'hf-mini-dropdown-menu__item',
                                lh.value === currentLineHeight && 'is-active',
                            )}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                editor.chain().focus().setLineHeight(lh.value).run();
                                setOpenMenu(null);
                            }}
                        >
                            {lh.label}
                        </button>
                    ))}
                </MiniDropdown>

                <span className="hf-mini-sep" />

                <label className="hf-mini-btn hf-mini-color-btn" title="Metin Rengi" onMouseDown={(e) => e.preventDefault()}>
                    <MaterialIcon icon="format_color_text" size={13} />
                    <div className="hf-mini-color-bar" style={{ background: editor.getAttributes('textStyle').color || 'currentColor' }} />
                    <input
                        type="color"
                        className="hf-mini-color-input"
                        value={editor.getAttributes('textStyle').color || '#000000'}
                        onChange={(e) => applyEditorTextColor(editor, e.target.value)}
                    />
                </label>

                <label className="hf-mini-btn hf-mini-color-btn" title="Vurgu Rengi" onMouseDown={(e) => e.preventDefault()}>
                    <MaterialIcon icon="format_color_fill" size={13} />
                    <div className="hf-mini-color-bar" style={{ background: editor.getAttributes('highlight').color || 'transparent' }} />
                    <input
                        type="color"
                        className="hf-mini-color-input"
                        value={editor.getAttributes('highlight').color || '#ffff00'}
                        onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()}
                    />
                </label>

                <span className="hf-mini-sep" />

                {(['left', 'center', 'right', 'justify'] as const).map((align) => {
                    const icons: Record<HfTextAlign, string> = {
                        left: 'format_align_left',
                        center: 'format_align_center',
                        right: 'format_align_right',
                        justify: 'format_align_justify',
                    };
                    const titles: Record<HfTextAlign, string> = {
                        left: 'Sola Hizala',
                        center: 'Ortala',
                        right: 'Sağa Hizala',
                        justify: 'İki Yana Yasla',
                    };
                    return (
                        <button
                            key={align}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                applyHfMiniEditorTextAlign(editor, align);
                            }}
                            className={cn('hf-mini-btn', activeAlign === align && 'is-active')}
                            title={titles[align]}
                        >
                            <MaterialIcon icon={icons[align]} size={13} />
                        </button>
                    );
                })}

                <span className="hf-mini-sep" />

                <button
                    onMouseDown={(e) => { e.preventDefault(); onImageClick(); }}
                    className="hf-mini-btn"
                    title="Görsel Yükle (maks 500 KB)"
                >
                    <MaterialIcon icon="image" size={13} />
                </button>
            </div>
        </div>
    );
};

export default HeaderFooterMiniToolbar;
