import React from 'react';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import MaterialIcon from '../ui/MaterialIcon';
import { toast } from '../../lib/glass-utils';
import { useShallow } from 'zustand/react/shallow';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { canOpenUdfInEditor } from '../../utils/processDockviewFileDrop';

export const UdfOpenChoiceDialog: React.FC = () => {
    const {
        udfOpenChoice,
        clearUdfOpenChoice,
        openUdfEditorTab,
        openInNewViewerTab,
    } = useLayoutStore(
        useShallow((s) => ({
            udfOpenChoice: s.udfOpenChoice,
            clearUdfOpenChoice: s.clearUdfOpenChoice,
            openUdfEditorTab: s.openUdfEditorTab,
            openInNewViewerTab: s.openInNewViewerTab,
        })),
    );

    const fileName = udfOpenChoice?.name ?? '';
    const canUseEditor = canOpenUdfInEditor(udfOpenChoice?.fsPath);

    const openInEditor = React.useCallback(() => {
        if (!udfOpenChoice) return;
        if (!canOpenUdfInEditor(udfOpenChoice.fsPath)) {
            toast.error('UDF dosya yolu okunamadı. Finder’dan doğrudan sürükleyin veya Dosya Gezgini’nden açın.');
            return;
        }
        openUdfEditorTab({ path: udfOpenChoice.fsPath, name: udfOpenChoice.name });
        clearUdfOpenChoice();
    }, [clearUdfOpenChoice, openUdfEditorTab, udfOpenChoice]);

    const openInViewer = React.useCallback(() => {
        if (!udfOpenChoice) return;
        openInNewViewerTab(
            { url: udfOpenChoice.viewerUrl, name: udfOpenChoice.name },
            udfOpenChoice.viewerOptions,
        );
        clearUdfOpenChoice();
    }, [clearUdfOpenChoice, openInNewViewerTab, udfOpenChoice]);

    return (
        <AlertDialog
            open={udfOpenChoice !== null}
            onOpenChange={(open) => {
                if (!open) clearUdfOpenChoice();
            }}
        >
            <AlertDialogContent variant="glass" className="glass-panel max-w-md border-white/10">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-base font-semibold">
                        UDF dosyasını nasıl açmak istersiniz?
                    </AlertDialogTitle>
                    <p className="text-sm text-muted-foreground break-all">{fileName}</p>
                    {!canUseEditor && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                            Dosya yolu okunamadı; yalnızca görüntüleyicide açılabilir.
                        </p>
                    )}
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
                    <Button
                        type="button"
                        className="w-full justify-start gap-2"
                        disabled={!canUseEditor}
                        onClick={openInEditor}
                    >
                        <MaterialIcon icon="edit_document" size={18} className="opacity-80" />
                        Editörde aç
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        className="w-full justify-start gap-2"
                        onClick={openInViewer}
                    >
                        <MaterialIcon icon="visibility" size={18} className="opacity-80" />
                        Görüntüleyicide aç
                    </Button>
                    <AlertDialogCancel className="mt-1 w-full">İptal</AlertDialogCancel>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
