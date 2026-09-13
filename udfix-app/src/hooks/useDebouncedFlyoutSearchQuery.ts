import { useCallback, useEffect, useRef, useState } from 'react';
import { useLayoutStore } from '../stores/useLayoutStore';

const COMMIT_MS = 80;

/**
 * Local draft for the right-rail search box. Layout store (and therefore the
 * result list) updates after COMMIT_MS, or immediately when the query is cleared.
 */
export function useDebouncedFlyoutSearchQuery(): {
    draft: string;
    setQuery: (value: string) => void;
    flush: () => void;
} {
    const storeQuery = useLayoutStore((s) => s.flyoutSearchQuery);
    const [draft, setDraft] = useState(storeQuery);
    const draftRef = useRef(draft);
    draftRef.current = draft;
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const commit = useCallback((value: string) => {
        if (useLayoutStore.getState().flyoutSearchQuery === value) return;
        useLayoutStore.getState().setFlyoutSearchQuery(value);
    }, []);

    const flush = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        commit(draftRef.current);
    }, [commit]);

    useEffect(() => {
        setDraft(storeQuery);
    }, [storeQuery]);

    const setQuery = useCallback(
        (value: string) => {
            setDraft(value);
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            if (!value.trim()) {
                commit('');
                return;
            }
            timerRef.current = setTimeout(() => {
                timerRef.current = null;
                commit(value);
            }, COMMIT_MS);
        },
        [commit],
    );

    useEffect(
        () => () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        },
        [],
    );

    return { draft, setQuery, flush };
}
