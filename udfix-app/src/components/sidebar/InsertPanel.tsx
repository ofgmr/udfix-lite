import React, { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
    Popover,
    PopoverContent,
} from '../../components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import TableSelector from '../editor/TableSelector';
import MaterialIcon from '../../components/ui/MaterialIcon';


interface InsertPanelProps {
    editor: Editor | null;
}

const InsertPanel: React.FC<InsertPanelProps> = ({ editor }) => {
    const [showTableSelector, setShowTableSelector] = useState(false);
    const [tableSelectorPosition, setTableSelectorPosition] = useState<{ x: number; y: number } | null>(null);
    const [showImagePopover, setShowImagePopover] = useState(false);
    const [showLinkPopover, setShowLinkPopover] = useState(false);
    const [imageUrl, setImageUrl] = useState('');
    const [linkUrl, setLinkUrl] = useState('');

    if (!editor) return null;

    const handleAddImage = () => {
        if (imageUrl) {
            editor.chain().focus().insertContent({
                type: 'image',
                attrs: { src: imageUrl },
            }).run();
            setImageUrl('');
            setShowImagePopover(false);
        }
    };

    const handleSetLink = () => {
        if (linkUrl === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
        } else {
            editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
        }
        setLinkUrl('');
        setShowLinkPopover(false);
    };

    const insertFootnote = () => {
        editor.chain().focus().insertFootnote().run();
    };

    const insertPageBreak = () => {
        editor.chain().focus().setPageBreak({ kind: 'page', forceNextPage: true }).run();
    };

    const handleTableClick = (e?: React.MouseEvent) => {
        if (!e) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        // Position slightly below and to the right/left of the button
        setTableSelectorPosition({
            x: rect.left,
            y: rect.bottom + 5
        });
        setShowTableSelector(true);
    };

    const insertItems: Array<{
        id: string;
        icon: string;
        label: string;
        action: (e?: React.MouseEvent) => void;
    }> = [
        { id: 'table', icon: 'table', label: 'Tablo', action: handleTableClick },
        { id: 'image', icon: 'image', label: 'Görsel', action: () => setShowImagePopover(true) },
        { id: 'link', icon: 'link', label: 'Bağlantı', action: () => setShowLinkPopover(true) },
        { id: 'footnote', icon: 'sticky_note_2', label: 'Dipnot', action: insertFootnote },
        { id: 'page-break', icon: 'horizontal_rule', label: 'Sayfa Sonu', action: insertPageBreak },
    ];

    return (
        <TooltipProvider delayDuration={0}>
            <div className="p-2">
                {/* Grid Layout: 3 columns */}
                <div className="grid grid-cols-3 gap-2">
                    {insertItems.map((item) => (
                        <Tooltip key={item.id}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={(e) => {
                                        if (item.id === 'table') {
                                            handleTableClick(e);
                                        } else {
                                            item.action();
                                        }
                                    }}
                                    className="flex items-center justify-center h-16 rounded-lg bg-background/50 hover:bg-background/80 border border-border/40 transition-all hover:shadow-md group"
                                >
                                    <MaterialIcon
                                        icon={item.icon}
                                        size={24}
                                        className="text-muted-foreground group-hover:text-foreground transition-colors"
                                    />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                <p>{item.label}</p>
                            </TooltipContent>
                        </Tooltip>
                    ))}
                </div>

                {/* Portal Table Selector */}
                {showTableSelector && tableSelectorPosition && (
                    <TableSelector
                        position={tableSelectorPosition}
                        onSelect={(rows, cols) => {
                            editor
                                .chain()
                                .focus()
                                .insertTable({ rows, cols, withHeaderRow: true })
                                .run();
                            setShowTableSelector(false);
                            setTableSelectorPosition(null);
                        }}
                        onClose={() => {
                            setShowTableSelector(false);
                            setTableSelectorPosition(null);
                        }}
                    />
                )}

                {/* Image URL Popover */}
                <Popover open={showImagePopover} onOpenChange={setShowImagePopover}>
                    <PopoverContent className="w-80 p-3" align="start" side="right">
                        <div className="space-y-3">
                            <h4 className="font-medium leading-none">Görsel Ekle</h4>
                            <div className="flex gap-2">
                                <Input
                                    value={imageUrl}
                                    onChange={(e) => setImageUrl(e.target.value)}
                                    placeholder="https://example.com/image.png"
                                    className="h-8"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddImage()}
                                />
                                <Button size="sm" onClick={handleAddImage} className="h-8 px-2">
                                    <MaterialIcon icon="check" size={16} />
                                </Button>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>

                {/* Link URL Popover */}
                <Popover open={showLinkPopover} onOpenChange={(open) => {
                    setShowLinkPopover(open);
                    if (open) {
                        const previousUrl = editor.getAttributes('link').href;
                        setLinkUrl(previousUrl || '');
                    }
                }}>
                    <PopoverContent className="w-80 p-3" align="start" side="right">
                        <div className="space-y-3">
                            <h4 className="font-medium leading-none">Bağlantıyı Düzenle</h4>
                            <div className="flex gap-2">
                                <Input
                                    value={linkUrl}
                                    onChange={(e) => setLinkUrl(e.target.value)}
                                    placeholder="https://example.com"
                                    className="h-8"
                                    onKeyDown={(e) => e.key === 'Enter' && handleSetLink()}
                                />
                                <Button size="sm" onClick={handleSetLink} className="h-8 px-2">
                                    <MaterialIcon icon="check" size={16} />
                                </Button>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        </TooltipProvider>
    );
};

export default InsertPanel;
