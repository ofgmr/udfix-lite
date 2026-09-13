import React, { useState, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent } from '../../components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../components/ui/collapsible';

interface ReviewPanelProps {
    editor: Editor | null;
    onShowHistory?: () => void;
}

const ReviewPanel: React.FC<ReviewPanelProps> = ({ editor }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [replaceTerm, setReplaceTerm] = useState('');
    const [isOpen, setIsOpen] = useState(true);

    useEffect(() => {
        if (!editor) return;

        // Cleanup: Clear search highlights when component unmounts
        return () => {
            editor.commands.setSearchTerm('');
        };
    }, [editor]);

    const updateSearch = (term: string) => {
        setSearchTerm(term);
        if (editor) {
            // Valid command from @tiptap/extension-search
            editor.commands.setSearchTerm(term);
        }
    };

    const updateReplace = (term: string) => {
        setReplaceTerm(term);
    };

    const handleReplace = () => {
        if (!editor || !searchTerm) return;

        // Find the first occurrence of the search term
        const { state } = editor;
        const { doc } = state;
        let found = false;

        // Simple search implementation
        doc.descendants((node, pos) => {
            if (found || !node.isText) return;

            const text = node.text || '';
            const index = text.indexOf(searchTerm);

            if (index !== -1) {
                const from = pos + index;
                const to = from + searchTerm.length;

                // Execute the replace transaction
                editor
                    .chain()
                    .focus()
                    .deleteRange({ from, to })
                    .insertContentAt(from, replaceTerm)
                    .setTextSelection(from + replaceTerm.length)
                    .run();

                found = true;
                return false;
            }
        });
    };

    const handleReplaceAll = () => {
        if (!editor || !searchTerm) return;

        const { state } = editor;
        const { doc } = state;

        // Gather all matches first to avoid index shifting issues
        const matches: { from: number; to: number }[] = [];

        doc.descendants((node, pos) => {
            if (!node.isText) return;

            const text = node.text || '';
            // Use Regex to find all instances
            const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            let match;
            while ((match = regex.exec(text)) !== null) {
                matches.push({
                    from: pos + match.index,
                    to: pos + match.index + searchTerm.length
                });
            }
        });

        // Perform replacements in reverse order to preserve positions
        if (matches.length > 0) {
            editor.chain().focus();
            for (let i = matches.length - 1; i >= 0; i--) {
                const { from, to } = matches[i];
                editor.commands.insertContentAt({ from, to }, replaceTerm);
            }
        }
    };

    if (!editor) return null;

    return (
        <div className="space-y-3 p-2">
            {/* Search & Replace */}
            <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        className="w-full justify-between h-10 px-3 font-normal"
                    >
                        <div className="flex items-center gap-2">
                            <MaterialIcon icon="search" size={16} />
                            <span>Search & Replace</span>
                        </div>
                        {isOpen ? <MaterialIcon icon="expand_less" size={16} /> : <MaterialIcon icon="expand_more" size={16} />}
                    </Button>
                </CollapsibleTrigger>

                <CollapsibleContent className="space-y-2">
                    <Card className="bg-muted/30">
                        <CardContent className="p-3 space-y-3">
                            <div className="space-y-2">
                                <div className="relative">
                                    <MaterialIcon icon="search" size={16} className="absolute left-2 top-2 text-muted-foreground" />
                                    <Input
                                        type="text"
                                        placeholder="Find..."
                                        value={searchTerm}
                                        onChange={(e) => updateSearch(e.target.value)}
                                        className="h-8 text-sm pl-8"
                                    />
                                </div>
                                <div className="relative">
                                    <MaterialIcon icon="find_replace" size={16} className="absolute left-2 top-2 text-muted-foreground" />
                                    <Input
                                        type="text"
                                        placeholder="Replace with..."
                                        value={replaceTerm}
                                        onChange={(e) => updateReplace(e.target.value)}
                                        className="h-8 text-sm pl-8"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    onClick={handleReplace}
                                    variant="secondary"
                                    size="sm"
                                    className="flex-1 h-8 text-xs"
                                    disabled={!searchTerm}
                                    title="Replace next occurrence"
                                >
                                    <MaterialIcon icon="find_replace" size={12} className="mr-1" />
                                    Replace
                                </Button>
                                <Button
                                    onClick={handleReplaceAll}
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 h-8 text-xs"
                                    disabled={!searchTerm}
                                    title="Replace all occurrences"
                                >
                                    <MaterialIcon icon="published_with_changes" size={12} className="mr-1" />
                                    All
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
};

export default ReviewPanel;
