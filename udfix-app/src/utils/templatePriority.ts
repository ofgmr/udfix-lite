const MIN = 1;
const MAX = 5;
const DEFAULT = 3;

/** UI önceliği: 1 liste başı, 5 liste sonu. DB `sort_order DESC` ile eşleşir. */
const RANK_LABELS: Record<number, string> = {
    1: 'En üst sıra',
    2: 'Üst sıra',
    3: 'Orta sıra',
    4: 'Alt sıra',
    5: 'En alt sıra',
};

export function sortOrderToPriority(sortOrder?: number | null): number {
    if (sortOrder != null && sortOrder >= MIN && sortOrder <= MAX) {
        return MAX + MIN - sortOrder;
    }
    return DEFAULT;
}

export function priorityToSortOrder(priority: number): number {
    const ui = Math.max(MIN, Math.min(MAX, Math.round(priority)));
    return MAX + MIN - ui;
}

export function templatePriorityRankLabel(priority: number): string {
    const ui = Math.max(MIN, Math.min(MAX, Math.round(priority)));
    return RANK_LABELS[ui] ?? RANK_LABELS[DEFAULT];
}
