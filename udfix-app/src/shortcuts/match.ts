import type { ShortcutCombo } from './types';
import { hasModKey } from './platform';

function codeForKey(key: string): string[] {
    if (/^[a-z]$/i.test(key)) return [`Key${key.toUpperCase()}`];
    if (/^\d$/.test(key)) return [`Digit${key}`, `Numpad${key}`];
    return [];
}

function matchesKey(e: KeyboardEvent, key: string): boolean {
    const expectedKey = key.length === 1 ? key.toLowerCase() : key;
    const eventKey = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (eventKey === expectedKey) return true;

    return codeForKey(key).includes(e.code);
}

export function matchesCombo(e: KeyboardEvent, combo: ShortcutCombo): boolean {
    if (!matchesKey(e, combo.key)) return false;
    if (Boolean(combo.mod) !== hasModKey(e)) return false;
    if (Boolean(combo.shift) !== e.shiftKey) return false;
    if (Boolean(combo.alt) !== e.altKey) return false;
    return true;
}
