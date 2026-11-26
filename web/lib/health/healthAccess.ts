/**
 * D-H6 — THE HEALTH ACCESS BOUNDARY, enforced server-side.
 *
 * ── WHY UI HIDING IS NOT ENOUGH ──
 *
 * A Surface field policy (`editable | read-only | hidden`) is PRESENTATION configuration: it is
 * keyed on surface + group + field + tier and is uniform across roles. It decides what a card draws,
 * not who may receive the data — and anyone who can call the endpoint gets the payload regardless of
 * what the card chose to draw. So the boundary lives here, at the provider and the mutation seam,
 * and every Health read path must pass through it.
 *
 * ── READ AND WRITE ARE SEPARATE KEYS ──
 *
 * `health.manage` does not imply `health.view`. They are asked separately because the questions are
 * separate: a role that may record a medication an operator dictated is not automatically a role
 * that may browse a child's conditions. Callers that need both ask for both.
 *
 * ── A FAILED GRANT READ IS A DENIAL ──
 *
 * `permissionKeys` comes back as `null` when the grant read FAILED, which is not the same answer as
 * `[]`. W-43 recorded what happens when those are collapsed: the failure becomes OPEN for every
 * surface that gates on admission alone. For health, a failed read denies.
 */

export type HealthPermissionKey = "health.view" | "health.manage";

export const HEALTH_VIEW_PERMISSION: HealthPermissionKey = "health.view";
export const HEALTH_MANAGE_PERMISSION: HealthPermissionKey = "health.manage";

export type HealthAccessSubject = {
    /** Resolved grants for the caller. `null` means the grant read FAILED — deny. */
    permissionKeys: readonly string[] | null;
};

export type HealthAccessDecision =
    | { allowed: true }
    | { allowed: false; code: "health_permission_required"; missing: HealthPermissionKey; message: string };

function deny(missing: HealthPermissionKey): HealthAccessDecision {
    return {
        allowed: false,
        code: "health_permission_required",
        missing,
        // Names the permission rather than the data. An operator who cannot see health information
        // should not learn from the refusal that this child has any.
        message:
            missing === HEALTH_VIEW_PERMISSION
                ? "You do not have permission to view health information."
                : "You do not have permission to change health information.",
    };
}

export function evaluateHealthAccess(
    subject: HealthAccessSubject,
    required: HealthPermissionKey,
): HealthAccessDecision {
    // A failed grant read is not an empty grant set.
    if (!Array.isArray(subject.permissionKeys)) return deny(required);
    return subject.permissionKeys.includes(required) ? { allowed: true } : deny(required);
}

export function canViewHealth(subject: HealthAccessSubject): boolean {
    return evaluateHealthAccess(subject, HEALTH_VIEW_PERMISSION).allowed;
}

export function canManageHealth(subject: HealthAccessSubject): boolean {
    return evaluateHealthAccess(subject, HEALTH_MANAGE_PERMISSION).allowed;
}

export class HealthAccessDeniedError extends Error {
    readonly code = "health_permission_required";
    constructor(readonly missing: HealthPermissionKey, message: string) {
        super(message);
        this.name = "HealthAccessDeniedError";
    }
}

/**
 * Throw unless the caller holds the permission.
 *
 * The resolver and the mutation seam both call this, so a new Health endpoint cannot forget the
 * check by omission — it would have no health data to return without going through a function that
 * demands the decision as an argument.
 */
export function assertHealthAccess(
    subject: HealthAccessSubject,
    required: HealthPermissionKey,
): void {
    const decision = evaluateHealthAccess(subject, required);
    if (!decision.allowed) throw new HealthAccessDeniedError(decision.missing, decision.message);
}
