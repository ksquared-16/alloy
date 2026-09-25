/**
 * WHICH COLLECTION ATTEMPTS ARE STILL OPEN ON THIS ACCOUNT.
 *
 * ── THE DEFECT THIS CLOSES ─────────────────────────────────────────────────────────────────────
 *
 * This selection used to begin `chargeIdsForReads.filter(Boolean).slice(0, 200)`. That slice was a
 * URI-LENGTH GUARD: when the attempts were fetched with `.in("charge_id", ids)`, too many ids
 * overflowed the request URI and PostgREST answered `URI too long`. Capping the id list kept the
 * request legal.
 *
 * The request it guarded no longer exists. The attempts now arrive with the account fact bundle,
 * gathered set-based in SQL (`charge_id = ANY(v_charge_ids)`) with the `canonical_payment_id IS
 * NULL` rule applied there — so nothing here is transported by URI and nothing needs capping.
 *
 * What the slice still did was silently stop looking after the two-hundredth charge. On an account
 * with more than 200 charges an open attempt on a later one simply did not appear, and WHICH 200
 * survived depended on ledger row order — a presentation detail deciding what an operator is told
 * about money. It was carried forward deliberately during the transport migration, reported rather
 * than quietly changed, and it is closed here.
 *
 * ── WHAT DID NOT CHANGE ────────────────────────────────────────────────────────────────────────
 *
 * The economics. An attempt is open when its processor state is one of OPEN_STATES and it belongs
 * to a charge on this account; the ordering is still newest-updated first. Removing the cap adds
 * no charge that was not already eligible — it stops omitting ones that always were.
 */

/** The processor states an operator can still act on. Unchanged. */
export const OPEN_COLLECTION_STATES: ReadonlySet<string> = new Set([
    "initiated",
    "requires_payment_method",
    "requires_action",
    "processing",
    "succeeded",
]);

type AttemptRow = Record<string, unknown>;
const text = (v: unknown): string => (v == null ? "" : String(v));

export function selectOpenCollections(
    attempts: readonly AttemptRow[],
    chargeIds: readonly string[],
): AttemptRow[] {
    /*
     * A Set, so an account with thousands of charges costs one hash lookup per attempt rather than
     * a scan per attempt. No cap: every charge this account owns participates.
     */
    const onThisAccount = new Set(chargeIds.filter(Boolean));
    if (onThisAccount.size === 0) return [];
    return attempts
        .filter((a) => onThisAccount.has(text(a.charge_id)) && OPEN_COLLECTION_STATES.has(text(a.processor_state)))
        .slice()
        .sort((a, b) => text(b.updated_at).localeCompare(text(a.updated_at)));
}
