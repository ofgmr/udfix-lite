import React from 'react';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import MaterialIcon from '../ui/MaterialIcon';

interface SignedUdfEditDialogProps {
    open: boolean;
    fileName: string;
    signerLabel: string | null;
    busy: boolean;
    onWorkOnCopy: () => void;
    onEditOriginal: () => void;
    onDiscard: () => void;
}

const SignedUdfEditDialog: React.FC<SignedUdfEditDialogProps> = ({
    open,
    fileName,
    signerLabel,
    busy,
    onWorkOnCopy,
    onEditOriginal,
    onDiscard,
}) => {
    return (
        <AlertDialog open={open} onOpenChange={() => undefined}>
            <AlertDialogContent variant="glass" className="glass-panel max-w-md border-white/10">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-base font-semibold">E-imzalı belge</AlertDialogTitle>
                    <AlertDialogDescription>
                        {fileName ? `${fileName} e-imzalı.` : 'Bu UDF e-imzalı.'} Kaydetmek dosyadaki imzayı
                        siler. Orijinal dosya değişmeden kopya üzerinde devam edebilirsiniz.
                    </AlertDialogDescription>
                    {signerLabel ? (
                        <p className="text-xs text-muted-foreground">İmzalayan: {signerLabel}</p>
                    ) : null}
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
                    <Button
                        type="button"
                        className="w-full justify-start gap-2"
                        disabled={busy}
                        onClick={onWorkOnCopy}
                    >
                        <MaterialIcon icon="file_copy" size={18} className="opacity-80" />
                        {busy ? 'Kopya hazırlanıyor…' : 'Kopyada devam et'}
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        className="w-full justify-start gap-2"
                        disabled={busy}
                        onClick={onEditOriginal}
                    >
                        <MaterialIcon icon="draw" size={18} className="opacity-80" />
                        İmzayı kaldır ve orijinali kaydet
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        className="w-full justify-start"
                        disabled={busy}
                        onClick={onDiscard}
                    >
                        Vazgeç
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};

export default SignedUdfEditDialog;
