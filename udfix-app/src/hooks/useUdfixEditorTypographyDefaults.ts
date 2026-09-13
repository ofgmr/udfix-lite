import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { applyTypographyPayload } from '../utils/editorTypography';
import { useEditorStyleStore } from '../stores/useEditorStyleStore';

export function useUdfixEditorTypographyDefaults(editor: Editor | null): void {
    const typographyDefaultsRef = useRef(false);
    useEffect(() => {
        typographyDefaultsRef.current = false;
    }, [editor]);

    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        let cancelled = false;
        void (async () => {
            await useEditorStyleStore.getState().loadFromDb();
            if (cancelled || editor.isDestroyed || typographyDefaultsRef.current) return;
            const row = useEditorStyleStore.getState().defaults;
            if (!row?.payload) return;
            const p = row.payload;
            const hasAny = Object.values(p).some((v) => v != null && String(v).trim() !== '');
            if (!hasAny) return;
            typographyDefaultsRef.current = true;
            applyTypographyPayload(editor, p);
        })();
        return () => {
            cancelled = true;
        };
    }, [editor]);
}
