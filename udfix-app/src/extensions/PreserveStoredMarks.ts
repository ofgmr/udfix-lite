import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Step } from '@tiptap/pm/transform';

const preserveStoredMarksKey = new PluginKey('preserveStoredMarks');

/** `setNodeMarkup` (line height, alignment, margins) is a replace-around whose gap is the node's content. */
function isNodeMarkupStep(step: Step): boolean {
    const json = step.toJSON() as { stepType?: string; from?: number; to?: number; gapFrom?: number; gapTo?: number };
    return (
        json.stepType === 'replaceAround' &&
        typeof json.from === 'number' &&
        typeof json.to === 'number' &&
        json.gapFrom === json.from + 1 &&
        json.gapTo === json.to - 1
    );
}

/**
 * Line height, alignment, and paragraph spacing update the block via
 * `setNodeMarkup`. That step clears stored marks, so a font chosen on an
 * empty caret disappeared as soon as the toolbar touched the paragraph.
 * Restore the caret marks when the transaction only retargets block nodes.
 */
export const PreserveStoredMarks = Extension.create({
    name: 'preserveStoredMarks',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: preserveStoredMarksKey,
                appendTransaction(transactions, oldState, newState) {
                    const previous = oldState.storedMarks;
                    if (!previous?.length) return null;
                    if (!oldState.selection.empty || !newState.selection.empty) return null;
                    if (newState.storedMarks?.length) return null;

                    let sawBlockStep = false;
                    for (const tr of transactions) {
                        for (const step of tr.steps) {
                            if (!isNodeMarkupStep(step)) return null;
                            sawBlockStep = true;
                        }
                    }
                    if (!sawBlockStep) return null;
                    return newState.tr.setStoredMarks(previous);
                },
            }),
        ];
    },
});
