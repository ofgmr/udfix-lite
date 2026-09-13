import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import Mark from 'mark.js';

/** Viewer aramasında gezinirken vurguyu güçlendirmek için (editör: Tiptap `Search` eklentisi + `.search-result-active`) */
export const VIEWER_SEARCH_HIGHLIGHT_ACTIVE = 'viewer-search-highlight-active';

/**
 * mark.js ile DOM içinde arama yapıp eşleşen kelimeleri <mark> ile saran custom hook.
 * Docx, Excel, UDF, Text, RTF, Markdown gibi DOM-tabanlı viewer'larda kullanılır.
 * contentDeps: İçerik sonradan render oluyorsa (örn. lazy html) hook'un tekrar çalışması için eklenir.
 * activeMatchIndex: 0 tabanlı; geçerli eşleşmeye VIEWER_SEARCH_HIGHLIGHT_ACTIVE eklenir (null => yok).
 * Eşleşme sayısını döner.
 */
export function useSearchHighlight(
    containerRef: RefObject<HTMLElement | null>,
    query: string,
    contentDeps: unknown[] = [],
    activeMatchIndex: number | null = null,
): number {
    const markInstance = useRef<Mark | null>(null);
    const [matchCount, setMatchCount] = useState(0);

    useEffect(() => {
        if (!containerRef.current) return;
        markInstance.current = new Mark(containerRef.current);
        return () => {
            markInstance.current?.unmark();
            markInstance.current = null;
        };
    }, [containerRef]);

    useEffect(() => {
        if (!markInstance.current) {
            if (containerRef.current) {
                markInstance.current = new Mark(containerRef.current);
            } else {
                setMatchCount(0);
                return;
            }
        }

        const markInst = markInstance.current;
        // Timer to allow React render cycle to flush before searching
        const timer = setTimeout(() => {
            markInst.unmark({
                done: () => {
                    if (query.trim()) {
                        let count = 0;
                        markInst.mark(query, {
                            className: 'viewer-search-highlight',
                            separateWordSearch: false,
                            acrossElements: true,
                            each: (el: Element) => {
                                const i = count;
                                count++;
                                if (
                                    activeMatchIndex != null &&
                                    i === activeMatchIndex
                                ) {
                                    el.classList.add(VIEWER_SEARCH_HIGHLIGHT_ACTIVE);
                                }
                            },
                            done: () => { setMatchCount(count); },
                        });
                    } else {
                        setMatchCount(0);
                    }
                }
            });
        }, 50); // slight debounce for DOM to settle

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- contentDeps spread is intentional for viewer remounts
    }, [query, containerRef, activeMatchIndex, ...contentDeps]);

    // Aktif eşleşme işaretlendikten sonra görünür alana kaydır (UniversalViewer / panel ile uyum)
    useEffect(() => {
        if (activeMatchIndex == null || !containerRef.current) return;
        const id = requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const root = containerRef.current;
                if (!root) return;
                const el = root.querySelector<HTMLElement>(
                    `.viewer-search-highlight.${VIEWER_SEARCH_HIGHLIGHT_ACTIVE}`,
                );
                el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            });
        });
        return () => cancelAnimationFrame(id);
    }, [activeMatchIndex, matchCount, query, containerRef]);

    return matchCount;
}
