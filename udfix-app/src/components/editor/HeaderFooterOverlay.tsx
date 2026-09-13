import React from 'react';
import { Editor } from '@tiptap/react';

/**
 * Placeholder — header/footer çift tıklama `UdfixEditor` içinde `editor.view.dom` üzerinden işleniyor.
 * Eski sürümde tam yüzey overlay’i tekerlek olaylarını kesiyordu; artık portal yok.
 */

interface HeaderFooterOverlayProps {
    editor: Editor | null;
}

const HeaderFooterOverlay: React.FC<HeaderFooterOverlayProps> = ({ editor }) => {
    void editor;
    return null;
};

export default HeaderFooterOverlay;
