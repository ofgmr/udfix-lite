import { app, BrowserWindow, dialog, type MessageBoxOptions } from 'electron';
import { loadAppPreferences, patchAppPreferences } from './appPreferences';
import {
    isUdfixDefaultUdfHandler,
    registerUdfixWithLaunchServices,
    trySetUdfixAsDefaultUdfHandler,
} from './macLaunchServices';
import { UDFIX_APP_NAME } from './appBranding';

async function showMessageBox(
    parent: BrowserWindow | null | undefined,
    options: MessageBoxOptions,
): Promise<Electron.MessageBoxReturnValue> {
    if (parent && !parent.isDestroyed()) {
        return dialog.showMessageBox(parent, options);
    }
    return dialog.showMessageBox(options);
}

async function showManualDefaultFallback(parent: BrowserWindow | null | undefined): Promise<void> {
    await showMessageBox(parent, {
        type: 'info',
        title: UDFIX_APP_NAME,
        message: 'Varsayılan uygulama değiştirilemedi',
        detail:
            'Bir .udf dosyasına sağ tıklayın → Bilgi Al → Aç Birlikte bölümünden UDFIX\'i seçin → Tümünü Değiştir.',
        buttons: ['Tamam'],
    });
}

export async function promptSetUdfDefaultHandler(options?: {
    parentWindow?: BrowserWindow | null;
    respectDismissed?: boolean;
}): Promise<void> {
    if (process.platform !== 'darwin' || !app.isPackaged) return;

    const prefs = loadAppPreferences();
    if (options?.respectDismissed !== false && prefs.udfDefaultHandlerPromptDismissed) return;

    await registerUdfixWithLaunchServices();

    if (await isUdfixDefaultUdfHandler()) {
        patchAppPreferences({ udfDefaultHandlerEnabled: true });
        return;
    }

    const parent = options?.parentWindow ?? BrowserWindow.getFocusedWindow();
    const { response, checkboxChecked } = await showMessageBox(parent, {
        type: 'info',
        title: `${UDFIX_APP_NAME} — UDF dosyaları`,
        message: 'UDFIX\'i .udf dosyaları için varsayılan uygulama yapılsın mı?',
        detail: 'Çift tıklayınca belgeler doğrudan UDFIX\'te açılır.',
        buttons: ['Varsayılan yap', 'Daha sonra'],
        defaultId: 0,
        cancelId: 1,
        checkboxLabel: 'Bir daha gösterme',
        checkboxChecked: false,
    });

    if (checkboxChecked) {
        patchAppPreferences({ udfDefaultHandlerPromptDismissed: true });
    }

    if (response !== 0) return;

    const result = await trySetUdfixAsDefaultUdfHandler();
    if (result === 'fail') {
        await showManualDefaultFallback(parent);
        return;
    }

    patchAppPreferences({ udfDefaultHandlerEnabled: true });
}

export async function toggleUdfDefaultHandlerFromTray(): Promise<void> {
    if (process.platform !== 'darwin' || !app.isPackaged) return;

    const prefs = loadAppPreferences();
    if (prefs.udfDefaultHandlerEnabled) {
        patchAppPreferences({ udfDefaultHandlerEnabled: false });
        return;
    }

    await promptSetUdfDefaultHandler({ respectDismissed: false });
    const enabled = await isUdfixDefaultUdfHandler();
    patchAppPreferences({ udfDefaultHandlerEnabled: enabled });
}

export async function syncUdfDefaultHandlerPreference(): Promise<void> {
    if (process.platform !== 'darwin' || !app.isPackaged) return;
    const enabled = await isUdfixDefaultUdfHandler();
    const prefs = loadAppPreferences();
    if (prefs.udfDefaultHandlerEnabled !== enabled) {
        patchAppPreferences({ udfDefaultHandlerEnabled: enabled });
    }
}

export async function maybeShowFirstLaunchUdfPrompt(
    parentWindow: BrowserWindow | null,
): Promise<void> {
    if (process.platform !== 'darwin' || !app.isPackaged) return;
    await registerUdfixWithLaunchServices();
    await syncUdfDefaultHandlerPreference();
    const prefs = loadAppPreferences();
    if (prefs.udfDefaultHandlerPromptDismissed || prefs.udfDefaultHandlerEnabled) return;
    await promptSetUdfDefaultHandler({ parentWindow, respectDismissed: true });
}
