/**
 * Enrollment Business Process template — OPTIONAL SEED CONFIGURATION, not doctrine.
 *
 * The stage keys below are an EXAMPLE a tenant may start from and then change: rename, reorder,
 * re-grain, add or delete any of them. They are not a required Enrollment shape, and no runtime
 * invariant may depend on any of them existing.
 *
 * In particular the platform does NOT require an Enrollment process to contain `closed` or
 * `closed_withdrawn`. A family case ends through `opportunities.status_key`; a child's
 * participation ends through `process_instances.state`. Representing either terminal result as a
 * stage is a tenant's choice, not the platform's model.
 *
 * Used by: apply template action, template UI card, enrollment-specific tests.
 * Generic runtime must NOT import this module.
 */

import { randomUUID } from "crypto";
import type {
    LifecycleBuilderProcessRecord,
    LifecycleBuilderStageRecord,
    LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { defaultEnrollmentQueueMembershipForStage } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import type { StageGrain } from "@/lib/lifecycle/stageGrainV1";
import type { StageOperatingPlanV1, StageOutcomeRuleTargetV1, StageWorkParticipantDecisionV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { mapOpportunityRecordActionToPatch } from "@/lib/recordChrome/opportunityRecordActionMap";

export const ENROLLMENT_TEMPLATE_PROCESS_KEY = ENROLLMENT_PROCESS_KEY;

export const ENROLLMENT_TRACK_FAMILY_KEY = "family_track" as const;
export const ENROLLMENT_TRACK_CHILD_KEY = "child_track" as const;

export const ENROLLMENT_FAMILY_STAGE_SPECS = [
    { key: "lead", label: "New Lead", track_key: ENROLLMENT_TRACK_FAMILY_KEY },
    { key: "tour", label: "Tour", track_key: ENROLLMENT_TRACK_FAMILY_KEY },
    { key: "decision", label: "Placement / Decision", track_key: ENROLLMENT_TRACK_FAMILY_KEY },
    { key: "closed", label: "Closed", track_key: ENROLLMENT_TRACK_FAMILY_KEY },
] as const;
// `qualification` removed (Part 9): no distinct work — folded into the Lead stage's qualify_fit work.

export const ENROLLMENT_CHILD_STAGE_SPECS = [
    { key: "waitlist", label: "Waitlist", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { key: "enrolling", label: "Enrolling", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { key: "enrolled", label: "Enrolled", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { key: "closed_withdrawn", label: "Closed / Withdrawn", track_key: ENROLLMENT_TRACK_CHILD_KEY },
] as const;

export const ENROLLMENT_STAGE_SPECS = [
    ...ENROLLMENT_FAMILY_STAGE_SPECS,
    ...ENROLLMENT_CHILD_STAGE_SPECS,
] as const;

/**
 * The CURRENT enrollment template stage keys — the only stages a fresh tenant receives, and the
 * only sanctioned built-in stage vocabulary for pre-configuration bootstrap. Deliberately does
 * NOT contain `qualification` (removed in Part 9). Do not confuse with the broad legacy
 * ENROLLMENT_TEMPLATE_STAGE_KEYS set, which retains historical keys for migration support only.
 */
export const CURRENT_ENROLLMENT_TEMPLATE_STAGE_KEYS: ReadonlySet<string> = new Set(
    ENROLLMENT_STAGE_SPECS.map((s) => s.key),
);

export const ENROLLMENT_STATUS_ROLLUP_HINTS: Record<
    string,
    { family_status_examples?: string[]; enrollment_status_examples?: string[] }
> = {
    lead: { family_status_examples: ["Open"] },
    tour: { family_status_examples: ["Open"] },
    decision: { family_status_examples: ["Open"] },
    closed: { family_status_examples: ["Closed"] },
    waitlist: { enrollment_status_examples: ["Waitlisted", "Offer Pending"] },
    enrolling: { enrollment_status_examples: ["Enrolling", "Future Start"] },
    enrolled: { enrollment_status_examples: ["Enrolled"] },
    closed_withdrawn: { enrollment_status_examples: ["Withdrawn", "Closed"] },
};

export const ENROLLMENT_DEFAULT_TRACKS: ProcessTracksV1 = {
    version: 1,
    tracks: [
        {
            key: ENROLLMENT_TRACK_FAMILY_KEY,
            label: "Family Track",
            subject: "family_case",
            sort_order: 0,
        },
        {
            key: ENROLLMENT_TRACK_CHILD_KEY,
            label: "Child Track",
            subject: "child_enrollment_track",
            sort_order: 1,
        },
    ],
    split_rules: [
        {
            version: 1,
            from_track_key: ENROLLMENT_TRACK_FAMILY_KEY,
            from_stage_key: "decision",
            into_track_key: ENROLLMENT_TRACK_CHILD_KEY,
            per_subject_outcomes: [
                { outcome_key: "waitlist", label: "Waitlist", target_stage_key: "waitlist" },
                { outcome_key: "enrolling", label: "Enrolling", target_stage_key: "enrolling" },
                {
                    outcome_key: "closed_withdrawn",
                    label: "Closed / Withdrawn",
                    target_stage_key: "closed_withdrawn",
                },
                { outcome_key: "no_action", label: "No action — keep with family", target_stage_key: null },
            ],
        },
    ],
};

/** The family track's terminal stage — where every closed family case sits, whatever the reason. */
const ENROLLMENT_FAMILY_TERMINAL_STAGE_KEY = "closed" as const;

/**
 * "CLOSE AS LOST" LANDS ON THE FAMILY TERMINAL STAGE, AND SAYS WHY.
 *
 * The shared default operating plans give `lead`, `tour` and `decision` a "Close as Lost" exit to
 * `closed_lost` — a stage this template has never had. Applied as-is, the template was refused by the
 * builder's own referential gate (422 `dangling_stage_reference`) for every new tenant.
 *
 * "Lost" is not a position: the family status vocabulary is `open` / `closed`, and why a case closed is
 * a durable close reason (`mark_lost` → `{ status_key: "closed", close_reason_key: "lost" }`). So the exit
 * lands on the family terminal stage, and the outcome that takes it records the lost reason FIRST —
 * repointing alone would close a lost family exactly like a family whose children enrolled. This is the
 * canonical repair `correctInvalidClosedLostTargets` makes to drifted configurations; the template now
 * produces that corrected form directly (it cannot import the correction: that module reads this one's
 * track constants at load).
 *
 * Done HERE, not in the shared defaults: the runtime fallback for stages without a stored plan strips
 * movement but keeps every other target, so a reason target in the defaults would start closing cases
 * that it then leaves sitting in their stage. Only exits that close the case AND point outside the
 * template are touched; every other exit and outcome is exactly the default.
 */
function closeLostExitsOntoFamilyTerminal(plan: StageOperatingPlanV1): StageOperatingPlanV1 {
    const templateStages = new Set<string>(ENROLLMENT_STAGE_SPECS.map((s) => s.key));
    const exits = plan.outgoing_transitions ?? [];
    const lostRefs = new Set(
        exits
            .filter((e) => (e.closes_record === true || (e.status_key ?? "").trim() === "closed") && !templateStages.has(e.target_stage_key))
            .map((e) => e.transition_ref),
    );
    if (!lostRefs.size) return plan;
    const lost = mapOpportunityRecordActionToPatch("mark_lost");
    if (!lost?.status_key || !lost.close_reason_key) {
        throw new Error("Enrollment template: the canonical lost-close mapping is unavailable; refusing to close lost cases without their reason");
    }
    const reason: StageOutcomeRuleTargetV1 = { kind: "update_family_case_status", status_key: lost.status_key, close_reason_key: lost.close_reason_key };
    return {
        ...plan,
        outgoing_transitions: exits.map((e) => (lostRefs.has(e.transition_ref) ? { ...e, target_stage_key: ENROLLMENT_FAMILY_TERMINAL_STAGE_KEY } : e)),
        outcome_rules: (plan.outcome_rules ?? []).map((rule) => {
            const takesLostExit = (rule.targets ?? []).some((t) => t.kind === "move_to_stage" && typeof t.transition_ref === "string" && lostRefs.has(t.transition_ref));
            const recordsReason = (rule.targets ?? []).some((t) => t.kind === "update_family_case_status" && (t.close_reason_key ?? "").trim());
            return takesLostExit && !recordsReason ? { ...rule, targets: [reason, ...(rule.targets ?? [])] } : rule;
        }),
    };
}

/**
 * THE FAMILY DOES NOT ENTER WAITLIST; ITS CHILDREN DO. (Director decision, BP V2 Slice 8B-1.)
 *
 * Waitlist is a CHILD-track stage. The shared defaults let two family outcomes move the family case onto
 * it — `tour.no_availability` and `decision.wants_waitlist` — which publication refuses
 * (`outcome_movement_grain_mismatch`), and they leave Waitlist's own child movement undeclared. The rule:
 *
 *   - Wants Waitlist: the family stays at Decision. The operator waitlists each applicable child through
 *     the existing child-level Decision (`per_subject_outcomes` → `waitlist`); nothing waitlists every
 *     child of a family automatically.
 *   - No Availability: the family moves Tour → Decision on the existing `tour_to_decision` exit, where the
 *     same child-level Decision places children on Waitlist.
 *   - Spot Offered: Waitlist declares `waitlist_to_enrolling` (child → child) and the existing outcome moves
 *     through it — same destination, same child status update, now a declared path.
 *
 * The family → Waitlist exits are removed rather than kept unused: an exit is an operator-visible path, and
 * this one would move a family case onto a child stage. Template-only, like the lost-close correction
 * above, so no published configuration and no runtime fallback changes. Each correction names exactly what
 * it expects in the defaults and REFUSES if that is absent, so drift in the defaults surfaces here instead
 * of shipping a template that silently skipped its own correction.
 */
const FAMILY_TO_WAITLIST_EXITS = { tour: "tour_to_waitlist", decision: "decision_to_waitlist" } as const;
const WAITLIST_TO_ENROLLING_REF = "waitlist_to_enrolling" as const;

function separateFamilyFromChildWaitlist(stageKey: string, plan: StageOperatingPlanV1): StageOperatingPlanV1 {
    const refuse = (what: string): never => {
        throw new Error(`Enrollment template: expected ${what} in the default ${stageKey} plan; refusing to build a template that skipped its waitlist correction`);
    };
    const replaceMove = (outcome: string, ref: string, replacement: StageOutcomeRuleTargetV1): StageOperatingPlanV1["outcome_rules"] => {
        let found = false;
        const rules = (plan.outcome_rules ?? []).map((rule) => {
            if (rule.when_outcome_key !== outcome) return rule;
            const targets = (rule.targets ?? []).map((t) => {
                if (t.kind === "move_to_stage" && t.transition_ref === ref) { found = true; return replacement; }
                return t;
            });
            return { ...rule, targets };
        });
        if (!found) refuse(`outcome "${outcome}" moving through "${ref}"`);
        return rules;
    };

    if (stageKey === "tour" || stageKey === "decision") {
        const ref = FAMILY_TO_WAITLIST_EXITS[stageKey];
        const exits = plan.outgoing_transitions ?? [];
        if (!exits.some((e) => e.transition_ref === ref)) refuse(`exit "${ref}"`);
        if (stageKey === "tour" && !exits.some((e) => e.transition_ref === "tour_to_decision" && e.target_stage_key === "decision")) {
            refuse(`exit "tour_to_decision" to decision`);
        }
        return {
            ...plan,
            outgoing_transitions: exits.filter((e) => e.transition_ref !== ref),
            outcome_rules: stageKey === "tour"
                ? replaceMove("no_availability", ref, { kind: "move_to_stage", transition_ref: "tour_to_decision" })
                : replaceMove("wants_waitlist", ref, { kind: "no_movement" }),
        };
    }

    if (stageKey === "waitlist") {
        let found = false;
        const outcome_rules = (plan.outcome_rules ?? []).map((rule) => {
            if (rule.when_outcome_key !== "spot_offered") return rule;
            return {
                ...rule,
                targets: (rule.targets ?? []).map((t) => {
                    if (t.kind === "move_to_stage" && !t.transition_ref && t.stage_key === "enrolling") {
                        found = true;
                        return { kind: "move_to_stage", transition_ref: WAITLIST_TO_ENROLLING_REF } as StageOutcomeRuleTargetV1;
                    }
                    return t;
                }),
            };
        });
        if (!found) refuse(`outcome "spot_offered" moving to "enrolling"`);
        return {
            ...plan,
            outgoing_transitions: [
                ...(plan.outgoing_transitions ?? []),
                { transition_ref: WAITLIST_TO_ENROLLING_REF, source_stage_key: "waitlist", target_stage_key: "enrolling", label: "Offer Spot", available: true },
            ],
            outcome_rules,
        };
    }

    return plan;
}

/**
 * BP V2 D2/D5 — the family decides as a family; each child gets its own path (Director: family and child
 * lifecycle authority are separate).
 *
 * The default Decision plan said "Family Enrolling" = no family movement + `enter_child_enrollment`. That
 * target begins enrollment for the ONE child a family has and refuses for two or more, so in a multi-child
 * family the only way forward was a per-child path the template never declared — and until the plan parser
 * admitted the kind, the target was silently dropped and the outcome completed the work having done nothing.
 *
 * The template now carries the per-child pattern the platform already executes (and that Firefly's published
 * Decision stage uses): `participant_decisions` on the Decision work — Begin Enrolling (`enroll_child`),
 * Waitlist (`waitlist_child`), Not Enrolling — run by `executeParticipantDecisionForChild` against ONE chosen
 * child, moving that child's status and stage and nothing else. `requires_all_participants_resolved` keeps the
 * family outcome refused until every child has a path, so "Family Enrolling" records the family's intent and
 * never stands in for, or implies, a child's enrollment. Its child target is removed: starting a child is the
 * child's decision, not a side effect of the family's.
 *
 * Template-only (new organizations): the shared default plans, the runtime fallback and every published
 * configuration — Firefly's included — are unchanged.
 */
export const ENROLLMENT_DECISION_WORK_TEMPLATE_KEY = "support_enrollment_decision" as const;
export const ENROLLMENT_PER_CHILD_CAPABILITIES = ["enroll_child", "waitlist_child", "update_child_enrollment_status"] as const;
const ENROLLMENT_PER_CHILD_DECISIONS: StageWorkParticipantDecisionV1[] = [
    {
        decision_key: "child_begin_enrolling",
        action_ref: "enroll_child",
        label: "Begin Enrolling",
        subject_grain: "child",
        targets: [
            { kind: "update_child_enrollment_status", disposition_key: "enrolling" },
            { kind: "move_to_stage", stage_key: "enrolling" },
        ],
    },
    {
        decision_key: "child_waitlist",
        action_ref: "waitlist_child",
        label: "Waitlist",
        subject_grain: "child",
        targets: [
            { kind: "update_child_enrollment_status", disposition_key: "waitlisted" },
            { kind: "move_to_stage", stage_key: "waitlist" },
        ],
    },
    {
        decision_key: "child_not_enrolling",
        action_ref: "update_child_enrollment_status",
        label: "Not Enrolling",
        subject_grain: "child",
        targets: [{ kind: "update_child_enrollment_status", disposition_key: "not_enrolling" }],
        required_inputs: [
            {
                key: "close_reason_key",
                label: "Reason",
                type: "select",
                required: true,
                binds_to_target_field: "close_reason_key",
                options: [
                    { label: "Chose another provider", value: "chose_another_provider" },
                    { label: "No suitable capacity", value: "no_capacity" },
                    { label: "Schedule did not fit", value: "schedule_mismatch" },
                    { label: "Cost", value: "cost" },
                    { label: "No longer needs care", value: "no_longer_needed" },
                ],
            },
        ],
    },
];

function declarePerChildDecisionPaths(stageKey: string, plan: StageOperatingPlanV1): StageOperatingPlanV1 {
    if (stageKey !== "decision") return plan;
    const refuse = (what: string): never => {
        throw new Error(`Enrollment template: expected ${what} in the default decision plan; refusing to build a template that skipped its per-child paths`);
    };
    if (!(plan.work_templates ?? []).some((w) => w.template_key === ENROLLMENT_DECISION_WORK_TEMPLATE_KEY)) refuse(`work "${ENROLLMENT_DECISION_WORK_TEMPLATE_KEY}"`);
    let found = false;
    const outcome_rules = (plan.outcome_rules ?? []).map((rule) => {
        if (rule.when_outcome_key !== "family_enrolling") return rule;
        const targets = (rule.targets ?? []).filter((t) => {
            if (t.kind !== "enter_child_enrollment") return true;
            found = true;
            return false;
        });
        return { ...rule, targets: targets.length ? targets : [{ kind: "no_movement" } as StageOutcomeRuleTargetV1] };
    });
    if (!found) refuse(`outcome "family_enrolling" carrying "enter_child_enrollment"`);
    return {
        ...plan,
        work_templates: plan.work_templates.map((w) =>
            w.template_key !== ENROLLMENT_DECISION_WORK_TEMPLATE_KEY
                ? w
                : {
                      ...w,
                      completion_policy: { ...(w.completion_policy ?? {}), requires_all_participants_resolved: true },
                      participant_decisions: structuredClone(ENROLLMENT_PER_CHILD_DECISIONS),
                  },
        ),
        outcome_rules,
    };
}

/** Build enrollment template stage records (metadata only — no DB seeding). */
export function buildEnrollmentTemplateStageRecords(): LifecycleBuilderStageRecord[] {
    return ENROLLMENT_STAGE_SPECS.map((spec, index) => {
        const membership = defaultEnrollmentQueueMembershipForStage(spec.key) ?? undefined;
        const defaultPlan = defaultStageOperatingPlanForEnrollmentStage(spec.key);
        const operatingPlan = defaultPlan
            ? declarePerChildDecisionPaths(spec.key, separateFamilyFromChildWaitlist(spec.key, closeLostExitsOntoFamilyTerminal(defaultPlan)))
            : undefined;
        // Seed the row-type grain so Work Views can be scoped per grain (family vs child) and the
        // grain banner has data. Family track = one row per case; child track = one row per enrollment track.
        const grain: StageGrain = spec.track_key === ENROLLMENT_TRACK_CHILD_KEY ? "child" : "family";
        return {
            id: randomUUID(),
            key: spec.key,
            label: spec.label,
            track_key: spec.track_key,
            sort_order: index,
            is_active: true,
            grain,
            ...(membership ? { queue_membership_v1: membership } : {}),
            ...(operatingPlan ? { stage_operating_plan_v1: operatingPlan } : {}),
        };
    });
}

export function applyEnrollmentTemplateToProcess(
    process: LifecycleBuilderProcessRecord,
): LifecycleBuilderProcessRecord {
    if (process.key !== ENROLLMENT_PROCESS_KEY) {
        throw new Error("Enrollment template applies only to enrollment processes");
    }
    if (process.stages.length > 0) {
        throw new Error("Process already has stages — remove stages before applying the template");
    }
    return {
        ...process,
        tracks_v1: structuredClone(ENROLLMENT_DEFAULT_TRACKS),
        stages: buildEnrollmentTemplateStageRecords(),
    };
}

export function applyEnrollmentTemplateInConfig(
    config: LifecycleBuilderV1,
    processId: string,
): LifecycleBuilderV1 {
    const pid = processId.trim();
    return {
        ...config,
        processes: config.processes.map((p) => {
            if (p.id !== pid) return p;
            return applyEnrollmentTemplateToProcess(p);
        }),
    };
}

/** @deprecated Use applyEnrollmentTemplateToProcess */
export const applyEnrollmentV2TemplateToProcess = applyEnrollmentTemplateToProcess;
/** @deprecated Use applyEnrollmentTemplateInConfig */
export const applyEnrollmentV2TemplateInConfig = applyEnrollmentTemplateInConfig;
/** @deprecated Use buildEnrollmentTemplateStageRecords */
export const buildEnrollmentV2StageRecords = buildEnrollmentTemplateStageRecords;
/** @deprecated Use ENROLLMENT_STAGE_SPECS */
export const ENROLLMENT_V2_STAGE_SPECS = ENROLLMENT_STAGE_SPECS;
/** @deprecated Use ENROLLMENT_FAMILY_STAGE_SPECS */
export const ENROLLMENT_V2_FAMILY_STAGE_SPECS = ENROLLMENT_FAMILY_STAGE_SPECS;
/** @deprecated Use ENROLLMENT_CHILD_STAGE_SPECS */
export const ENROLLMENT_V2_CHILD_STAGE_SPECS = ENROLLMENT_CHILD_STAGE_SPECS;
/** @deprecated Use ENROLLMENT_DEFAULT_TRACKS */
export const ENROLLMENT_V2_DEFAULT_TRACKS = ENROLLMENT_DEFAULT_TRACKS;
