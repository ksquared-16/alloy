/**
 * The canonical Enrollment participant progress projection (Slice 2.3).
 *
 * Answers exactly one question, deterministically:
 *
 *   > What does this participant still need to satisfy for the current Enrollment stage?
 *
 * ```
 *   process_instance
 *     -> pinned governing BP revision      (D-96)
 *     -> current stage
 *     -> stable effective requirements     (D-97: stated by the revision itself)
 *     -> anchored participant session      (D-95)
 *     -> Forms-owned satisfaction evidence (form_submissions.status = 'submitted')
 *     -> deterministic progress
 * ```
 *
 * ## Authority, stated once
 *
 * **Business Process owns WHICH requirements exist**, and their level, scope, timing and
 * enforcement. **Forms owns the EVIDENCE** that satisfies a form requirement. **This projection owns
 * neither** — it owns only the join, and reports satisfied / outstanding / unrealized.
 *
 * The packet definition is a REALIZATION vehicle, not a second requirement authority. Traced before
 * building: nothing under `lib/lifecycle` or `lib/completion` treats packet-item completion as
 * enrollment requirement satisfaction, and `resolveEffectiveStageRequirements` (D-92, the one
 * requirement resolver) never reads packets. `opportunity:enrollment_packet` is a FIELD rule an
 * operator records, not packet state.
 *
 * ## Why `unrealized` is its own status
 *
 * If the governing revision requires Form X and the packet does not realize it, the requirement
 * stays in the DENOMINATOR and is reported `unrealized`. Dropping it would make an incomplete packet
 * configuration look like a completed enrollment — the count would be honest about the packet and
 * silent about the process. Failing closed here is the whole point: `unrealized` is not satisfied,
 * so it can never inflate progress, and it names its own cause so an operator can fix the packet
 * rather than hunt for a missing parent.
 *
 * ## Status vocabulary — small, deterministic, evidence-backed
 *
 * No confidence, no inference, no "probably complete". Every status is a fact about a row that
 * either exists or does not.
 *
 * Pure types. The resolver lives beside this file.
 */

import type { RequirementKindV1 } from "@/lib/lifecycle/stageRequirementsV1";

/**
 * What is true about one requirement, right now.
 *
 * - `satisfied`   — Forms-owned evidence exists and is complete.
 * - `outstanding` — realized and reachable by the participant, but not yet complete.
 * - `unrealized`  — the governing revision requires it and the participant's packet does not
 *                   contain it. Stays in the denominator; never silently dropped.
 * - `unsupported` — a requirement KIND this slice cannot evaluate evidence for. Reported plainly
 *                   rather than guessed at, and deliberately NOT satisfied. Field requirements sit
 *                   here until Slice 2.4 owns canonical fact resolution.
 */
export const ENROLLMENT_REQUIREMENT_STATUSES = [
    "satisfied",
    "outstanding",
    "unrealized",
    "unsupported",
] as const;

export type EnrollmentRequirementStatus = (typeof ENROLLMENT_REQUIREMENT_STATUSES)[number];

/**
 * Identity of the artifact a requirement points at — never a copy of it.
 *
 * `kind` plus one identifier, mirroring `RequirementRefV1`. A label, schema or version number here
 * would go stale the moment the owning platform changed it.
 */
export type EnrollmentRequirementArtifact = {
    readonly kind: RequirementKindV1;
    /** `form_definition_id` for a form, `rule_id` for a field, and so on. */
    readonly id: string;
};

/**
 * Where a `satisfied` verdict came from, so it can be audited rather than trusted.
 *
 * Populated only when satisfied. `form_definition_version_id` is the D-94 session pin — the version
 * the participant actually transacted against, which is not necessarily the newest published one.
 */
export type EnrollmentSatisfactionEvidence = {
    readonly kind: "form_submission";
    readonly form_submission_id: string;
    readonly form_definition_version_id: string | null;
    readonly session_item_id: string;
};

export type EnrollmentRequirementProgress = {
    readonly requirement_id: string;
    readonly kind: RequirementKindV1;
    readonly artifact: EnrollmentRequirementArtifact;
    readonly level: "recommended" | "required" | "enforced";
    readonly status: EnrollmentRequirementStatus;
    /** Present only when `status === "satisfied"`. */
    readonly evidence?: EnrollmentSatisfactionEvidence;
    /** Present only when `status === "unrealized"` or `"unsupported"` — why, in one phrase. */
    readonly reason?: string;
};

export type EnrollmentParticipantProgress = {
    readonly process_instance_id: string;
    /** Null when no participant objective has been launched yet. Requirements still project. */
    readonly session_id: string | null;
    /** Null for a historical unpinned instance running on the live compatibility projection. */
    readonly business_process_revision_id: string | null;
    readonly stage_key: string | null;
    readonly total_requirements: number;
    readonly satisfied_requirements: number;
    readonly remaining_requirements: number;
    readonly requirements: readonly EnrollmentRequirementProgress[];
};

/**
 * Counts derived from the rows, never tracked alongside them.
 *
 * Keeping the totals a pure function of the list is what makes "1 of 2" impossible to fake: a
 * whole-packet completion flag cannot move the numerator without moving a requirement's status.
 * `remaining` is everything not satisfied — outstanding, unrealized and unsupported alike — because
 * from the participant's point of view all three are still owed.
 */
export function summarizeEnrollmentRequirementProgress(
    requirements: readonly EnrollmentRequirementProgress[],
): Pick<
    EnrollmentParticipantProgress,
    "total_requirements" | "satisfied_requirements" | "remaining_requirements"
> {
    const total_requirements = requirements.length;
    const satisfied_requirements = requirements.filter((r) => r.status === "satisfied").length;
    return {
        total_requirements,
        satisfied_requirements,
        remaining_requirements: total_requirements - satisfied_requirements,
    };
}
