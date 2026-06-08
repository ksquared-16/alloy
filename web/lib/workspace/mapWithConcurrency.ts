/**
 * Run async work over `items` with at most `limit` in flight.
 * Result order matches `items` order.
 */
export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    if (items.length === 0) return [];
    const cap = Math.max(1, Math.min(limit, items.length));
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    async function worker(): Promise<void> {
        for (;;) {
            const i = nextIndex++;
            if (i >= items.length) return;
            results[i] = await fn(items[i]!, i);
        }
    }

    await Promise.all(Array.from({ length: cap }, () => worker()));
    return results;
}
