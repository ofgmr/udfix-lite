const FLOATING_FORMAT_MENU_ENABLED_KEY = 'udfix-floating-format-enabled';
const FLOATING_FORMAT_MENU_ENABLED_EVENT = 'udfix-floating-format-enabled-change';

type FloatingFormatMenuEnabledEvent = CustomEvent<{ enabled: boolean }>;

export const isFloatingFormatMenuEnabled = (): boolean =>
    localStorage.getItem(FLOATING_FORMAT_MENU_ENABLED_KEY) !== 'false';

export const setFloatingFormatMenuEnabled = (enabled: boolean): void => {
    localStorage.setItem(FLOATING_FORMAT_MENU_ENABLED_KEY, String(enabled));
    window.dispatchEvent(
        new CustomEvent(FLOATING_FORMAT_MENU_ENABLED_EVENT, { detail: { enabled } }),
    );
};

export const subscribeToFloatingFormatMenuEnabled = (
    handler: (enabled: boolean) => void,
): (() => void) => {
    const listener = (event: Event) => {
        handler((event as FloatingFormatMenuEnabledEvent).detail.enabled);
    };
    window.addEventListener(FLOATING_FORMAT_MENU_ENABLED_EVENT, listener);
    return () => window.removeEventListener(FLOATING_FORMAT_MENU_ENABLED_EVENT, listener);
};
