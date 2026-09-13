import React from 'react';
import type { Editor } from '@tiptap/react';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../components/ui/select';
import { Label } from '../../components/ui/label';
import { Separator } from '../../components/ui/separator';
import ColorPicker from '../ui/ColorPicker';
import { applyEditorTextColor } from '../../utils/editorTextColor';
import { applyFontFamilyOrMarker, getMarkerFontFamily } from '../../utils/listFormatUtils';

interface FormatPanelProps {
    editor: Editor | null;
}

const FormatPanel: React.FC<FormatPanelProps> = ({ editor }) => {
    if (!editor) return null;

    // Helper to check active state for ToggleGroup
    const getActiveFormats = () => {
        const formats = [];
        if (editor.isActive('bold')) formats.push('bold');
        if (editor.isActive('italic')) formats.push('italic');
        if (editor.isActive('underline')) formats.push('underline');
        if (editor.isActive('strike')) formats.push('strike');
        return formats;
    };

    const getActiveScript = () => {
        if (editor.isActive('superscript')) return 'superscript';
        if (editor.isActive('subscript')) return 'subscript';
        return '';
    };

    return (
        <div className="flex flex-col gap-6 p-4">
            {/* Typography Section */}
            <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                    Text Style
                </Label>

                <div className="space-y-2">
                    <ToggleGroup
                        type="multiple"
                        value={getActiveFormats()}
                        className="justify-start w-full border rounded-md p-1"
                    >
                        <ToggleGroupItem value="bold" onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Toggle bold" className="flex-1">
                            <MaterialIcon icon="format_bold" size={16} />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="italic" onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Toggle italic" className="flex-1">
                            <MaterialIcon icon="format_italic" size={16} />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="underline" onClick={() => editor.chain().focus().toggleUnderline().run()} aria-label="Toggle underline" className="flex-1">
                            <MaterialIcon icon="format_underlined" size={16} />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="strike" onClick={() => editor.chain().focus().toggleStrike().run()} aria-label="Toggle strikethrough" className="flex-1">
                            <MaterialIcon icon="strikethrough_s" size={16} />
                        </ToggleGroupItem>
                    </ToggleGroup>

                    <ToggleGroup
                        type="single"
                        value={getActiveScript()}
                        className="justify-start w-full border rounded-md p-1"
                    >
                        <ToggleGroupItem
                            value="superscript"
                            onClick={() => {
                                if (editor.isActive('superscript')) {
                                    editor.chain().focus().unsetSuperscript().run();
                                } else {
                                    editor.chain().focus().unsetSubscript().setSuperscript().run();
                                }
                            }}
                            className="flex-1"
                        >
                            <MaterialIcon icon="superscript" size={16} />
                        </ToggleGroupItem>
                        <ToggleGroupItem
                            value="subscript"
                            onClick={() => {
                                if (editor.isActive('subscript')) {
                                    editor.chain().focus().unsetSubscript().run();
                                } else {
                                    editor.chain().focus().unsetSuperscript().setSubscript().run();
                                }
                            }}
                            className="flex-1"
                        >
                            <MaterialIcon icon="subscript" size={16} />
                        </ToggleGroupItem>
                    </ToggleGroup>
                </div>
            </div>

            <Separator />

            {/* Font Controls */}
            <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                    Font
                </Label>
                <div className="space-y-3">
                    <Select
                        value={getMarkerFontFamily(editor) || editor.getAttributes('textStyle').fontFamily || ''}
                        onValueChange={(value) => applyFontFamilyOrMarker(editor, value)}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Font Family" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Inter">Default (Inter)</SelectItem>
                            <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                            <SelectItem value="Arial">Arial</SelectItem>
                            <SelectItem value="Courier New">Courier New</SelectItem>
                            <SelectItem value="Georgia">Georgia</SelectItem>
                            <SelectItem value="Verdana">Verdana</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select
                        value={editor.getAttributes('textStyle').fontSize || ''}
                        onValueChange={(value) => editor.chain().focus().setFontSize(value).run()}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Size" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="8pt">8 pt</SelectItem>
                            <SelectItem value="9pt">9 pt</SelectItem>
                            <SelectItem value="10pt">10 pt</SelectItem>
                            <SelectItem value="11pt">11 pt</SelectItem>
                            <SelectItem value="12pt">12 pt</SelectItem>
                            <SelectItem value="14pt">14 pt</SelectItem>
                            <SelectItem value="16pt">16 pt</SelectItem>
                            <SelectItem value="18pt">18 pt</SelectItem>
                            <SelectItem value="20pt">20 pt</SelectItem>
                            <SelectItem value="24pt">24 pt</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Separator />

            {/* Color Controls */}
            <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                    Color
                </Label>
                <div className="space-y-2 p-3 bg-muted/30 rounded-lg border">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Text Color</span>
                        <ColorPicker
                            color={editor.getAttributes('textStyle').color}
                            onChange={(color) => applyEditorTextColor(editor, color)}
                            label="Text Color"
                        />
                    </div>
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Highlight</span>
                        <ColorPicker
                            color={editor.getAttributes('highlight').color}
                            onChange={(color) => editor.chain().focus().toggleHighlight({ color }).run()}
                            label="Highlight Color"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FormatPanel;
