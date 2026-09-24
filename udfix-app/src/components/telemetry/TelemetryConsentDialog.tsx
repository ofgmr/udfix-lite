import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
    APP_PREFERENCES_CHANGED_EVENT,
    type AppPreferences,
    type TelemetryConsent,
} from '../../preferences/appPreferencesTypes';
import {
    getCachedAppPreferences,
    patchAppPreferencesOnMain,
} from '../../preferences/appPreferencesClient';

const COLLECTED = [
    'Dava, taraf, not ve belge adetleri',
    'UYAP evrak kartı sayısı',
    'Yerel veritabanının boyutu',
    'Sürüm, işletim sistemi ve dil',
] as const;

const NEVER = [
    'Müvekkil, dava veya belge adları',
    'Dosya ve klasör isimleri',
    'Klavye girişi, arama veya pano',
    'E-posta, TCKN veya belge içeriği',
] as const;

function consentFromPrefs(prefs: AppPreferences | null | undefined): TelemetryConsent | null {
    if (!prefs) return null;
    return prefs.telemetryConsent;
}

export function TelemetryConsentDialog() {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const choosingRef = useRef(false);

    const syncOpen = useCallback((prefs?: AppPreferences) => {
        if (choosingRef.current) return;
        const consent = consentFromPrefs(prefs ?? getCachedAppPreferences());
        setOpen(consent === 'unknown');
    }, []);

    useEffect(() => {
        syncOpen();
        const onPrefs = (event: Event) => {
            const detail = (event as CustomEvent<AppPreferences>).detail;
            syncOpen(detail);
        };
        window.addEventListener(APP_PREFERENCES_CHANGED_EVENT, onPrefs);
        return () => window.removeEventListener(APP_PREFERENCES_CHANGED_EVENT, onPrefs);
    }, [syncOpen]);

    const choose = useCallback(async (consent: Exclude<TelemetryConsent, 'unknown'>) => {
        if (choosingRef.current) return;
        choosingRef.current = true;
        setBusy(true);
        try {
            await patchAppPreferencesOnMain({ telemetryConsent: consent });
            setOpen(false);
        } catch {
            choosingRef.current = false;
        } finally {
            setBusy(false);
        }
    }, []);

    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                if (next) {
                    setOpen(true);
                    return;
                }
                if (getCachedAppPreferences()?.telemetryConsent === 'unknown') {
                    void choose('opted_out');
                    return;
                }
                setOpen(false);
            }}
        >
            <AlertDialogContent variant="glass" className="max-w-lg border-border">
                <AlertDialogHeader>
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                            <MaterialIcon icon="query_stats" size={22} />
                        </span>
                        <div className="space-y-1.5 text-left">
                            <AlertDialogTitle className="text-base font-semibold">
                                Büronuzun ölçeğini anlamamıza yardım eder misiniz?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                Haftada bir kez yalnızca sayılar. İçerik yok, isim yok, tuş vuruşu yok.
                                Böylece UDFIX'i gerçek arşiv büyüklüğüne göre hızlandırırız — dosyalarınıza bakmadan.
                                Reklam veya profilleme yok; paylaşım tamamen isteğe bağlıdır.
                            </AlertDialogDescription>
                        </div>
                    </div>
                </AlertDialogHeader>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md border border-border/70 bg-card/40 p-3">
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
                            <MaterialIcon icon="check_circle" size={16} className="text-primary" />
                            Paylaşılan
                        </p>
                        <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                            {COLLECTED.map((line) => (
                                <li key={line}>{line}</li>
                            ))}
                        </ul>
                    </div>
                    <div className="rounded-md border border-border/70 bg-card/40 p-3">
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
                            <MaterialIcon icon="block" size={16} className="text-destructive" />
                            Asla alınmaz
                        </p>
                        <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                            {NEVER.map((line) => (
                                <li key={line}>{line}</li>
                            ))}
                        </ul>
                    </div>
                </div>

                <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Anonim bir kurulum kimliği yeter. Kararı daha sonra
                    <span className="text-foreground/80"> UDFIX → Tercihler → Anonim kullanım verileri </span>
                    menüsünden değiştirebilirsiniz.
                </p>

                <AlertDialogFooter>
                    <Button
                        type="button"
                        variant="ghost"
                        className="h-9"
                        disabled={busy}
                        onClick={() => void choose('opted_out')}
                    >
                        Şimdi değil
                    </Button>
                    <Button
                        type="button"
                        className="h-9"
                        disabled={busy}
                        onClick={() => void choose('opted_in')}
                    >
                        Anonim sayıları paylaş
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
