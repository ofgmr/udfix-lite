import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import MaterialIcon from '../ui/MaterialIcon';
import { FileSystemService } from '../../services/fileSystemService';
import {
    pdfOutputPathForUdf,
    runUdfBatchPdfExport,
    type UdfBatchPdfItem,
} from '../../utils/udfBatchPdfExport';
import {
    collectUdfPathsFromDataTransfer,
    describeUdfDropRejection,
} from '../../utils/collectUdfPathsFromDrop';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

function statusIcon(status: UdfBatchPdfItem['status']): string {
    switch (status) {
        case 'running':
            return 'progress_activity';
        case 'done':
            return 'check_circle';
        case 'error':
            return 'error';
        default:
            return 'schedule';
    }
}

function statusTone(status: UdfBatchPdfItem['status']): string {
    switch (status) {
        case 'running':
            return 'text-primary';
        case 'done':
            return 'text-emerald-600 dark:text-emerald-400';
        case 'error':
            return 'text-destructive';
        default:
            return 'text-muted-foreground';
    }
}

export const UdfBatchConverterDialog: React.FC<Props> = ({ open, onOpenChange }) => {
    const [inputPaths, setInputPaths] = React.useState<string[]>([]);
    const [outputDir, setOutputDir] = React.useState<string | null>(null);
    const [items, setItems] = React.useState<UdfBatchPdfItem[]>([]);
    const [running, setRunning] = React.useState(false);
    const [dragActive, setDragActive] = React.useState(false);
    const dragDepthRef = React.useRef(0);
    const abortRef = React.useRef<AbortController | null>(null);

    const resetSession = React.useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        setRunning(false);
    }, []);

    React.useEffect(() => {
        if (!open) {
            resetSession();
        }
    }, [open, resetSession]);

    const buildItemsFromPaths = React.useCallback(
        (paths: string[], dir: string | null) =>
            paths.map((inputPath) => ({
                inputPath,
                fileName: inputPath.split(/[/\\]/).pop() ?? inputPath,
                status: 'pending' as const,
                outputPath: dir ? pdfOutputPathForUdf(dir, inputPath) : undefined,
            })),
        [],
    );

    const mergeInputPaths = React.useCallback(
        (newPaths: string[]) => {
            if (newPaths.length === 0) return;
            const merged = [...inputPaths];
            for (const p of newPaths) {
                if (!merged.includes(p)) merged.push(p);
            }
            setInputPaths(merged);
            setItems(buildItemsFromPaths(merged, outputDir));
        },
        [inputPaths, outputDir, buildItemsFromPaths],
    );

    const handleAddFiles = async () => {
        const picked = await FileSystemService.selectUdfFiles();
        mergeInputPaths(picked);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepthRef.current = 0;
        setDragActive(false);
        if (running) return;

        const dropped = collectUdfPathsFromDataTransfer(e.dataTransfer);
        if (dropped.length === 0) {
            const message = describeUdfDropRejection(e.dataTransfer);
            if (message) toast.error(message);
            return;
        }
        mergeInputPaths(dropped);
        toast.success(`${dropped.length} UDF dosyası listeye eklendi.`);
    };

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (running) return;
        dragDepthRef.current += 1;
        setDragActive(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragActive(false);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!running) e.dataTransfer.dropEffect = 'copy';
    };

    const handlePickOutputDir = async () => {
        const dir = await FileSystemService.selectOutputDirectory();
        if (!dir) return;
        setOutputDir(dir);
        setItems((prev) =>
            prev.map((item) => ({
                ...item,
                outputPath: pdfOutputPathForUdf(dir, item.inputPath),
            })),
        );
    };

    const handleRemove = (path: string) => {
        const next = inputPaths.filter((p) => p !== path);
        setInputPaths(next);
        setItems(buildItemsFromPaths(next, outputDir));
    };

    const handleClear = () => {
        setInputPaths([]);
        setItems([]);
    };

    const handleStart = async () => {
        if (inputPaths.length === 0) {
            toast.error('En az bir UDF dosyası seçin.');
            return;
        }
        if (!outputDir) {
            toast.error('PDF çıktı klasörü seçin.');
            return;
        }

        const controller = new AbortController();
        abortRef.current = controller;
        setRunning(true);
        setItems(buildItemsFromPaths(inputPaths, outputDir));

        try {
            const result = await runUdfBatchPdfExport({
                inputPaths,
                outputDir,
                signal: controller.signal,
                onProgress: ({ item }) => {
                    setItems((prev) =>
                        prev.map((row) => (row.inputPath === item.inputPath ? { ...item } : row)),
                    );
                },
            });

            if (controller.signal.aborted) {
                toast.info('Dönüştürme iptal edildi.');
                return;
            }

            if (result.failed === 0) {
                toast.success(`${result.succeeded} dosya PDF olarak kaydedildi.`);
            } else if (result.succeeded > 0) {
                toast.warning(`${result.succeeded} başarılı, ${result.failed} hatalı.`);
            } else {
                toast.error('Hiçbir dosya dönüştürülemedi.');
            }
        } catch (err) {
            console.error('[udf-batch]', err);
            toast.error(err instanceof Error ? err.message : 'Toplu dönüştürme başarısız.');
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    };

    const handleCancel = () => {
        abortRef.current?.abort();
    };

    const handleShowOutputFolder = () => {
        if (outputDir) void FileSystemService.showItemInFolder(outputDir);
    };

    const doneCount = items.filter((i) => i.status === 'done').length;
    const errorCount = items.filter((i) => i.status === 'error').length;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="glass-panel flex max-h-[min(88vh,720px)] w-full max-w-xl flex-col gap-0 border-border/70 p-0 shadow-2xl sm:max-w-xl">
                <DialogHeader className="border-b border-border/60 px-5 py-4">
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <MaterialIcon icon="transform" size={22} className="text-primary" />
                        UDF → PDF Toplu Dönüştürücü
                    </DialogTitle>
                    <p className="text-sm font-normal text-muted-foreground">
                        Seçtiğiniz UDF dosyaları yerel olarak PDF&apos;e dönüştürülür; içerik sunucuya gönderilmez.
                    </p>
                </DialogHeader>

                <div className="flex flex-col gap-3 px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="rounded-lg"
                            disabled={running}
                            onClick={() => void handleAddFiles()}
                        >
                            <MaterialIcon icon="note_add" size={18} className="mr-1.5" />
                            UDF Ekle
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-lg"
                            disabled={running}
                            onClick={() => void handlePickOutputDir()}
                        >
                            <MaterialIcon icon="folder_open" size={18} className="mr-1.5" />
                            Çıktı Klasörü
                        </Button>
                        {inputPaths.length > 0 && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="rounded-lg text-muted-foreground"
                                disabled={running}
                                onClick={handleClear}
                            >
                                Listeyi Temizle
                            </Button>
                        )}
                    </div>

                    {outputDir ? (
                        <p className="truncate text-xs text-muted-foreground" title={outputDir}>
                            <span className="font-medium text-foreground">Çıktı:</span> {outputDir}
                        </p>
                    ) : (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                            Dönüştürmeye başlamadan çıktı klasörü seçin.
                        </p>
                    )}

                    <div
                        className={cn(
                            'relative rounded-xl border border-dashed transition-colors',
                            dragActive
                                ? 'border-primary bg-primary/10'
                                : 'border-border/70 bg-card/30',
                            running && 'pointer-events-none opacity-60',
                        )}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                    >
                        {dragActive && (
                            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-primary/5">
                                <p className="flex items-center gap-2 text-sm font-medium text-primary">
                                    <MaterialIcon icon="upload_file" size={20} />
                                    UDF dosyalarını buraya bırakın
                                </p>
                            </div>
                        )}
                        <ScrollArea className="h-[min(42vh,320px)] rounded-xl border border-border/60 bg-card/40">
                        <ul className="divide-y divide-border/50 p-1">
                            {items.length === 0 ? (
                                <li className="px-3 py-10 text-center text-sm text-muted-foreground">
                                    <MaterialIcon icon="upload_file" size={28} className="mx-auto mb-2 opacity-50" />
                                    <p>UDF dosyalarını buraya sürükleyip bırakın</p>
                                    <p className="mt-1 text-xs">veya &quot;UDF Ekle&quot; ile seçin.</p>
                                </li>
                            ) : (
                                items.map((item) => (
                                    <li
                                        key={item.inputPath}
                                        className="flex items-start gap-2 px-3 py-2.5 text-sm"
                                    >
                                        <MaterialIcon
                                            icon={statusIcon(item.status)}
                                            size={18}
                                            className={cn('mt-0.5 shrink-0', statusTone(item.status), item.status === 'running' && 'animate-spin')}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-medium text-foreground">{item.fileName}</p>
                                            {item.error ? (
                                                <p className="mt-0.5 text-xs text-destructive">{item.error}</p>
                                            ) : item.outputPath ? (
                                                <p className="mt-0.5 truncate text-xs text-muted-foreground" title={item.outputPath}>
                                                    → {item.outputPath.split(/[/\\]/).pop()}
                                                </p>
                                            ) : null}
                                        </div>
                                        {!running && item.status === 'pending' && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 shrink-0 text-muted-foreground"
                                                onClick={() => handleRemove(item.inputPath)}
                                            >
                                                <MaterialIcon icon="close" size={16} />
                                            </Button>
                                        )}
                                    </li>
                                ))
                            )}
                        </ul>
                    </ScrollArea>
                    </div>

                    {running && (
                        <p className="text-xs text-muted-foreground">
                            Dönüştürülüyor… {doneCount + errorCount}/{items.length}
                            {errorCount > 0 ? ` (${errorCount} hata)` : ''}
                        </p>
                    )}
                </div>

                <DialogFooter className="flex-row flex-wrap gap-2 border-t border-border/60 px-5 py-4">
                    {outputDir && doneCount > 0 && !running && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mr-auto rounded-lg"
                            onClick={handleShowOutputFolder}
                        >
                            <MaterialIcon icon="folder" size={18} className="mr-1.5" />
                            Klasörü Aç
                        </Button>
                    )}
                    {running ? (
                        <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={handleCancel}>
                            İptal
                        </Button>
                    ) : null}
                    <Button type="button" variant="ghost" size="sm" className="rounded-lg" onClick={() => onOpenChange(false)}>
                        Kapat
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        className="rounded-lg"
                        disabled={running || inputPaths.length === 0 || !outputDir}
                        onClick={() => void handleStart()}
                    >
                        <MaterialIcon icon="picture_as_pdf" size={18} className="mr-1.5" />
                        {running ? 'Dönüştürülüyor…' : 'PDF Oluştur'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
