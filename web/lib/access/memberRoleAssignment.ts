/**
 * W-51 / `IA-7` (+ `M2-17`) — role assignment as the union the schema actually stores.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §21.
 *
 * **The defect.** `user_roles` has composite identity `(user_id, org_id, role)`, so a membership is
 * a **set** of roles. `IA-7` is *"the product states a one-role model the schema does not have"*:
 * `displayRoleForAdminPicker` collapses that set to one literal on the way to the operator's screen
 * — `02…§8` calls it *"discarding union semantics on the way to the operator's screen"* — and the
 * Access chapter then renders the survivor as though it were the whole answer. The Roles chapter
 * compounds it: counting members by the collapsed value undercounts every role that is never
 * anyone's primary.
 *
 * **Why the collapse is worse than a display bug.** `02…§17.4` records the composition as `M2-17`:
 * the read collapses, the editor is seeded from the collapsed value, and
 * `PATCH /api/admin/users/[userId]/role` replaces **every** role row for the pair with the one
 * submitted. So an operator who changes the single visible role of a principal holding
 * `{admin, regional_lead}` destroys `regional_lead` **having never been shown it**. The one guard
 * present made it worse: the save was disabled while `editRole === primary_role`, which removes the
 * harmless no-op and leaves only the submissions that reach the destructive path.
 *
 * **What this module does and does not settle.** It restores the union to the surface and makes the
 * consequence of the replacement API *nameable* — {@link rolesDiscardedByReplacement} answers
 * exactly which held roles a submission would delete. It does not make the write additive: that is
 * `W-17`, which needs an API that can add a role without removing the others. Until `W-17`, the
 * honest product shows the whole set, states that the editor **replaces** rather than adds, and
 * refuses to perform a destructive replacement that the operator has not been shown and confirmed.
 *
 * Pure functions only, so the surface cannot acquire a second opinion about what someone holds.
 */

/** Sorted, de-duplicated, non-empty role keys — the membership union, defensively normalized. */
export function normalizeHeldRoleKeys(roleKeys: readonly string[] | null | undefined): string[] {
    const set = new Set<string>();
    for (const key of roleKeys ?? []) {
        if (typeof key !== "string") continue;
        const trimmed = key.trim();
        if (trimmed) set.add(trimmed);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Every role the membership holds, labelled for display.
 *
 * `roleKeys` is the authority; `primaryRole` is accepted only as a fallback for a caller whose
 * payload predates the union being carried, and it is never preferred over a non-empty set. A
 * membership with neither projects an empty list, and {@link roleAssignmentLabel} states that
 * honestly rather than inventing a role.
 */
export function heldRoleKeys(member: {
    role_keys?: readonly string[] | null;
    primary_role?: string | null;
}): string[] {
    const union = normalizeHeldRoleKeys(member.role_keys);
    if (union.length > 0) return union;
    return normalizeHeldRoleKeys(member.primary_role ? [member.primary_role] : []);
}

/** True when the membership holds more than one role — the case the one-role UI could not state. */
export function holdsMultipleRoles(member: { role_keys?: readonly string[] | null; primary_role?: string | null }): boolean {
    return heldRoleKeys(member).length > 1;
}

/**
 * The display string for what a membership holds.
 *
 * A membership with no role rows returns `null` rather than an empty string or a plausible default:
 * `IA-R1` requires an uncomputed value to render as unknown, and the caller renders that decision.
 * Returning `"Member"` here is exactly the manufactured certainty this wave exists to remove.
 */
export function roleAssignmentLabel(
    member: { role_keys?: readonly string[] | null; primary_role?: string | null },
    labelFor: (roleKey: string) => string,
): string | null {
    const held = heldRoleKeys(member);
    if (held.length === 0) return null;
    return held.map((key) => labelFor(key)).join(" · ");
}

/** Does this membership hold `roleKey`? The predicate the Roles chapter must count and filter on. */
export function memberHoldsRole(
    member: { role_keys?: readonly string[] | null; primary_role?: string | null },
    roleKey: string,
): boolean {
    return heldRoleKeys(member).includes(roleKey);
}

/**
 * The roles a single-role replacement would **delete**.
 *
 * This is `M2-17` made nameable. `PATCH /api/admin/users/[userId]/role` replaces every role row for
 * the pair with the submitted one, so the loss is *everything held except the submitted role*. The
 * answer is sorted and stable so a confirmation can name them in a fixed order.
 */
export function rolesDiscardedByReplacement(
    member: { role_keys?: readonly string[] | null; primary_role?: string | null },
    nextRoleKey: string,
): string[] {
    const next = typeof nextRoleKey === "string" ? nextRoleKey.trim() : "";
    return heldRoleKeys(member).filter((key) => key !== next);
}

/**
 * Whether a replacement submission would change anything at all.
 *
 * The old guard compared the selection to the **collapsed** value, so a multi-role membership whose
 * primary happened to equal the selection read as "no change" while the submission would in fact
 * have deleted the other roles. The membership is unchanged only when the union is exactly the one
 * submitted role.
 */
export function replacementIsNoOp(
    member: { role_keys?: readonly string[] | null; primary_role?: string | null },
    nextRoleKey: string,
): boolean {
    const next = typeof nextRoleKey === "string" ? nextRoleKey.trim() : "";
    if (!next) return true;
    const held = heldRoleKeys(member);
    return held.length === 1 && held[0] === next;
}

/** What a refused replacement was going to destroy, and which part of it the caller never saw. */
export type ReplacementRemovalRefusal = {
    /** Every role the replacement would delete. */
    removed: string[];
    /** Of those, the ones the request did not carry — the reason it is refused. */
    unacknowledged: string[];
};

/**
 * W-54 / `I-34`ᴬ — the route refuses a destructive replacement submitted from a partial view.
 *
 * **Why this exists when `IA-7` already added a confirmation.** `IA-7` (session 1) made the loss
 * *nameable* and put an acknowledgement in front of the canonical surface's save. That closed the
 * display half. It did not close this one: the request body was still `{ role }` alone, so the
 * acknowledgement never left the browser and the route could not tell an operator who had been
 * shown `{admin, regional_lead}` and accepted the loss from one who had been shown a single
 * collapsed value and had no idea the other row existed. The two legacy role editors are the second
 * case by construction — they cannot render a set. This is the same argument `IA-7` itself made one
 * layer up: a `disabled` attribute is a presentation fact, and presentation must not be where
 * authority is decided.
 *
 * **The rule is about the VIEW, not about the removal.** Every replacement removes something — a
 * single-role membership changed from `coordinator` to `admin` removes `coordinator`, and that is
 * the operation the operator asked for, not collateral. What makes a removal illegitimate is that
 * the caller could not have seen it. So:
 *
 * - **The request carried no acknowledgement.** A caller that cannot send the set is a caller that
 *   collapsed it, and a collapsed view is accurate only when there was nothing to collapse. Permit
 *   a single-role membership; refuse a multi-role one.
 * - **The request carried an acknowledgement.** Refuse when the principal holds a role the request
 *   did not list — the view was stale or partial, whatever it claimed.
 *
 * `I-34`ᴬ: *"until `W-17` lands, the editor must not be able to reach the destructive path with a
 * partial view."* Rejection is the correct verb, because a surface that cannot express a fact MUST
 * NOT be able to delete it.
 *
 * **What this deliberately does NOT do.** It does not make the write additive — that is `W-17`, and
 * a caller carrying the full held set may still replace, because that is a loss the operator has
 * been shown. It is also not a concurrency control: the read and the write are two statements, so a
 * role added between them is not caught. Atomicity is `W-28`/`S-12`. What is closed is the
 * partial-view path, which is the one the product ships a button for.
 *
 * **Ordinary use of either legacy surface is unaffected**, because a single-role membership — the
 * overwhelming majority — is permitted with no acknowledgement at all. They are refused exactly
 * where they would otherwise have destroyed a row they never rendered.
 */
export function replacementRemovalRefusal(params: {
    /** What the principal holds right now, read at the route. */
    currentRoleKeys: readonly string[] | null | undefined;
    /** The single role being written. */
    nextRoleKey: string;
    /** The full held set the request carried, or null/undefined when it carried none. */
    acknowledgedRoleKeys: readonly string[] | null | undefined;
}): ReplacementRemovalRefusal | null {
    const next = typeof params.nextRoleKey === "string" ? params.nextRoleKey.trim() : "";
    const current = normalizeHeldRoleKeys(params.currentRoleKeys);
    const removed = current.filter((key) => key !== next);
    if (removed.length === 0) return null;

    const acknowledged = normalizeHeldRoleKeys(params.acknowledgedRoleKeys);

    if (acknowledged.length === 0) {
        // No acknowledgement: legitimate only if there was nothing a collapsed view could have hidden.
        if (current.length <= 1) return null;
        return { removed, unacknowledged: removed };
    }

    // Acknowledged: the view is stale if the principal holds anything the request did not list.
    const unacknowledged = current.filter((key) => !acknowledged.includes(key));
    if (unacknowledged.length === 0) return null;

    return { removed, unacknowledged };
}

/** The operator-facing reason a replacement was refused. Names the roles, so the loss is legible. */
export function replacementRemovalRefusalMessage(refusal: ReplacementRemovalRefusal): string {
    const names = refusal.unacknowledged.join(", ");
    return (
        `This change would remove ${refusal.unacknowledged.length === 1 ? "the role" : "the roles"} `
        + `${names}, which this request did not include. Reload the member and try again so the full `
        + `set of assigned roles is shown before it is replaced.`
    );
}
