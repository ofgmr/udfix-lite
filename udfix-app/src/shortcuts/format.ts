import type { ShortcutCombo } from './types';
import { isMacPlatform } from './platform';

function formatCombo(combo: ShortcutCombo, mac: boolean): string {
    const parts: string[] = [];
    if (combo.mod) parts.push(mac ? '⌘' : 'Ctrl');
    if (combo.shift) parts.push(mac ? '⇧' : 'Shift');
    if (combo.alt) parts.push(mac ? '⌥' : 'Alt');
    const key = combo.key === 'Enter' ? (mac ? '↵' : 'Enter') : combo.key.toUpperCase();
    if (mac && parts.length > 0) {
        return parts.join('') + key;
    }
    return [...parts, key].join('+');
}

export function formatShortcutKeys(combo: ShortcutCombo, winCombo?: ShortcutCombo): string {
    const macStr = formatCombo(combo, true);
    const winStr = formatCombo(winCombo ?? combo, false);
    if (isMacPlatform() || macStr === winStr) return macStr;
    return `${macStr} / ${winStr}`;
}

/** Spaced modifier glyphs for compact UI (tab chips). Shift is always ⇧ so it stays visible. */
export function shortcutGlyphs(combo: ShortcutCombo, winCombo?: ShortcutCombo): string[] {
    const mac = isMacPlatform();
    const used = !mac && winCombo ? winCombo : combo;
    const parts: string[] = [];
    if (used.mod) parts.push(mac ? '⌘' : 'Ctrl');
    if (used.shift) parts.push('⇧');
    if (used.alt) parts.push(mac ? '⌥' : 'Alt');
    parts.push(used.key === 'Enter' ? '↵' : used.key.toUpperCase());
    return parts;
}
