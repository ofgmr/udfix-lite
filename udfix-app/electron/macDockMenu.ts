import { app, Menu } from 'electron';
import {
    buildWorkspaceRecentSubmenu,
    handleOpenWorkspacePicker,
} from './workspaceMenuActions';

export function rebuildMacDockMenu(): void {
    if (process.platform !== 'darwin' || !app.dock) return;

    const template = [
        {
            label: 'Klasör Aç…',
            click: () => void handleOpenWorkspacePicker(),
        },
        {
            label: 'Son Klasörler',
            submenu: buildWorkspaceRecentSubmenu(),
        },
    ];

    app.dock.setMenu(Menu.buildFromTemplate(template));
}
