import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { DataService, type EditorDocumentRecoveryItem } from '../../services/dataService';
import { useLayoutStore } from '../../stores/useLayoutStore';
import CommandResultCard from '../layout/CommandResultCard';
import MaterialIcon from '../ui/MaterialIcon';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { toast } from '../../lib/glass-utils';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
});

function formatDate(value: string | null | undefined): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return dateFormatter.format(date);
}

function statusLabel(item: EditorDocumentRecoveryItem): string {
    if (item.has_draft) return 'Kaydedilmeden kapanmış';
    if (item.kind === 'udf' && item.file_exists === false) return 'Dosya taşınmış olabilir';
    if (item.is_orphan) return 'Registry dışı kayıt';
    return 'Son belge';
}

function statusTone(item: EditorDocumentRecoveryItem): string {
    if (item.has_draft) return 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300';
    if (item.kind === 'udf' && item.file_exists === false) {
        return 'bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-300';
    }
    if (item.is_orphan) return 'bg-primary/10 text-primary border-primary/30';
    return 'bg-accent text-accent-foreground border-border/70';
}

function pathSubtitle(item: EditorDocumentRecoveryItem): string {
    if (item.file_path) return item.file_path;
    return item.kind === 'udf'
        ? 'UDF dosya yolu bulunamadı; son kayıt çalışma kopyası olarak açılır.'
        : item.document_id;
}

const DocumentRecoveryCenter: React.FC<IDockviewPanelProps> = (props) => {
    const [items, setItems] = React.useState<EditorDocumentRecoveryItem[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [openingId, setOpeningId] = React.useState<string | null>(null);

    const loadItems = React.useCallback(async () => {
        setLoading(true);
        try {
            const rows = await DataService.listDocumentRecoveryItems(20);
            setItems(rows);
        } catch (error) {
            console.warn('Document recovery list failed', error);
            toast.error('Kurtarma listesi alınamadı');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        void loadItems();
    }, [loadItems]);

    const openItem = React.useCallback(async (item: EditorDocumentRecoveryItem) => {
        if (openingId) return;
        setOpeningId(item.document_id);
        try {
            const content = await DataService.getDocumentRecoveryContent(item.document_id);
            if (content?.content) {
                localStorage.setItem(`nomai-content-${item.document_id}`, content.content);
            }
            await DataService.upsertEditorDocument({
                documentId: item.document_id,
                title: item.title,
                kind: item.kind,
                filePath: item.file_path,
                touchOpened: true,
            });

            props.api.close();
            window.setTimeout(() => {
                const layout = useLayoutStore.getState();
                if (item.kind === 'udf' && item.file_path && item.file_exists !== false) {
                    layout.openUdfEditorTab({ path: item.file_path, name: item.title });
                } else {
                    layout.openEditorDocument(item.document_id, item.title);
                }
            }, 0);
        } catch (error) {
            console.warn('Document recovery open failed', error);
            toast.error('Belge açılamadı');
        } finally {
            setOpeningId(null);
        }
    }, [openingId, props.api]);

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-background/85 text-foreground shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <MaterialIcon icon="restore_page" size={18} />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold">Belge Kurtarma Merkezi</h3>
                            <p className="text-[11px] text-muted-foreground">Son 20 çalışma kopyası, taslak ve yetim versiyon</p>
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => void loadItems()}
                        title="Yenile"
                    >
                        <MaterialIcon icon="refresh" size={16} className={cn(loading && 'animate-spin')} />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => props.api.close()}
                        title="Kapat"
                    >
                        <MaterialIcon icon="close" size={16} />
                    </Button>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
                {loading ? (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        Kayıtlar taranıyor...
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center text-xs text-muted-foreground">
                        <MaterialIcon icon="inventory_2" size={28} className="opacity-70" />
                        Henüz kurtarılabilir belge kaydı yok.
                    </div>
                ) : (
                    <div className="flex flex-col gap-2.5">
                        {items.map((item) => (
                            <div key={item.document_id} className="relative">
                                <CommandResultCard
                                    type="DOCUMENT"
                                    title={item.title}
                                    subtitle={pathSubtitle(item)}
                                    accent="primary"
                                    metadata={[
                                        { label: 'Tür', value: item.kind === 'udf' ? 'UDF' : 'Editör' },
                                        { label: 'Son', value: formatDate(item.sort_at) },
                                        { label: 'Versiyon', value: String(item.version_count) },
                                    ]}
                                    actions={[
                                        {
                                            icon: openingId === item.document_id ? 'sync' : 'open_in_new',
                                            label: 'Aç',
                                            onClick: () => void openItem(item),
                                        },
                                    ]}
                                    onClick={() => void openItem(item)}
                                    className="pr-20"
                                />
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        'pointer-events-none absolute right-3 top-3 h-5 max-w-[160px] truncate px-1.5 text-[10px]',
                                        statusTone(item),
                                    )}
                                >
                                    {statusLabel(item)}
                                </Badge>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DocumentRecoveryCenter;
