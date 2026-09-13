import { app } from 'electron';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { loadAppPreferences } from './appPreferences';

const execFileAsync = promisify(execFile);

const UDFIX_BUNDLE_ID = 'com.ofg.udfix';

export type UdfHandlerCheckResult = {
    utis: Array<{ uti: string; bundleId: string }>;
    status: 'all' | 'partial' | 'none';
};

function launchServicesHelperPaths(): { executable: string; args: string[] } | null {
    const packagedBinary = path.join(process.resourcesPath, 'udfLaunchServices');
    if (app.isPackaged && fs.existsSync(packagedBinary)) {
        return { executable: packagedBinary, args: [] };
    }

    const devBinary = path.join(__dirname, 'swift', 'udfLaunchServices');
    if (fs.existsSync(devBinary)) {
        return { executable: devBinary, args: [] };
    }

    // Development fallback when the helper was not compiled yet.
    if (!app.isPackaged) {
        const script = path.join(__dirname, 'swift', 'udfLaunchServices.swift');
        if (fs.existsSync(script)) {
            return { executable: '/usr/bin/swift', args: [script] };
        }
    }

    return null;
}

async function runSwiftLaunchServicesCommand(command: 'check' | 'set-default' | 'register'): Promise<string> {
    const helper = launchServicesHelperPaths();
    if (!helper) {
        throw new Error('udfLaunchServices helper is missing');
    }
    const { stdout } = await execFileAsync(helper.executable, [...helper.args, command], {
        timeout: 30_000,
        maxBuffer: 256 * 1024,
    });
    return stdout.trim();
}

function parseCheckOutput(stdout: string): UdfHandlerCheckResult {
    const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
    const statusLine = lines[lines.length - 1] ?? 'none';
    const mappingLines = lines.slice(0, -1);

    const utis: Array<{ uti: string; bundleId: string }> = [];
    for (const line of mappingLines) {
        const eq = line.indexOf('=');
        if (eq <= 0) continue;
        utis.push({
            uti: line.slice(0, eq),
            bundleId: line.slice(eq + 1),
        });
    }

    const status =
        statusLine === 'all' ? 'all' : statusLine === 'partial' ? 'partial' : 'none';
    return { utis, status };
}

export async function readUdfHandlerCheck(): Promise<UdfHandlerCheckResult> {
    if (process.platform !== 'darwin') {
        return { utis: [], status: 'none' };
    }
    try {
        const stdout = await runSwiftLaunchServicesCommand('check');
        return parseCheckOutput(stdout);
    } catch {
        return { utis: [], status: 'none' };
    }
}

export async function readUdfDefaultHandlerBundleId(): Promise<string | null> {
    const check = await readUdfHandlerCheck();
    if (check.utis.length === 0) return null;
    return check.utis[0]?.bundleId ?? null;
}

export async function isUdfixDefaultUdfHandler(): Promise<boolean> {
    if (!app.isPackaged) return false;
    const check = await readUdfHandlerCheck();
    return check.status === 'all';
}

export async function trySetUdfixAsDefaultUdfHandler(): Promise<'ok' | 'partial' | 'fail'> {
    if (process.platform !== 'darwin' || !app.isPackaged) return 'fail';
    try {
        const result = await runSwiftLaunchServicesCommand('set-default');
        if (result === 'ok') return 'ok';
        if (result === 'partial') return 'partial';
        return 'fail';
    } catch {
        return 'fail';
    }
}

export async function registerUdfixWithLaunchServices(): Promise<void> {
    if (process.platform !== 'darwin' || !app.isPackaged) return;
    try {
        await runSwiftLaunchServicesCommand('register');
    } catch {
        /* best effort */
    }
}

export async function reassertUdfDefaultHandlerIfEnabled(): Promise<void> {
    if (process.platform !== 'darwin' || !app.isPackaged) return;

    const prefs = loadAppPreferences();
    if (!prefs.udfDefaultHandlerEnabled) return;

    await registerUdfixWithLaunchServices();
    const check = await readUdfHandlerCheck();
    if (check.status !== 'all') {
        await trySetUdfixAsDefaultUdfHandler();
    }
}

export { UDFIX_BUNDLE_ID };
