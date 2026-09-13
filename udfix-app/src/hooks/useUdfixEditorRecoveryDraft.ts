import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { Editor } from '@tiptap/react';
import { DataService } from '../services/dataService';

export function useUdfixEditorRecoveryDraft(editor: Editor | null, documentId: string): {
    recoveryDraft: string | null;
    setRecoveryDraft: Dispatch<SetStateAction<string | null>>;
} {
    const [recoveryDraft, setRecoveryDraft] = useState<string | null>(null);

    useEffect(() => {
        if (!editor || editor.isDestroyed || !documentId) return;
        let cancelled = false;
        void (async () => {
            try {
                const draft = await DataService.getDocumentDraft(documentId);
                if (cancelled || !draft?.content) return;
                const current = editor.getHTML();
                if (draft.content !== current) {
                    setRecoveryDraft(draft.content);
                }
            } catch (err) {
                console.warn('Recovery draft check failed', err);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [editor, documentId]);

    return { recoveryDraft, setRecoveryDraft };
}
