/**
 * THE GATE ON "COMPLETE ENROLLMENT" — completion may not bypass requirement sufficiency.
 *
 * ── THE THREE CONCEPTS, KEPT APART ──
 *
 *   PARTICIPANT COMPLETE      the parent finished everything the runtime asked them for
 *   REQUIREMENTS SUFFICIENT   every blocking requirement is satisfied or governed-excepted
 *   ENROLLMENT COMPLETE       an authorized operator executed the governed outcome
 *
 * They are three different facts and the platform already keeps the first and the third apart:
 * participant completion is non-mutating, and only an operator outcome moves the child. What had no
 * owner in the EXECUTION path was the middle one. `evaluateEnrollmentCompletionSufficiency` was
 * built, tested and consumed by NOTHING in production — so an operator could record the enrolled
 * outcome with required paperwork still outstanding, and every surface would agree the child was
 * enrolled. The requirement projection would still have said otherwise, and nobody was asking it.
 *
 * ── WHY THIS IS NOT `evaluateTransitionRequirementPreflight` ──
 *
 * That preflight already runs here and answers a different question: are the configured TRANSITION
 * field requirements present on the record. It reads fields. It knows nothing about the family's
 * packet, their form submissions, or a governed exception. Both gates are needed and neither
 * subsumes the other.
 *
 * ── WHICH OUTCOMES ARE GATED, AND WHY IT IS NOT AN OUTCOME KEY ──
 *
 * The trigger is the configured TARGET, not a name: an outcome is gated when its rules would write
 * a durable enrolled disposition (`update_child_enrollment_status` → `enrolled`). Two stages already
 * carry such an outcome under different keys (`enrollment_complete` on `enrolling`, `enrolled` on
 * `future_start`), and an org may configure a third. Matching on the key would gate the ones we
 * happened to know about on the day this was written, and silently let the next one through — which
 * is the precise failure this exists to prevent.
 *
 * ── FAILING CLOSED, AND WHAT IS NOT A FAILURE ──
 *
 * If sufficiency cannot be resolved the outcome is BLOCKED, because "I could not check" is not
 * "nothing blocks". But a journey with no configured requirements at all is NOT a failure: zero
 * requirements is a complete answer, `eligible` is true, and completion proceeds. An org that
 * configures no Enrollment paperwork is not thereby prevented from enrolling anybody.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveEnrollmentCompletionSufficiency } from "@/lib/enrollment/completion/enrollmentCompletionSufficiency";
import type { EnrollmentCompletionSufficiency } from "@/lib/enrollment/completion/enrollmentCompletionSufficiency";
import { outcomeRulesForKey, type StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

/**
 * Dispositions that mean the child is durably ENROLLED.
 *
 * Only these are gated. `withdrawn` and `not_enrolling` are terminal too, and neither may be held up
 * by outstanding paperwork — a family that is leaving must not be trapped in the journey by a form
 * they were never going to send.
 */
const ENROLLED_DISPOSITIONS: ReadonlySet<string> = new Set(["enrolled"]);

export type EnrollmentCompletionSufficiencyPreflight = {
    readonly blocked: boolean;
    /** Operator-facing copy. Null when nothing blocks, or when this outcome is not gated. */
    readonly message: string | null;
    /** Null when the outcome is not a durable-enrolled outcome, so it was never evaluated. */
    readonly sufficiency: EnrollmentCompletionSufficiency | null;
    /** True when this outcome would durably enroll the child, whatever the verdict was. */
    readonly gated: boolean;
};

const NOT_GATED: EnrollmentCompletionSufficiencyPreflight = {
    blocked: false,
    message: null,
    sufficiency: null,
    gated: false,
};

/**
 * Would recording this outcome durably enrol the child?
 *
 * Reads the plan's own configured rule targets, so an org that renames or adds an enrolling outcome
 * is gated by the same rule without anyone editing this file.
 */
export function outcomeDurablyEnrolls(params: {
    readonly plan: StageOperatingPlanV1;
    readonly outcomeKey: string;
    readonly attemptCount?: number | null;
}): boolean {
    const rules = outcomeRulesForKey(params.plan, params.outcomeKey, {
        attemptCount: params.attemptCount ?? null,
    });
    for (const rule of rules) {
        for (const target of rule.targets) {
            if (target.kind !== "update_child_enrollment_status") continue;
            const disposition = (target.disposition_key ?? "").trim().toLowerCase();
            if (ENROLLED_DISPOSITIONS.has(disposition)) return true;
        }
    }
    return false;
}

/**
 * Operator-readable copy naming what still blocks.
 *
 * Names the requirements and says why, because "requirements are incomplete" tells an operator to go
 * looking and tells them nothing about where. It does NOT name the excepted ones: an exception is
 * not an obstacle, and listing it invites someone to go and satisfy paperwork a person already
 * decided did not apply.
 */
export function formatCompletionSufficiencyBlockMessage(
    sufficiency: EnrollmentCompletionSufficiency,
): string {
    const blocking = sufficiency.blocking;
    if (!blocking.length) return "Enrollment cannot be completed — requirements are incomplete.";

    const lines = blocking.map((r) => {
        const reason = (r.blocked_reason ?? "").trim();
        return reason ? `${r.requirement_id} — ${reason}` : r.requirement_id;
    });

    const count =
        blocking.length === 1 ?
            "1 requirement needs attention"
        :   `${blocking.length} requirements need attention`;

    return `Enrollment cannot be completed — ${count}: ${lines.join("; ")}`;
}

/**
 * Block a durable-enrolled outcome while any blocking requirement is neither satisfied nor excepted.
 *
 * Called from the completion transaction's `validate` phase, so a refusal happens before ANY write:
 * no work state, no status, no stage, no handoff. A blocked completion must leave the journey
 * exactly where the operator found it.
 */
export async function preflightEnrollmentCompletionSufficiency(params: {
    readonly supabase: SupabaseClient;
    readonly orgId: string;
    readonly plan: StageOperatingPlanV1;
    readonly outcomeKey: string;
    readonly attemptCount?: number | null;
    /** The child's Enrollment journey. Absent means this outcome is not about one child's journey. */
    readonly processInstanceId: string | null | undefined;
}): Promise<EnrollmentCompletionSufficiencyPreflight> {
    if (!outcomeDurablyEnrolls(params)) return NOT_GATED;

    const processInstanceId = (params.processInstanceId ?? "").trim();
    if (!processInstanceId) {
        /*
         * A durable-enrolled outcome with no resolvable journey cannot be checked. This is the
         * family-grain caller reaching a child-grain gate, and guessing either way is wrong — so it
         * refuses and says which identity is missing, rather than enrolling a child whose paperwork
         * nobody looked at.
         */
        return {
            blocked: true,
            message:
                "Enrollment cannot be completed — this child's Enrollment journey could not be identified, "
                + "so their requirements could not be checked.",
            sufficiency: null,
            gated: true,
        };
    }

    const resolved = await resolveEnrollmentCompletionSufficiency(params.supabase, {
        orgId: params.orgId,
        processInstanceId,
    });

    // Fails CLOSED. "I could not check" is not "nothing blocks".
    if (!resolved.ok) {
        return {
            blocked: true,
            message:
                "Enrollment cannot be completed — this child's requirements could not be checked "
                + `(${resolved.refusal.detail}). Try again in a moment.`,
            sufficiency: null,
            gated: true,
        };
    }

    if (resolved.sufficiency.eligible) {
        return { blocked: false, message: null, sufficiency: resolved.sufficiency, gated: true };
    }

    return {
        blocked: true,
        message: formatCompletionSufficiencyBlockMessage(resolved.sufficiency),
        sufficiency: resolved.sufficiency,
        gated: true,
    };
}
