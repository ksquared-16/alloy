/**
 * PROGRESSIVE DRAWER TRUTH — a canonical fact delivered the moment it is known, on the wire that
 * already carries the action carrier and the full drawer.
 *
 * ── WHY THIS EXISTS ──
 *
 * Measured on deployed 96f37f1a, n=22 cold row switches: `_inquiry_children` becomes canonical on
 * the server at P50 1,148ms, the full view model reaches the browser at P50 3,146ms, and the
 * children and household cells clear at P50 3,194ms — 46ms after it lands. The cards are not slow.
 * The fact is produced early and then waits about two seconds for a payload it does not need.
 *
 * So this carries the SAME canonical result, from the SAME producer, earlier. It is not a second
 * resolver, not a refetch, and not a second owner of the fact: the drawer composition still
 * produces `_inquiry_children` exactly once and the full view model still arrives and converges.
 *
 * ── PATCH SEMANTICS, AND WHY THEY ARE NOT MERGE SEMANTICS ──
 *
 * A field ABSENT from a patch means NO NEW INFORMATION. It does not mean null, empty, deleted or
 * "this family has no children". Only an explicitly present value is a claim. That distinction is
 * the whole contract: a roster that has not resolved yet and a family with no children are
 * different answers, and the card renders differently for each.
 *
 * KNOWN never regresses. A later patch may add facts and may restate a fact identically; it may not
 * remove one. A conflicting value is left to the caller's canonical invalidation, never silently
 * applied — see {@link mergeDrawerTruthPatchFields}.
 */

/** The patch's own line on the phased drawer stream, beside `__carrier` and `__viewModel`. */
export const TRUTH_PATCH_LINE_KEY = "__truthPatch";

export const DRAWER_TRUTH_PATCH_VERSION = 1 as const;

export type DrawerTruthPatch = {
    version: typeof DRAWER_TRUTH_PATCH_VERSION;
    subject: {
        opportunity_id: string;
        /** The participation lens this patch was produced under, or null for the case grain. */
        attention_subject_id: string | null;
    };
    /**
     * Canonical record fields that have become KNOWN. Opaque here on purpose: this module owns
     * delivery, never which facts exist — the same reason the commit-critical builder spreads the
     * identity bag without knowing a single key.
     */
    fields: Record<string, unknown>;
};

function trimOrNull(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Is this patch about the subject currently selected?
 *
 * The opportunity is the whole identity, exactly as it is for the action carrier: one opportunity
 * has one canonical roster whatever lens asked for it. Comparing the participation lens as well
 * once made a hover-warmed carrier unreachable to a panel that asserts no lens — a store with a
 * writer and no reader, shipped to production. The lens travels on the patch for diagnostics and
 * for a future lens-scoped fact; it is deliberately not part of the match.
 */
export function drawerTruthPatchDescribesSubject(
    patch: unknown,
    selected: { opportunityId: string | null | undefined },
): patch is DrawerTruthPatch {
    if (!patch || typeof patch !== "object") return false;
    const p = patch as Partial<DrawerTruthPatch>;
    if (p.version !== DRAWER_TRUTH_PATCH_VERSION) return false;
    if (!p.subject || typeof p.subject !== "object") return false;
    if (!p.fields || typeof p.fields !== "object" || Array.isArray(p.fields)) return false;
    const want = trimOrNull(selected.opportunityId);
    const got = trimOrNull((p.subject as { opportunity_id?: unknown }).opportunity_id);
    return want != null && got != null && want === got;
}

/**
 * Fold a patch's fields onto what is already known.
 *
 * UNKNOWN → KNOWN applies. KNOWN → the same KNOWN is idempotent. KNOWN → missing cannot happen,
 * because an absent key carries no claim. KNOWN → a DIFFERENT known value is refused here and left
 * to whatever canonical invalidation the caller owns: silently overwriting one canonical answer
 * with another is how a card flickers to a contradictory value with nothing recording that it did.
 */
export function mergeDrawerTruthPatchFields(
    known: Record<string, unknown> | null | undefined,
    fields: Record<string, unknown>,
): Record<string, unknown> {
    const base: Record<string, unknown> = { ...(known ?? {}) };
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) continue; // absent is not a claim
        if (!(key in base) || base[key] == null) {
            base[key] = value;
            continue;
        }
        // Already known. Restating it is fine; contradicting it is not applied here.
        if (JSON.stringify(base[key]) === JSON.stringify(value)) continue;
    }
    return base;
}
