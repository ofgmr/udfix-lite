/** Where a shortcut is handled — used for docs and conflict notes. */
export type ShortcutScope =
    | 'global'
    | 'editor'
    | 'editor-search'
    | 'viewer'
    | 'panel'
    | 'palette'
    | 'popover'
    | 'tiptap';

export type ShortcutPlatform = 'all' | 'mac' | 'win';

/** Human-facing combo; Mod = ⌘ on macOS, Ctrl on Windows/Linux. */
export type ShortcutCombo = {
    mod?: boolean;
    shift?: boolean;
    alt?: boolean;
    key: string;
};

export type ShortcutRegistryEntry = {
    id: string;
    actionTr: string;
    scope: ShortcutScope;
    combo: ShortcutCombo;
    /** Optional different display on Windows (defaults to Mod→Ctrl). */
    winCombo?: ShortcutCombo;
    notesTr?: string;
    /** Source file(s) for maintainers */
    implementation?: string;
    platform?: ShortcutPlatform;
};
