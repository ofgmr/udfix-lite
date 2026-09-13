import { useEffect } from 'react';
import { useLayoutStore } from '../stores/useLayoutStore';
import { useNotesStore } from '../stores/useNotesStore';
import { matchesCombo } from './match';
import { getRegistryEntry } from './registry';
import { emptyTipTapDocJson } from '../utils/editorEmptyPlaceholder';
import { trackShortcutUsed } from '../telemetry/trackEvent';
import {
    isBlockingFormTarget,
    isModalOpen,
    shouldDeferLayoutShortcutToEditor,
} from './target';
import { DATABASE_SEARCH_SHORTCUTS } from './databaseSearch';
import { tryCloseActiveTabShortcut } from './closeActiveTab';

/**
 * Global layout shortcuts wired from the central registry.
 * Command palette (Mod+K) stays in CommandPalette.tsx because it owns dialog open state.
 */
export function useAppKeyboardShortcuts(): void {
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (isModalOpen()) return;

            const newDoc = getRegistryEntry('new-document');
            const newNote = getRegistryEntry('new-note');
            const fileExplorer = getRegistryEntry('toggle-file-explorer');
            const viewer = getRegistryEntry('focus-or-open-viewer');
            const commentsPanel = getRegistryEntry('open-comments-panel');

            if (newDoc && matchesCombo(e, newDoc.combo)) {
                if (isBlockingFormTarget(e)) return;
                e.preventDefault();
                trackShortcutUsed('new-document');
                useLayoutStore.getState().openEditorInNewTab();
                return;
            }

            if (newNote && matchesCombo(e, newNote.combo)) {
                if (isBlockingFormTarget(e)) return;
                e.preventDefault();
                trackShortcutUsed('new-note');
                void (async () => {
                    const noteId = await useNotesStore.getState().addNote({
                        title: 'Yeni Not',
                        content_json: emptyTipTapDocJson(),
                        content_plain: '',
                        parent_type: 'GENERAL',
                        is_pinned: false,
                    });
                    if (noteId) {
                        useLayoutStore.getState().openNote(noteId, 'Yeni Not');
                    }
                })();
                return;
            }

            if (fileExplorer && matchesCombo(e, fileExplorer.combo)) {
                if (isBlockingFormTarget(e)) return;
                e.preventDefault();
                trackShortcutUsed('toggle-file-explorer');
                useLayoutStore.getState().toggleLeftExplorer();
                return;
            }

            if (viewer && matchesCombo(e, viewer.combo)) {
                if (isBlockingFormTarget(e) || shouldDeferLayoutShortcutToEditor()) return;
                e.preventDefault();
                trackShortcutUsed('focus-or-open-viewer');
                useLayoutStore.getState().focusOrOpenViewer();
                return;
            }

            if (commentsPanel && matchesCombo(e, commentsPanel.combo)) {
                if (isBlockingFormTarget(e)) return;
                e.preventDefault();
                trackShortcutUsed('open-comments-panel');
                useLayoutStore.getState().openRightPanel('comments');
                return;
            }

            if (tryCloseActiveTabShortcut(e)) return;

            for (const shortcut of DATABASE_SEARCH_SHORTCUTS) {
                const entry = getRegistryEntry(shortcut.registryId);
                if (entry && matchesCombo(e, entry.combo)) {
                    if (shouldDeferLayoutShortcutToEditor()) return;
                    e.preventDefault();
                    trackShortcutUsed(shortcut.registryId);
                    useLayoutStore.getState().openRightPanelSearch(shortcut.panel);
                    return;
                }
            }

            const calendarPanel = getRegistryEntry('database-open-calendar');
            if (calendarPanel && matchesCombo(e, calendarPanel.combo)) {
                if (shouldDeferLayoutShortcutToEditor()) return;
                e.preventDefault();
                trackShortcutUsed('database-open-calendar');
                useLayoutStore.getState().toggleRightPanel('calendar');
                return;
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);
}
