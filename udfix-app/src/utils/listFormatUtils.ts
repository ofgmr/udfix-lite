import type { Editor } from '@tiptap/react';
import type { EditorState } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';

/**
 * Yalnızca liste öğesi düğümü seçiliyken (NodeSelection + listItem) işaretçi
 * biçimlendirmesi yapılır. Metin seçiminde her zaman gövde metnine mark uygulanır.
 */
export function getNodeSelectedListItems(state: EditorState): { pos: number; node: PMNode }[] {
    const sel = state.selection;
    if (sel instanceof NodeSelection && sel.node.type.name === 'listItem') {
        return [{ pos: sel.from, node: sel.node }];
    }
    return [];
}

function isMarkerAttrActive(node: PMNode, format: 'bold' | 'italic' | 'underline'): boolean {
    const a = node.attrs as {
        markerWeight?: number;
        markerStyle?: string;
        markerTextDecoration?: string;
    };
    if (format === 'bold') return a.markerWeight === 700;
    if (format === 'italic') return a.markerStyle === 'italic';
    return a.markerTextDecoration === 'underline';
}

function nextMarkerAttrs(
    node: PMNode,
    format: 'bold' | 'italic' | 'underline',
    nextActive: boolean,
): Record<string, unknown> {
    const attrs = { ...node.attrs };
    if (format === 'bold') {
        attrs.markerWeight = nextActive ? 700 : 500;
    } else if (format === 'italic') {
        attrs.markerStyle = nextActive ? 'italic' : 'normal';
    } else {
        attrs.markerTextDecoration = nextActive ? 'underline' : 'none';
    }
    return attrs;
}

export function applyMarkerToggleToListItems(
    editor: Editor,
    items: { pos: number; node: PMNode }[],
    format: 'bold' | 'italic' | 'underline',
): boolean {
    if (items.length === 0) return false;
    const allActive = items.every(({ node }) => isMarkerAttrActive(node, format));
    const nextActive = !allActive;
    const tr = editor.state.tr;
    const sorted = [...items].sort((a, b) => b.pos - a.pos);
    for (const { pos, node } of sorted) {
        tr.setNodeMarkup(pos, undefined, nextMarkerAttrs(node, format, nextActive));
    }
    editor.view.dispatch(tr);
    editor.view.focus();
    return true;
}

export const isMarkerFormatSelected = (editor: Editor) => {
    return getNodeSelectedListItems(editor.state).length > 0;
};

export function getMarkerFormatActive(editor: Editor, format: 'bold' | 'italic' | 'underline') {
    const markerItems = getNodeSelectedListItems(editor.state);
    if (markerItems.length > 0) {
        return markerItems.every(({ node }) => isMarkerAttrActive(node, format));
    }
    if (format === 'underline') return editor.isActive('underline');
    return editor.isActive(format);
}

export function toggleMarkerFormatOrMark(editor: Editor, format: 'bold' | 'italic' | 'underline') {
    const markerItems = getNodeSelectedListItems(editor.state);
    if (markerItems.length > 0) {
        return applyMarkerToggleToListItems(editor, markerItems, format);
    }

    if (format === 'bold') return editor.chain().focus().toggleBold().run();
    if (format === 'italic') return editor.chain().focus().toggleItalic().run();
    return editor.chain().focus().toggleUnderline().run();
}

export function getMarkerFontFamily(editor: Editor): string | null {
    const markerItems = getNodeSelectedListItems(editor.state);
    if (markerItems.length === 0) return null;
    const first = markerItems[0]?.node.attrs.markerFontFamily;
    if (typeof first !== 'string' || !first.trim()) return null;
    const allSame = markerItems.every(({ node }) => node.attrs.markerFontFamily === first);
    return allSame ? first : null;
}

function setMarkerFontFamilyOnItems(
    editor: Editor,
    items: { pos: number; node: PMNode }[],
    stack: string,
): boolean {
    if (items.length === 0) return false;
    const tr = editor.state.tr;
    const sorted = [...items].sort((a, b) => b.pos - a.pos);
    for (const { pos } of sorted) {
        const node = tr.doc.nodeAt(pos);
        if (!node || node.type.name !== 'listItem') continue;
        tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            markerFontFamily: stack,
        });
    }
    if (!tr.docChanged) return false;
    editor.view.dispatch(tr);
    editor.view.focus();
    return true;
}

/** Collect listItem nodes that contain the current selection (caret or range). */
function getListItemsIntersectingSelection(state: EditorState): { pos: number; node: PMNode }[] {
    const markerItems = getNodeSelectedListItems(state);
    if (markerItems.length > 0) return markerItems;

    const found = new Map<number, PMNode>();
    const { from, to, $from } = state.selection;
    if (from !== to) {
        state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.type.name === 'listItem') found.set(pos, node);
        });
    }
    if (found.size === 0) {
        for (let d = $from.depth; d >= 0; d--) {
            if ($from.node(d).type.name === 'listItem') {
                found.set($from.before(d), $from.node(d));
                break;
            }
        }
    }
    return [...found.entries()].map(([pos, node]) => ({ pos, node }));
}

/**
 * Madde numarası (li::before) font family.
 * Marker NodeSelection → yalnızca işaretçi; aksi halde gövde TextStyle + parent listItem işaretçisi.
 */
export function applyFontFamilyOrMarker(editor: Editor, stack: string): boolean {
    const markerOnly = getNodeSelectedListItems(editor.state);
    if (markerOnly.length > 0) {
        return setMarkerFontFamilyOnItems(editor, markerOnly, stack);
    }

    const ok = editor.chain().focus().setFontFamily(stack).run();
    const parentItems = getListItemsIntersectingSelection(editor.state);
    if (parentItems.length > 0) {
        setMarkerFontFamilyOnItems(editor, parentItems, stack);
    }
    return ok;
}
