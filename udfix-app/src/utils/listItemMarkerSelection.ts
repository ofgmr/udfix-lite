import type { EditorView } from '@tiptap/pm/view';
import { NodeSelection } from '@tiptap/pm/state';

function findListItemFromPoint(root: HTMLElement, clientX: number, clientY: number): HTMLLIElement | null {
    if (typeof document === 'undefined' || !document.elementsFromPoint) return null;
    const stack = document.elementsFromPoint(clientX, clientY);
    if (!stack?.length) return null;

    for (const node of stack) {
        if (!(node instanceof Element) || !root.contains(node)) continue;
        const hitLi = node.closest('li');
        if (!hitLi || !root.contains(hitLi)) continue;
        if (hitLi.closest('[data-type="taskList"]')) continue;
        const parent = hitLi.parentElement;
        if (parent && ['OL', 'UL'].includes(parent.tagName)) {
            return hitLi as HTMLLIElement;
        }
    }
    return null;
}

function cssPx(value: string | null | undefined, fallback: number): number {
    const n = Number.parseFloat(value ?? '');
    return Number.isFinite(n) ? n : fallback;
}

function firstContentBlock(li: HTMLLIElement): HTMLElement | null {
    return li.querySelector(
        ':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6',
    ) as HTMLElement | null;
}

/** True when the click is on the list marker (1., a., •), not on item text. */
export function isListMarkerClick(li: HTMLLIElement, event: MouseEvent): boolean {
    const liRect = li.getBoundingClientRect();
    const liStyle = getComputedStyle(li);
    const markerStyle = getComputedStyle(li, '::before');
    const markerWidth = cssPx(markerStyle.width, cssPx(liStyle.getPropertyValue('--list-marker-width'), 34));
    const markerGap = cssPx(markerStyle.marginRight, 8);
    const clickSlop = 2;

    const markerLeft = liRect.left - markerGap - markerWidth - clickSlop;
    const markerRight = liRect.left;
    if (event.clientX < markerLeft || event.clientX > markerRight) return false;

    const block = firstContentBlock(li);
    const lineBox = block?.getBoundingClientRect() ?? liRect;
    const blockStyle = block ? getComputedStyle(block) : liStyle;
    const fontSize = cssPx(blockStyle.fontSize, 16);
    const lineHeight = cssPx(blockStyle.lineHeight, fontSize * 1.35);
    const markerTop = lineBox.top - clickSlop;
    const markerBottom = Math.min(lineBox.bottom, lineBox.top + lineHeight + clickSlop);

    return event.clientY >= markerTop && event.clientY <= markerBottom;
}

/**
 * Liste işaretçisi bandına veya Alt+tık ile `listItem` için NodeSelection.
 * Üst araç çubuğuna tıklanınca seçimin düşmemesi için Toolbar’da `onMouseDown(e => e.preventDefault())` kullanılmalı.
 */
export function trySelectListItemNodeForMarkerEditing(view: EditorView, event: MouseEvent): boolean {
    const root = view.dom as HTMLElement;
    const li =
        findListItemFromPoint(root, event.clientX, event.clientY) ??
        (event.target instanceof Element ? (event.target.closest('li') as HTMLLIElement | null) : null);

    if (!li || !root.contains(li)) return false;
    if (li.closest('[data-type="taskList"]')) return false;
    const parent = li.parentElement;
    if (!parent || !['OL', 'UL'].includes(parent.tagName)) return false;

    if (!event.altKey && !isListMarkerClick(li, event)) return false;

    const rectLi = li.getBoundingClientRect();
    const xProbe = Math.min(Math.max(event.clientX, rectLi.left + 2), rectLi.right - 2);
    const yProbe = Math.min(Math.max(event.clientY, rectLi.top + 2), rectLi.bottom - 2);
    const coords = view.posAtCoords({ left: xProbe, top: yProbe });
    if (!coords) return false;

    const $r = view.state.doc.resolve(coords.pos);
    let d = $r.depth;
    while (d > 0 && $r.node(d).type.name !== 'listItem') d--;
    if ($r.node(d).type.name !== 'listItem') return false;

    const liPos = $r.before(d);
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, liPos)));
    return true;
}
