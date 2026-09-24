import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import type { Editor } from '@tiptap/react';
import { cleanupComments } from '../utils/commentUtils';
import { useDocumentCommentsStore } from '../stores/useDocumentCommentsStore';
import { useHeaderFooterStore } from '../stores/useHeaderFooterStore';
import { DataService } from '../services/dataService';
import { fastChecksum } from '../utils/fastChecksum';
import { getUdfEditorPanelIdFromDocumentId } from '../utils/dockviewNoteTab';
import { requestUdfSaveAndWait } from '../utils/udfSaveBus';
import { invalidateUdfSignatureIfPresent } from '../utils/udfSignatureState';
import {
    APP_PREFERENCES_CHANGED_EVENT,
    type AppPreferences,
} from '../preferences/appPreferencesTypes';
import { getCachedAppPreferences } from '../preferences/appPreferencesClient';
import { formatSaveErrorMessage } from '../utils/saveErrorMessage';
import { toast } from '../lib/glass-utils';

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

export function useUdfixEditorAutosave(
    editor: Editor | null,
    documentId: string,
    setEditorSaveState: (state: SaveState) => void,
): {
    dirtyRef: MutableRefObject<boolean>;
    performSave: (options?: { manual?: boolean; forceVersion?: boolean }) => Promise<void>;
} {
    const isSavingRef = useRef(false);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dirtyRef = useRef(false);
    const lastSavedChecksumRef = useRef<string>('');
    const lastSnapshotChecksumRef = useRef<string>('');
    const lastSnapshotAtRef = useRef<number>(0);
    const autosaveDebounceMsRef = useRef<number>(
        getCachedAppPreferences()?.autosaveDebounceMs ?? 2000,
    );

    useEffect(() => {
        const onPrefs = (event: Event) => {
            const prefs = (event as CustomEvent<AppPreferences>).detail;
            if (prefs && typeof prefs.autosaveDebounceMs === 'number') {
                autosaveDebounceMsRef.current = prefs.autosaveDebounceMs;
            }
        };
        window.addEventListener(APP_PREFERENCES_CHANGED_EVENT, onPrefs);
        return () => window.removeEventListener(APP_PREFERENCES_CHANGED_EVENT, onPrefs);
    }, []);

    const performSave = useCallback(
        async (options?: { manual?: boolean; forceVersion?: boolean }) => {
            if (!editor || editor.isDestroyed || !documentId || isSavingRef.current) return;
            isSavingRef.current = true;
            setEditorSaveState('saving');
            try {
                if (documentId.startsWith('udf:')) {
                    const panelId = getUdfEditorPanelIdFromDocumentId(documentId);
                    if (!panelId) {
                        throw new Error('UDF panel kimliği çözümlenemedi.');
                    }
                    if (useHeaderFooterStore.getState().currentDocumentId === documentId) {
                        await useHeaderFooterStore.getState().save();
                    }
                    const source = options?.manual ? 'manual' : options?.forceVersion ? 'flush' : 'autosave';
                    await requestUdfSaveAndWait(panelId, source);
                    dirtyRef.current = false;
                    return;
                }

                cleanupComments(editor, documentId);
                useDocumentCommentsStore.getState().reloadFromStorage();
                const html = editor.getHTML();
                const checksum = fastChecksum(html);
                const now = Date.now();
                const isChanged = checksum !== lastSavedChecksumRef.current;
                const snapshotDueByTime = now - lastSnapshotAtRef.current >= 120_000;
                const snapshotDueBySize =
                    Math.abs(html.length - (localStorage.getItem(`nomai-content-${documentId}`)?.length || 0)) >=
                    5_000;
                const shouldCreateVersion =
                    checksum !== lastSnapshotChecksumRef.current &&
                    ((isChanged && (snapshotDueByTime || snapshotDueBySize)) ||
                        options?.manual ||
                        options?.forceVersion);

                localStorage.setItem(`nomai-content-${documentId}`, html);
                await DataService.upsertEditorDocument({ documentId, touchOpened: false });
                await DataService.upsertDocumentDraft(documentId, html);

                if (shouldCreateVersion) {
                    const created = await DataService.createDocumentVersion({
                        documentId,
                        content: html,
                        source: options?.manual ? 'manual' : 'auto',
                    });
                    if (created?.created) {
                        lastSnapshotAtRef.current = now;
                        lastSnapshotChecksumRef.current = checksum;
                    }
                }
                await DataService.pruneDocumentVersions(documentId, 300);
                dirtyRef.current = false;
                lastSavedChecksumRef.current = checksum;
                setEditorSaveState('saved');
                await DataService.clearDocumentDraft(documentId);
            } catch (err: unknown) {
                const message = formatSaveErrorMessage(err);
                console.warn('Save failed', err);
                setEditorSaveState('error', message);
                if (documentId.startsWith('udf:')) {
                    toast.error('UDF kaydedilemedi', { description: message });
                }
            } finally {
                isSavingRef.current = false;
            }
        },
        [documentId, editor, setEditorSaveState],
    );

    useEffect(() => {
        if (!editor || editor.isDestroyed || !documentId) return;
        const onUpdate = () => {
            dirtyRef.current = true;
            setEditorSaveState('unsaved');
            if (editor.isFocused) {
                invalidateUdfSignatureIfPresent(documentId);
            }
            const debounceMs = autosaveDebounceMsRef.current;
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            if (debounceMs > 0) {
                saveTimeoutRef.current = setTimeout(() => {
                    void performSave();
                }, debounceMs);
            }
        };
        editor.on('update', onUpdate);

        const onBeforeUnload = () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            void performSave({ forceVersion: true });
        };
        window.addEventListener('beforeunload', onBeforeUnload);

        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            if (!documentId.startsWith('udf:') || (!editor.isDestroyed && dirtyRef.current)) {
                void performSave({ forceVersion: true });
            }
            editor.off('update', onUpdate);
            window.removeEventListener('beforeunload', onBeforeUnload);
        };
    }, [editor, documentId, performSave, setEditorSaveState]);

    useEffect(() => {
        if (!editor || editor.isDestroyed || !documentId || documentId.startsWith('udf:')) return;
        const id = setInterval(() => {
            if (!dirtyRef.current || isSavingRef.current) return;
            const html = editor.getHTML();
            void DataService.upsertDocumentDraft(documentId, html);
        }, 10_000);
        return () => clearInterval(id);
    }, [editor, documentId]);

    return { dirtyRef, performSave };
}
