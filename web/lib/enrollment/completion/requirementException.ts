/**
 * A governed requirement exception — "this exact requirement is legitimately excepted".
 *
 * Pure model. The vocabulary, the identity, the authority question and the projection into the
 * shape `evaluateEnrollmentCompletionSufficiency` already consumes. No I/O.
 *
 * ## What this is, stated narrowly
 *
 * Business Process owns which requirements exist. Forms owns the evidence. Shared sufficiency owns
 * whether they block. An exception is the fourth thing, and it was missing: a durable record that a
 * person decided one requirement does not apply to one child.
 *
 * It is deliberately NOT a waiver product. One disposition, one subject, one requirement, one
 * reason, one approver, three states.
 *
 * ## An exception is never evidence
 *
 * The requirement keeps its own status. `outstanding` stays `outstanding`, and the sufficiency
 * verdict separately reports `excepted`. Marking the Form submitted would have been simpler and
 * would have destroyed the distinction permanently — nobody reading the record later could tell
 * whether the paperwork arrived or somebody decided it need not.
 *
 * ## Identity is (participation, stage, requirement)
 *
 * `StageRequirementV1.requirement_id` is stable WITHIN a stage, so the stage belongs to the
 * identity. The subject is the Enrollment Participation — the durable episode — not the process
 * instance, which can be re-anchored, and not the Opportunity, which may not exist at all.
 */

import type { RequirementExceptionRef } from "@/lib/enrollment/completion/enrollmentCompletionSufficiency";

/**
 * Authorization is a PERMISSION, not a job title.
 *
 * One key covers granting and revoking: whoever may decide a requirement does not apply may also
 * decide it applies again. A role that can excuse a requirement and cannot put it back is the worse
 * half to hold alone.
 */
export const REQUIREMENT_EXCEPTION_MANAGE_PERMISSION = "enrollment.requirement_exception.manage" as const;

/** V1 vocabulary, one member. A second disposition is a decision, not a string a caller invents. */
export const REQUIREMENT_EXCEPTION_DISPOSITIONS = ["excepted"] as const;
export type RequirementExceptionDisposition = (typeof REQUIREMENT_EXCEPTION_DISPOSITIONS)[number];

/**
 * `active` blocks nothing. `revoked` blocks again the moment the underlying requirement is still
 * outstanding. `superseded` is what a replacement leaves behind, so history stays answerable.
 */
export const REQUIREMENT_EXCEPTION_STATES = ["active", "revoked", "superseded"] as const;
export type RequirementExceptionState = (typeof REQUIREMENT_EXCEPTION_STATES)[number];

/** One stored row, as the rest of the runtime reads it. */
export type RequirementExceptionRecord = {
    readonly id: string;
    readonly org_id: string;
    readonly enrollment_participation_id: string;
    readonly stage_key: string;
    readonly requirement_id: string;
    readonly disposition: RequirementExceptionDisposition;
    readonly reason: string;
    readonly state: RequirementExceptionState;
    readonly approved_by: string | null;
    readonly approved_at: string;
    readonly revoked_by?: string | null;
    readonly revoked_at?: string | null;
    readonly revoke_reason?: string | null;
};

/** Exactly what identifies one exception. Every read and every write states all four. */
export type RequirementExceptionIdentity = {
    readonly orgId: string;
    readonly participationId: string;
    readonly stageKey: string;
    readonly requirementId: string;
};

export type RequirementExceptionRefusal = {
    readonly code:
        | "requirement_exception_permission_required"
        | "missing_subject"
        | "missing_requirement"
        | "missing_reason"
        | "missing_actor";
    readonly detail: string;
};

/**
 * May this actor decide? A failed grant read arrives as `null` and DENIES — it is not the same
 * answer as "holds no grants" (W-43).
 */
export function evaluateRequirementExceptionAuthority(subject: {
    readonly permissionKeys: readonly string[] | null;
}): { readonly allowed: true } | { readonly allowed: false; readonly refusal: RequirementExceptionRefusal } {
    if (!Array.isArray(subject.permissionKeys) || !subject.permissionKeys.includes(REQUIREMENT_EXCEPTION_MANAGE_PERMISSION)) {
        return {
            allowed: false,
            refusal: {
                code: "requirement_exception_permission_required",
                // Names the permission, not the family. A refusal must not leak what is outstanding.
                detail: "You do not have permission to except an Enrollment requirement.",
            },
        };
    }
    return { allowed: true };
}

/**
 * The request is complete enough to be a decision.
 *
 * `reason` is required because an exception with no stated reason is indistinguishable from a
 * mistake, and `actorUserId` is required because an exception with no author is exactly the state
 * this model exists to prevent.
 */
export function validateRequirementExceptionRequest(input: {
    readonly identity: Partial<RequirementExceptionIdentity>;
    readonly reason?: string | null;
    readonly actorUserId?: string | null;
}): { readonly ok: true } | { readonly ok: false; readonly refusal: RequirementExceptionRefusal } {
    const id = input.identity;
    if (!(id.orgId ?? "").trim() || !(id.participationId ?? "").trim() || !(id.stageKey ?? "").trim()) {
        return {
            ok: false,
            refusal: { code: "missing_subject", detail: "An exception needs an Enrollment participation and a stage." },
        };
    }
    if (!(id.requirementId ?? "").trim()) {
        return { ok: false, refusal: { code: "missing_requirement", detail: "An exception names exactly one requirement." } };
    }
    if (!(input.reason ?? "").trim()) {
        return { ok: false, refusal: { code: "missing_reason", detail: "State why this requirement is excepted." } };
    }
    if (!(input.actorUserId ?? "").trim()) {
        return { ok: false, refusal: { code: "missing_actor", detail: "An exception records who approved it." } };
    }
    return { ok: true };
}

/**
 * Project stored rows into the map sufficiency already consumes.
 *
 * ONLY `active` rows, and only rows for the stage being evaluated. A revoked or superseded row
 * contributes nothing — which is what makes revocation block again — and a row from another stage
 * is a different requirement that happens to share a name.
 */
export function activeRequirementExceptionsByRequirementId(
    records: readonly RequirementExceptionRecord[],
    stageKey: string | null,
): Record<string, RequirementExceptionRef> {
    const stage = (stageKey ?? "").trim();
    if (!stage) return {};
    const map: Record<string, RequirementExceptionRef> = {};
    for (const record of records) {
        if (record.state !== "active") continue;
        if ((record.stage_key ?? "").trim() !== stage) continue;
        map[record.requirement_id] = {
            requirement_id: record.requirement_id,
            reason: record.reason,
            approved_by: record.approved_by,
            approved_at: record.approved_at,
        };
    }
    return map;
}
