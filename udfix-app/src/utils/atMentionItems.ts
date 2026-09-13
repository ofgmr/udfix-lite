import { DataService, type SuggestRow } from '../services/dataService';

export type AtMentionSuggestItem = {
    id: string;
    label: string;
    entityType: string;
    filePath?: string;
};

const toItem = (row: SuggestRow): AtMentionSuggestItem => ({
    id: row.id,
    label: row.label,
    entityType: row.entity_type,
    filePath: row.file_path,
});

export async function fetchAtMentionItems(query: string, limit = 36): Promise<AtMentionSuggestItem[]> {
    const pack = await DataService.suggestEntitiesOnly(query.trim(), limit);
    return [
        ...pack.parties.map(toItem),
        ...pack.matters.map(toItem),
        ...pack.documents.map(toItem),
        ...pack.knowledge.map(toItem),
    ];
}

/** Debounce `@` suggestion IPC so each keystroke does not hit SQLite. */
export function createDebouncedAtMentionItems(limit = 36, waitMs = 80) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let latestQuery = '';
    let waiters: Array<{
        resolve: (rows: AtMentionSuggestItem[]) => void;
        reject: (err: unknown) => void;
    }> = [];

    const flush = () => {
        timer = null;
        const q = latestQuery;
        const batch = waiters;
        waiters = [];
        void fetchAtMentionItems(q, limit).then(
            (rows) => {
                for (const w of batch) w.resolve(rows);
            },
            (err: unknown) => {
                for (const w of batch) w.reject(err);
            },
        );
    };

    return ({ query }: { query: string }): Promise<AtMentionSuggestItem[]> => {
        latestQuery = query;
        return new Promise((resolve, reject) => {
            waiters.push({ resolve, reject });
            if (timer) clearTimeout(timer);
            timer = setTimeout(flush, waitMs);
        });
    };
}
