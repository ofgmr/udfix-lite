import type { JSONContent } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { generateHTML } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';

import { createNoteContentExtensions } from '../components/notes/noteEditorExtensions';
import { sanitizeExportBaseName } from './sanitizeExportBaseName';
import type { Note } from '../services/dataService';
import { trackExportAction } from '../telemetry/trackEvent';

/** Extensions aligned with NoteEditor content nodes + GFM markdown. */
export function createNoteMarkdownExtensions() {
    return createNoteContentExtensions();
}

let noteMarkdownManager: MarkdownManager | null = null;

function getNoteMarkdownManager(): MarkdownManager {
    if (!noteMarkdownManager) {
        noteMarkdownManager = new MarkdownManager({
            markedOptions: { gfm: true },
            extensions: createNoteMarkdownExtensions(),
        });
    }
    return noteMarkdownManager;
}

function parseNoteJsonInput(json: JSONContent | string | null | undefined): JSONContent | null {
    if (!json) return null;
    if (typeof json === 'string') {
        try {
            return JSON.parse(json) as JSONContent;
        } catch {
            return null;
        }
    }
    return json;
}

/** Serialize note TipTap JSON to markdown without mounting an editor. */
export function tiptapJsonToMarkdown(json: JSONContent | string | null | undefined): string {
    const content = parseNoteJsonInput(json);
    if (!content) return '';
    try {
        return getNoteMarkdownManager().serialize(content).trim();
    } catch (error) {
        console.error('Failed to serialize TipTap JSON to markdown:', error);
        return '';
    }
}

function noteExportFilename(note: Note, usedNames: Set<string>): string {
    const rawBase =
        sanitizeExportBaseName(note.title?.trim() || '') ||
        `not-${note.id.slice(0, 8)}`;
    let candidate = `${rawBase}.md`;
    if (!usedNames.has(candidate)) {
        usedNames.add(candidate);
        return candidate;
    }
    candidate = `${rawBase}-${note.id.slice(0, 8)}.md`;
    usedNames.add(candidate);
    return candidate;
}

function buildNoteMarkdownFile(note: Note): string {
    const title = note.title?.trim();
    const body = tiptapJsonToMarkdown(note.content_json);
    if (!title) return body;
    if (!body) return `# ${title}\n`;
    return `# ${title}\n\n${body}`;
}

/** Export the live editor document as a .md file. Requires the Markdown extension on the editor. */
export async function exportEditorToMarkdown(
    editor: Editor | null,
    suggestedBaseName?: string | null,
): Promise<void> {
    if (!editor) return;
    if (typeof editor.getMarkdown !== 'function') {
        throw new Error('Editor Markdown extension is not available');
    }
    const markdown = editor.getMarkdown().trim();
    const base = sanitizeExportBaseName(suggestedBaseName) || 'belge';
    saveAs(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), `${base}.md`);
    trackExportAction('markdown');
}

/** Bulk-export notes as a zip of markdown files (one note per file). */
export async function exportNotesBulkMarkdown(notes: Note[]): Promise<void> {
    if (notes.length === 0) {
        throw new Error('Dışa aktarılacak not bulunamadı');
    }

    const zip = new JSZip();
    const usedNames = new Set<string>();
    const indexLines: string[] = ['# NOMAI Not Dışa Aktarımı', ''];

    for (const note of notes) {
        const filename = noteExportFilename(note, usedNames);
        zip.file(filename, buildNoteMarkdownFile(note));
        indexLines.push(`- [${note.title?.trim() || filename}](./${filename})`);
    }

    zip.file('README.md', `${indexLines.join('\n')}\n`);

    const blob = await zip.generateAsync({ type: 'blob' });
    const stamp = new Date().toISOString().slice(0, 10);
    saveAs(blob, `nomai-notlar-${stamp}.zip`);
    trackExportAction('markdown_bulk');
}
