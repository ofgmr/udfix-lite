import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../ui/alert-dialog';
import MaterialIcon from '../ui/MaterialIcon';
import type { AppUpdateSnapshot } from '../../types/appUpdate';

const CHECK_TOAST_ID = 'udfix-update-check';
const PROGRESS_TOAST_ID = 'udfix-update-progress';
const DISMISS_STORAGE_KEY = 'udfix-update-dismissed-version';

function isUpdateSnapshot(value: unknown): value is AppUpdateSnapshot {
    return (
        typeof value === 'object' &&
        value !== null &&
        'phase' in value &&
        typeof (value as AppUpdateSnapshot).phase === 'string'
    );
}

function formatReleaseNotes(notes?: string): string | undefined {
    if (!notes?.trim()) return undefined;
    return notes.trim();
}

async function invokeUpdate(channel: string, ...args: unknown[]): Promise<unknown> {
    if (!window.electron?.invoke) return undefined;
    return window.electron.invoke(channel, ...args);
}

export function AppUpdateNotifier() {
    const [availableSnapshot, setAvailableSnapshot] = useState<AppUpdateSnapshot | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const lastPhaseRef = useRef<AppUpdateSnapshot['phase']>('idle');

    const dismissAvailableVersion = useCallback((version?: string) => {
        if (version) {
            sessionStorage.setItem(DISMISS_STORAGE_KEY, version);
        }
        setDialogOpen(false);
        setAvailableSnapshot(null);
    }, []);

    const startDownload = useCallback(async () => {
        setDialogOpen(false);
        toast.loading('Güncelleme indiriliyor…', { id: PROGRESS_TOAST_ID });
        await invokeUpdate('app-update-download');
    }, []);

    const restartToInstall = useCallback(async () => {
        toast.dismiss(PROGRESS_TOAST_ID);
        await invokeUpdate('app-update-install');
    }, []);

    const handleSnapshot = useCallback(
        (next: AppUpdateSnapshot) => {
            if (next.phase === 'disabled') return;

            const previousPhase = lastPhaseRef.current;
            lastPhaseRef.current = next.phase;

            switch (next.phase) {
                case 'checking':
                    toast.loading('Güncellemeler denetleniyor…', { id: CHECK_TOAST_ID });
                    break;

                case 'available': {
                    toast.dismiss(CHECK_TOAST_ID);
                    const dismissed = sessionStorage.getItem(DISMISS_STORAGE_KEY);
                    if (dismissed === next.availableVersion) break;

                    setAvailableSnapshot(next);
                    setDialogOpen(true);
                    toast.info(`UDFIX ${next.availableVersion ?? ''} mevcut`, {
                        description: 'Yeni sürüm indirilebilir.',
                        duration: 10_000,
                        action: {
                            label: 'Görüntüle',
                            onClick: () => {
                                setAvailableSnapshot(next);
                                setDialogOpen(true);
                            },
                        },
                    });
                    break;
                }

                case 'not-available':
                    toast.dismiss(CHECK_TOAST_ID);
                    if (next.triggeredByUser) {
                        toast.success('UDFIX güncel', {
                            description: `Sürüm ${next.currentVersion}`,
                        });
                    }
                    break;

                case 'downloading': {
                    toast.dismiss(CHECK_TOAST_ID);
                    const percent =
                        typeof next.downloadPercent === 'number'
                            ? Math.round(next.downloadPercent)
                            : undefined;
                    toast.loading(
                        percent !== undefined
                            ? `Güncelleme indiriliyor… %${percent}`
                            : 'Güncelleme indiriliyor…',
                        { id: PROGRESS_TOAST_ID },
                    );
                    break;
                }

                case 'downloaded':
                    toast.dismiss(PROGRESS_TOAST_ID);
                    toast.success(`UDFIX ${next.availableVersion ?? ''} indirildi`, {
                        description: 'Kurulum için uygulamayı yeniden başlatın.',
                        duration: Infinity,
                        action: {
                            label: 'Yeniden başlat',
                            onClick: () => void restartToInstall(),
                        },
                    });
                    break;

                case 'error':
                    toast.dismiss(CHECK_TOAST_ID);
                    toast.dismiss(PROGRESS_TOAST_ID);
                    if (next.triggeredByUser || previousPhase === 'checking') {
                        toast.error('Güncelleme denetlenemedi', {
                            description: next.errorMessage ?? 'Bilinmeyen hata',
                        });
                    }
                    break;

                default:
                    break;
            }
        },
        [restartToInstall],
    );

    useEffect(() => {
        if (!window.electron?.invoke) return;

        void invokeUpdate('app-update-get-state').then((raw) => {
            if (isUpdateSnapshot(raw) && raw.phase !== 'disabled') {
                lastPhaseRef.current = raw.phase;
                if (raw.phase === 'available') {
                    const dismissed = sessionStorage.getItem(DISMISS_STORAGE_KEY);
                    if (dismissed !== raw.availableVersion) {
                        setAvailableSnapshot(raw);
                        setDialogOpen(true);
                    }
                } else if (raw.phase === 'downloaded') {
                    handleSnapshot(raw);
                }
            }
        });

        const onEvent = (...args: unknown[]) => {
            const payload = args[0];
            if (isUpdateSnapshot(payload)) {
                handleSnapshot(payload);
            }
        };

        window.electron.on?.('app-update-event', onEvent);
        return () => window.electron?.off?.('app-update-event', onEvent);
    }, [handleSnapshot]);

    const releaseNotes = formatReleaseNotes(availableSnapshot?.releaseNotes);
    const versionLabel = availableSnapshot?.availableVersion ?? '';

    return (
        <AlertDialog
            open={dialogOpen}
            onOpenChange={(open) => {
                if (!open) {
                    dismissAvailableVersion(availableSnapshot?.availableVersion);
                } else {
                    setDialogOpen(true);
                }
            }}
        >
            <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                            <MaterialIcon icon="system_update" size={22} />
                        </span>
                        <div className="space-y-1 text-left">
                            <AlertDialogTitle>Yeni sürüm mevcut</AlertDialogTitle>
                            <AlertDialogDescription>
                                UDFIX {versionLabel} yayınlandı
                                {availableSnapshot?.currentVersion
                                    ? ` (kurulu: ${availableSnapshot.currentVersion})`
                                    : ''}
                                .
                            </AlertDialogDescription>
                        </div>
                    </div>
                </AlertDialogHeader>

                {releaseNotes ? (
                    <div className="max-h-40 overflow-y-auto rounded-md border border-white/10 bg-black/10 px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap">
                        {releaseNotes}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Güvenlik düzeltmeleri ve iyileştirmeler içerebilir.
                    </p>
                )}

                <AlertDialogFooter>
                    <AlertDialogCancel
                        onClick={() => dismissAvailableVersion(availableSnapshot?.availableVersion)}
                    >
                        Daha sonra
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={() => void startDownload()}>
                        Güncelle
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
