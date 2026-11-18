import type { Editor } from '@tiptap/core';

export interface TocHeading {
    level: number;
    text: string;
    pos: number;
}

/** Nodes visited while collecting headings. Cursor moves must not increment this. */
export const tocScanStats = { nodes: 0 };

export function collectTocHeadings(editor: Editor): TocHeading[] {
    const headings: TocHeading[] = [];
    editor.state.doc.descendants((node, pos) => {
        tocScanStats.nodes += 1;
        if (node.type.name === 'heading') {
            headings.push({
                level: node.attrs.level as number,
                text: node.textContent,
                pos,
            });
        }
    });
    return headings;
}

/** Refresh the outline when the document changes. Selection moves do not rescan. */
export function bindTableOfContents(editor: Editor, onChange: (items: TocHeading[]) => void): () => void {
    const update = () => {
        onChange(collectTocHeadings(editor));
    };
    update();
    editor.on('update', update);
    return () => {
        editor.off('update', update);
    };
}
