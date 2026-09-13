import { app } from 'electron';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const UDFIX_QL_PREVIEW_ID = 'com.ofg.udfix.QuickLookPreview';
export const UDFIX_QL_THUMB_ID = 'com.ofg.udfix.QuickLookThumbnail';

function packagedPluginPaths(): { preview: string; thumb: string } | null {
    if (!app.isPackaged) return null;
    const pluginsDir = path.join(path.dirname(process.resourcesPath), 'PlugIns');
    const preview = path.join(pluginsDir, 'QuickLookPreview.appex');
    const thumb = path.join(pluginsDir, 'QuickLookThumbnail.appex');
    if (!fs.existsSync(preview) || !fs.existsSync(thumb)) return null;
    return { preview, thumb };
}

async function pluginkit(args: string[]): Promise<void> {
    await execFileAsync('/usr/bin/pluginkit', args, {
        timeout: 20_000,
        maxBuffer: 256 * 1024,
    });
}

/** Best-effort: attach and enable Finder QuickLook plugins shipped in PlugIns. */
export async function registerUdfQuickLookPlugins(): Promise<void> {
    if (process.platform !== 'darwin' || !app.isPackaged) return;
    const plugins = packagedPluginPaths();
    if (!plugins) return;
    try {
        await pluginkit(['-a', plugins.preview]);
        await pluginkit(['-a', plugins.thumb]);
        await pluginkit(['-e', 'use', '-i', UDFIX_QL_PREVIEW_ID]);
        await pluginkit(['-e', 'use', '-i', UDFIX_QL_THUMB_ID]);
    } catch {
        /* Launch Services / PluginKit can refuse on unsigned or disabled builds */
    }
}
