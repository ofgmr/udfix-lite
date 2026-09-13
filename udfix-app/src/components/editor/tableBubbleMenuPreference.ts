const TABLE_BUBBLE_MENU_ENABLED_KEY = 'udfix-table-bubble-enabled';
const TABLE_BUBBLE_MENU_ENABLED_EVENT = 'udfix-table-bubble-enabled-change';

type TableBubbleMenuEnabledEvent = CustomEvent<{ enabled: boolean }>;

export const isTableBubbleMenuEnabled = (): boolean =>
    localStorage.getItem(TABLE_BUBBLE_MENU_ENABLED_KEY) !== 'false';

export const setTableBubbleMenuEnabled = (enabled: boolean): void => {
    localStorage.setItem(TABLE_BUBBLE_MENU_ENABLED_KEY, String(enabled));
    window.dispatchEvent(new CustomEvent(TABLE_BUBBLE_MENU_ENABLED_EVENT, { detail: { enabled } }));
};

export const subscribeToTableBubbleMenuEnabled = (handler: (enabled: boolean) => void): (() => void) => {
    const listener = (event: Event) => {
        handler((event as TableBubbleMenuEnabledEvent).detail.enabled);
    };

    window.addEventListener(TABLE_BUBBLE_MENU_ENABLED_EVENT, listener);
    return () => window.removeEventListener(TABLE_BUBBLE_MENU_ENABLED_EVENT, listener);
};
