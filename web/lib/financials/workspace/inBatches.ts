/**
 * READING BY A LIST OF IDS, WITHOUT THE LIST BECOMING THE LIMIT.
 *
 * PostgREST puts `.in(...)` filters in the query string, so a list of ids is literally part of the
 * URL. A few hundred uuids is about eleven kilobytes and the server answers `414 URI Too Long` —
 * and supabase-js reports that in `error`, which every one of these call sites was discarding. The
 * result was not an error anywhere: it was `data: null`, read as "no rows", read in turn as "none of
 * this money has been applied".
 *
 * Certification found it on an organization with 314 payments: the Financials workspace reported
 * every receipt as fully unapplied while the database held a correct allocation for each one. It
 * degrades silently with size, so it looks like a data problem rather than a request problem, and an
 * operator would chase the money rather than the page.
 *
 * So: read in batches small enough to stay inside any sane URL limit, and let a real failure be a
 * real failure instead of an empty answer.
 */

/** Ids per request. 200 uuids is roughly 7.5 KB of query string — comfortably inside 8 KB. */
const BATCH = 200;

export async function selectIn<Row>(
    ids: readonly string[],
    read: (batch: string[]) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
    what: string,
): Promise<Row[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];
    const out: Row[] = [];
    for (let i = 0; i < unique.length; i += BATCH) {
        const { data, error } = await read(unique.slice(i, i + BATCH));
        /*
         * Thrown, not swallowed. A read that fails and returns nothing is indistinguishable from a
         * read that succeeded and found nothing, and the two mean opposite things about a family's
         * money — which is exactly how this went unnoticed.
         */
        if (error) throw new Error(`could not read ${what}: ${error.message}`);
        out.push(...(data ?? []));
    }
    return out;
}
