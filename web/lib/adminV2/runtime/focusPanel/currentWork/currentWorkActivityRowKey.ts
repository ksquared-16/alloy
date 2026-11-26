/**
 * THE ONE OWNER OF AN ACTIVITY ROW'S RENDER IDENTITY.
 *
 * It lives in lib rather than beside one component because FOUR presentation paths need it: the
 * Activity preview popover, the Current Work workspace list, the focused surface list, and the
 * What's Next card, which computes its key inside a presentation DTO rather than in JSX. Keeping
 * the rule in a component made the fourth one invisible, and it kept the old display-derived key.
 */

/** The minimum an item must expose to be identified. Structural on purpose — several DTOs qualify. */
export type ActivityRowIdentityLike = {
    id?: string | null;
    label: string;
    kind?: string | null;
};

/**
 * THE RENDER IDENTITY OF ONE ACTIVITY ROW.
 *
 * Rows were keyed `${label}-${occurredAt}`, and `occurredAt` is the FORMATTED timestamp
 * ("Today • 8:21 AM") — minute granularity. Two canonical events with the same title in the same
 * minute collided; observed live as 18 duplicate-key warnings in one journey, every one of them
 * `Tour invitation sent-Today • 8:21 AM`.
 *
 * The precision was never missing from the DATA — the upstream timeline entry carries an immutable
 * `id` and an epoch-ms `atSortKey`. Only the display string is coarse, and the display string had
 * become the identity. So this uses the canonical id, already namespaced by source and related
 * scope upstream so two contributing sources cannot collide on a shared row id.
 *
 * The fallback is for the one producer that has no event id at all (the lead activity preview).
 * It is positional, deliberately and visibly: that producer's own upstream ids are index-derived
 * too, so this mirrors what already exists rather than inventing an identity scheme. It is unique
 * within a render, which is what removes the collision.
 */
export function currentWorkActivityRowKey(item: ActivityRowIdentityLike, index: number): string {
    const id = item.id?.trim();
    if (id) return id;
    return `no-canonical-id:${index}:${item.kind ?? "activity"}:${item.label}`;
}
