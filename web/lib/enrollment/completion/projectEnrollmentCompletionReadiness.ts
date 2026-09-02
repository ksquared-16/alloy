/**
 * WHAT THE OPERATOR NEEDS TO KNOW BEFORE THEY PRESS COMPLETE ENROLLMENT.
 *
 * The operator's questions are business questions, and there are only ever six:
 *
 *   is the family's paperwork done?      what is outstanding, and what is merely advisory?
 *   what did somebody already except?    why is the button off?
 *   is it on?                            what happens when I press it?
 *
 * This answers all six from the sufficiency verdict that already exists. It is a PROJECTION, not a
 * product: no new module, no Enrollment Completion workspace, no second requirement resolver. The
 * card that renders it is whichever canonical Focus Panel / Current Work surface already owns the
 * journey.
 *
 * Pure. No I/O — so the operator surface and the completion preflight cannot drift into telling an
 * operator two different stories about the same child.
 *
 * ── WHY RECOMMENDED REQUIREMENTS ARE NOT IN THE FRACTION ──
 *
 * "4 of 5 resolved · Ready to enroll" is a contradiction an operator has to stop and resolve in
 * their head, and the fifth item was never going to block anything. So the fraction counts only
 * requirements that are ACCOUNTABLE — satisfied, excepted, or blocking — and guidance is reported
 * beside it as guidance. The count and the verdict then always agree.
 *
 * ── EXCEPTED IS SHOWN, NOT HIDDEN ──
 *
 * An excepted requirement counts as resolved and is listed under its own heading with who decided
 * and why. Folding it into "satisfied" would let the record say paperwork arrived when a person
 * made a judgement call, which is the distinction the whole exception model exists to preserve.
 */

import type {
    EnrollmentCompletionSufficiency,
    EnrollmentRequirementSufficiency,
    RequirementExceptionRef,
} from "@/lib/enrollment/completion/enrollmentCompletionSufficiency";
import { outcomeRulesForKey, type StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

/** One requirement as an operator reads it. `label` falls back to the id when nothing names it. */
export type ReadinessRequirementRow = {
    readonly requirement_id: string;
    readonly label: string;
    readonly level: EnrollmentRequirementSufficiency["level"];
    readonly status: EnrollmentRequirementSufficiency["status"];
    /** Present on an outstanding row: why it is not resolved, in one phrase. */
    readonly reason?: string;
    /** Present on an excepted row: the standing decision. */
    readonly exception?: RequirementExceptionRef;
};

export type EnrollmentCompletionReadiness = {
    readonly state: "ready" | "blocked";
    /** "Enrollment paperwork complete" / "Enrollment paperwork incomplete". */
    readonly headline: string;
    /** "5 of 5 requirements resolved" / "2 requirements need attention". */
    readonly detail: string;
    readonly action: {
        readonly label: string;
        readonly enabled: boolean;
        /** Null when enabled. Never a code — this is the sentence the operator reads. */
        readonly blocked_reason: string | null;
    };
    /** What must be dealt with. Empty when ready. */
    readonly outstanding: readonly ReadinessRequirementRow[];
    /** Standing governed decisions. Visible, never folded into "satisfied". */
    readonly exceptions: readonly ReadinessRequirementRow[];
    /** Guidance that does not block, so nobody mistakes it for a reason the button is off. */
    readonly recommended: readonly ReadinessRequirementRow[];
    /** What pressing the button will actually do, from the plan's OWN configured targets. */
    readonly effects: readonly string[];
    readonly counts: {
        /** satisfied + excepted. */
        readonly resolved: number;
        /** satisfied + excepted + blocking. Excludes advisory requirements. */
        readonly accountable: number;
        readonly blocking: number;
        readonly excepted: number;
        readonly recommended: number;
    };
};

function labelFor(
    requirementId: string,
    labels: Readonly<Record<string, string>> | undefined,
): string {
    const named = (labels?.[requirementId] ?? "").trim();
    return named || requirementId;
}

function row(
    requirement: EnrollmentRequirementSufficiency,
    labels: Readonly<Record<string, string>> | undefined,
): ReadinessRequirementRow {
    return {
        requirement_id: requirement.requirement_id,
        label: labelFor(requirement.requirement_id, labels),
        level: requirement.level,
        status: requirement.status,
        ...(requirement.blocked_reason ? { reason: requirement.blocked_reason } : {}),
        ...(requirement.exception ? { exception: requirement.exception } : {}),
    };
}

/**
 * Describe what the configured outcome will do, reading the plan's own targets.
 *
 * Written from configuration rather than from knowledge of the childcare vertical, so an org that
 * configures a different set of targets gets a truthful description instead of this file's
 * assumptions about what enrolling means.
 */
export function describeCompletionEffects(params: {
    readonly plan: StageOperatingPlanV1;
    readonly outcomeKey: string;
}): string[] {
    const effects: string[] = [];
    const seen = new Set<string>();
    const add = (text: string) => {
        if (seen.has(text)) return;
        seen.add(text);
        effects.push(text);
    };

    for (const rule of outcomeRulesForKey(params.plan, params.outcomeKey)) {
        for (const target of rule.targets) {
            switch (target.kind) {
                case "update_child_enrollment_status": {
                    const disposition = (target.disposition_key ?? "").trim();
                    if (disposition) add(`Set this child's enrollment state to "${disposition}".`);
                    break;
                }
                case "move_to_stage": {
                    const stage = (target.stage_key ?? "").trim();
                    if (stage) add(`Move the journey to the "${stage}" stage.`);
                    break;
                }
                case "stamp_enrollment_date":
                    add("Record the enrollment date.");
                    break;
                case "mark_stage_work_complete":
                    add("Close the open work for this stage.");
                    break;
                case "create_next_work":
                    add("Open the next step's work.");
                    break;
                default:
                    // Attention and candidate-status targets are not operator-visible consequences
                    // of completing; naming them would pad the list without informing the decision.
                    break;
            }
        }
    }
    return effects;
}

/**
 * The operator's readiness story for one journey.
 *
 * `sufficiency` is the SAME verdict the completion gate enforces. That is the point: an operator who
 * is told "Ready to enroll" and then refused would have been shown a second opinion, and a surface
 * that computes its own readiness is exactly how that happens.
 */
export function projectEnrollmentCompletionReadiness(input: {
    readonly sufficiency: EnrollmentCompletionSufficiency;
    /** Optional human names by `requirement_id`. Absent falls back to the id — never blank. */
    readonly labels?: Readonly<Record<string, string>>;
    /** Supplied together to describe the button's effects; omitted leaves `effects` empty. */
    readonly plan?: StageOperatingPlanV1;
    readonly outcomeKey?: string;
    /** The button's name on this surface. */
    readonly actionLabel?: string;
}): EnrollmentCompletionReadiness {
    const { sufficiency, labels } = input;
    const actionLabel = (input.actionLabel ?? "").trim() || "Complete Enrollment";

    const outstanding = sufficiency.requirements
        .filter((r) => r.disposition === "blocking")
        .map((r) => row(r, labels));
    const exceptions = sufficiency.requirements
        .filter((r) => r.disposition === "excepted")
        .map((r) => row(r, labels));
    const recommended = sufficiency.requirements
        .filter((r) => r.disposition === "not_blocking")
        .map((r) => row(r, labels));
    const satisfied = sufficiency.requirements.filter((r) => r.disposition === "satisfied").length;

    const resolved = satisfied + exceptions.length;
    const accountable = resolved + outstanding.length;

    const effects =
        input.plan && input.outcomeKey ?
            describeCompletionEffects({ plan: input.plan, outcomeKey: input.outcomeKey })
        :   [];

    if (sufficiency.eligible) {
        return {
            state: "ready",
            headline: "Enrollment paperwork complete",
            /*
             * A journey with nothing configured is READY and says so plainly. "0 of 0 requirements
             * resolved" is arithmetically true and reads like a defect.
             */
            detail:
                accountable === 0 ?
                    "No Enrollment requirements are configured"
                :   `${resolved} of ${accountable} requirements resolved`,
            action: { label: actionLabel, enabled: true, blocked_reason: null },
            outstanding: [],
            exceptions,
            recommended,
            effects,
            counts: {
                resolved,
                accountable,
                blocking: 0,
                excepted: exceptions.length,
                recommended: recommended.length,
            },
        };
    }

    const needs =
        outstanding.length === 1 ?
            "1 requirement needs attention"
        :   `${outstanding.length} requirements need attention`;

    return {
        state: "blocked",
        headline: "Enrollment paperwork incomplete",
        detail: needs,
        action: {
            label: actionLabel,
            enabled: false,
            // Says WHICH, because "requirements are incomplete" sends an operator looking.
            blocked_reason: `${needs}: ${outstanding.map((r) => r.label).join(", ")}`,
        },
        outstanding,
        exceptions,
        recommended,
        effects,
        counts: {
            resolved,
            accountable,
            blocking: outstanding.length,
            excepted: exceptions.length,
            recommended: recommended.length,
        },
    };
}
