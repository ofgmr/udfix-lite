import { app, Menu, Tray, type MenuItemConstructorOptions } from 'electron';
import { appIconImage } from './appBranding';
import { loadAppPreferences, patchAppPreferences } from './appPreferences';
import {
    buildWorkspaceRecentSubmenu,
    handleOpenWorkspacePicker,
} from './workspaceMenuActions';
import { isUdfixDefaultUdfHandler, trySetUdfixAsDefaultUdfHandler } from './macLaunchServices';

let tray: Tray | null = null;

type CreateMainWindowFn = () => void;

let createMainWindow: CreateMainWindowFn | null = null;

export function initMacMenuBarTray(deps: { createMainWindow: CreateMainWindowFn }): void {
    createMainWindow = deps.createMainWindow;
}

export function disposeMacMenuBarTray(): void {
    if (tray && !tray.isDestroyed()) {
        tray.destroy();
    }
    tray = null;
}

function menuBarIcon() {
    const icon = appIconImage();
    if (!icon) return undefined;
    const sized = icon.resize({ width: 18, height: 18 });
    sized.setTemplateImage(true);
    return sized;
}

async function buildUdfDefaultToggleItem(): Promise<MenuItemConstructorOptions> {
    const prefs = loadAppPreferences();
    const isDefault = app.isPackaged ? await isUdfixDefaultUdfHandler() : false;
    const checked = prefs.udfDefaultHandlerEnabled || isDefault;

    return {
        label: 'UDF varsayılan uygulama',
        type: 'checkbox',
        checked,
        enabled: app.isPackaged,
        click: async (menuItem) => {
            if (!app.isPackaged) return;
            if (menuItem.checked) {
                const result = await trySetUdfixAsDefaultUdfHandler();
                const enabled = result === 'ok' || result === 'partial' || (await isUdfixDefaultUdfHandler());
                patchAppPreferences({ udfDefaultHandlerEnabled: enabled });
            } else {
                patchAppPreferences({ udfDefaultHandlerEnabled: false });
            }
            void rebuildMacMenuBarTray();
        },
    };
}

export async function rebuildMacMenuBarTray(): Promise<void> {
    if (process.platform !== 'darwin') return;

    const prefs = loadAppPreferences();
    if (!prefs.menuBarTrayEnabled) {
        disposeMacMenuBarTray();
        return;
    }

    const icon = menuBarIcon();
    if (!icon) return;

    if (!tray || tray.isDestroyed()) {
        tray = new Tray(icon);
        tray.setToolTip('UDFIX');
        tray.on('click', () => {
            createMainWindow?.();
        });
    } else {
        tray.setImage(icon);
    }

    const udfToggle = await buildUdfDefaultToggleItem();
    const menu = Menu.buildFromTemplate([
        {
            label: 'Yeni Pencere',
            click: () => createMainWindow?.(),
        },
        { type: 'separator' },
        {
            label: 'Klasör Aç…',
            click: () => void handleOpenWorkspacePicker(),
        },
        {
            label: 'Son Klasörler',
            submenu: buildWorkspaceRecentSubmenu(),
        },
        { type: 'separator' },
        udfToggle,
        {
            label: 'Menü çubuğu simgesini gizle',
            type: 'checkbox',
            checked: true,
            click: () => {
                patchAppPreferences({ menuBarTrayEnabled: false });
                disposeMacMenuBarTray();
            },
        },
    ]);

    tray.setContextMenu(menu);
}
