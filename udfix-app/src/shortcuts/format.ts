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
