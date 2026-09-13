import React from 'react';
import type { ListStyleType } from '../../extensions/ExtendedOrderedList';
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
import { Button } from '../../components/ui/button';

interface ParagraphPanelProps {
    editor: Editor | null;
}

const ParagraphPanel: React.FC<ParagraphPanelProps> = ({ editor }) => {
    if (!editor) return null;

    const getActiveAlignment = () => {
        if (editor.isActive({ textAlign: 'center' })) return 'center';
        if (editor.isActive({ textAlign: 'right' })) return 'right';
        if (editor.isActive({ textAlign: 'justify' })) return 'justify';
        return 'left';
    };

    const getActiveList = () => {
        if (editor.isActive('bulletList')) return 'bulletList';
        if (editor.isActive('orderedList')) return 'orderedList';
        return '';
    };

    return (
        <div className="flex flex-col gap-6 p-4">
            {/* Alignment */}
            <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                    Alignment
                </Label>
                <ToggleGroup
                    type="single"
                    value={getActiveAlignment()}
                    onValueChange={(value) => {
                        if (value) editor.chain().focus().setTextAlign(value).run();
                    }}
                    className="justify-start w-full border rounded-md p-1"
                >
                    <ToggleGroupItem value="left" aria-label="left aligned" className="flex-1">
                        <MaterialIcon icon="format_align_left" size={16} />
                    </ToggleGroupItem>
                    <ToggleGroupItem value="center" aria-label="centered" className="flex-1">
                        <MaterialIcon icon="format_align_center" size={16} />
                    </ToggleGroupItem>
                    <ToggleGroupItem value="right" aria-label="right aligned" className="flex-1">
                        <MaterialIcon icon="format_align_right" size={16} />
                    </ToggleGroupItem>
                    <ToggleGroupItem value="justify" aria-label="justified" className="flex-1">
                        <MaterialIcon icon="format_align_justify" size={16} />
                    </ToggleGroupItem>
                </ToggleGroup>
            </div>

            <Separator />

            {/* Lists and Numbering */}
            <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                    Lists & Numbering
                </Label>
                <div className="space-y-3">
                    <ToggleGroup
                        type="single"
                        value={getActiveList()}
                        onValueChange={(value) => {
                            if (value === 'bulletList') editor.chain().focus().toggleBulletList().run();
                            else if (value === 'orderedList') {
                                editor.chain().focus().toggleOrderedList().run();
                            }
                        }}
                        className="justify-start w-full border rounded-md p-1"
                    >
                        <ToggleGroupItem value="bulletList" aria-label="bullet list" className="flex-1">
                            <MaterialIcon icon="format_list_bulleted" size={16} />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="orderedList" aria-label="numbered list" className="flex-1">
                            <MaterialIcon icon="format_list_numbered" size={16} />
                        </ToggleGroupItem>
                    </ToggleGroup>

                    {/* Numbering Library Picker */}
                    {editor.isActive('orderedList') && (
                        <Select
                            onValueChange={(value) => {
                                editor.commands.setListStyle(value as ListStyleType);
                            }}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Numbering Style" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="default">1. a. i.</SelectItem>
                                <SelectItem value="legal">1. 1.1. 1.1.1.</SelectItem>
                                <SelectItem value="roman">I. A. 1.</SelectItem>
                                <SelectItem value="paren">1) a) i)</SelectItem>
                                <SelectItem value="outline">A. 1. a.</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>

            <Separator />

            {/* Indent Controls */}
            <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                    Indent
                </Label>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => editor.chain().focus().smartOutdent().run()}
                        className="flex-1"
                    >
                        <MaterialIcon icon="format_indent_decrease" size={16} className="mr-2" />
                        Outdent
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => editor.chain().focus().smartIndent().run()}
                        className="flex-1"
                    >
                        <MaterialIcon icon="format_indent_increase" size={16} className="mr-2" />
                        Indent
                    </Button>
                </div>
            </div>

            <Separator />

            {/* Text Case Conversion */}
            <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                    Text Case
                </Label>
                <Select
                    value=""
                    onValueChange={(value) => {
                        const caseType = value as 'uppercase' | 'lowercase' | 'titlecase' | 'sentencecase';
                        const { from, to } = editor.state.selection;
                        const selectedText = editor.state.doc.textBetween(from, to, ' ');

                        let transformedText = selectedText;
                        switch (caseType) {
                            case 'uppercase':
                                transformedText = selectedText.toUpperCase();
                                break;
                            case 'lowercase':
                                transformedText = selectedText.toLowerCase();
                                break;
                            case 'titlecase':
                                transformedText = selectedText.replace(/\w\S*/g, (txt) =>
                                    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
                                );
                                break;
                            case 'sentencecase':
                                transformedText = selectedText.charAt(0).toUpperCase() + selectedText.slice(1).toLowerCase();
                                break;
                        }

                        if (transformedText !== selectedText) {
                            editor.chain().focus().deleteSelection().insertContent(transformedText).run();
                        }
                    }}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Change Case..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="uppercase">UPPERCASE</SelectItem>
                        <SelectItem value="lowercase">lowercase</SelectItem>
                        <SelectItem value="titlecase">Title Case</SelectItem>
                        <SelectItem value="sentencecase">Sentence case</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <Separator />

            {/* Heading Styles */}
            <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                    Heading
                </Label>
                <Select
                    value={
                        editor.isActive('heading', { level: 1 }) ? '1' :
                            editor.isActive('heading', { level: 2 }) ? '2' :
                                editor.isActive('heading', { level: 3 }) ? '3' :
                                    editor.isActive('heading', { level: 4 }) ? '4' :
                                        editor.isActive('heading', { level: 5 }) ? '5' :
                                            editor.isActive('heading', { level: 6 }) ? '6' : '0'
                    }
                    onValueChange={(value) => {
                        const level = parseInt(value);
                        if (level === 0) {
                            editor.chain().focus().setParagraph().run();
                        } else {
                            editor.chain().focus().setHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run();
                        }
                    }}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Heading Level" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="0">Normal Text</SelectItem>
                        <SelectItem value="1">Heading 1</SelectItem>
                        <SelectItem value="2">Heading 2</SelectItem>
                        <SelectItem value="3">Heading 3</SelectItem>
                        <SelectItem value="4">Heading 4</SelectItem>
                        <SelectItem value="5">Heading 5</SelectItem>
                        <SelectItem value="6">Heading 6</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <Separator />

            {/* Line Spacing */}
            <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                    Line Spacing
                </Label>
                <Select
                    value={editor.getAttributes('paragraph').lineHeight || '1.0'}
                    onValueChange={(value) => editor.chain().focus().setLineHeight(value).run()}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Line Spacing" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1.0">Single (1.0)</SelectItem>
                        <SelectItem value="1.15">1.15</SelectItem>
                        <SelectItem value="1.5">1.5</SelectItem>
                        <SelectItem value="2.0">Double (2.0)</SelectItem>
                        <SelectItem value="2.5">2.5</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div >
    );
};

export default ParagraphPanel;
