import {
    app,
    Menu,
    type MenuItemConstructorOptions,
} from 'electron';
import {
    loadAppPreferences,
    type AppPreferences,
    type AutosaveDebounceMs,
} from './appPreferences';
import { SHORTCUT_MENU_GROUPS, rowToElectronAccelerator, type ShortcutMenuRow } from './shortcutMenuReference';
import { openOpenSourceLicensesWindow, showAboutDialog, UDFIX_APP_NAME } from './appBranding';
import { isUpdateEnabled } from './updateConfig';
import { triggerManualUpdateCheck } from './updateService';
import { isRendererDevelopmentHost } from './rendererSecurity';
import {
    applyPreferencePatch,
    broadcastToRenderers,
    buildWorkspaceRecentSubmenu,
    handleOpenWorkspacePicker,
    setWorkspaceMenusChangedHandler,
} from './workspaceMenuActions';
import { refreshMacPlatformMenus } from './macAppLifecycle';
import { promptSetUdfDefaultHandler } from './macUdfDefaultHandler';
import { MENU_CHANNEL } from './applicationMenuTypes';

export { MENU_CHANNEL };
export type { AppMenuAction } from './applicationMenuTypes';

function shortcutReferenceItems(): MenuItemConstructorOptions[] {
    return SHORTCUT_MENU_GROUPS.map((group) => ({
        label: group.label,
        submenu: group.rows.map((row) => shortcutRowItem(row)),
    }));
}

function shortcutRowItem(row: ShortcutMenuRow): MenuItemConstructorOptions {
    const accelerator = rowToElectronAccelerator(row);
    if (!accelerator) {
        return { label: row.actionTr, enabled: false };
    }
    return {
        label: row.actionTr,
        accelerator,
        enabled: false,
        registerAccelerator: false,
    };
}

function autosaveSubmenu(current: AutosaveDebounceMs): MenuItemConstructorOptions[] {
    const options: { label: string; ms: AutosaveDebounceMs }[] = [
        { label: 'Kapalı', ms: 0 },
        { label: '2 saniye', ms: 2000 },
        { label: '5 saniye', ms: 5000 },
        { label: '10 saniye', ms: 10000 },
    ];
    return options.map(({ label, ms }) => ({
        label,
        type: 'radio',
        checked: current === ms,
        click: () => {
            applyPreferencePatch({ autosaveDebounceMs: ms });
            void rebuildApplicationMenu();
        },
    }));
}

function togglePreference(
    key: 'showRuler' | 'tableBubbleEnabled' | 'floatingFormatMenuEnabled' | 'showUserGuidanceLabels' | 'menuBarTrayEnabled',
): void {
    const prefs = loadAppPreferences();
    applyPreferencePatch({ [key]: !prefs[key] });
    void rebuildApplicationMenu();
}

function toggleTelemetryConsent(): void {
    const prefs = loadAppPreferences();
    applyPreferencePatch({
        telemetryConsent: prefs.telemetryConsent === 'opted_in' ? 'opted_out' : 'opted_in',
    });
    void rebuildApplicationMenu();
}

function developerMenuItems(): MenuItemConstructorOptions[] {
    if (!isRendererDevelopmentHost()) return [];
    return [
        {
            label: 'Geliştirici',
            submenu: [
                {
                    role: 'toggleDevTools',
                    label: 'Geliştirici Araçları',
                },
                { type: 'separator' },
                { role: 'reload', label: 'Yeniden Yükle' },
                { role: 'forceReload', label: 'Önbelleksiz Yeniden Yükle' },
            ],
        },
    ];
}

function preferencesSubmenu(prefs: AppPreferences): MenuItemConstructorOptions[] {
    return [
        {
            label: 'Cetveli göster',
            type: 'checkbox',
            checked: prefs.showRuler,
            click: () => togglePreference('showRuler'),
        },
        {
            label: 'Tablo açılır menüsü',
            type: 'checkbox',
            checked: prefs.tableBubbleEnabled,
            click: () => togglePreference('tableBubbleEnabled'),
        },
        {
            label: 'Biçimlendirme açılır menüsü',
            type: 'checkbox',
            checked: prefs.floatingFormatMenuEnabled,
            click: () => togglePreference('floatingFormatMenuEnabled'),
        },
        {
            label: 'Kullanıcı rehberi (buton etiketleri)',
            type: 'checkbox',
            checked: prefs.showUserGuidanceLabels,
            click: () => togglePreference('showUserGuidanceLabels'),
        },
        ...(process.platform === 'darwin'
            ? ([
                  { type: 'separator' },
                  {
                      label: 'Menü çubuğu simgesi',
                      type: 'checkbox',
                      checked: prefs.menuBarTrayEnabled,
                      click: () => togglePreference('menuBarTrayEnabled'),
                  },
                  {
                      label: 'UDF varsayılan uygulama…',
                      enabled: app.isPackaged,
                      click: () => void promptSetUdfDefaultHandler({ respectDismissed: false }),
                  },
              ] satisfies MenuItemConstructorOptions[])
            : []),
        { type: 'separator' },
        { label: 'Otomatik kaydet', submenu: autosaveSubmenu(prefs.autosaveDebounceMs) },
        { type: 'separator' },
        {
            label: 'Anonim kullanım verileri',
            type: 'checkbox',
            checked: prefs.telemetryConsent === 'opted_in',
            click: () => toggleTelemetryConsent(),
        },
    ];
}

function buildTemplate(prefs: AppPreferences): MenuItemConstructorOptions[] {
    const isMac = process.platform === 'darwin';
    const appName = UDFIX_APP_NAME;

    const fileMenu: MenuItemConstructorOptions = {
        label: 'Dosya',
        submenu: [
            {
                label: 'Klasör Aç…',
                accelerator: undefined,
                click: () => void handleOpenWorkspacePicker(),
            },
            { type: 'separator' },
            {
                label: 'Son Klasörler',
                submenu: buildWorkspaceRecentSubmenu(),
            },
            { type: 'separator' },
            {
                label: 'Sekmeyi Kapat',
                accelerator: 'CmdOrCtrl+W',
                click: () => broadcastToRenderers({ type: 'close-active-tab' }),
            },
        ],
    };

    const shortcutsMenu: MenuItemConstructorOptions = {
        label: 'Kısayollar',
        submenu: shortcutReferenceItems(),
    };

    const editMenu: MenuItemConstructorOptions = {
        label: 'Düzenle',
        submenu: [
            { role: 'undo', label: 'Geri al' },
            { role: 'redo', label: 'Yinele' },
            { type: 'separator' },
            { role: 'cut', label: 'Kes' },
            { role: 'copy', label: 'Kopyala' },
            { role: 'paste', label: 'Yapıştır' },
            ...(isMac
                ? ([
                      { role: 'pasteAndMatchStyle', label: 'Biçimi koruyarak yapıştır' },
                      { role: 'delete', label: 'Sil' },
                  ] satisfies MenuItemConstructorOptions[])
                : []),
            { type: 'separator' },
            { role: 'selectAll', label: 'Tümünü seç' },
        ],
    };

    if (!isMac) {
        return [
            {
                label: appName,
                submenu: [
                    { label: `Hakkında ${appName}`, click: () => showAboutDialog() },
                    { label: 'Lisanslar…', click: () => openOpenSourceLicensesWindow() },
                    ...(isUpdateEnabled()
                        ? [
                              {
                                  label: 'Güncellemeleri Denetle…',
                                  click: () => triggerManualUpdateCheck(),
                              } as MenuItemConstructorOptions,
                          ]
                        : []),
                    { type: 'separator' },
                    {
                        label: 'Tercihler',
                        submenu: preferencesSubmenu(prefs),
                    },
                    { type: 'separator' },
                    { role: 'quit', label: 'Çıkış' },
                ],
            },
            editMenu,
            fileMenu,
            ...developerMenuItems(),
            shortcutsMenu,
        ];
    }

    const appMenu: MenuItemConstructorOptions = {
        label: appName,
        submenu: [
            { label: `Hakkında ${appName}`, click: () => showAboutDialog() },
            { label: 'Lisanslar…', click: () => openOpenSourceLicensesWindow() },
            ...(isUpdateEnabled()
                ? [
                      {
                          label: 'Güncellemeleri Denetle…',
                          click: () => triggerManualUpdateCheck(),
                      } as MenuItemConstructorOptions,
                  ]
                : []),
            { type: 'separator' },
            {
                label: 'Tercihler',
                submenu: preferencesSubmenu(prefs),
            },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide', label: `${appName} Gizle` },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit', label: `${appName} Kapat` },
        ],
    };

    return [appMenu, editMenu, fileMenu, ...developerMenuItems(), shortcutsMenu];
}

export function rebuildApplicationMenu(): void {
    const prefs = loadAppPreferences();
    const template = buildTemplate(prefs);
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    void refreshMacPlatformMenus();
}

export function registerApplicationMenuIpc(): void {
    app.setName(UDFIX_APP_NAME);
    setWorkspaceMenusChangedHandler(() => {
        rebuildApplicationMenu();
    });
    rebuildApplicationMenu();
}
