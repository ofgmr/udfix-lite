import React, { useEffect, useReducer, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import MaterialIcon from '../../components/ui/MaterialIcon';

interface TablePanelProps {
    editor: Editor | null;
}

const TablePanel: React.FC<TablePanelProps> = ({ editor }) => {
    const [, bump] = useReducer((n: number) => n + 1, 0);
    const panelKey = useRef('');
    useEffect(() => {
        if (!editor) return;
        const sync = () => {
            const key = [editor.can().mergeCells(), editor.can().splitCell(), editor.isActive('table')].join('\0');
            if (key === panelKey.current) return;
            panelKey.current = key;
            bump();
        };
        editor.on('selectionUpdate', sync);
        editor.on('transaction', sync);
        sync();
        return () => {
            editor.off('selectionUpdate', sync);
            editor.off('transaction', sync);
        };
    }, [editor]);

    if (!editor) return null;

    const isTableActive = editor.isActive('table');
    const canMerge = editor.can().mergeCells();
    const canSplit = editor.can().splitCell();

    if (!isTableActive) {
        return (
            <div className="p-4 text-center text-sm text-[#86868b]">
                Select a table to see controls
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Row Operations */}
            <div>
                <h4 className="text-xs font-semibold text-[#86868b] uppercase mb-2">Rows</h4>
                <div className="space-y-1">
                    <button
                        onClick={() => editor.chain().focus().addRowBefore().run()}
                        className="w-full px-3 py-2 text-sm text-left hover:bg-gray-200 rounded transition-colors flex items-center gap-2"
                    >
                        <MaterialIcon icon="arrow_upward" size={16} />
                        <span>Add Row Above</span>
                    </button>
                    <button
                        onClick={() => editor.chain().focus().addRowAfter().run()}
                        className="w-full px-3 py-2 text-sm text-left hover:bg-gray-200 rounded transition-colors flex items-center gap-2"
                    >
                        <MaterialIcon icon="arrow_downward" size={16} />
                        <span>Add Row Below</span>
                    </button>
                    <button
                        onClick={() => editor.chain().focus().deleteRow().run()}
                        className="w-full px-3 py-2 text-sm text-left hover:bg-red-100 text-red-600 rounded transition-colors flex items-center gap-2"
                    >
                        <MaterialIcon icon="delete" size={16} />
                        <span>Delete Row</span>
                    </button>
                </div>
            </div>

            {/* Column Operations */}
            <div>
                <h4 className="text-xs font-semibold text-[#86868b] uppercase mb-2">Columns</h4>
                <div className="space-y-1">
                    <button
                        onClick={() => editor.chain().focus().addColumnBefore().run()}
                        className="w-full px-3 py-2 text-sm text-left hover:bg-gray-200 rounded transition-colors flex items-center gap-2"
                    >
                        <MaterialIcon icon="arrow_upward" size={16} className="rotate-[-90deg]" />
                        <span>Add Column Left</span>
                    </button>
                    <button
                        onClick={() => editor.chain().focus().addColumnAfter().run()}
                        className="w-full px-3 py-2 text-sm text-left hover:bg-gray-200 rounded transition-colors flex items-center gap-2"
                    >
                        <MaterialIcon icon="arrow_downward" size={16} className="rotate-[-90deg]" />
                        <span>Add Column Right</span>
                    </button>
                    <button
                        onClick={() => editor.chain().focus().deleteColumn().run()}
                        className="w-full px-3 py-2 text-sm text-left hover:bg-red-100 text-red-600 rounded transition-colors flex items-center gap-2"
                    >
                        <MaterialIcon icon="delete" size={16} />
                        <span>Delete Column</span>
                    </button>
                </div>
            </div>

            {/* Cell Operations */}
            <div>
                <h4 className="text-xs font-semibold text-[#86868b] uppercase mb-2">Cells</h4>
                <div className="space-y-1">
                    <button
                        type="button"
                        disabled={!canMerge}
                        onClick={() => editor.chain().focus().mergeCells().run()}
                        className="w-full px-3 py-2 text-sm text-left hover:bg-gray-200 rounded transition-colors flex items-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
                    >
                        <MaterialIcon icon="view_column" size={16} />
                        <span>Merge Cells</span>
                    </button>
                    <button
                        type="button"
                        disabled={!canSplit}
                        onClick={() => editor.chain().focus().splitCell().run()}
                        className="w-full px-3 py-2 text-sm text-left hover:bg-gray-200 rounded transition-colors flex items-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
                    >
                        <MaterialIcon icon="table_rows" size={16} />
                        <span>Split Cell</span>
                    </button>
                </div>
            </div>

            {/* Delete Table */}
            <div className="pt-2 border-t border-gray-300">
                <button
                    onClick={() => editor.chain().focus().deleteTable().run()}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-red-100 text-red-600 rounded transition-colors flex items-center gap-2"
                >
                    <MaterialIcon icon="delete" size={16} />
                    <span>Delete Table</span>
                </button>
            </div>
        </div>
    );
};

export default TablePanel;
