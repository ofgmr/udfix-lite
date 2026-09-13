import React, { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';

interface TableOfContentsProps {
    editor: Editor | null;
}

interface TOCItem {
    level: number;
    text: string;
    pos: number;
}

const TableOfContents: React.FC<TableOfContentsProps> = ({ editor }) => {
    const [items, setItems] = useState<TOCItem[]>([]);

    useEffect(() => {
        if (!editor) return;

        const updateTOC = () => {
            const headings: TOCItem[] = [];
            editor.state.doc.descendants((node, pos) => {
                if (node.type.name === 'heading') {
                    headings.push({
                        level: node.attrs.level,
                        text: node.textContent,
                        pos
                    });
                }
            });
            setItems(headings);
        };

        // Initial update
        updateTOC();

        // Listen for updates
        editor.on('update', updateTOC);
        editor.on('selectionUpdate', updateTOC);

        return () => {
            editor.off('update', updateTOC);
            editor.off('selectionUpdate', updateTOC);
        };
    }, [editor]);

    const handleItemClick = (pos: number) => {
        if (!editor) return;

        editor.chain().focus().setTextSelection(pos).run();

        const domNode = editor.view.nodeDOM(pos) as HTMLElement;
        if (domNode) {
            domNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    if (!editor) return null;

    if (items.length === 0) {
        return (
            <div className="p-4 text-center text-muted-foreground text-sm">
                No headings found. Add headings to see them here.
            </div>
        );
    }

    return (
        <div className="space-y-1">
            {items.map((item, index) => (
                <div
                    key={index}
                    onClick={() => handleItemClick(item.pos)}
                    className="py-1.5 px-2 rounded cursor-pointer transition-colors text-sm hover:bg-muted text-foreground"
                    style={{
                        paddingLeft: `${(item.level - 1) * 12 + 8}px`,
                        fontSize: item.level === 1 ? '14px' : '13px',
                        fontWeight: item.level === 1 ? 600 : 400
                    }}
                >
                    {item.text || <span className="text-muted-foreground italic">Empty Heading</span>}
                </div>
            ))}
        </div>
    );
};

export default TableOfContents;
