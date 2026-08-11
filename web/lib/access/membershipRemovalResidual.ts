/**
 * W-20 / `T-19` — removal reports what it actually revoked, and refuses to claim more.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §48, and the
 * ordering rule §1.6 that makes this half executable ahead of the deletion half.
 *
 * **The defect, in the plan's own words.** *"The failure mode is not 'removal is slow' — it is
 * 'removal is inverted.' … Removing a `school_director` who has an old `app_users.role = 'admin'`
 * row **promotes them**"* (`01…§49`). `POST /api/admin/users/[userId]/remove` deletes the
 * principal's `user_roles` row for the org and nothing else — its own comment says *"Does not delete
 * auth.users"* — and `resolveAdminAccessCore` then falls through to the legacy identity tables,
 * which accept `admin`/`ops` and set `portalEligible`. **The product reports `{ ok: true }`.**
 *
 * **Why this is `W-20`'s half and not `W-20`.** §48 re-prices `W-20` as the corpus's only `S1` and
 * establishes that `W-0`'s `Q2 = 0` answered a *different question*: Q2 counted who would be locked
 * out if the fallback were **deleted**; `T-19` asks who is **admitted** by it after the product says
 * they were removed. Deleting the fallback is therefore gated on census `Q15` — nobody has counted
 * the exposed population, and a straight deletion without that count is a lockout risk. **This
 * module does not delete the fallback.** It closes the live half by §1.6: *"where a defect can be
 * closed by showing more and refusing more, that fix is scheduled ahead of the architectural fix
 * that would make it impossible — and it MUST NOT be deferred into it."* Nothing here needs `Q15`,
 * a migration, or a decision, because it removes no one's access and changes nothing at all for a
 * principal with no legacy row.
 *
 * **The rule is `W-54`'s rule, applied to removal.** `W-54` refuses a role replacement submitted
 * from a view that could not have shown the loss, and permits it when the caller carries what it
 * saw. The same shape holds here, with the asymmetry reversed: a replacement destroys more than the
 * operator was shown, and a removal destroys **less** — it revokes nothing while reporting success.
 * So:
 *
 * - **Membership remains elsewhere.** The fallback fires only for a principal with no `user_roles`
 *   row at all, so a principal who still holds one is unaffected and the removal is exactly what it
 *   says within this org. Permit, and do not read the legacy tables at all.
 * - **No legacy grant.** Permit. This is the overwhelming majority and the path where behaviour is
 *   byte-for-byte what it was.
 * - **A legacy grant.** The removal will not revoke authority. Refuse it unless the caller states
 *   it has been shown that fact, then permit and **report the residual** — because the operator's
 *   intent (get this person off the roster) is legitimate and blocking it outright would trade a
 *   lie for an impasse.
 * - **The read failed.** Refuse, and refuse unacknowledgeably. An operator cannot acknowledge a
 *   fact nobody established, and an unknown treated as absent is the exact conflation `W-43` closed
 *   in the resolver and `W-56` closed at the surface.
 *
 * **What this deliberately does NOT do.** It does not delete the fallback (`W-20`'s other half,
 * `Q15`), does not dispose of the unattached `handle_new_user()` trigger function (`W-20`, and a
 * migration, so `OD-1`), and is not a concurrency control — the guard's read and the delete are two
 * statements, so a legacy row written between them is not caught. Atomicity is `W-28`/`S-12`.
 *
 * Pure functions only: the decision has to be answerable without a database, because the route is
 * where it must be enforced and the route is not where it may be re-derived.
 */

import type { LegacyAdminOpsAuthorityRead } from "@/lib/admin/resolveAdminAccessCore";

/** What authority the principal retains once the membership row is gone. */
export type RemovalResidualAuthority =
    /** Nothing outside this org's membership admits them. The removal means what it says. */
    | { kind: "none" }
    /** Membership in another org remains — legitimate, out of this org's scope, and NOT a residual. */
    | { kind: "other_membership" }
    /** The legacy identity tables still admit them. The removal revokes nothing. */
    | { kind: "legacy_authority"; role: "admin" | "ops"; orgId: string }
    /** The legacy read failed, so whether the removal revokes anything is not established. */
    | { kind: "unknown"; table: string; reason: string };

/**
 * Does the legacy fallback get consulted at all once this membership is removed?
 *
 * Answered with the resolver's own `chooseOrgAndRoleKeysFromMembershipRows` at the call site rather
 * than re-implemented here, so the guard's model of *when the fallback fires* is the resolver's
 * model and not a second one. `fallbackWouldBeConsulted` is that predicate's result, passed in.
 */
export function removalResidualAuthority(params: {
    /** True when, after the delete, no membership row remains for the principal in any org. */
    fallbackWouldBeConsulted: boolean;
    /** The legacy read, performed ONLY when the fallback would be consulted. */
    legacyRead: LegacyAdminOpsAuthorityRead | null;
}): RemovalResidualAuthority {
    if (!params.fallbackWouldBeConsulted) return { kind: "other_membership" };

    const read = params.legacyRead;
    if (!read) {
        // The fallback would fire and nobody looked. Treating that as "none" is the whole defect.
        return { kind: "unknown", table: "unread", reason: "The legacy authority tables were not read." };
    }
    if (read.status === "unknown") {
        return { kind: "unknown", table: read.table, reason: read.reason };
    }
    if (read.status === "present") {
        return { kind: "legacy_authority", role: read.role, orgId: read.orgId };
    }
    return { kind: "none" };
}

/** True when the removal does revoke the principal's operator authority, as the product claims. */
export function removalRevokesAuthority(residual: RemovalResidualAuthority): boolean {
    return residual.kind === "none" || residual.kind === "other_membership";
}

export type RemovalRefusal = {
    residual: RemovalResidualAuthority;
    /** Whether stating the fact to the operator makes the removal performable. */
    acknowledgeable: boolean;
    message: string;
};

/**
 * Why the removal is refused, or `null` when it may proceed.
 *
 * `acknowledged` is the caller's statement that it has been shown the residual — the same role
 * `expected_role_keys` plays in `W-54`. It is deliberately unable to clear an `unknown`.
 */
export function removalRefusal(params: {
    residual: RemovalResidualAuthority;
    acknowledged: boolean;
}): RemovalRefusal | null {
    const { residual, acknowledged } = params;

    if (residual.kind === "unknown") {
        return {
            residual,
            acknowledgeable: false,
            message:
                `This member's other sources of access could not be read (${residual.table}), so removing `
                + `their membership might not revoke their access. Nothing was changed. Try again.`,
        };
    }

    if (residual.kind === "legacy_authority") {
        if (acknowledged) return null;
        return {
            residual,
            acknowledgeable: true,
            message:
                `Removing this membership will NOT revoke this person's access. They are also `
                + `${residual.role === "admin" ? "an administrator" : "an operations user"} through a legacy `
                + `identity record, which admits them to the operator portal on its own. Removing the `
                + `membership here leaves that access in place. Confirm to remove the membership anyway.`,
        };
    }

    return null;
}

/** The residual to report on a removal that succeeded, or `null` when there is nothing to report. */
export function residualAuthorityReport(
    residual: RemovalResidualAuthority,
): { source: "legacy_identity_record"; role: "admin" | "ops"; org_id: string } | null {
    if (residual.kind !== "legacy_authority") return null;
    return { source: "legacy_identity_record", role: residual.role, org_id: residual.orgId };
}
