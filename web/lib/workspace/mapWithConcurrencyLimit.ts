/**
 * Bounded-concurrency async map (Trust Closure). Runs at most `limit` workers at once, preserving
 * input order in the result. Used to cap the canonical Work View totals fan-out so a work unit with
 * many pills does not fire an unbounded burst of count requests that competes with the active queue.
 */
export async function mapWithConcurrencyLimit<T, R>(
    items: readonly T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    if (items.length === 0) return results;
    let next = 0;
    const poolSize = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
    const runners = Array.from({ length: poolSize }, async () => {
        for (;;) {
            const i = next++;
            if (i >= items.length) return;
            results[i] = await worker(items[i], i);
        }
    });
    await Promise.all(runners);
    return results;
}
