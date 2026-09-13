/**
 * Apply configured stage operating outcome side effects after manual Change Enrollment Status.
 * Reuses executeStageOperatingOutcome + onChildDispositionEntrySpawnWorkIntent — no duplicated automation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
    EnrollmentStatusDestinationKey,
    EnrollmentStatusTransitionScope,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import {
    findBpDestinationOption,
    resolveBpEnrollmentStatusDestinations,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionBpResolver";
import {
    executeStageOperatingOutcome,
    STAGE_OUTCOME_MANUAL_TRANSITION_SKIP_TARGET_KINDS,
    type StageOutcomeExecutionResult,
} from "@/lib/lifecycle/executeStageOperatingOutcome";
import type { StageOutcomeRuleTargetKind } from "@/lib/lifecycle/stageOperatingPlanV1";
import { applyStageOutcomeRuleTarget } from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";
import { isLifecycleOperatorStage } from "@/lib/lifecycle/enrollmentOperatorStage";
import { DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID } from "@/lib/lifecycle/emitDomainLifecycleStatusChangedEvent";
import { onChildDispositionEntrySpawnWorkIntent } from "@/lib/lifecycle/onChildDispositionEntrySpawnWorkIntent";
import type { OnStageEntrySpawnWorkIntentResult } from "@/lib/lifecycle/onStageEntrySpawnWorkIntent";
import { resolveOpportunityDepartmentId } from "@/lib/opportunities/resolveOpportunityDepartmentId";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import { outcomeRulesForKey } from "@/lib/lifecycle/stageOperatingPlanV1";

export type ApplyEnrollmentStatusTransitionOutcomeEffectsInput = {
    supabase: SupabaseClient;
    orgId: string;
    userId?: string | null;
    departmentId?: string | null;
    scope: EnrollmentStatusTransitionScope;
    destinationKey: EnrollmentStatusDestinationKey;
    targetStatusKey: string;
    previousStatusKey: string | null;
    /** When known from modal / queue context. */
    outcomeKey?: string | null;
    sourceBuilderStageKey?: string | null;
    builderStageKey?: string | null;
};

type StageOutcomeRuleTargetResult = Awaited<ReturnType<typeof applyStageOutcomeRuleTarget>>;

export type ApplyEnrollmentStatusTransitionOutcomeEffectsResult = {
    outcome_execution: StageOutcomeExecutionResult | null;
    /**
     * The canonical destination move, applied when the source stage's plan declared no rule for the
     * operator's chosen destination. Null means a configured rule already moved the child, or the
     * destination names no stage.
     */
    destination_stage_move: StageOutcomeRuleTargetResult | null;
    stage_entry_spawn: OnStageEntrySpawnWorkIntentResult | null;
    outcome_key: string | null;
    source_builder_stage_key: string | null;
    errors: string[];
};

const STAGE_PLAN_LOOKUP_KEYS: Record<string, readonly string[]> = {
    decision: ["decision", "decision_pending"],
    tour: ["tour", "tour_completed", "tour_scheduled"],
    qualification: ["qualification"],
    lead: ["lead", "new_lead"],
};

async function loadDepartmentMetadata(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error || !data) return null;
    const md = (data as { metadata?: unknown }).metadata;
    return md != null && typeof md === "object" && !Array.isArray(md)
        ? (md as Record<string, unknown>)
        : {};
}

function resolveOutcomeKey(
    explicit: string | null | undefined,
    destinationKey: EnrollmentStatusDestinationKey,
): string | null {
    const trimmed = explicit?.trim();
    if (trimmed) return trimmed;
    if (destinationKey === "waitlist") return "waitlist";
    if (destinationKey === "enrollment") return "enrolling";
    if (destinationKey === "closed_withdrawn") return "declined";
    if (destinationKey === "enrolled") return "enrollment_complete";
    return null;
}

function resolvePlanForOutcomeExecution(
    departmentMetadata: Record<string, unknown>,
    sourceBuilderStageKey: string,
    outcomeKey: string,
): { plan: NonNullable<ReturnType<typeof resolveEffectiveStageOperatingPlan>["plan"]>; stageKey: string } | null {
    const candidates = STAGE_PLAN_LOOKUP_KEYS[sourceBuilderStageKey] ?? [sourceBuilderStageKey];
    for (const stageKey of candidates) {
        const { plan } = resolveEffectiveStageOperatingPlan({
            departmentMetadata,
            builderStageKey: stageKey,
        });
        if (plan && outcomeRulesForKey(plan, outcomeKey).length > 0) {
            return { plan, stageKey };
        }
    }
    return null;
}

/**
 * WHAT THE MANUAL TRANSITION HAS ALREADY DONE — AND WHAT IT HAS NOT.
 *
 * The skip set exists because `executeEnrollmentStatusTransition` writes the status itself, so
 * re-running the configured status targets would double-write it. That premise holds for the three
 * status kinds. It does NOT hold for `move_to_stage`: the manual path touches no stage at all.
 *
 * For a FAMILY case that is harmless, because a case's rail position is derived from its status —
 * writing the status IS moving the case, and skipping the target avoids a second, redundant answer.
 *
 * For a CHILD it is the whole divergence. A child's position lives in its process instance and
 * nowhere else, so skipping the move left the manual path writing disposition `waitlisted` and
 * minting a placement candidate while the child's process instance stayed where it was. That is how
 * the tenant came to hold seventeen placement-waitlisted children and one Waitlist membership: two
 * halves of one decision, only one of them recorded.
 *
 * So a child transition stops skipping the movement. Nothing new writes: the configured
 * `to_waitlist` rule already declares `move_to_stage → waitlist`, and the target executor routes it
 * through `moveEnrollmentInstanceStageByScope` — the authoritative writer — behind its grain guard,
 * which refuses a child outcome aimed at a family stage. The status kinds stay skipped exactly as
 * before, and the family path is untouched.
 *
 * Idempotent by construction: the executor reads the prior stage and writes the destination, so a
 * child already at the destination is written the value it already holds.
 */
function manualTransitionSkipKinds(
    journeySegment: "child" | "family",
): readonly StageOutcomeRuleTargetKind[] {
    if (journeySegment !== "child") return STAGE_OUTCOME_MANUAL_TRANSITION_SKIP_TARGET_KINDS;
    return STAGE_OUTCOME_MANUAL_TRANSITION_SKIP_TARGET_KINDS.filter((k) => k !== "move_to_stage");
}

export async function applyEnrollmentStatusTransitionOutcomeEffects(
    input: ApplyEnrollmentStatusTransitionOutcomeEffectsInput,
): Promise<ApplyEnrollmentStatusTransitionOutcomeEffectsResult> {
    const orgId = input.orgId.trim();
    const opportunityId = input.scope.opportunityId.trim();
    const ocmId = input.scope.opportunityCustomerMemberId?.trim() ?? null;
    const userId = input.userId?.trim() || DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID;
    const errors: string[] = [];

    if (!orgId || !opportunityId) {
        return {
            outcome_execution: null,
            destination_stage_move: null,
            stage_entry_spawn: null,
            outcome_key: null,
            source_builder_stage_key: null,
            errors: ["missing_scope"],
        };
    }

    let departmentId = input.departmentId?.trim() ?? null;
    if (!departmentId) {
        const { data: opp } = await input.supabase
            .from("opportunities")
            .select("work_unit_id, metadata")
            .eq("id", opportunityId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (opp) {
            departmentId = await resolveOpportunityDepartmentId(input.supabase, orgId, {
                metadata: (opp as { metadata?: unknown }).metadata,
                work_unit_id: (opp as { work_unit_id?: unknown }).work_unit_id,
            });
        }
    }

    if (!departmentId) {
        return {
            outcome_execution: null,
            destination_stage_move: null,
            stage_entry_spawn: null,
            outcome_key: null,
            source_builder_stage_key: null,
            errors: [],
        };
    }

    const departmentMetadata = await loadDepartmentMetadata(input.supabase, orgId, departmentId);
    if (!departmentMetadata) {
        return {
            outcome_execution: null,
            destination_stage_move: null,
            stage_entry_spawn: null,
            outcome_key: null,
            source_builder_stage_key: null,
            errors: ["department_load_failed"],
        };
    }

    const grain = ocmId && input.scope.grain !== "case" ? "child" : "case";
    const bpResolved = resolveBpEnrollmentStatusDestinations({
        departmentMetadata,
        currentStatusKey: input.previousStatusKey,
        grain,
        builderStageKey: input.sourceBuilderStageKey ?? input.builderStageKey,
    });
    const bpDestination = findBpDestinationOption(
        bpResolved.destinations,
        input.destinationKey,
        input.targetStatusKey,
    );

    const outcomeKey = resolveOutcomeKey(
        input.outcomeKey ?? bpDestination?.outcomeKey,
        input.destinationKey,
    );
    const sourceBuilderStageKey =
        input.sourceBuilderStageKey?.trim() ||
        bpResolved.currentBuilderStageKey ||
        input.builderStageKey?.trim() ||
        null;

    let outcome_execution: StageOutcomeExecutionResult | null = null;
    if (outcomeKey && sourceBuilderStageKey) {
        const resolvedPlan = resolvePlanForOutcomeExecution(
            departmentMetadata,
            sourceBuilderStageKey,
            outcomeKey,
        );
        if (resolvedPlan) {
            const journey_segment =
                resolvedPlan.plan.journey_segment === "child" || grain === "child" ? "child" : "family";
            outcome_execution = await executeStageOperatingOutcome({
                supabase: input.supabase,
                orgId,
                userId,
                departmentId,
                plan: resolvedPlan.plan,
                outcomeKey,
                subject: {
                    journey_segment,
                    opportunity_id: opportunityId,
                    // Threaded child identity → outcome execution targets the process instance directly.
                    customer_member_id: input.scope.customerMemberId ?? null,
                    opportunity_customer_member_id: ocmId,
                    placement_candidate_id: input.scope.placementCandidateId ?? null,
                },
                skipTargetKinds: manualTransitionSkipKinds(journey_segment),
            });
            if (outcome_execution.errors.length) {
                errors.push(...outcome_execution.errors);
            }
        }
    }

    /*
     * ── THE DESTINATION IS NAMED BY THE OPERATOR, NOT ONLY BY THE SOURCE STAGE'S RULES ──
     *
     * Everything above runs only when the SOURCE stage's plan happens to declare an outcome rule for
     * this destination. `decision_pending` declares `to_waitlist`, so a child waitlisted from
     * Decision moves. `lead` declares only `ready_to_contact` -- so a child waitlisted straight from
     * Lead resolved no plan, `executeStageOperatingOutcome` never ran at all, and the child was left
     * disposition-waitlisted with a placement candidate and a process instance that never moved.
     *
     * Reproduced live before this existed: a child taken from Lead to Waitlist came back
     * `outcome_status_key = waitlisted`, a placement candidate created, and
     * `_effective_participant_stage_keys` still empty -- the child riding its family's Lead.
     *
     * An operator choosing "Waitlist" has named a destination, and for a child that destination is
     * a POSITION, not a label. `EnrollmentStatusDestinationKey` is `LifecycleOperatorStage |
     * "closed_withdrawn"`, so the destination key already IS the builder stage -- nothing is mapped
     * or guessed here, and `closed_withdrawn` (which names no stage) is excluded by the same check.
     *
     * The move goes through `applyStageOutcomeRuleTarget`, the same executor the configured rules
     * use and the same one `applyChildWaitlistViaOutcomeRuntime` uses for the waitlist_child
     * command. So it inherits the referential-integrity guard (the destination must exist in the
     * configured process), the grain guard (a child outcome may not write a family stage), and the
     * destination-stage work reconciliation that opens the entry work. This is not a second writer;
     * it is the same one, reached when configuration named no rule.
     *
     * Skipped entirely when a configured rule already moved the child -- one move, never two.
     */
    let destination_stage_move: StageOutcomeRuleTargetResult | null = null;
    const destinationStageKey =
        grain === "child" && isLifecycleOperatorStage(input.destinationKey) ? input.destinationKey : null;
    const alreadyMoved = (outcome_execution?.applied_targets ?? []).some((t) => t.kind === "move_to_stage");
    /*
     * EITHER identity is enough. A caller that names only the participation (`ocmId`) is the common
     * case from the drawer and the queue row -- `resolveChildSubjectId` reads the durable child from
     * it. Requiring the durable id here would have made the branch unreachable from exactly the
     * surfaces that need it, which is how the live proof first came back with the child unmoved.
     */
    const childIdentityKnown = Boolean(input.scope.customerMemberId?.trim() || ocmId);
    if (destinationStageKey && !alreadyMoved && childIdentityKnown) {
        destination_stage_move = await applyStageOutcomeRuleTarget(input.supabase, {
            orgId,
            userId,
            departmentId,
            stageKey: sourceBuilderStageKey ?? destinationStageKey,
            /*
             * A stub carrying only what the executor reads for a move. The SOURCE plan is the right
             * thing to pass when one resolved, but the whole point of this branch is that it often
             * has not -- and the move does not read outcome rules, only the stage inventory.
             */
            plan: {
                version: 1,
                lifecycle_key: "enrollment",
                stage_key: sourceBuilderStageKey ?? destinationStageKey,
                journey_segment: "child",
                work_templates: [],
                outcomes: [],
                outcome_rules: [],
            } as unknown as NonNullable<ReturnType<typeof resolveEffectiveStageOperatingPlan>["plan"]>,
            subject: {
                journey_segment: "child",
                opportunity_id: opportunityId,
                customer_member_id: input.scope.customerMemberId,
                opportunity_customer_member_id: ocmId,
                placement_candidate_id: input.scope.placementCandidateId ?? null,
            },
            target: { kind: "move_to_stage", stage_key: destinationStageKey },
        });
        if (destination_stage_move.error) {
            // Surfaced, never swallowed: a child that did not move is exactly the divergence this
            // whole seam exists to prevent, and it must not read as a clean transition.
            errors.push(`destination_stage_move: ${destination_stage_move.error}`);
        }
    }

    let stage_entry_spawn: OnStageEntrySpawnWorkIntentResult | null = null;
    if (ocmId && input.scope.grain !== "case") {
        const previous = input.previousStatusKey?.trim() ?? null;
        const next = input.targetStatusKey.trim();
        if (previous !== next) {
            stage_entry_spawn = await onChildDispositionEntrySpawnWorkIntent({
                supabase: input.supabase,
                orgId,
                userId,
                opportunityId,
                previousStatusKey: previous,
                nextStatusKey: next,
            });
            if (stage_entry_spawn.action === "skipped" && stage_entry_spawn.reason === "instantiate_failed") {
                errors.push(stage_entry_spawn.reason);
            }
        }
    }

    return {
        outcome_execution,
        destination_stage_move,
        stage_entry_spawn,
        outcome_key: outcomeKey,
        source_builder_stage_key: sourceBuilderStageKey,
        errors,
    };
}
