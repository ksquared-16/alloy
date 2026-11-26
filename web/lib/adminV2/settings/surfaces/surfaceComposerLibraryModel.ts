/**
 * Shared Surface Composer — library catalog utilities.
 *
 * Surface definitions contribute pickable items; the composer owns search,
 * grouping, and presentation.
 */

export type SurfaceComposerLibraryCategory<TItem> = {
    key: string;
    label: string;
    items: TItem[];
};

export function filterSurfaceComposerLibrary<TItem>(
    items: readonly TItem[],
    search: string,
    matchFn: (item: TItem, query: string) => boolean,
): TItem[] {
    const q = search.trim().toLowerCase();
    if (!q) return [...items];
    return items.filter((item) => matchFn(item, q));
}

export function groupSurfaceComposerLibrary<TItem>(
    items: readonly TItem[],
    categoryOrder: readonly string[],
    categoryLabel: (key: string) => string,
    categoryKey: (item: TItem) => string,
): SurfaceComposerLibraryCategory<TItem>[] {
    const buckets = new Map<string, TItem[]>();
    for (const item of items) {
        const key = categoryKey(item);
        const list = buckets.get(key) ?? [];
        list.push(item);
        buckets.set(key, list);
    }
    return categoryOrder
        .filter((key) => buckets.has(key))
        .map((key) => ({
            key,
            label: categoryLabel(key),
            items: buckets.get(key) ?? [],
        }));
}
