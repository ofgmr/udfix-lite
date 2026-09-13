import { formatShortcutKeys } from './format';
import { getRegistryEntry } from './registry';

export const DATABASE_SEARCH_SHORTCUTS = [
    { panel: 'matters', registryId: 'database-search-matters' },
    { panel: 'parties', registryId: 'database-search-parties' },
    { panel: 'knowledge_base', registryId: 'database-search-knowledge' },
    { panel: 'notes', registryId: 'database-search-notes' },
    { panel: 'mevzuat', registryId: 'database-search-mevzuat' },
] as const;

export type DatabaseSearchPanelId = (typeof DATABASE_SEARCH_SHORTCUTS)[number]['panel'];

const DATABASE_SEARCH_SHORTCUT_IDS: Record<DatabaseSearchPanelId, string> =
    DATABASE_SEARCH_SHORTCUTS.reduce(
        (acc, shortcut) => {
            acc[shortcut.panel] = shortcut.registryId;
            return acc;
        },
        {} as Record<DatabaseSearchPanelId, string>,
    );

export function getDatabaseSearchShortcutLabel(panel: DatabaseSearchPanelId): string {
    const entry = getRegistryEntry(DATABASE_SEARCH_SHORTCUT_IDS[panel]);
    return entry ? formatShortcutKeys(entry.combo, entry.winCombo) : '';
}
