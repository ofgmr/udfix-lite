export type CommandPaletteTab = 'search' | 'templates' | 'tasks' | 'uyap';

export interface CommandPaletteOpenEventDetail {
    tab?: CommandPaletteTab;
}

export const COMMAND_PALETTE_OPEN_EVENT = 'nomai:command-palette-open';
export const COMMAND_PALETTE_CLOSE_EVENT = 'nomai:command-palette-close';

export function openCommandPalette(tab: CommandPaletteTab = 'search') {
    if (typeof window === 'undefined') return;

    window.dispatchEvent(
        new CustomEvent<CommandPaletteOpenEventDetail>(COMMAND_PALETTE_OPEN_EVENT, {
            detail: { tab },
        }),
    );
}

export function closeCommandPalette() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(COMMAND_PALETTE_CLOSE_EVENT));
}
