import React, { useState } from 'react';
import { Editor } from '@tiptap/react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { saveAs } from 'file-saver';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { buildDocxFromEditor } from '../../utils/docxNativeExport';
import { flushSyncHfToEditor } from '../../utils/headerFooterSyncScheduler';
import { toast } from 'sonner';

interface ExportDialogProps {
    isOpen: boolean;
    onClose: () => void;
    editor: Editor | null;
}

export const DocxExportDialog: React.FC<ExportDialogProps> = ({ isOpen, onClose, editor }) => {
    const [filename, setFilename] = useState('document');
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        if (!editor) return;
        setIsExporting(true);

        try {
            const { activeDocument, documents } = useLayoutStore.getState();
            const docTitle = documents.find((d) => d.id === activeDocument)?.title ?? 'Belge';
            await flushSyncHfToEditor();
            const { buffer } = await buildDocxFromEditor(editor, {
                docTitle,
                documentId: activeDocument,
            });

            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            });

            saveAs(blob, `${filename}.docx`);
            onClose();
        } catch (error) {
            console.error('Export failed:', error);
            toast.error('Dışa aktarma başarısız', {
                description: 'Lütfen tekrar deneyin.',
            });
        } finally {
            setIsExporting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="glass-panel w-96 rounded-xl p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                        <MaterialIcon icon="description" className="text-blue-600" size={24} />
                    </div>
                    <h2 className="text-xl font-bold">Export as Word</h2>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="filename">File Name</Label>
                        <Input
                            id="filename"
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            placeholder="My Document"
                            autoFocus
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={onClose} disabled={isExporting}>Cancel</Button>
                        <Button onClick={handleExport} disabled={isExporting}>
                            {isExporting ? 'Kaydediyor...' : 'DOCX Olarak Kaydet'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
