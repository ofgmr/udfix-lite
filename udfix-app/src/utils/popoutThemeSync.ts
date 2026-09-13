const THEME_CLASS_PREFIX = 'theme-';

function isThemeClass(className: string): boolean {
    return className === 'dark' || className.startsWith(THEME_CLASS_PREFIX);
}

function copyThemeClasses(sourceRoot: Element, targetRoot: Element): void {
    const nextThemeClasses = Array.from(sourceRoot.classList).filter(isThemeClass);
    const staleClasses = Array.from(targetRoot.classList).filter(isThemeClass);
    staleClasses.forEach((className) => targetRoot.classList.remove(className));
    nextThemeClasses.forEach((className) => targetRoot.classList.add(className));
}

function syncColorScheme(sourceRoot: Element, targetDoc: Document): void {
    const isDark = sourceRoot.classList.contains('dark');
    const scheme = isDark ? 'dark' : 'light';
    targetDoc.documentElement.style.colorScheme = scheme;
    if (targetDoc.body) {
        targetDoc.body.style.colorScheme = scheme;
    }
}

/**
 * Popout penceredeki html/body tema classlarini ana pencereden esitler.
 */
export function syncThemeToPopoutWindow(sourceWindow: Window, popoutWindow: Window): void {
    try {
        if (popoutWindow.closed) return;
    } catch {
        return;
    }

    const sourceDoc = sourceWindow.document;
    const targetDoc = popoutWindow.document;
    if (!sourceDoc?.documentElement || !targetDoc?.documentElement) return;

    copyThemeClasses(sourceDoc.documentElement, targetDoc.documentElement);
    if (sourceDoc.body && targetDoc.body) {
        copyThemeClasses(sourceDoc.body, targetDoc.body);
    }
    syncColorScheme(sourceDoc.documentElement, targetDoc);
}

const POPOUT_THEME_RETRY_MS = [0, 32, 100, 250, 500, 1000] as const;

/**
 * Dockview popout document is often reset shortly after onDidOpen — re-apply theme a few times.
 */
export function syncThemeToPopoutWindowWithRetry(
    sourceWindow: Window,
    popoutWindow: Window,
): () => void {
    const timers: number[] = [];
    const run = () => syncThemeToPopoutWindow(sourceWindow, popoutWindow);
    run();
    for (const delay of POPOUT_THEME_RETRY_MS) {
        if (delay === 0) continue;
        timers.push(sourceWindow.setTimeout(run, delay));
    }
    try {
        popoutWindow.requestAnimationFrame?.(() => {
            run();
            popoutWindow.requestAnimationFrame?.(run);
        });
    } catch {
        // noop
    }
    return () => {
        for (const id of timers) sourceWindow.clearTimeout(id);
    };
}
