import React, { useCallback, useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import MaterialIcon from '../ui/MaterialIcon';
import { toast } from 'sonner';
import { DataService, type ClientReport } from '../../services/dataService';
import { cn } from '../../lib/utils';
import { useClientReportUiStore } from '../../stores/useClientReportUiStore';

type ClientReportDialogProps = {
    partyId: string | null;
    partyName?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

function summaryChips(report: ClientReport): string[] {
    const { summary } = report;
    return [
        `${summary.davaOpen}/${summary.davaTotal} dava`,
        `${summary.icraOpen}/${summary.icraTotal} icra`,
        `${summary.appealCount} istinaf`,
    ];
}

export const ClientReportDialog: React.FC<ClientReportDialogProps> = ({
    partyId,
    partyName,
    open,
    onOpenChange,
}) => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [report, setReport] = useState<ClientReport | null>(null);

    useEffect(() => {
        if (!open || !partyId) {
            setReport(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setReport(null);
        void DataService.getClientReport(partyId)
            .then((next) => {
                if (!cancelled) setReport(next);
            })
            .catch(() => {
                if (!cancelled) {
                    setReport(null);
                    toast.error('Rapor oluşturulamadı');
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open, partyId]);

    const handleSave = useCallback(async () => {
        if (!report) return;
        setSaving(true);
        try {
            const filePath = await DataService.showSaveCsvDialog(report.suggestedFileName);
            if (!filePath) return;
            const ok = await DataService.writeTextFile(filePath, report.csvText);
            if (!ok) {
                toast.error('CSV yazılamadı');
                return;
            }
            toast.success('CSV kaydedildi');
            onOpenChange(false);
        } catch (error) {
            console.error('Client report CSV save error:', error);
            toast.error('CSV kaydedilemedi');
        } finally {
            setSaving(false);
        }
    }, [onOpenChange, report]);

    const titleName = report?.partyName || partyName || 'Müvekkil';
    const empty = Boolean(report && report.rows.length === 0);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden grid-rows-[auto_1fr_auto]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-sm">
                        <MaterialIcon icon="download" size={18} className="text-primary" />
                        {titleName} — durum raporu
                    </DialogTitle>
                    <DialogDescription>
                        Müvekkile gönderilecek CSV. Son işlemler UYAP’a giren evraklardır.
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="text-[12px] text-muted-foreground italic animate-pulse py-6">
                        Rapor hazırlanıyor…
                    </div>
                ) : !report ? (
                    <div className="text-[12px] text-muted-foreground py-6">Rapor bulunamadı.</div>
                ) : (
                    <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
                        <div className="flex flex-wrap gap-1.5">
                            {summaryChips(report).map((chip) => (
                                <span
                                    key={chip}
                                    className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                                >
                                    {chip}
                                </span>
                            ))}
                        </div>
                        {empty ? (
                            <p className="text-[12px] text-muted-foreground py-4">
                                Bu müvekkile bağlı dosya yok.
                            </p>
                        ) : (
                            <div className="min-h-0 overflow-auto rounded-lg border border-white/10">
                                <table className="w-full text-left text-[11px]">
                                    <thead className="sticky top-0 bg-background/90 backdrop-blur">
                                        <tr className="text-muted-foreground">
                                            <th className="px-2 py-1.5 font-medium">Karşı taraf</th>
                                            <th className="px-2 py-1.5 font-medium">Dosya no</th>
                                            <th className="px-2 py-1.5 font-medium">Mahkeme</th>
                                            <th className="px-2 py-1.5 font-medium">Tür</th>
                                            <th className="px-2 py-1.5 font-medium">Durum</th>
                                            <th className="px-2 py-1.5 font-medium">Sıfat</th>
                                            <th className="px-2 py-1.5 font-medium">Son evrak</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.rows.map((row) => (
                                            <tr key={row.matterId} className="border-t border-white/5">
                                                <td className="px-2 py-1.5 max-w-[12rem] truncate">
                                                    {row.karsiTaraf || '—'}
                                                </td>
                                                <td className="px-2 py-1.5 font-medium whitespace-nowrap">
                                                    {row.fileNumber || '—'}
                                                </td>
                                                <td className="px-2 py-1.5 max-w-[12rem] truncate">
                                                    {row.courtName || '—'}
                                                </td>
                                                <td className="px-2 py-1.5 whitespace-nowrap">{row.tur || '—'}</td>
                                                <td className="px-2 py-1.5 whitespace-nowrap">{row.status || '—'}</td>
                                                <td className="px-2 py-1.5 whitespace-nowrap">{row.sifat || '—'}</td>
                                                <td className={cn('px-2 py-1.5 max-w-[14rem] truncate')}>
                                                    {row.lastEvrakTur
                                                        ? `${row.lastEvrakTur}${row.lastEvrakDate ? ` (${row.lastEvrakDate})` : ''}`
                                                        : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        disabled={saving}
                    >
                        Kapat
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => void handleSave()}
                        disabled={!report || saving}
                    >
                        <MaterialIcon icon="download" size={14} className="mr-1" />
                        CSV indir
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export const ClientReportHost: React.FC = () => {
    const { open, partyId, partyName, setOpen } = useClientReportUiStore();
    return (
        <ClientReportDialog
            partyId={partyId}
            partyName={partyName}
            open={open}
            onOpenChange={setOpen}
        />
    );
};
