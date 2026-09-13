import React, { useState, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';

interface SearchPanelProps {
    editor: Editor | null;
    onClose: () => void;
}

const SearchPanel: React.FC<SearchPanelProps> = ({ editor, onClose }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [replaceTerm, setReplaceTerm] = useState('');
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [matchCount, setMatchCount] = useState(0);
    const [matchIndex, setMatchIndex] = useState(0);

    useEffect(() => {
        if (!editor) return;

        // Cleanup: Clear search highlights when component unmounts
        return () => {
            editor.commands.clearSearch();
        };
    }, [editor]);

    const computeSearchStats = (term: string, isCaseSensitive: boolean) => {
        if (!editor || !term.trim()) {
            setMatchCount(0);
            setMatchIndex(0);
            return;
        }

        const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let escaped = escapeRegExp(term);
        if (!isCaseSensitive) {
            escaped = escaped
                .replace(/i|İ/g, '[iİ]')
                .replace(/ı|I/g, '[ıI]')
                .replace(/ğ|Ğ/g, '[ğĞ]')
                .replace(/ü|Ü/g, '[üÜ]')
                .replace(/ş|Ş/g, '[şŞ]')
                .replace(/ö|Ö/g, '[öÖ]')
                .replace(/ç|Ç/g, '[çÇ]');
        }
        const regex = new RegExp(escaped, isCaseSensitive ? 'g' : 'gi');
        
        const hits: Array<{ from: number; to: number }> = [];
        editor.state.doc.descendants((node, pos) => {
            if (!node.isText) return;
            const text = node.text || '';
            if (!text) return;
            regex.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = regex.exec(text)) !== null) {
                const from = pos + m.index;
                hits.push({ from, to: from + m[0].length });
            }
        });
        
        const selFrom = editor.state.selection.from;
        const selectedIdx = hits.findIndex((h) => selFrom >= h.from && selFrom <= h.to);
        
        setMatchCount(hits.length);
        setMatchIndex(selectedIdx >= 0 ? selectedIdx + 1 : hits.length > 0 ? 1 : 0);
    };

    const updateSearch = (term: string) => {
        setSearchTerm(term);
        if (editor) {
            editor.commands.setSearchTerm(term);
            computeSearchStats(term, caseSensitive);
        }
    };

    // Update stats when selection changes (e.g., when user clicks around or commands move selection)
    useEffect(() => {
        if (!editor || !searchTerm) return;
        const handleSelectionUpdate = () => {
            computeSearchStats(searchTerm, caseSensitive);
        };
        editor.on('selectionUpdate', handleSelectionUpdate);
        return () => {
            editor.off('selectionUpdate', handleSelectionUpdate);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- selection stats tied to search UI state
    }, [editor, searchTerm, caseSensitive]);

    const updateReplace = (term: string) => {
        setReplaceTerm(term);
    };

    const toggleCaseSensitive = () => {
        const next = !caseSensitive;
        setCaseSensitive(next);
        if (editor) {
            editor.commands.setCaseSensitive(next);
            computeSearchStats(searchTerm, next);
        }
    };

    const handleReplace = () => {
        if (!editor || !searchTerm) return;
        editor.commands.replace(replaceTerm);
        computeSearchStats(searchTerm, caseSensitive);
    };

    const handleReplaceAll = () => {
        if (!editor || !searchTerm) return;
        editor.commands.replaceAll(replaceTerm);
        computeSearchStats(searchTerm, caseSensitive);
    };

    const handleFindNext = () => {
        if (!editor || !searchTerm) return;
        editor.chain().focus().findNext().run();
        computeSearchStats(searchTerm, caseSensitive);
    };

    const handleFindPrevious = () => {
        if (!editor || !searchTerm) return;
        editor.chain().focus().findPrevious().run();
        computeSearchStats(searchTerm, caseSensitive);
    };

    if (!editor) return null;

    return (
        <TooltipProvider delayDuration={200}>
            <div className="flex gap-1.5 p-1.5 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border border-border rounded-md shadow-md animate-in slide-in-from-top-2 text-sm w-[238px]">
                
                {/* Left Column: Inputs */}
                <div className="flex flex-col gap-1.5 flex-1">
                    {/* Find Row */}
                    <div className="flex items-center flex-1 bg-muted/50 rounded px-1.5 py-0.5 border border-input focus-within:ring-1 focus-within:ring-primary/50">
                        <MaterialIcon icon="search" size={14} className="text-muted-foreground mr-1" />
                        <Input
                            value={searchTerm}
                            onChange={(e) => updateSearch(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    if (e.shiftKey) handleFindPrevious();
                                    else handleFindNext();
                                }
                            }}
                            placeholder="Bul"
                            className="h-6 flex-1 border-none bg-transparent focus-visible:ring-0 px-0 text-xs shadow-none min-w-0"
                            autoFocus
                        />
                        {searchTerm && (
                            <span className="text-[10px] text-muted-foreground tabular-nums mr-1">
                                {matchCount > 0 ? `${matchIndex}/${matchCount}` : '0/0'}
                            </span>
                        )}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className={cn("h-5 w-5 ml-1 rounded-sm", caseSensitive ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground")} 
                                    onClick={toggleCaseSensitive} 
                                >
                                    <span className="text-[10px] font-bold">Aa</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">Büyük/Küçük Harf Duyarlı</TooltipContent>
                        </Tooltip>
                    </div>

                    {/* Replace Row */}
                    <div className="flex items-center flex-1 bg-muted/50 rounded px-1.5 py-0.5 border border-input focus-within:ring-1 focus-within:ring-primary/50">
                        <MaterialIcon icon="find_replace" size={14} className="text-muted-foreground mr-1" />
                        <Input
                            value={replaceTerm}
                            onChange={(e) => updateReplace(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                e.preventDefault();
                                if (e.metaKey || e.ctrlKey) {
                                    handleReplaceAll();
                                } else {
                                    handleReplace();
                                }
                            }}
                            placeholder="Değiştir"
                            className="h-6 flex-1 border-none bg-transparent focus-visible:ring-0 px-0 text-xs shadow-none min-w-0"
                        />
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-5 w-5 ml-1 rounded-sm text-muted-foreground hover:text-foreground" 
                                    onClick={handleReplace} 
                                    disabled={!searchTerm}
                                >
                                    <MaterialIcon icon="sync_alt" size={14} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">Değiştir (Enter)</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-5 w-5 ml-0.5 rounded-sm text-muted-foreground hover:text-foreground" 
                                    onClick={handleReplaceAll} 
                                    disabled={!searchTerm}
                                >
                                    <MaterialIcon icon="published_with_changes" size={14} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">Tümünü Değiştir (⌘+Enter)</TooltipContent>
                        </Tooltip>
                    </div>
                </div>

                {/* Middle Column: Up/Down Navigation */}
                <div className="flex flex-col gap-1.5">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className={cn("h-[30px] w-6 rounded-sm border border-transparent transition-colors", searchTerm ? "bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary/30" : "bg-muted/30 hover:border-border")} 
                                onClick={handleFindPrevious} 
                                disabled={!searchTerm}
                            >
                                <MaterialIcon icon="keyboard_arrow_up" size={16} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Önceki (Shift+Enter)</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className={cn("h-[30px] w-6 rounded-sm border border-transparent transition-colors", searchTerm ? "bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary/30" : "bg-muted/30 hover:border-border")} 
                                onClick={handleFindNext} 
                                disabled={!searchTerm}
                            >
                                <MaterialIcon icon="keyboard_arrow_down" size={16} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Sonraki (Enter)</TooltipContent>
                    </Tooltip>
                </div>

                {/* Right Column: Close */}
                <div className="flex flex-col">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-[66px] w-6 rounded-sm bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive border border-transparent hover:border-destructive/30 transition-colors" 
                                onClick={onClose} 
                            >
                                <MaterialIcon icon="close" size={14} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Kapat (Esc)</TooltipContent>
                    </Tooltip>
                </div>
            </div>
        </TooltipProvider>
    );
};

export default SearchPanel;